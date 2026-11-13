import Foundation

/// Per-device settings. These stay on this Mac on purpose (the surfaces plan keeps them local):
/// menu bar options, the shortcut, the dock icon. Account state lives on the server.
enum Prefs {
    /// Snapshots and the self-test write to their own suite, so they never touch the real settings.
    static let defaults: UserDefaults = Store.isOverridden
        ? (UserDefaults(suiteName: "com.relife.mac.test") ?? .standard) : .standard

    private static func bool(_ key: String, default value: Bool) -> Bool {
        defaults.object(forKey: key) == nil ? value : defaults.bool(forKey: key)
    }

    static var serverOrigin: String? {
        get { defaults.string(forKey: "server.origin") }
        set { defaults.set(newValue, forKey: "server.origin") }
    }

    static var deviceID: String? {
        get { defaults.string(forKey: "device.id") }
        set { defaults.set(newValue, forKey: "device.id") }
    }

    static var deviceName: String {
        get { defaults.string(forKey: "device.name") ?? (Host.current().localizedName ?? "Mac") }
        set { defaults.set(newValue, forKey: "device.name") }
    }

    static var ownerName: String? {
        get { defaults.string(forKey: "owner.name") }
        set { defaults.set(newValue, forKey: "owner.name") }
    }

    /// Who the offline queue belongs to (`QueueRules.accountKey`).
    static var queueAccount: String? {
        get { defaults.string(forKey: "queue.account") }
        set { defaults.set(newValue, forKey: "queue.account") }
    }

    static var onboarded: Bool {
        get { bool("onboarded", default: false) }
        set { defaults.set(newValue, forKey: "onboarded") }
    }

    static var showInDock: Bool {
        get { bool("dock.show", default: false) }
        set { defaults.set(newValue, forKey: "dock.show") }
    }

    static var remindersOnMac: Bool {
        get { bool("notifications.reminders", default: false) }
        set { defaults.set(newValue, forKey: "notifications.reminders") }
    }

    static var trackingPaused: Bool {
        get { bool("activity.paused", default: false) }
        set { defaults.set(newValue, forKey: "activity.paused") }
    }

    static var excludedApps: [String] {
        get { defaults.stringArray(forKey: "activity.excluded") ?? [] }
        set { defaults.set(newValue, forKey: "activity.excluded") }
    }

    /// The local day the 21:00 warning last fired.
    static var lastWarnedDay: String? {
        get { defaults.string(forKey: "warning.day") }
        set { defaults.set(newValue, forKey: "warning.day") }
    }

    static var page: String? {
        get { defaults.string(forKey: "window.page") }
        set { defaults.set(newValue, forKey: "window.page") }
    }

    static var settingsTab: String? {
        get { defaults.string(forKey: "settings.tab") }
        set { defaults.set(newValue, forKey: "settings.tab") }
    }

    /// Carbon key code and modifiers of the quick log shortcut. Default: Control-Option-Space.
    static var hotKeyCode: Int {
        get { defaults.object(forKey: "hotkey.code") == nil ? 49 : defaults.integer(forKey: "hotkey.code") }
        set { defaults.set(newValue, forKey: "hotkey.code") }
    }

    static var hotKeyModifiers: Int {
        get { defaults.object(forKey: "hotkey.mods") == nil ? (4096 | 2048) : defaults.integer(forKey: "hotkey.mods") }
        set { defaults.set(newValue, forKey: "hotkey.mods") }
    }
}
