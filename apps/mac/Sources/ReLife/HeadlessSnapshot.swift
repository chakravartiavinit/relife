import AppKit
import ReLifeKit
import SwiftUI

/// Snapshots with no screen: `APP_RENDER=<dir>` draws each surface with `ImageRenderer` and writes
/// `<name>-light.png` and `<name>-dark.png`, then quits. It needs no window server, no Screen Recording
/// permission and no logged-in user, so a build machine with no display (CI) can run it.
///
/// What it does not show: system chrome (title bar, toolbar, real sidebar glass) and AppKit-backed controls
/// (switches, grouped Forms, text field borders), which `ImageRenderer` cannot draw. The window composition
/// here uses a plain stand-in sidebar. `tools/snap.sh` (real windows, screencapture) is the full check on a Mac
/// with a screen.
enum HeadlessSnapshot {
    static var requested: Bool { !(ProcessInfo.processInfo.environment["APP_RENDER"] ?? "").isEmpty }

    static func runIfRequested(model: AppModel) {
        guard let dir = ProcessInfo.processInfo.environment["APP_RENDER"], !dir.isEmpty else { return }
        guard Store.isOverridden else {
            print("RENDER refused: set APP_STORE to a file in /tmp")
            Headless.finish(code: 1)
            return
        }
        try? FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
        print("RENDER start \(dir)")
        Task {
            try? await Task.sleep(for: .seconds(0.3))
            for mode in ["light", "dark"] {
                let scheme: ColorScheme = mode == "light" ? .light : .dark
                Headless.setAppearance(mode == "light" ? .aqua : .darkAqua)
                let draw = Drawer(model: model, dir: dir, mode: mode, scheme: scheme)

                SeedData.signIn(model)
                for page in SidebarPage.allCases { draw.window(page.rawValue, page: page) }

                model.phase = .offline(lastUpdated: Date().addingTimeInterval(-1_800))
                model.queueCount = 2
                model.pendingRows = ["r:" + SeedData.sampleView.routines[0].id]
                draw.window("today-offline", page: .today)
                model.queueCount = 0
                model.pendingRows = []

                SeedData.signIn(model)
                model.phase = .serverTooOld
                draw.window("today-server-old", page: .today)

                SeedData.signIn(model)
                var empty = SeedData.sampleView
                empty.quests = []
                empty.routines = []
                empty.goals = []
                empty.left = 0
                empty.done = 0
                empty.total = 0
                empty.focus.seconds = 0
                empty.focus.byKind = []
                model.view = empty
                draw.window("today-empty", page: .today)

                SeedData.signIn(model)
                model.levelUpBanner = "Level 22 · Vanguard"
                draw.window("today-level-up", page: .today)
                model.levelUpBanner = nil

                model.view = nil
                model.onboarded = false
                model.phase = .unpaired
                model.onboarding = .where
                model.pairing.local = .found
                draw.full("onboarding-where", OnboardingView())

                model.onboarding = .connect
                model.pairing.server = ServerAddress.local
                model.pairing.started = sampleRequest(expiresIn: 272)
                model.pairing.state = .waiting
                draw.full("onboarding-connect", OnboardingView())
                model.pairing.state = .expired
                draw.full("onboarding-connect-expired", OnboardingView())
                model.pairing.started = nil
                model.pairing.state = .idle

                model.onboarding = .where
                model.phase = .sessionEnded(.revoked)
                draw.full("connect-ended", OnboardingView())

                SeedData.signIn(model)
                model.onboarded = false
                model.onboarding = .reminders
                draw.full("onboarding-reminders", OnboardingView())
                model.onboarding = .shortcut
                draw.full("onboarding-shortcut", OnboardingView())

                SeedData.signIn(model)
                draw.popover("menubar", MenuBarView())
                model.phase = .offline(lastUpdated: Date().addingTimeInterval(-1_800))
                model.queueCount = 2
                draw.popover("menubar-offline", MenuBarView())
                model.queueCount = 0
                model.phase = .unpaired
                draw.popover("menubar-unpaired", MenuBarView())

                SeedData.signIn(model)
                draw.panel("quicklog", QuickLogView(initialText: "water 500", onClose: {}))
            }
            print("RENDER done \(dir)")
            Headless.finish()
        }
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

@MainActor
private struct Drawer {
    let model: AppModel
    let dir: String
    let mode: String
    let scheme: ColorScheme

    /// The main window with a stand-in sidebar.
    func window(_ name: String, page: SidebarPage) {
        model.page = page
        write(name, size: CGSize(width: 1100, height: 720), content: StaticWindow(page: page).environment(model))
    }

    /// A surface that fills the window.
    func full<V: View>(_ name: String, _ view: V) {
        write(name, size: CGSize(width: 1100, height: 720), content: view.environment(model))
    }

    /// The menu bar window, at its natural height, on a desktop-coloured margin.
    func popover<V: View>(_ name: String, _ view: V) {
        let body = view
            .environment(model)
            .background(Tokens.surface)
            .clipShape(RoundedRectangle(cornerRadius: Tokens.radiusLg, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Tokens.radiusLg, style: .continuous).strokeBorder(Tokens.hairline))
            .padding(Space.xl)
            .background(Tokens.skySoft)
        write(name, size: nil, content: body)
    }

    func panel<V: View>(_ name: String, _ view: V) {
        write(name, size: nil, content: view.environment(model).padding(Space.xl).background(Tokens.skySoft))
    }

    private func write<V: View>(_ name: String, size: CGSize?, content: V) {
        // The colour scheme goes on the outside, so the backdrop resolves its dynamic colours in the same scheme.
        let base = content.tint(Tokens.pill)
        let sized: AnyView = size.map { AnyView(base.frame(width: $0.width, height: $0.height).background(Tokens.bg).environment(\.colorScheme, scheme)) }
            ?? AnyView(base.environment(\.colorScheme, scheme))
        print("RENDER drawing \(name)-\(mode)")
        let renderer = ImageRenderer(content: sized)
        renderer.scale = 2
        let path = "\(dir)/\(name)-\(mode).png"
        guard let image = renderer.cgImage,
              let png = NSBitmapImageRep(cgImage: image).representation(using: .png, properties: [:]) else {
            print("RENDER failed \(name)-\(mode)")
            return
        }
        try? png.write(to: URL(fileURLWithPath: path))
        print("RENDER \(path)")
    }
}

/// A plain sidebar and the page, standing in for `NavigationSplitView` (which `ImageRenderer` cannot draw).
private struct StaticWindow: View {
    @Environment(AppModel.self) private var model
    var page: SidebarPage

    var body: some View {
        HStack(spacing: 0) {
            VStack(alignment: .leading, spacing: Space.xs) {
                Spacer().frame(height: Space.section)
                ForEach(SidebarPage.allCases) { item in
                    HStack {
                        Label(item.title, systemImage: item.symbol)
                        Spacer()
                        if item == .today, let left = model.view?.left, left > 0 {
                            Text("\(left)").foregroundStyle(.secondary).monospacedDigit()
                        }
                    }
                    .padding(.horizontal, Space.md)
                    .padding(.vertical, Space.sm)
                    .background(item == page ? Tokens.surface3 : .clear, in: RoundedRectangle(cornerRadius: Tokens.radiusSm, style: .continuous))
                }
                Spacer()
                AccountRow()
            }
            .padding(Space.sm)
            .frame(width: 212)
            .background(Tokens.surface2)
            Divider()
            VStack(spacing: 0) {
                HStack {
                    Text(page.title).font(.headline)
                    Spacer()
                    StatusPill(phase: model.phase, queued: model.queueCount, timeZone: model.timeZone)
                }
                .padding(.horizontal, Space.margin)
                .frame(height: Space.section + Space.md)
                Divider()
                // The page overflows the window; show its top and clip the rest, like a scroll view at the top.
                Color.clear
                    .overlay(alignment: .top) {
                        switch page {
                        case .today: TodayPage()
                        case .progress: ProgressPage()
                        case .activity: ActivityPage()
                        }
                    }
                    .clipped()
            }
        }
    }
}
