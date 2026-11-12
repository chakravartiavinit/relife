import AppKit
import ReLifeKit
import SwiftData

/// Self-test for agents: runs the app's real functions on a test store with the offline queue, prints PASS or
/// FAIL per check, and quits with exit code 0 or 1.
///   APP_STORE=/tmp/ReLife-self.store ~/Applications/ReLife.app/Contents/MacOS/ReLife --selftest
/// (tools/selftest.sh does this.) Add a check for every story with logic.
@MainActor
enum SelfTest {
    static var requested: Bool { CommandLine.arguments.contains("--selftest") }
    /// Read by AppDelegate.applicationWillTerminate.
    static var exitCode: Int32 = 0
    private static var failures = 0
    private static var count = 0

    static func runIfRequested(model: AppModel) {
        guard requested else { return }
        // Print each line at once, so a crash keeps the lines before it.
        setvbuf(stdout, nil, _IOLBF, 0)
        guard Store.isOverridden else {
            print("SELFTEST refused: set APP_STORE to a file in /tmp")
            finish(code: 1)
            return
        }
        Task {
            try? await Task.sleep(for: .seconds(0.5))
            await run(model)
            print(failures == 0 ? "SELFTEST PASS \(count) checks" : "SELFTEST FAIL \(failures) of \(count) checks")
            finish(code: failures == 0 ? 0 : 1)
        }
    }

    private static func run(_ model: AppModel) async {
        // Seed data parses and the badge counts what is left.
        SeedData.signIn(model)
        check("the sample view decodes", SeedData.sampleView.character.level == 21)
        check("the badge counts what is left", model.badge == .count(6), "\(model.badge)")
        check("the badge says unreachable when offline", BadgeState.make(view: model.view, reachable: false, trackingPaused: false) == .unreachable)

        // The quick log shortcut registers (Carbon, no permission).
        check("the global shortcut registers", model.hotKey.register(code: Prefs.hotKeyCode, modifiers: Prefs.hotKeyModifiers))
        check("the shortcut reads Control-Option-Space", HotKeyCenter.describe(code: 49, modifiers: 4096 | 2048) == "⌃⌥Space")

        // The Keychain keeps a token and gives it back.
        let keychain = KeychainTokenStore()
        let account = "selftest.\(UUID().uuidString)"
        keychain.save("rlf_m_selftest", account: account)
        check("the Keychain stores the token", keychain.load(account: account) == "rlf_m_selftest")
        keychain.delete(account: account)
        check("the Keychain forgets it on delete", keychain.load(account: account) == nil)

        // Offline queue: point at a port nobody listens on, sign in with a fake token, then act.
        model.serverURL = URL(string: "http://127.0.0.1:9")
        model.tokens.save("rlf_m_selftest", account: "http://127.0.0.1:9")
        let before = model.view?.left ?? 0
        let routine = SeedData.sampleView.routines[0]
        await model.perform(.check(scheduleId: routine.scheduleId, occurrence: routine.occurrence, status: .done), row: "r:" + routine.id, label: "Done")
        check("checking a routine updates the badge at once", model.view?.left == before - 1, "left \(model.view?.left ?? -1)")
        check("an unreachable server queues the write", model.queueCount == 1, "queue \(model.queueCount)")
        check("the row shows its clock", model.pendingRows.contains("r:" + routine.id))
        check("the status goes offline", !model.reachable)
        let stored = (try? model.container.mainContext.fetch(FetchDescriptor<PendingOp>())) ?? []
        check("the queued write is saved in SwiftData", stored.count == 1 && stored.first?.value.kind == .action)
        if let op = stored.first?.value, let action = try? JSONDecoder().decode(TodayAction.self, from: op.body) {
            check("the queued write keeps its action", action == .check(scheduleId: routine.scheduleId, occurrence: routine.occurrence, status: .done))
        } else {
            check("the queued write keeps its action", false)
        }
        await model.flushQueue(force: true)
        check("a flush with no server keeps the write", model.queueCount == 1)
        check("and counts the attempt", ((try? model.container.mainContext.fetch(FetchDescriptor<PendingOp>())) ?? []).first?.attempts == 1)

        // Quick log through the URL scheme.
        model.handle(url: URL(string: "relife://log?text=water%20250")!)
        try? await Task.sleep(for: .seconds(1.5))
        check("relife://log queues a quick log", model.queueCount == 2, "queue \(model.queueCount)")
        check("a bad link does nothing", RelifeLink(url: URL(string: "relife://open?path=//evil")!) == nil)

        // The activity watcher never records ReLife itself.
        check("the watcher skips ReLife's own windows", ActivityWatcher.excluded.contains("com.relife.mac"))

        // Notice texts.
        check("the account-change notice names the count", QueueNotice.accountChanged(dropped: 2)?.hasPrefix("2 unsent logs were cleared") == true)

        // Session end clears the token and shows Connect.
        model.endSession(.revoked)
        check("a revoked token shows the Connect screen", model.showsOnboarding)
        check("and clears the token", model.tokens.load(account: "http://127.0.0.1:9") == nil)
        check("with the reason in words", Words.sessionEnded(.revoked) == "This device was disconnected from ReLife.")
    }

    private static func check(_ name: String, _ ok: Bool, _ detail: String = "") {
        count += 1
        if !ok { failures += 1 }
        print(ok ? "PASS \(name)" : "FAIL \(name)\(detail.isEmpty ? "" : ": \(detail)")")
    }

    /// Quits through NSApp.terminate, never exit(), and closes sheets first:
    /// an open sheet refuses terminate, and the run would wait forever.
    static func finish(code: Int32) {
        exitCode = code
        for window in NSApp.windows { if let sheet = window.attachedSheet { window.endSheet(sheet) } }
        NSApp.terminate(nil)
    }
}
