import AppKit
import ReLifeKit
import SwiftData
import SwiftUI

// The Mac app: a client of one server (local or cloud). It does not run the server.
//   <app>                              the app
//   APP_STORE=<file> <app>             use another database and keep settings and the token in memory (tests, experiments)
//   APP_SNAPSHOT=<dir> <app>           save a PNG of every page, state, panel and Settings tab in light and dark mode, then quit
//   APP_SEED=1 <app>                   fill an empty /tmp store with a sample character and quests (tools/snap.sh)
//   <app> --selftest                   run the self-test on a /tmp store and quit with 0 or 1 (tools/selftest.sh)
//   APP_HEADLESS=1 ...                  with --selftest or APP_RENDER: run with no NSApplication, so a machine with no logged-in user (CI) works
//   APP_RENDER=<dir> <app>             like APP_SNAPSHOT, but drawn with ImageRenderer: no screen or permission needed (CI)
//   APP_GRID=1 <app>                   draw the 8 pt grid and the layout probes over the window
//   relife://pair?server=…&s=…          connect to a server from a dashboard link
//   relife://log?text=water%20250       open Quick Log with the text filled in (Return saves; links never write alone)
//   relife://open?path=/wealth          open a dashboard page
//   relife://today                      show the Today page

struct ReLifeApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @State private var model = AppModel.shared
    @AppStorage("menubar.show", store: Prefs.defaults) private var showMenuBar = true

    var body: some Scene {
        Window(Brand.name, id: "main") {
            ContentView()
                .environment(model)
                .tint(Tokens.pill)
                .overlay { if GridOverlay.enabled { GridOverlay() } }
        }
        .modelContainer(model.container)
        .defaultSize(width: 1100, height: 720)
        .windowToolbarStyle(.unified)
        .commands { AppCommands(model: model) }

        MenuBarExtra(isInserted: $showMenuBar) {
            MenuBarView()
                .environment(model)
                .tint(Tokens.pill)
        } label: {
            MenuBarLabel()
                .environment(model)
        }
        .menuBarExtraStyle(.window)

        Settings {
            SettingsView()
                .environment(model)
                .tint(Tokens.pill)
        }
        .windowResizability(.contentSize)
    }
}

/// Every action has a menu item and a shortcut. SwiftUI commands do not observe `@Observable` models, so
/// titles here stay static.
struct AppCommands: Commands {
    var model: AppModel

    var body: some Commands {
        SidebarCommands()
        ToolbarCommands()
        CommandGroup(replacing: .newItem) {
            Button("Quick Log…") { model.showQuickLog() }
                .keyboardShortcut("l")
            Button("Open Today") { model.showMainWindow(page: .today) }
                .keyboardShortcut("o")
            Button("Refresh") { Task { await model.refresh(force: true) } }
                .keyboardShortcut("r")
        }
        CommandGroup(after: .sidebar) {
            Divider()
            Button("Today") { model.showMainWindow(page: .today) }.keyboardShortcut("1")
            Button("Progress") { model.showMainWindow(page: .progress) }.keyboardShortcut("2")
            Button("Activity") { model.showMainWindow(page: .activity) }.keyboardShortcut("3")
            Divider()
            Button("Open \(Brand.name) in Browser") { model.openDashboard() }.keyboardShortcut("d", modifiers: [.command, .shift])
            Button("Pause or Resume Activity Tracking") { model.setTrackingPaused(!model.trackingPaused) }
        }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var observers: [NSObjectProtocol] = []

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Started from a terminal, the process is not a foreground app yet.
        NSApp.setActivationPolicy(.regular)
        AppModel.shared.start()
        // The self-test needs no window, so it runs from here (a machine with no screen can run it too).
        SelfTest.runIfRequested(model: AppModel.shared)
        HeadlessSnapshot.runIfRequested(model: AppModel.shared)
        let center = NotificationCenter.default
        for name in [NSWindow.didBecomeKeyNotification, NSWindow.willCloseNotification, NSWindow.didMiniaturizeNotification] {
            observers.append(center.addObserver(forName: name, object: nil, queue: .main) { _ in
                // After the window finished closing or opening.
                DispatchQueue.main.async { MainActor.assumeIsolated { DockPolicy.update() } }
            })
        }
        if Self.launchedAtLogin, Prefs.onboarded {
            // Opened by the login item: stay in the menu bar and keep the window closed.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
                MainActor.assumeIsolated {
                    AppModel.shared.mainWindow?.close()
                    DockPolicy.update()
                }
            }
        } else {
            NSApp.activate()
        }
    }

    /// The login item launch passes 'lgit' in the open event (keyAELaunchedAsLogInItem).
    private static var launchedAtLogin: Bool {
        let event = NSAppleEventManager.shared().currentAppleEvent
        return event?.paramDescriptor(forKeyword: 0x7072_6474)?.enumCodeValue == 0x6C67_6974
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag { AppModel.shared.showMainWindow() }
        return true
    }

    func application(_ application: NSApplication, open urls: [URL]) {
        for url in urls { AppModel.shared.handle(url: url) }
    }

    func applicationWillTerminate(_ notification: Notification) {
        AppModel.shared.watcher.stop()
        if SelfTest.requested { exit(SelfTest.exitCode) }
    }

    /// The Dock menu: the same actions as the menu bar window (os-integrations: every feature three ways).
    func applicationDockMenu(_ sender: NSApplication) -> NSMenu? {
        let menu = NSMenu()
        let items: [(String, Selector)] = [
            ("Quick Log…", #selector(quickLog)),
            ("Open Today", #selector(openToday)),
            ("Open \(Brand.name) in Browser", #selector(openBrowser)),
            ("Pause or Resume Activity Tracking", #selector(toggleTracking)),
        ]
        for (title, action) in items {
            let item = NSMenuItem(title: title, action: action, keyEquivalent: "")
            item.target = self
            menu.addItem(item)
        }
        return menu
    }

    @objc private func quickLog() { AppModel.shared.showQuickLog() }
    @objc private func openToday() { AppModel.shared.showMainWindow(page: .today) }
    @objc private func openBrowser() { AppModel.shared.openDashboard() }
    @objc private func toggleTracking() { AppModel.shared.setTrackingPaused(!AppModel.shared.trackingPaused) }
}
