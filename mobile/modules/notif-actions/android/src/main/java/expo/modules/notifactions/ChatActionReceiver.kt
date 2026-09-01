package expo.modules.notifactions

import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Parcelable
import android.util.Log
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.RemoteInput
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Intercepts the "Reply" / "Mark as read" buttons on chat push notifications
 * and services them with a direct HTTP call to the chat API — so they work
 * WhatsApp-style even when the app process is fully dead. Everything else
 * (the notification body tap, non-chat notifications, expo-notifications'
 * internal scheduling/boot events) is forwarded verbatim to
 * `expo.modules.notifications.service.NotificationsService`.
 *
 * Registered at intent-filter priority 1 so it wins over expo-notifications'
 * own receiver (priority -1) as the "designated" receiver its PendingIntents
 * target. See the module manifest.
 *
 * Safety properties:
 *  - onReceive does NO blocking work on the main thread — it goes async
 *    immediately and hands everything to a worker.
 *  - the goAsync() hold is released exactly once, and always within
 *    WATCHDOG_MS regardless of what the network is doing.
 *  - nothing here throws out of onReceive: the worker body is fully guarded.
 *  - every path we can't finish natively re-dispatches the original broadcast
 *    to expo-notifications (which buffers it for the JS replay-on-open path),
 *    then lingers briefly so that receiver actually runs before the OS can
 *    reclaim the process.
 */
class ChatActionReceiver : BroadcastReceiver() {

  companion object {
    private const val TAG = "GlosNotifActions"
    private const val EXPO_RECEIVER = "expo.modules.notifications.service.NotificationsService"

    // Mirrors expo.modules.notifications.service.NotificationsService constants.
    private const val EVENT_TYPE_KEY = "type"
    private const val RECEIVE_RESPONSE_TYPE = "receiveResponse"
    private const val NOTIFICATION_KEY = "notification"
    private const val NOTIFICATION_ACTION_KEY = "notificationAction"
    private const val USER_TEXT_RESPONSE_KEY = "userTextResponse"

    private const val REPLY_ACTION = "reply"
    private const val MARK_READ_ACTION = "mark_read"

    // expo-notifications posts with NotificationManagerCompat.notify(tag = identifier, id = 0)
    private const val EXPO_NOTIFY_ID = 0

    // HTTP timeouts. A killed-app background broadcast gets far more than the
    // oft-quoted 10s (that's the foreground figure); these are sized so the
    // worst case (GET + POST, both timing out) still lands under WATCHDOG_MS.
    private const val CONNECT_MS = 6_000
    private const val READ_MS = 8_000
    private const val QUICK_CONNECT_MS = 3_000
    private const val QUICK_READ_MS = 3_000

    // Hard ceiling on the goAsync() hold. Any in-flight request continues
    // best-effort after this; the process just becomes reclaimable.
    private const val WATCHDOG_MS = 18_000L

    // After re-dispatching to expo-notifications, linger this long so its
    // receiver processes the broadcast before we let the process go.
    private const val SETTLE_MS = 1_200L
  }

  override fun onReceive(context: Context, intent: Intent) {
    val app = context.applicationContext
    val pending = goAsync()
    val done = AtomicBoolean(false)
    fun finishOnce() {
      if (done.compareAndSet(false, true)) runCatching { pending.finish() }
    }

    // Watchdog — releases the hold no matter what.
    Thread {
      try { Thread.sleep(WATCHDOG_MS) } catch (_: InterruptedException) {}
      finishOnce()
    }.apply { isDaemon = true }.start()

    Thread {
      try {
        val isResponse = try {
          intent.getStringExtra(EVENT_TYPE_KEY) == RECEIVE_RESPONSE_TYPE
        } catch (e: Exception) {
          false
        }
        if (isResponse) process(app, intent) else forwardAndSettle(app, intent)
      } catch (e: Exception) {
        Log.w(TAG, "worker crashed, forwarding: ${e.message}")
        runCatching { forwardAndSettle(app, intent) }
      } finally {
        finishOnce()
      }
    }.start()
  }

  /** Worker thread, under the goAsync() hold. */
  private fun process(app: Context, intent: Intent) {
    runCatching { intent.setExtrasClassLoader(app.classLoader) }

    val actionId = reflectActionId(intent)
    if (actionId != REPLY_ACTION && actionId != MARK_READ_ACTION) {
      forwardAndSettle(app, intent) // default tap / other action → expo routes it
      return
    }

    val data = reflectData(intent)
    val type = data?.optString("type").orEmpty()
    val appId = data?.optInt("app_id", -1) ?: -1
    val convId = data?.optInt("conversation_id", -1) ?: -1
    if (type != "chat_message" || appId <= 0 || convId <= 0) {
      forwardAndSettle(app, intent)
      return
    }

    // Raw (untrimmed) text — the dedup key must match JS's exactly:
    //   `${notifId}:${actionId}:${response.userText ?? ''}`
    val rawUserText = if (actionId == REPLY_ACTION) {
      runCatching {
        RemoteInput.getResultsFromIntent(intent)?.getString(USER_TEXT_RESPONSE_KEY)
      }.getOrNull().orEmpty()
    } else {
      ""
    }
    val replyText = rawUserText.trim()
    if (actionId == REPLY_ACTION && replyText.isEmpty()) {
      forwardAndSettle(app, intent)
      return
    }

    val creds = NotifAuthStore.load(app)
    val usable = creds != null &&
      creds.token.isNotBlank() &&
      (creds.expiresAtMs <= 0L || creds.expiresAtMs > System.currentTimeMillis())
    if (creds == null || !usable) {
      forwardAndSettle(app, intent) // JS replay-on-open picks it up
      return
    }

    val notifTag = reflectNotificationId(intent)
    val handledKey = "${notifTag ?: ""}:$actionId:$rawUserText"
    // Claim now so the JS replay-on-open path defers to us; rolled back below if
    // it doesn't go through.
    NotifAuthStore.markHandled(app, handledKey)

    var ok = false
    try {
      ok = if (actionId == REPLY_ACTION) {
        val sent = postMessage(creds, appId, convId, replyText)
        if (sent) {
          dismiss(app, notifTag)
          // "read on reply" — detached, never gates the result or the budget.
          Thread { runCatching { markRead(creds, appId, convId) } }.start()
        }
        sent
      } else {
        val read = markRead(creds, appId, convId)
        if (read) dismiss(app, notifTag)
        read
      }
    } catch (e: Exception) {
      Log.w(TAG, "chat action '$actionId' failed: ${e.message}")
    }

    if (!ok) {
      NotifAuthStore.unmarkHandled(app, handledKey)
      forwardAndSettle(app, intent)
    }
  }

  // ---- forwarding -----------------------------------------------------

  private fun forwardAndSettle(context: Context, intent: Intent) {
    forwardToExpo(context, intent)
    try { Thread.sleep(SETTLE_MS) } catch (_: InterruptedException) {}
  }

  /** Re-dispatch the original broadcast to expo-notifications' own receiver. */
  private fun forwardToExpo(context: Context, original: Intent) {
    try {
      val fwd = Intent(original).apply {
        component = ComponentName(context.packageName, EXPO_RECEIVER)
      }
      context.sendBroadcast(fwd)
    } catch (e: Exception) {
      Log.w(TAG, "forwardToExpo failed: ${e.message}")
    }
  }

  // ---- reflection into expo-notifications parcelables ----------------
  // Reflective so this module needs no compile-time dependency on
  // expo-notifications (its model classes are not a stable API).

  private fun reflectActionId(intent: Intent): String? = try {
    val action = getParcelable(intent, NOTIFICATION_ACTION_KEY)
    action?.let { it.javaClass.getMethod("getIdentifier").invoke(it) as? String }
  } catch (e: Exception) {
    Log.w(TAG, "reflectActionId failed: ${e.message}"); null
  }

  private fun reflectNotificationId(intent: Intent): String? = try {
    val notification = getParcelable(intent, NOTIFICATION_KEY)
    val request = notification?.javaClass?.getMethod("getNotificationRequest")?.invoke(notification)
    request?.javaClass?.getMethod("getIdentifier")?.invoke(request) as? String
  } catch (e: Exception) {
    Log.w(TAG, "reflectNotificationId failed: ${e.message}"); null
  }

  private fun reflectData(intent: Intent): JSONObject? = try {
    val notification = getParcelable(intent, NOTIFICATION_KEY)
    val request = notification?.javaClass?.getMethod("getNotificationRequest")?.invoke(notification)
    val content = request?.javaClass?.getMethod("getContent")?.invoke(request)
    // INotificationContent.getBody() -> JSONObject (the remote push data payload)
    content?.javaClass?.getMethod("getBody")?.invoke(content) as? JSONObject
  } catch (e: Exception) {
    Log.w(TAG, "reflectData failed: ${e.message}"); null
  }

  @Suppress("DEPRECATION")
  private fun getParcelable(intent: Intent, key: String): Parcelable? =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      intent.getParcelableExtra(key, Parcelable::class.java)
    } else {
      intent.getParcelableExtra(key)
    }

  // ---- chat API calls -----------------------------------------------

  private fun postMessage(creds: NotifAuthStore.Creds, appId: Int, convId: Int, body: String): Boolean {
    val payload = JSONObject().apply {
      put("body", body)
      put("reply_to_id", JSONObject.NULL)
      put("attachments", JSONArray())
      put("_tempId", "notif-${System.currentTimeMillis()}-${UUID.randomUUID()}")
    }
    val (code, _) = request(creds, "POST", "/apps/$appId/chat/$convId/messages", payload.toString(), CONNECT_MS, READ_MS)
    return code in 200..299
  }

  private fun markRead(creds: NotifAuthStore.Creds, appId: Int, convId: Int): Boolean {
    val lastId = latestMessageId(creds, appId, convId)
    val payload = JSONObject().apply {
      if (lastId != null) put("last_read_message_id", lastId) else put("last_read_message_id", JSONObject.NULL)
    }
    val (code, _) = request(creds, "POST", "/apps/$appId/chat/$convId/read", payload.toString(), CONNECT_MS, READ_MS)
    return code in 200..299
  }

  /** Newest message id so the server advances the read *cursor*, not just the timestamp. */
  private fun latestMessageId(creds: NotifAuthStore.Creds, appId: Int, convId: Int): Long? = try {
    val (code, resBody) = request(
      creds, "GET", "/apps/$appId/chat/$convId/messages?limit=1", null, QUICK_CONNECT_MS, QUICK_READ_MS,
    )
    if (code !in 200..299 || resBody.isNullOrBlank()) {
      null
    } else {
      val arr = JSONArray(resBody)
      if (arr.length() == 0) null else arr.getJSONObject(arr.length() - 1).optLong("id").takeIf { it > 0 }
    }
  } catch (e: Exception) {
    Log.w(TAG, "latestMessageId failed: ${e.message}"); null
  }

  private fun request(
    creds: NotifAuthStore.Creds,
    method: String,
    path: String,
    body: String?,
    connectTimeoutMs: Int,
    readTimeoutMs: Int,
  ): Pair<Int, String?> {
    val conn = (URL(creds.apiBaseUrl + path).openConnection() as HttpURLConnection).apply {
      requestMethod = method
      connectTimeout = connectTimeoutMs
      readTimeout = readTimeoutMs
      instanceFollowRedirects = true
      setRequestProperty("Authorization", "Bearer ${creds.token}")
      setRequestProperty("Accept", "application/json")
      if (creds.email.isNotBlank()) setRequestProperty("x-user-email", creds.email)
      if (creds.firstName.isNotBlank()) setRequestProperty("x-user-firstname", creds.firstName)
      if (creds.lastName.isNotBlank()) setRequestProperty("x-user-lastname", creds.lastName)
      if (body != null) {
        doOutput = true
        setRequestProperty("Content-Type", "application/json; charset=utf-8")
      }
    }
    return try {
      if (body != null) {
        conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
      }
      val code = conn.responseCode
      val stream = if (code in 200..299) conn.inputStream else conn.errorStream
      val text = stream?.bufferedReader()?.use { it.readText() }
      if (code !in 200..299) Log.w(TAG, "$method $path -> $code")
      code to text
    } finally {
      runCatching { conn.disconnect() }
    }
  }

  // ---- notification housekeeping --------------------------------

  private fun dismiss(context: Context, tag: String?) {
    if (tag == null) return
    try {
      NotificationManagerCompat.from(context).cancel(tag, EXPO_NOTIFY_ID)
    } catch (e: Exception) {
      Log.w(TAG, "dismiss failed: ${e.message}")
    }
  }
}
