import Foundation
import Security

/// Where the device token lives. The real one is the Keychain; snapshots and the self-test use memory.
protocol TokenStore {
    func load(account: String) -> String?
    /// False when the token could not be stored.
    @discardableResult func save(_ token: String, account: String) -> Bool
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

    @discardableResult
    func save(_ token: String, account: String) -> Bool {
        delete(account: account)
        var q = query(account)
        q[kSecValueData as String] = Data(token.utf8)
        q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        return SecItemAdd(q as CFDictionary, nil) == errSecSuccess
    }

    func delete(account: String) {
        SecItemDelete(query(account) as CFDictionary)
    }
}

final class MemoryTokenStore: TokenStore {
    private var items: [String: String] = [:]

    func load(account: String) -> String? { items[account] }
    @discardableResult
    func save(_ token: String, account: String) -> Bool { items[account] = token; return true }
    func delete(account: String) { items[account] = nil }
}
