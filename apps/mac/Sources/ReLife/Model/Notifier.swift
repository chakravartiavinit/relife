import AppKit
import Observation
import UserNotifications

/// Notifications on this Mac: level up, quest cleared and the 21:00 System quest warning. Permission is asked
/// at first use (the person turns on "Reminders on this Mac"), never at launch.
@Observable
final class Notifier {
    private(set) var status: UNAuthorizationStatus = .notDetermined

    /// Snapshots and the self-test never touch the real notification center.
    private var available: Bool { !Store.isOverridden }

    var isAllowed: Bool {
        status == .authorized || status == .provisional
    }

    func refreshStatus() {
        guard available else { return }
        Task { [weak self] in
            let current = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
            self?.status = current
        }
    }

    /// Asks for permission. Returns whether notifications may be shown.
    func requestAuthorization() async -> Bool {
        guard available else { return false }
        let granted = (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound])) ?? false
        status = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
        return granted
    }

    func post(id: String, title: String, body: String) {
        guard available, Prefs.remindersOnMac, isAllowed else { return }
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        let request = UNNotificationRequest(identifier: id, content: content, trigger: nil)
        UNUserNotificationCenter.current().add(request)
    }

    func openSystemSettings() {
        if let url = URL(string: "x-apple.systempreferences:com.apple.Notifications-Settings.extension") {
            NSWorkspace.shared.open(url)
        }
    }
}
