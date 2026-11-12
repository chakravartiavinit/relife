import AppKit
import Foundation

// The entry point. Normally it starts the SwiftUI app. With APP_HEADLESS=1 it runs the self-test or the
// headless render without creating an NSApplication, which needs a logged-in user session (a CI machine has none).
if ProcessInfo.processInfo.environment["APP_HEADLESS"] == "1" {
    Headless.run()
} else {
    ReLifeApp.main()
}

enum Headless {
    /// True when no NSApplication exists (headless run).
    static var isActive: Bool { ProcessInfo.processInfo.environment["APP_HEADLESS"] == "1" }

    static func run() -> Never {
        // Print each line at once, so a hang or crash keeps the lines before it.
        setvbuf(stdout, nil, _IOLBF, 0)
        Task { @MainActor in
            let model = AppModel.shared
            if SelfTest.requested {
                SelfTest.runIfRequested(model: model)
            } else if HeadlessSnapshot.requested {
                HeadlessSnapshot.runIfRequested(model: model)
            } else {
                print("APP_HEADLESS needs --selftest or APP_RENDER=<dir>")
                exit(2)
            }
        }
        // Run the main run loop (not dispatchMain): SwiftUI's renderer waits on the real main thread.
        RunLoop.main.run()
        exit(0)
    }

    /// Ends the process: through NSApp.terminate when there is an app, else with exit().
    @MainActor
    static func finish(code: Int32 = 0) {
        if isActive {
            exit(code)
        } else {
            for window in NSApp.windows { if let sheet = window.attachedSheet { window.endSheet(sheet) } }
            NSApp.terminate(nil)
        }
    }

    /// Sets the app's appearance when there is an app.
    @MainActor
    static func setAppearance(_ name: NSAppearance.Name) {
        if !isActive { NSApp.appearance = NSAppearance(named: name) }
    }
}
