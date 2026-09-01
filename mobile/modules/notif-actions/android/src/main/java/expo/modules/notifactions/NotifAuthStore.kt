package expo.modules.notifactions

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject

/**
 * Small key/value store shared between [NotifActionsModule] (writer, called
 * from JS while the app is alive) and [ChatActionReceiver] (reader, runs while
 * no JS exists). Holds a short-lived Clerk bearer token + the API base URL so
 * the receiver can call the chat endpoints on its own, plus a rolling list of
 * responses it has already actioned (so the JS replay-on-open path doesn't
 * double-send).
 *
 * Plain private SharedPreferences on purpose: the value is a <=1h JWT living in
 * app-private storage — the same exposure as the Clerk session token already in
 * AsyncStorage — and avoiding androidx.security keeps the build lean and keeps
 * Keystore work off the BroadcastReceiver's main thread. Every accessor is
 * wrapped: a storage hiccup degrades to "no credentials" (→ JS replay), never
 * crashes the receiver.
 */
object NotifAuthStore {
  private const val TAG = "GlosNotifActions"
  private const val FILE = "glos_notif_auth"

  private const val HANDLED_KEY = "handled"
  private const val HANDLED_CAP = 40
  private const val HANDLED_TTL_MS = 24L * 60 * 60 * 1000

  data class Creds(
    val token: String,
    val apiBaseUrl: String,
    val expiresAtMs: Long,
    val email: String,
    val firstName: String,
    val lastName: String,
  )

  private fun prefs(context: Context): SharedPreferences =
    context.applicationContext.getSharedPreferences(FILE, Context.MODE_PRIVATE)

  fun save(
    context: Context,
    token: String,
    apiBaseUrl: String,
    expiresAtMs: Long,
    email: String?,
    firstName: String?,
    lastName: String?,
  ) {
    try {
      prefs(context).edit()
        .putString("token", token)
        .putString("api_base_url", apiBaseUrl.trimEnd('/'))
        .putLong("expires_at", expiresAtMs)
        .putString("email", email ?: "")
        .putString("first_name", firstName ?: "")
        .putString("last_name", lastName ?: "")
        .apply()
    } catch (e: Exception) {
      Log.w(TAG, "save failed: ${e.message}")
    }
  }

  fun clear(context: Context) {
    try {
      // Keep the handled list — a sign-out shouldn't resurrect an already-sent
      // reply via the replay path.
      prefs(context).edit()
        .remove("token").remove("api_base_url").remove("expires_at")
        .remove("email").remove("first_name").remove("last_name")
        .apply()
    } catch (e: Exception) {
      Log.w(TAG, "clear failed: ${e.message}")
    }
  }

  fun load(context: Context): Creds? {
    return try {
      val p = prefs(context)
      val token = p.getString("token", null)?.takeIf { it.isNotBlank() } ?: return null
      val base = p.getString("api_base_url", null)?.takeIf { it.isNotBlank() } ?: return null
      Creds(
        token = token,
        apiBaseUrl = base.trimEnd('/'),
        expiresAtMs = p.getLong("expires_at", 0L),
        email = p.getString("email", "") ?: "",
        firstName = p.getString("first_name", "") ?: "",
        lastName = p.getString("last_name", "") ?: "",
      )
    } catch (e: Exception) {
      Log.w(TAG, "load failed: ${e.message}")
      null
    }
  }

  // ---- "already handled" list ---------------------------------------------
  // key = "$notifId:$actionId:$rawUserText" — identical to the dedupKey JS
  // builds in pushNotifications.ts.

  @Synchronized
  fun markHandled(context: Context, key: String) {
    try {
      val next = prune(handledArray(context), key)
      next.put(JSONObject().put("key", key).put("ts", System.currentTimeMillis()))
      while (next.length() > HANDLED_CAP) next.remove(0)
      prefs(context).edit().putString(HANDLED_KEY, next.toString()).apply()
    } catch (e: Exception) {
      Log.w(TAG, "markHandled failed: ${e.message}")
    }
  }

  @Synchronized
  fun unmarkHandled(context: Context, key: String) {
    try {
      val next = prune(handledArray(context), key)
      prefs(context).edit().putString(HANDLED_KEY, next.toString()).apply()
    } catch (e: Exception) {
      Log.w(TAG, "unmarkHandled failed: ${e.message}")
    }
  }

  @Synchronized
  fun wasHandled(context: Context, key: String): Boolean {
    return try {
      val arr = prune(handledArray(context), null)
      (0 until arr.length()).any { arr.optJSONObject(it)?.optString("key") == key }
    } catch (e: Exception) {
      Log.w(TAG, "wasHandled failed: ${e.message}")
      false
    }
  }

  private fun handledArray(context: Context): JSONArray {
    val raw = prefs(context).getString(HANDLED_KEY, null) ?: return JSONArray()
    return try { JSONArray(raw) } catch (e: Exception) { JSONArray() }
  }

  /** Drop expired entries and (optionally) any entry matching [exclude]. */
  private fun prune(arr: JSONArray, exclude: String?): JSONArray {
    val now = System.currentTimeMillis()
    val out = JSONArray()
    for (i in 0 until arr.length()) {
      val o = arr.optJSONObject(i) ?: continue
      if (now - o.optLong("ts") >= HANDLED_TTL_MS) continue
      if (exclude != null && o.optString("key") == exclude) continue
      out.put(o)
    }
    return out
  }
}
