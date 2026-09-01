import Foundation
import UIKit
import UserNotifications

/// Serializes begin/end of a single UIBackgroundTask so the expiration handler
/// and the worker block can't double-end or leak it.
private final class BGTaskHolder {
  private let lock = NSLock()
  private var id: UIBackgroundTaskIdentifier = .invalid

  func begin(_ name: String) {
    lock.lock(); defer { lock.unlock() }
    guard id == .invalid else { return }
    id = UIApplication.shared.beginBackgroundTask(withName: name) { [weak self] in
      self?.end()
    }
  }

  func end() {
    lock.lock(); defer { lock.unlock() }
    guard id != .invalid else { return }
    UIApplication.shared.endBackgroundTask(id)
    id = .invalid
  }
}

/// The iOS counterpart of Android's ChatActionReceiver: talks to the chat API
/// directly, holding the process awake with a background task, so a Reply /
/// Mark-as-read acted on while the app is not running still goes through.
enum ChatActionHandler {
  static let replyAction = "reply"
  static let markReadAction = "mark_read"

  // Kept well inside the ~30s iOS grants for a notification-action background
  // launch. reply = one POST; mark_read = a short GET + a POST.
  private static let requestTimeout: TimeInterval = 10
  private static let quickTimeout: TimeInterval = 6
  // How long the caller blocks on the semaphore before giving up on a request.
  private static let waitSlackSeconds: TimeInterval = 3

  // MARK: - entry point

  static func handle(
    actionId: String,
    appId: Int,
    convId: Int,
    replyText: String,
    notificationId: String,
    responseKey: String
  ) {
    // Claim it up front (synchronously, before any I/O) so a JS response
    // listener firing on the same run loop defers to us. Rolled back on any
    // path that doesn't actually send.
    NotifAuthStore.markHandled(responseKey)

    // Claim background time now (cheap, no I/O) — before yielding the main
    // thread — so there's no gap where iOS could suspend us.
    let bg = BGTaskHolder()
    bg.begin("glos-notif-action")

    DispatchQueue.global(qos: .userInitiated).async {
      defer { bg.end() }

      guard let creds = NotifAuthStore.load() else {
        NotifAuthStore.unmarkHandled(responseKey) // leave it for JS replay-on-open
        return
      }
      let nowMs = Date().timeIntervalSince1970 * 1000
      if creds.expiresAtMs > 0, creds.expiresAtMs <= nowMs {
        NotifAuthStore.unmarkHandled(responseKey)
        return
      }

      let ok: Bool
      if actionId == replyAction {
        let sent = postMessage(creds, appId, convId, replyText)
        if sent {
          dismiss(notificationId)
          // "read on reply" — detached, doesn't gate anything.
          DispatchQueue.global(qos: .utility).async {
            _ = markRead(creds, appId, convId)
          }
        }
        ok = sent
      } else {
        let read = markRead(creds, appId, convId)
        if read { dismiss(notificationId) }
        ok = read
      }

      if !ok {
        NotifAuthStore.unmarkHandled(responseKey)
      }
    }
  }

  // MARK: - payload parsing

  /// Expo delivers a remote push's custom `data` under `userInfo["body"]`
  /// (EXNotificationSerializer). Accept a dict or a JSON string, or the raw
  /// userInfo as a fallback.
  static func chatData(from userInfo: [AnyHashable: Any]) -> (appId: Int, convId: Int)? {
    let raw: Any = userInfo["body"] ?? userInfo
    var dict: [String: Any]?
    if let d = raw as? [String: Any] {
      dict = d
    } else if let s = raw as? String, let data = s.data(using: .utf8) {
      dict = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    }
    guard let d = dict, (d["type"] as? String) == "chat_message" else { return nil }
    let appId = intValue(d["app_id"])
    let convId = intValue(d["conversation_id"])
    guard appId > 0, convId > 0 else { return nil }
    return (appId, convId)
  }

  static func intValue(_ any: Any?) -> Int {
    if let n = any as? NSNumber { return n.intValue }
    if let s = any as? String { return Int(s) ?? 0 }
    return 0
  }

  // MARK: - chat API

  private static func postMessage(_ creds: NotifAuthStore.Creds, _ appId: Int, _ convId: Int, _ text: String) -> Bool {
    let payload: [String: Any] = [
      "body": text,
      "reply_to_id": NSNull(),
      "attachments": [],
      "_tempId": "notif-\(Int(Date().timeIntervalSince1970 * 1000))-\(UUID().uuidString)",
    ]
    guard let body = try? JSONSerialization.data(withJSONObject: payload) else { return false }
    let (code, _) = request(creds, "POST", "/apps/\(appId)/chat/\(convId)/messages", body, requestTimeout)
    return (200..<300).contains(code)
  }

  private static func markRead(_ creds: NotifAuthStore.Creds, _ appId: Int, _ convId: Int) -> Bool {
    let lastId = latestMessageId(creds, appId, convId)
    let payload: [String: Any] = ["last_read_message_id": lastId.map { $0 as Any } ?? NSNull()]
    guard let body = try? JSONSerialization.data(withJSONObject: payload) else { return false }
    let (code, _) = request(creds, "POST", "/apps/\(appId)/chat/\(convId)/read", body, requestTimeout)
    return (200..<300).contains(code)
  }

  private static func latestMessageId(_ creds: NotifAuthStore.Creds, _ appId: Int, _ convId: Int) -> Int? {
    let (code, data) = request(creds, "GET", "/apps/\(appId)/chat/\(convId)/messages?limit=1", nil, quickTimeout)
    guard (200..<300).contains(code),
          let data = data,
          let arr = (try? JSONSerialization.jsonObject(with: data)) as? [[String: Any]],
          let last = arr.last
    else {
      return nil
    }
    let id = intValue(last["id"])
    return id > 0 ? id : nil
  }

  private static func request(
    _ creds: NotifAuthStore.Creds,
    _ method: String,
    _ path: String,
    _ body: Data?,
    _ timeout: TimeInterval
  ) -> (Int, Data?) {
    guard let url = URL(string: creds.apiBaseURL + path) else { return (0, nil) }
    var req = URLRequest(url: url)
    req.httpMethod = method
    req.timeoutInterval = timeout
    req.setValue("Bearer \(creds.token)", forHTTPHeaderField: "Authorization")
    req.setValue("application/json", forHTTPHeaderField: "Accept")
    if !creds.email.isEmpty { req.setValue(creds.email, forHTTPHeaderField: "x-user-email") }
    if !creds.firstName.isEmpty { req.setValue(creds.firstName, forHTTPHeaderField: "x-user-firstname") }
    if !creds.lastName.isEmpty { req.setValue(creds.lastName, forHTTPHeaderField: "x-user-lastname") }
    if let body = body {
      req.httpBody = body
      req.setValue("application/json; charset=utf-8", forHTTPHeaderField: "Content-Type")
    }

    let sem = DispatchSemaphore(value: 0)
    var status = 0
    var respData: Data?
    let task = URLSession.shared.dataTask(with: req) { data, resp, _ in
      status = (resp as? HTTPURLResponse)?.statusCode ?? 0
      respData = data
      sem.signal()
    }
    task.resume()
    // On timeout, cancel and return without touching status/respData — the
    // completion closure may still be writing them (no happens-before without
    // a successful wait).
    if sem.wait(timeout: .now() + timeout + waitSlackSeconds) == .timedOut {
      task.cancel()
      return (0, nil)
    }
    return (status, respData)
  }

  private static func dismiss(_ notificationId: String) {
    UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: [notificationId])
  }
}
