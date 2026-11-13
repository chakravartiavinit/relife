import AppKit
import ReLifeKit
import SwiftUI

/// The Settings window (Command-Comma). One grouped Form per tab, sized to its content.
struct SettingsView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        @Bindable var model = model
        TabView(selection: $model.settingsTab) {
            ForEach(SettingsTab.allCases) { tab in
                page(tab)
                    .tabItem { Label(tab.title, systemImage: tab.symbol) }
                    .tag(tab)
            }
        }
        .noInitialFocus()
    }

    @ViewBuilder
    private func page(_ tab: SettingsTab) -> some View {
        Form {
            switch tab {
            case .general: GeneralSettings()
            case .shortcuts: ShortcutSettings()
            case .notifications: NotificationSettings()
            case .account: AccountSettings()
            case .activity: ActivitySettings()
            }
        }
        .formStyle(.grouped)
        .fitsContent()
        .frame(width: 520)
    }
}

struct GeneralSettings: View {
    @Environment(AppModel.self) private var model
    @AppStorage("menubar.show", store: Prefs.defaults) private var showMenuBar = true
    @AppStorage("menubar.count", store: Prefs.defaults) private var showCount = true
    @State private var login = LaunchAtLogin.isEnabled

    var body: some View {
        @Bindable var model = model
        Section("Startup") {
            Toggle("Open \(Brand.name) at login", isOn: $login)
                .onChange(of: login) { _, on in LaunchAtLogin.set(on) }
            Toggle("Show \(Brand.name) in the Dock", isOn: $model.showInDock)
            Text("Without this, the Dock icon shows only while a \(Brand.name) window is open.").font(.caption).foregroundStyle(.secondary)
        }
        Section("Menu bar") {
            Toggle("Show \(Brand.name) in the menu bar", isOn: $showMenuBar)
            Toggle("Show the number of quests left", isOn: $showCount)
                .disabled(!showMenuBar)
        }
    }
}

struct ShortcutSettings: View {
    @Environment(AppModel.self) private var model
    @State private var recording = false
    @State private var monitor: Any?
    @State private var shown = HotKeyCenter.describe(code: Prefs.hotKeyCode, modifiers: Prefs.hotKeyModifiers)
    @State private var error: String?

    var body: some View {
        Section("Quick log") {
            LabeledContent("Shortcut") {
                Button(recording ? "Press a shortcut…" : shown) { recording ? stop() : record() }
                    .buttonStyle(.bordered)
            }
            Text("Works in any app. Needs at least Control, Option or Command. Esc cancels.").font(.caption).foregroundStyle(.secondary)
            if let error { Text(error).font(.caption).foregroundStyle(Tokens.bad) }
            Button("Reset to Default") { apply(code: 49, modifiers: 4096 | 2048) }
        }
        Section("In the app") {
            LabeledContent("Quick Log", value: "⌘L")
            LabeledContent("Open Today", value: "⌘1")
            LabeledContent("Open \(Brand.name) in Browser", value: "⇧⌘D")
            LabeledContent("Refresh", value: "⌘R")
        }
    }

    private func record() {
        recording = true
        error = nil
        monitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { event in
            if event.keyCode == 53 { stop(); return nil }
            let mods = HotKeyCenter.carbonModifiers(event.modifierFlags)
            guard mods & (4096 | 2048 | 256) != 0 else { return nil }
            apply(code: Int(event.keyCode), modifiers: mods)
            stop()
            return nil
        }
    }

    private func stop() {
        recording = false
        if let monitor { NSEvent.removeMonitor(monitor) }
        monitor = nil
    }

    private func apply(code: Int, modifiers: Int) {
        if model.hotKey.register(code: code, modifiers: modifiers) {
            Prefs.hotKeyCode = code
            Prefs.hotKeyModifiers = modifiers
            shown = HotKeyCenter.describe(code: code, modifiers: modifiers)
            error = nil
        } else {
            model.hotKey.register(code: Prefs.hotKeyCode, modifiers: Prefs.hotKeyModifiers)
            error = "Another app already uses that shortcut."
        }
    }
}

struct NotificationSettings: View {
    @Environment(AppModel.self) private var model
    @State private var reminders = Prefs.remindersOnMac

    var body: some View {
        Section("This Mac") {
            Toggle("Reminders on this Mac", isOn: $reminders)
                .onChange(of: reminders) { _, on in
                    Prefs.remindersOnMac = on
                    if on { Task { _ = await model.notifier.requestAuthorization() } }
                }
            LabeledContent("Permission") {
                HStack {
                    Text(permission)
                    if !model.notifier.isAllowed && model.notifier.status != .notDetermined {
                        Button("Open System Settings") { model.notifier.openSystemSettings() }
                    }
                }
            }
            Text("Level ups, cleared quests, and a warning at 21:00 when System quests are left.").font(.caption).foregroundStyle(.secondary)
        }
        Section("Which reminders reach this Mac") {
            Text("Each category picks where it goes (Mac, Phone, Telegram) in the dashboard.").font(.callout).foregroundStyle(.secondary)
            Button("Open Notification Settings in Browser") { model.openDashboard(path: "/settings/notifications") }
        }
    }

    private var permission: String {
        switch model.notifier.status {
        case .authorized, .provisional, .ephemeral: "Allowed"
        case .denied: "Not allowed"
        default: "Not asked yet"
        }
    }
}

struct AccountSettings: View {
    @Environment(AppModel.self) private var model
    @State private var confirming = false

    var body: some View {
        @Bindable var model = model
        Section("Your \(Brand.name)") {
            LabeledContent("Address", value: model.serverURL.map { ServerAddress.display($0) } ?? "Not connected")
            LabeledContent("Account", value: model.me?.name ?? model.view?.name ?? "–")
            LabeledContent("Status") { Text(model.statusLine).foregroundStyle(.secondary) }
            TextField("This Mac is called", text: Binding(get: { model.deviceName }, set: { model.deviceName = $0; Prefs.deviceName = $0 }))
            LabeledContent("Version", value: AppModel.version)
        }
        Section {
            Button("Manage Devices in Browser") { model.openDashboard(path: "/settings/devices") }
            Button("Disconnect This Mac…", role: .destructive) { confirming = true }
                .disabled(!model.isSignedIn)
                .confirmationDialog("Disconnect this Mac from \(Brand.name)?", isPresented: $confirming) {
                    Button("Disconnect", role: .destructive) { Task { await model.disconnect() } }
                } message: {
                    Text("It signs out for good. To use \(Brand.name) for Mac again, connect it again.")
                }
        }
        if let url = model.serverURL, ServerAddress.isLoopback(url), model.localServer.isInstalled {
            LocalServerSection()
        }
    }
}

/// Status, Start, Stop, Restart and Open log for the LaunchAgent that runs the server on this Mac.
struct LocalServerSection: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        let server = model.localServer
        Section("Local server") {
            LabeledContent("Status") {
                HStack(spacing: Space.xs) {
                    Circle().fill(color(server.status)).frame(width: Space.sm, height: Space.sm)
                    Text(label(server.status))
                }
            }
            HStack {
                Button("Start") { Task { await server.start() } }
                Button("Stop") { Task { await server.stop() } }
                Button("Restart") { Task { await server.restart() } }
                Spacer()
                Button("Open Log") { server.openLog() }
            }
            .disabled(server.busy)
            if let error = server.lastError { Text(error).font(.caption).foregroundStyle(Tokens.bad) }
            Text("Rebuilding stays in the terminal: `npm run service -- restart`.").font(.caption).foregroundStyle(.secondary)
        }
        .task { await server.refresh() }
    }

    private func label(_ status: LocalServer.Status) -> String {
        switch status {
        case .unknown: "Checking…"
        case let .running(pid): pid.map { "Running (pid \($0))" } ?? "Running"
        case .stopped: "Stopped"
        }
    }

    private func color(_ status: LocalServer.Status) -> Color {
        switch status {
        case .running: Tokens.good
        case .stopped: Tokens.warn
        case .unknown: Tokens.ink3
        }
    }
}

struct ActivitySettings: View {
    @Environment(AppModel.self) private var model
    @State private var excluded = Prefs.excludedApps

    var body: some View {
        Section("Tracking") {
            Toggle("Track which app is in front", isOn: Binding(get: { !model.trackingPaused }, set: { model.setTrackingPaused(!$0) }))
            Text("\(Brand.name) counts the front app while you use the Mac. Idle time, sleep and a locked screen are not counted. Window titles are never read, so this needs no permission.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        Section("Never record these apps") {
            if excluded.isEmpty {
                Text("None").foregroundStyle(.secondary)
            }
            ForEach(excluded, id: \.self) { id in
                HStack {
                    Text(id)
                    Spacer()
                    Button("Remove", systemImage: "minus.circle") { remove(id) }
                        .labelStyle(.iconOnly)
                        .buttonStyle(.plain)
                }
            }
            Button("Add App…", action: add)
        }
    }

    private func add() {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.application]
        panel.directoryURL = URL(fileURLWithPath: "/Applications")
        panel.message = "Choose an app \(Brand.name) should never record."
        guard panel.runModal() == .OK, let url = panel.url, let id = Bundle(url: url)?.bundleIdentifier, !excluded.contains(id) else { return }
        excluded.append(id)
        Prefs.excludedApps = excluded
        model.watcher.excludedChanged()
    }

    private func remove(_ id: String) {
        excluded.removeAll { $0 == id }
        Prefs.excludedApps = excluded
        model.watcher.excludedChanged()
    }
}
