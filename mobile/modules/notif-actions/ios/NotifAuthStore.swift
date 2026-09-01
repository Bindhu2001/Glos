import Foundation
import Security

/// Keychain-backed credential the notification delegate uses while no JS runs,
/// plus a small "already handled" list so the JS replay-on-open path doesn't
/// re-send what we already sent.
enum NotifAuthStore {
  private static let service = "glos.notifactions"
  private static let account = "creds"
  private static let handledKey = "glos.notifactions.handled"
  private static let handledCap = 40
  private static let handledTTL: TimeInterval = 24 * 60 * 60
  // Serializes the read-modify-write on the handled list (called from the
  // main thread, the worker queue, and the JS async queue).
  private static let handledQueue = DispatchQueue(label: "glos.notifactions.handled")

  struct Creds {
    let token: String
    let apiBaseURL: String
    let expiresAtMs: Double
    let email: String
    let firstName: String
    let lastName: String
  }

  // MARK: - credentials (Keychain)

  static func save(
    token: String,
    apiBaseURL: String,
    expiresAtMs: Double,
    email: String?,
    firstName: String?,
    lastName: String?
  ) {
    let dict: [String: Any] = [
      "token": token,
      "apiBaseUrl": trimTrailingSlash(apiBaseURL),
      "expiresAtMs": expiresAtMs,
      "email": email ?? "",
      "firstName": firstName ?? "",
      "lastName": lastName ?? "",
    ]
    guard let data = try? JSONSerialization.data(withJSONObject: dict) else { return }

    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
    ]
    SecItemDelete(query as CFDictionary)

    var add = query
    add[kSecValueData as String] = data
    add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
    SecItemAdd(add as CFDictionary, nil)
  }

  static func clear() {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
    ]
    SecItemDelete(query as CFDictionary)
  }

  static func load() -> Creds? {
    let query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
      kSecReturnData as String: true,
      kSecMatchLimit as String: kSecMatchLimitOne,
    ]
    var out: AnyObject?
    guard SecItemCopyMatching(query as CFDictionary, &out) == errSecSuccess,
          let data = out as? Data,
          let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let token = obj["token"] as? String, !token.isEmpty,
          let base = obj["apiBaseUrl"] as? String, !base.isEmpty
    else {
      return nil
    }
    return Creds(
      token: token,
      apiBaseURL: trimTrailingSlash(base),
      expiresAtMs: (obj["expiresAtMs"] as? Double) ?? 0,
      email: (obj["email"] as? String) ?? "",
      firstName: (obj["firstName"] as? String) ?? "",
      lastName: (obj["lastName"] as? String) ?? ""
    )
  }

  // MARK: - handled-response list (UserDefaults; not secret)

  static func markHandled(_ key: String) {
    handledQueue.sync {
      var list = handledList()
      list.removeAll { ($0["key"] as? String) == key }
      list.append(["key": key, "ts": Date().timeIntervalSince1970])
      if list.count > handledCap {
        list.removeFirst(list.count - handledCap)
      }
      UserDefaults.standard.set(list, forKey: handledKey)
    }
  }

  static func unmarkHandled(_ key: String) {
    handledQueue.sync {
      var list = handledList()
      list.removeAll { ($0["key"] as? String) == key }
      UserDefaults.standard.set(list, forKey: handledKey)
    }
  }

  static func wasHandled(_ key: String) -> Bool {
    let now = Date().timeIntervalSince1970
    return handledQueue.sync {
      handledList().contains { entry in
        guard (entry["key"] as? String) == key,
              let ts = entry["ts"] as? Double else { return false }
        return now - ts < handledTTL
      }
    }
  }

  private static func handledList() -> [[String: Any]] {
    return (UserDefaults.standard.array(forKey: handledKey) as? [[String: Any]]) ?? []
  }

  private static func trimTrailingSlash(_ s: String) -> String {
    var v = s
    while v.hasSuffix("/") { v.removeLast() }
    return v
  }
}
