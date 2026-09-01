package expo.modules.notifactions

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class CredentialsRecord : Record {
  @Field var token: String = ""
  @Field var apiBaseUrl: String = ""
  @Field var expiresAtMs: Double = 0.0
  @Field var email: String? = null
  @Field var firstName: String? = null
  @Field var lastName: String? = null
}

/**
 * JS-facing surface. The app calls `setCredentials` whenever it has a fresh
 * long-lived Clerk token (on foreground, on sign-in) so [ChatActionReceiver]
 * has something to authenticate with while the process is dead. `clearCredentials`
 * is called on sign-out.
 */
class NotifActionsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("NotifActions")

    AsyncFunction("setCredentials") { creds: CredentialsRecord ->
      val context = appContext.reactContext ?: return@AsyncFunction
      NotifAuthStore.save(
        context,
        creds.token,
        creds.apiBaseUrl,
        creds.expiresAtMs.toLong(),
        creds.email,
        creds.firstName,
        creds.lastName,
      )
    }

    AsyncFunction("clearCredentials") {
      val context = appContext.reactContext ?: return@AsyncFunction
      NotifAuthStore.clear(context)
    }

    AsyncFunction("wasHandledNatively") { responseKey: String ->
      val context = appContext.reactContext ?: return@AsyncFunction false
      NotifAuthStore.wasHandled(context, responseKey)
    }
  }
}
