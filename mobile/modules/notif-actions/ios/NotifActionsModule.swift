import ExpoModulesCore
import EXNotifications
import UserNotifications

struct CredentialsRecord: Record {
  @Field var token: String = ""
  @Field var apiBaseUrl: String = ""
  @Field var expiresAtMs: Double = 0
  @Field var email: String?
  @Field var firstName: String?
  @Field var lastName: String?

  init() {}
}

/// JS surface + a NotificationDelegate registered with expo-notifications'
/// NotificationCenterManager. When the user acts on a chat notification's
/// Reply / Mark-as-read button, iOS gives the (possibly just-launched) app a
/// short background window; `didReceive` uses it to hit the chat API directly.
public class NotifActionsModule: Module, NotificationDelegate {
  public func definition() -> ModuleDefinition {
    Name("NotifActions")

    OnCreate {
      NotificationCenterManager.shared.addDelegate(self)
    }

    OnDestroy {
      NotificationCenterManager.shared.removeDelegate(self)
    }

    AsyncFunction("setCredentials") { (creds: CredentialsRecord) in
      NotifAuthStore.save(
        token: creds.token,
        apiBaseURL: creds.apiBaseUrl,
        expiresAtMs: creds.expiresAtMs,
        email: creds.email,
        firstName: creds.firstName,
        lastName: creds.lastName
      )
    }

    AsyncFunction("clearCredentials") {
      NotifAuthStore.clear()
    }

    AsyncFunction("wasHandledNatively") { (responseKey: String) -> Bool in
      NotifAuthStore.wasHandled(responseKey)
    }
  }

  // MARK: - NotificationDelegate

  public func didReceive(
    _ response: UNNotificationResponse,
    completionHandler: @escaping () -> Void
  ) -> Bool {
    let actionId = response.actionIdentifier
    guard actionId == ChatActionHandler.replyAction || actionId == ChatActionHandler.markReadAction else {
      return false
    }

    let request = response.notification.request
    guard let chat = ChatActionHandler.chatData(from: request.content.userInfo) else {
      return false
    }

    let userText = (response as? UNTextInputNotificationResponse)?.userText ?? ""
    if actionId == ChatActionHandler.replyAction,
       userText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      return false
    }

    let key = "\(request.identifier):\(actionId):\(userText)"

    ChatActionHandler.handle(
      actionId: actionId,
      appId: chat.appId,
      convId: chat.convId,
      replyText: userText.trimmingCharacters(in: .whitespacesAndNewlines),
      notificationId: request.identifier,
      responseKey: key
    )

    // Stay a passive observer: EmitterModule + NotificationCenterManager own the
    // completion handler, and returning false keeps the JS response event firing
    // for the app-alive case (JS then defers to us via wasHandledNatively).
    return false
  }
}
