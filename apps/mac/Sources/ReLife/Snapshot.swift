import AppKit
import IOKit.pwr_mgt
import ReLifeKit
import SwiftUI

/// Screenshot mode for agents.
///   APP_STORE=/tmp/test.store APP_SEED=1 APP_SNAPSHOT=/tmp/shots <app>
/// writes <name>-light.png and <name>-dark.png for every page, state, panel and Settings tab, then quits:
///   today, progress, activity, today-offline, today-loading, today-empty, today-server-old,
///   onboarding-where, onboarding-connect, onboarding-connect-expired, onboarding-reminders, onboarding-shortcut, connect-ended,
///   menubar, menubar-offline, menubar-unpaired, quicklog, settings-<tab>
/// Each PNG gets a <name>-<mode>-layout.json with the grid probes (tools/check-layout.swift).
/// APP_SNAPSHOT_ONLY=today,menubar limits the set. Add "settings" to include Settings.
enum Snapshot {
    static func runIfRequested(model: AppModel, openSettings: OpenSettingsAction) {
        let env = ProcessInfo.processInfo.environment
        guard let dir = env["APP_SNAPSHOT"], !dir.isEmpty else { return }
        // Snapshots never run against the real database.
        guard Store.isOverridden else {
            print("SNAPSHOT refused: set APP_STORE to a file in /tmp")
            NSApp.terminate(nil)
            return
        }
        let only = env["APP_SNAPSHOT_ONLY"].map { Set($0.split(separator: ",").map(String.init)) }
        func wanted(_ name: String) -> Bool { only?.contains(name) ?? true }
        Task {
            // A sleeping display gives screencapture nothing. Declaring user
            // activity wakes it; the assertion keeps it on until the run quits.
            var activity: IOPMAssertionID = 0
            IOPMAssertionDeclareUserActivity("Snapshots" as CFString, kIOPMUserActiveLocal, &activity)
            var awake: IOPMAssertionID = 0
            IOPMAssertionCreateWithName(kIOPMAssertionTypePreventUserIdleDisplaySleep as CFString,
                                        IOPMAssertionLevel(kIOPMAssertionLevelOn), "Snapshots" as CFString, &awake)
            try? FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
            SeedData.signIn(model)
            try? await Task.sleep(for: .seconds(1.5))
            for mode in ["light", "dark"] {
                NSApp.appearance = NSAppearance(named: mode == "light" ? .aqua : .darkAqua)
                let shot = Shooter(model: model, dir: dir, mode: mode)

                // Pages, ready.
                SeedData.signIn(model)
                for page in SidebarPage.allCases where wanted(page.rawValue) {
                    model.page = page
                    await shot.main(page.rawValue)
                }

                // States of Today.
                model.page = .today
                if wanted("today-offline") {
                    model.phase = .offline(lastUpdated: Date().addingTimeInterval(-1_800))
                    model.queueCount = 2
                    model.pendingRows = ["r:" + SeedData.sampleView.routines[0].id]
                    await shot.main("today-offline")
                    model.queueCount = 0
                    model.pendingRows = []
                }
                if wanted("today-loading") {
                    SeedData.signIn(model)
                    model.phase = .loading
                    model.view = nil
                    try? await Task.sleep(for: .seconds(0.7))
                    await shot.main("today-loading")
                }
                if wanted("today-empty") {
                    SeedData.signIn(model)
                    model.view = emptyView()
                    await shot.main("today-empty")
                }
                if wanted("today-server-old") {
                    SeedData.signIn(model)
                    model.phase = .serverTooOld
                    await shot.main("today-server-old")
                }

                // The Connect flow.
                model.view = nil
                model.onboarded = false
                model.phase = .unpaired
                if wanted("onboarding-where") {
                    model.onboarding = .where
                    model.pairing.local = .found
                    await shot.main("onboarding-where")
                }
                if wanted("onboarding-connect") {
                    model.onboarding = .connect
                    model.pairing.server = ServerAddress.local
                    model.pairing.started = sampleRequest(expiresIn: 272)
                    model.pairing.state = .waiting
                    await shot.main("onboarding-connect")
                }
                if wanted("onboarding-connect-expired") {
                    model.pairing.state = .expired
                    await shot.main("onboarding-connect-expired")
                }
                model.pairing.started = nil
                model.pairing.state = .idle
                if wanted("connect-ended") {
                    model.onboarding = .where
                    model.phase = .sessionEnded(.revoked)
                    await shot.main("connect-ended")
                }
                SeedData.signIn(model)
                model.onboarded = false
                if wanted("onboarding-reminders") {
                    model.onboarding = .reminders
                    await shot.main("onboarding-reminders")
                }
                if wanted("onboarding-shortcut") {
                    model.onboarding = .shortcut
                    await shot.main("onboarding-shortcut")
                }
                SeedData.signIn(model)

                // The menu bar window.
                if wanted("menubar") { await shot.hosted(MenuBarView(), name: "menubar") }
                if wanted("menubar-offline") {
                    model.phase = .offline(lastUpdated: Date().addingTimeInterval(-1_800))
                    model.queueCount = 2
                    await shot.hosted(MenuBarView(), name: "menubar-offline")
                    SeedData.signIn(model)
                    model.queueCount = 0
                }
                if wanted("menubar-unpaired") {
                    model.phase = .unpaired
                    await shot.hosted(MenuBarView(), name: "menubar-unpaired")
                    SeedData.signIn(model)
                }

                // The quick log panel.
                if wanted("quicklog") {
                    model.quickLog.show(model: model, text: "water 500")
                    try? await Task.sleep(for: .seconds(0.8))
                    shot.capture("quicklog", window: model.quickLog.window)
                    model.quickLog.hide()
                }
            }
            if only == nil || only?.contains("settings") == true {
                let main = NSApp.windows.first { $0.canBecomeMain && !$0.isSheet }
                openSettings()
                try? await Task.sleep(for: .seconds(1))
                for mode in ["light", "dark"] {
                    NSApp.appearance = NSAppearance(named: mode == "light" ? .aqua : .darkAqua)
                    for tab in SettingsTab.allCases {
                        model.settingsTab = tab
                        try? await Task.sleep(for: .seconds(0.8))
                        let settings = NSApp.windows.first { $0.isVisible && $0 !== main && !$0.isSheet && !($0 is NSPanel) }
                        Shooter(model: model, dir: dir, mode: mode).capture("settings-\(tab.rawValue)", window: settings)
                    }
                }
            }
            print("SNAPSHOT done \(dir)")
            // An open sheet refuses terminate, and the run would wait forever.
            for window in NSApp.windows { if let sheet = window.attachedSheet { window.endSheet(sheet) } }
            NSApp.terminate(nil)
        }
    }

    /// A Today view with nothing due.
    private static func emptyView() -> TodayView {
        var v = SeedData.sampleView
        v.quests = []
        v.routines = []
        v.goals = []
        v.left = 0
        v.done = 0
        v.total = 0
        v.focus.seconds = 0
        v.focus.byKind = []
        return v
    }

    private static func sampleRequest(expiresIn seconds: TimeInterval) -> PairRequestStarted {
        let json = """
        { "id": "a1b2c3d4-e5f6-4a78-8b9c-0d1e2f3a4b5c", "userCode": "K7P4QX2D", "pollSecret": "x",
          "approveUrl": "http://127.0.0.1:3030/pair/approve?r=a1b2c3d4-e5f6-4a78-8b9c-0d1e2f3a4b5c",
          "expiresAt": "\(ISO8601.string(Date().addingTimeInterval(seconds)))", "interval": 2 }
        """
        // swiftlint:disable:next force_try
        return try! JSONDecoder().decode(PairRequestStarted.self, from: Data(json.utf8))
    }
}

/// Takes the pictures for one appearance.
@MainActor
struct Shooter {
    let model: AppModel
    let dir: String
    let mode: String

    /// The main window, after the UI settles.
    func main(_ name: String) async {
        try? await Task.sleep(for: .seconds(0.8))
        capture(name, window: nil)
    }

    /// A view that normally lives in a menu bar window, shown in a plain window of its natural size.
    func hosted<V: View>(_ view: V, name: String) async {
        let content = view
            .environment(model)
            .tint(Tokens.pill)
            .background(.regularMaterial)
            .clipShape(RoundedRectangle(cornerRadius: Tokens.radiusLg, style: .continuous))
        let hosting = NSHostingView(rootView: content)
        let size = hosting.fittingSize
        let window = NSWindow(contentRect: NSRect(x: 240, y: 240, width: size.width, height: size.height),
                              styleMask: [.borderless], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
        window.backgroundColor = .clear
        window.hasShadow = true
        window.contentView = hosting
        window.appearance = NSApp.appearance
        window.makeKeyAndOrderFront(nil)
        try? await Task.sleep(for: .seconds(0.8))
        capture(name, window: window)
        window.orderOut(nil)
    }

    /// Captures the real window with screencapture, so glass, sidebars, and
    /// materials look exactly as on screen. That needs Screen Recording
    /// permission for the app that started this one. Without it, falls back to
    /// drawing the view hierarchy, which leaves sidebars and glass blank.
    func capture(_ name: String, window: NSWindow?) {
        let path = "\(dir)/\(name)-\(mode).png"
        // Another app can hide this one while snapshots run. Hidden windows cannot be captured.
        if NSApp.isHidden { NSApp.unhideWithoutActivation() }
        guard let window = window ?? NSApp.windows.first(where: { $0.canBecomeMain && !$0.isSheet && !($0 is NSPanel) }) else {
            print("SNAPSHOT no window for \(name)")
            return
        }
        // Active, like a window someone is using: real accent colors and focus rings.
        if !(window is NSPanel) { NSApp.activate() }
        window.makeKeyAndOrderFront(nil)
        let size = window.contentView?.bounds.size ?? .zero
        GridProbes.shared.write(to: path.replacingOccurrences(of: ".png", with: "-layout.json"), window: size)
        try? FileManager.default.removeItem(atPath: path)
        // The first capture of a run sometimes misses the window. Try three times.
        for _ in 1...3 {
            let shot = Process()
            shot.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
            shot.arguments = ["-x", "-o", "-l", String(window.windowNumber), path]
            try? shot.run()
            shot.waitUntilExit()
            if FileManager.default.fileExists(atPath: path) {
                print("SNAPSHOT \(path)")
                return
            }
            Thread.sleep(forTimeInterval: 0.5)
        }
        guard let view = window.contentView?.superview ?? window.contentView,
              let rep = view.bitmapImageRepForCachingDisplay(in: view.bounds) else { return }
        view.cacheDisplay(in: view.bounds, to: rep)
        if let data = rep.representation(using: .png, properties: [:]) {
            try? data.write(to: URL(fileURLWithPath: path))
            print("SNAPSHOT \(path) (fallback: no Screen Recording permission, sidebars and glass are blank)")
        }
    }
}
