/// The first-launch flow, in the order the surfaces plan gives.
enum OnboardingStep: Int, CaseIterable {
    case `where`, connect, reminders, shortcut

    var number: Int { rawValue + 1 }
    static var count: Int { allCases.count }
}

/// The Settings tabs. Snapshot mode walks through every case.
enum SettingsTab: String, CaseIterable, Identifiable {
    case general, shortcuts, notifications, account, activity

    var id: String { rawValue }

    var title: String {
        switch self {
        case .general: "General"
        case .shortcuts: "Shortcuts"
        case .notifications: "Notifications"
        case .account: "Account"
        case .activity: "Activity"
        }
    }

    var symbol: String {
        switch self {
        case .general: "gearshape"
        case .shortcuts: "keyboard"
        case .notifications: "bell"
        case .account: "person.crop.circle"
        case .activity: "desktopcomputer"
        }
    }
}
