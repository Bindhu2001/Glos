package expo.modules.notifactions

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.Parcelable
import android.os.ResultReceiver
import android.util.Log
import androidx.core.app.NotificationCompat
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
 * Also patches Reply/Mark-as-read action buttons onto chat notifications
 * after expo-notifications posts them (see [patchInActions]) — expo-notifications
 * has a longstanding Android bug where a remote push's `categoryId` fails to
 * attach its registered actions (expo/expo#31503, #31710, #36282), even
 * though the category is registered correctly and the push carries the right
 * categoryId. Rather than depend on that pipeline, we let expo build and post
 * the notification exactly as it always has (preserving its tap/content
 * intent, icon, everything), then add the two actions ourselves right after.
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
    private const val PRESENT_TYPE = "present"
    private const val NOTIFICATION_KEY = "notification"
    private const val NOTIFICATION_ACTION_KEY = "notificationAction"
    private const val USER_TEXT_RESPONSE_KEY = "userTextResponse"
    private const val RECEIVER_KEY = "receiver"

    // Our own action-tap contract for the actions we patch in — deliberately
    // separate from expo's NOTIFICATION_EVENT shape above, since these
    // PendingIntents target this receiver explicitly (by component, not
    // intent-filter match) and never need to round-trip through expo's model
    // classes.
    private const val SELF_ACTION = "expo.modules.notifactions.CHAT_ACTION"
    private const val SELF_ACTION_ID = "actionId"
    private const val SELF_APP_ID = "appId"
    private const val SELF_CONV_ID = "convId"
    private const val SELF_TAG = "tag"
    private const val SELF_TEXT_KEY = "chatReplyText"

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

    // How long to wait after forwarding a chat push to expo-notifications
    // before checking whether it actually posted the notification (so we can
    // patch actions onto it). One retry covers a slower first attempt.
    private const val PATCH_DELAY_MS = 1_200L
    private const val PATCH_RETRY_DELAY_MS = 900L
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
        if (intent.action == SELF_ACTION) {
          processSelfAction(app, intent)
        } else {
          when (safeEventType(intent)) {
            RECEIVE_RESPONSE_TYPE -> process(app, intent)
            PRESENT_TYPE -> presentAndPatch(app, intent)
            else -> forwardAndSettle(app, intent)
          }
        }
      } catch (e: Exception) {
        Log.w(TAG, "worker crashed, forwarding: ${e.message}")
        runCatching { forwardAndSettle(app, intent) }
      } finally {
        finishOnce()
      }
    }.start()
  }

  private fun safeEventType(intent: Intent): String? = try {
    intent.getStringExtra(EVENT_TYPE_KEY)
  } catch (e: Exception) {
    null
  }

  /** Worker thread, under the goAsync() hold. Handles a tap on an action we patched in. */
  private fun processSelfAction(app: Context, intent: Intent) {
    val actionId = intent.getStringExtra(SELF_ACTION_ID) ?: return
    val appId = intent.getIntExtra(SELF_APP_ID, -1)
    val convId = intent.getIntExtra(SELF_CONV_ID, -1)
    val tag = intent.getStringExtra(SELF_TAG)
    if (appId <= 0 || convId <= 0) return
    val rawUserText = if (actionId == REPLY_ACTION) {
      runCatching { RemoteInput.getResultsFromIntent(intent)?.getString(SELF_TEXT_KEY) }.getOrNull().orEmpty()
    } else {
      ""
    }
    // No expo-side fallback to forward to here — the notification this button
    // lives on was posted by expo, but the action itself is ours end-to-end,
    // so a failure here (e.g. expired credentials) is a silent best-effort
    // miss rather than falling back to the JS replay-on-open path, which only
    // covers expo's own response bookkeeping.
    performChatAction(app, actionId, appId, convId, rawUserText, tag)
  }

  /** Worker thread, under the goAsync() hold. Handles an expo NOTIFICATION_EVENT response (e.g. a plain tap, or a legacy pre-patch action). */
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

    val notifTag = reflectNotificationId(intent)
    val ok = performChatAction(app, actionId, appId, convId, rawUserText, notifTag)
    if (!ok) forwardAndSettle(app, intent)
  }

  /** Shared by both action-tap paths above. */
  private fun performChatAction(app: Context, actionId: String, appId: Int, convId: Int, rawUserText: String, notifTag: String?): Boolean {
    val replyText = rawUserText.trim()
    if (actionId == REPLY_ACTION && replyText.isEmpty()) return false

    val creds = NotifAuthStore.load(app)
    val usable = creds != null &&
      creds.token.isNotBlank() &&
      (creds.expiresAtMs <= 0L || creds.expiresAtMs > System.currentTimeMillis())
    if (creds == null || !usable) return false

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

    if (!ok) NotifAuthStore.unmarkHandled(app, handledKey)
    return ok
  }

  // ---- posting: forward to expo, then patch in the actions it drops ----

  private fun presentAndPatch(context: Context, intent: Intent) {
    val receiver = getResultReceiver(intent)
    try {
      runCatching { intent.setExtrasClassLoader(context.classLoader) }
      val info = reflectChatInfo(intent)
      forwardToExpo(context, intent) // unchanged: expo still builds/posts, so tap-to-open, icon etc. are untouched
      if (info != null) {
        Thread.sleep(PATCH_DELAY_MS)
        if (!patchInActions(context, info)) {
          Thread.sleep(PATCH_RETRY_DELAY_MS)
          patchInActions(context, info)
        }
      } else {
        Thread.sleep(SETTLE_MS)
      }
    } catch (e: Exception) {
      Log.w(TAG, "presentAndPatch failed: ${e.message}")
    } finally {
      receiver?.let { runCatching { it.send(0, Bundle()) } }
    }
  }

  /** Finds the just-posted chat notification and adds Reply/Mark-as-read to it. Returns whether it found one to patch. */
  private fun patchInActions(context: Context, info: ChatNotifInfo): Boolean {
    val tag = info.tag ?: return false
    try {
      val active = NotificationManagerCompat.from(context).activeNotifications
      val match = active.firstOrNull { it.tag == tag && it.id == EXPO_NOTIFY_ID } ?: return false

      @Suppress("DEPRECATION")
      val icon = match.notification.icon.takeIf { it != 0 } ?: context.applicationInfo.icon
      val replyIntent = selfActionPendingIntent(context, REPLY_ACTION, info.appId, info.convId, tag, withRemoteInput = true)
      val markReadIntent = selfActionPendingIntent(context, MARK_READ_ACTION, info.appId, info.convId, tag, withRemoteInput = false)
      val remoteInput = RemoteInput.Builder(SELF_TEXT_KEY)
        .setLabel("Type a message...")
        .build()

      val builder = NotificationCompat.Builder.recoverBuilder(context, match.notification)
        .addAction(
          NotificationCompat.Action.Builder(icon, "Reply", replyIntent)
            .addRemoteInput(remoteInput)
            .build()
        )
        .addAction(
          NotificationCompat.Action.Builder(icon, "Mark as read", markReadIntent)
            .build()
        )

      NotificationManagerCompat.from(context).notify(tag, EXPO_NOTIFY_ID, builder.build())
      return true
    } catch (e: Exception) {
      Log.w(TAG, "patchInActions failed: ${e.message}")
      return false
    }
  }

  private fun selfActionPendingIntent(
    context: Context,
    actionId: String,
    appId: Int,
    convId: Int,
    tag: String,
    withRemoteInput: Boolean,
  ): PendingIntent {
    val intent = Intent(context, ChatActionReceiver::class.java).apply {
      action = SELF_ACTION
      putExtra(SELF_ACTION_ID, actionId)
      putExtra(SELF_APP_ID, appId)
      putExtra(SELF_CONV_ID, convId)
      putExtra(SELF_TAG, tag)
    }
    // RemoteInput (the Reply button) requires a mutable PendingIntent on API 31+;
    // Mark-as-read carries no input and stays immutable, per platform guidance.
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or when {
      Build.VERSION.SDK_INT < Build.VERSION_CODES.S -> 0
      withRemoteInput -> PendingIntent.FLAG_MUTABLE
      else -> PendingIntent.FLAG_IMMUTABLE
    }
    return PendingIntent.getBroadcast(context, "$actionId:$tag".hashCode(), intent, flags)
  }

  @Suppress("DEPRECATION")
  private fun getResultReceiver(intent: Intent): ResultReceiver? = try {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      intent.getParcelableExtra(RECEIVER_KEY, ResultReceiver::class.java)
    } else {
      intent.getParcelableExtra(RECEIVER_KEY)
    }
  } catch (e: Exception) {
    null
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

  private data class ChatNotifInfo(val tag: String?, val appId: Int, val convId: Int)

  private fun reflectChatInfo(intent: Intent): ChatNotifInfo? = try {
    val notification = getParcelable(intent, NOTIFICATION_KEY)
    val request = notification?.javaClass?.getMethod("getNotificationRequest")?.invoke(notification)
    val tag = request?.javaClass?.getMethod("getIdentifier")?.invoke(request) as? String
    val content = request?.javaClass?.getMethod("getContent")?.invoke(request)
    val data = content?.javaClass?.getMethod("getBody")?.invoke(content) as? JSONObject
    val appId = data?.optInt("app_id", -1) ?: -1
    val convId = data?.optInt("conversation_id", -1) ?: -1
    if (data?.optString("type") != "chat_message" || appId <= 0 || convId <= 0) null
    else ChatNotifInfo(tag, appId, convId)
  } catch (e: Exception) {
    Log.w(TAG, "reflectChatInfo failed: ${e.message}"); null
  }

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
