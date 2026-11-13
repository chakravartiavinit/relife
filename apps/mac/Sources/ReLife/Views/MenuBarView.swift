import ReLifeKit
import SwiftUI

/// The menu bar icon: a capsule and the badge text (count, ✓, off, !). A template image, so it follows the menu bar.
struct MenuBarLabel: View {
    @Environment(AppModel.self) private var model
    @AppStorage("menubar.count", store: Prefs.defaults) private var showCount = true

    var body: some View {
        let badge = model.badge
        HStack(spacing: Space.xs) {
            Image(systemName: "capsule.lefthalf.filled")
            if showCount, !badge.text.isEmpty { Text(badge.text) }
        }
        .accessibilityLabel(badge.accessibilityLabel)
    }
}

/// The menu bar window (about 320 pt wide): character row, quick log, up to five quests, footer.
/// A window, not a menu, because it holds check boxes and a text field.
struct MenuBarView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.openWindow) private var openWindow
    @Environment(\.openSettings) private var openSettings
    @State private var text = ""

    var body: some View {
        VStack(alignment: .leading, spacing: Space.md) {
            if model.isSignedIn, let view = model.view {
                signedIn(view)
            } else if model.isSignedIn {
                Spinner().frame(maxWidth: .infinity, minHeight: Space.section * 3)
            } else {
                disconnected
            }
            Divider()
            footer
        }
        .padding(Space.lg)
        .frame(width: 320)
        .noInitialFocus()
        .onAppear {
            model.openMainWindow = { openWindow(id: "main") }
            model.openSettingsWindow = { openSettings() }
        }
    }

    private func signedIn(_ view: TodayView) -> some View {
        VStack(alignment: .leading, spacing: Space.md) {
            HStack(alignment: .center, spacing: Space.md) {
                VStack(alignment: .leading, spacing: Space.xs) {
                    HStack(spacing: Space.sm) {
                        LevelPill(level: view.character.level)
                        Text(view.character.title).font(.headline)
                    }
                    Text("\(Format.xpToNext(view.character)) · \(Format.xpToday(view.character).dropFirst())")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
                StreakBadge(streak: view.character.streak, keptToday: view.character.doneToday, freezes: view.character.freezes, compact: true)
            }
            XPBar(progress: Format.progress(view.character), height: Space.xs + 2)
            quickLogField
            if case .offline = model.phase {
                Label(Words.offline(lastUpdated: model.lastUpdated, queued: model.queueCount, timeZone: model.timeZone), systemImage: "icloud.slash")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            quests(view)
        }
    }

    private var quickLogField: some View {
        HStack(spacing: Space.sm) {
            Image(systemName: "sparkles").foregroundStyle(Tokens.pill)
            InputField("Log something…", text: $text)
                .textFieldStyle(.plain)
                .onSubmit {
                    model.log(text)
                    text = ""
                }
            Text(HotKeyCenter.describe(code: Prefs.hotKeyCode, modifiers: Prefs.hotKeyModifiers))
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(Space.sm)
        .background(Tokens.surface, in: RoundedRectangle(cornerRadius: Tokens.radiusSm, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Tokens.radiusSm, style: .continuous).strokeBorder(Tokens.hairline))
    }

    private func quests(_ view: TodayView) -> some View {
        let menu = QuestList.menuRows(view)
        return VStack(alignment: .leading, spacing: Space.xs) {
            HStack {
                Text(QuestList.headline(view)).font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                Spacer()
            }
            if QuestList.isEmpty(view) {
                Text("Nothing due today. Add routines in \(Brand.name).").font(.callout).foregroundStyle(.secondary)
            } else if menu.rows.isEmpty {
                Label("All clear", systemImage: "checkmark.circle.fill")
                    .font(.callout)
                    .foregroundStyle(Tokens.good)
            }
            ForEach(menu.rows) { row in
                MenuQuestRow(row: row)
            }
            if menu.more > 0 {
                Button("+\(menu.more) more") { model.showMainWindow(page: .today) }
                    .linkButton()
                    .font(.caption)
            }
        }
    }

    private var disconnected: some View {
        VStack(alignment: .leading, spacing: Space.sm) {
            Text("Connect to your \(Brand.name)").font(.headline)
            Text(model.statusLine).font(.callout).foregroundStyle(.secondary)
            Button("Open \(Brand.name)") { model.showMainWindow() }
                .buttonStyle(.borderedProminent)
        }
    }

    private var footer: some View {
        VStack(alignment: .leading, spacing: Space.xs) {
            MenuItem(title: "Open Today", symbol: "macwindow", shortcut: "⌘O") { model.showMainWindow(page: .today) }
            MenuItem(title: "Open \(Brand.name) in Browser", symbol: "globe", shortcut: "⇧⌘D") { model.openDashboard() }
            MenuItem(title: "Settings…", symbol: "gearshape", shortcut: "⌘,") { model.showSettings() }
            Divider().padding(.vertical, Space.xs)
            HStack {
                HStack(spacing: Space.xs) {
                    Circle().fill(statusTint).frame(width: Space.sm, height: Space.sm)
                    Text(model.statusLine).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                }
                Spacer()
                Button("Quit ⌘Q") { NSApp.terminate(nil) }.linkButton().font(.caption)
            }
        }
    }

    private var statusTint: Color {
        switch model.phase {
        case .ready: Tokens.good
        case .offline, .serverTooOld, .clientTooOld: Tokens.warn
        default: Tokens.ink3
        }
    }
}

struct MenuItem: View {
    var title: String
    var symbol: String
    var shortcut: String
    var action: () -> Void
    @State private var hovering = false

    var body: some View {
        Button(action: action) {
            HStack(spacing: Space.sm) {
                Image(systemName: symbol).frame(width: Space.xl).foregroundStyle(.secondary)
                Text(title)
                Spacer()
                Text(shortcut).foregroundStyle(.secondary)
            }
            .font(.callout)
            .padding(.horizontal, Space.sm)
            .padding(.vertical, Space.xs + 2)
            .background(hovering ? Tokens.surface2 : .clear, in: RoundedRectangle(cornerRadius: Tokens.radiusSm, style: .continuous))
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .onHover { hovering = $0 }
    }
}

struct MenuQuestRow: View {
    @Environment(AppModel.self) private var model
    var row: QuestRow

    var body: some View {
        HStack(spacing: Space.md) {
            leading
            Text(row.title).font(.callout).lineLimit(1)
            Spacer(minLength: Space.sm)
            trailing
        }
        .padding(.vertical, Space.xs)
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder private var leading: some View {
        switch row {
        case let .system(q): AreaMark(area: q.area, rank: q.rank)
        case let .routine(r):
            CheckToggle(isOn: r.status == .done, area: r.area) { model.check(r, done: r.status != .done) }
        case let .goal(g): AreaMark(area: g.area, rank: nil)
        }
    }

    @ViewBuilder private var trailing: some View {
        switch row {
        case let .system(q):
            Text("+\(q.xp) XP").font(.caption).foregroundStyle(.secondary)
        case let .routine(r):
            Text(r.time).font(.caption).foregroundStyle(.secondary)
        case let .goal(g):
            HStack(spacing: Space.sm) {
                Text("\(Format.number(g.value)) / \(Format.number(g.target))").font(.caption.monospacedDigit()).foregroundStyle(.secondary)
                Button("+\(Format.number(g.step))") { model.add(g) }.controlSize(.small)
            }
        }
    }
}
