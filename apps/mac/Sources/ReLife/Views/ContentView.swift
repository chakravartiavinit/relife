import ReLifeKit
import SwiftUI

/// The main window. Unpaired, ended or still in first-run: the connect flow replaces the content.
/// Otherwise a sidebar with Today, Progress and Activity. Everything else opens in the dashboard.
struct ContentView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.openWindow) private var openWindow
    @Environment(\.openSettings) private var openSettings

    var body: some View {
        Group {
            if model.showsOnboarding {
                OnboardingView()
            } else {
                MainSplitView()
            }
        }
        .frame(minWidth: 760, minHeight: 480)
        .background(WindowAccessor { model.mainWindow = $0 })
        .noInitialFocus()
        .onAppear {
            model.openMainWindow = { openWindow(id: "main") }
            model.openSettingsWindow = { openSettings() }
        }
        .task {
            SeedData.insertIfRequested(into: model)
            Snapshot.runIfRequested(model: model, openSettings: openSettings)
        }
        .overlay(alignment: .bottom) { HUDOverlay() }
    }
}

struct MainSplitView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        @Bindable var model = model
        NavigationSplitView {
            List(SidebarPage.allCases, selection: $model.page) { page in
                Label(page.title, systemImage: page.symbol)
                    .badge(page == .today ? (model.view?.left ?? 0) : 0)
                    .tag(page)
            }
            .navigationSplitViewColumnWidth(min: 180, ideal: 212)
            .safeAreaInset(edge: .bottom) { AccountRow() }
        } detail: {
            Group {
                switch model.page {
                case .today: TodayPage()
                case .progress: ProgressPage()
                case .activity: ActivityPage()
                }
            }
            .navigationTitle(model.page.title)
            .toolbar {
                ToolbarItem(placement: .automatic) {
                    StatusPill(phase: model.phase, queued: model.queueCount, timeZone: model.timeZone)
                }
                ToolbarItem(placement: .automatic) {
                    Button("Quick Log", systemImage: "plus") { model.showQuickLog() }
                        .help("Log something from anywhere (\(HotKeyCenter.describe(code: Prefs.hotKeyCode, modifiers: Prefs.hotKeyModifiers)))")
                }
                ToolbarItem(placement: .automatic) {
                    Button("Open in Browser", systemImage: "arrow.up.forward.square") { model.openDashboard(path: model.page.dashboardPath) }
                        .help("Open this page in the dashboard (⇧⌘D)")
                }
            }
        }
    }
}

extension SidebarPage {
    /// Where "Open in Browser" goes for this page.
    var dashboardPath: String {
        switch self {
        case .today: "/"
        case .progress: "/progress"
        case .activity: "/activity"
        }
    }
}

/// Who this Mac is signed in as, at the bottom of the sidebar.
struct AccountRow: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        HStack(spacing: Space.sm) {
            Image(systemName: "capsule.lefthalf.filled")
                .font(.title3)
                .foregroundStyle(Tokens.pill)
            VStack(alignment: .leading, spacing: 0) {
                Text(model.ownerName).font(.callout.weight(.semibold))
                Text(model.serverURL.map { ServerAddress.isLoopback($0) ? "ReLife on this Mac" : ServerAddress.display($0) } ?? "Not connected")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
        }
        .padding(Space.md)
        .accessibilityElement(children: .combine)
    }
}

/// The small result bar after a quick log: "Logged water 250 ml · Undo".
struct HUDOverlay: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        if let hud = model.hud {
            HUDView(message: hud) { model.undo(hud) }
                .padding(Space.lg)
                .transition(.move(edge: .bottom).combined(with: .opacity))
        }
    }
}

struct HUDView: View {
    var message: HUDMessage
    var onUndo: () -> Void

    var body: some View {
        HStack(spacing: Space.md) {
            Image(systemName: message.isError ? "exclamationmark.triangle.fill" : "checkmark.circle.fill")
                .foregroundStyle(message.isError ? Tokens.warn : Tokens.good)
            Text(message.text).font(.callout)
            if message.undo != nil {
                Button("Undo", action: onUndo).linkButton()
            }
        }
        .padding(.horizontal, Space.lg)
        .padding(.vertical, Space.md)
        .background(.regularMaterial, in: Capsule())
        .overlay(Capsule().strokeBorder(Tokens.hairline))
        .accessibilityElement(children: .combine)
    }
}
