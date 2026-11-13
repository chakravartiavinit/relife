import Foundation
import Security

/// Where the device token lives. The real one is the Keychain; snapshots and the self-test use memory.
protocol TokenStore {
    func load(account: String) -> String?
    func save(_ token: String, account: String)
    func delete(account: String)
}

/// Keychain generic password: service `com.relife.mac`, account = the server origin, readable after the
/// first unlock, never synced to iCloud (the token belongs to this device).
struct KeychainTokenStore: TokenStore {
    static let service = "com.relife.mac"

    private func query(_ account: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: Self.service,
         kSecAttrAccount as String: account,
         kSecAttrSynchronizable as String: false]
    }

    func load(account: String) -> String? {
        var q = query(account)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let data = out as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    func save(_ token: String, account: String) {
        delete(account: account)
        var q = query(account)
        q[kSecValueData as String] = Data(token.utf8)
        q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(q as CFDictionary, nil)
    }

    func delete(account: String) {
        SecItemDelete(query(account) as CFDictionary)
    }
}

final class MemoryTokenStore: TokenStore {
    private var items: [String: String] = [:]

    func load(account: String) -> String? { items[account] }
    func save(_ token: String, account: String) { items[account] = token }
    func delete(account: String) { items[account] = nil }
}
