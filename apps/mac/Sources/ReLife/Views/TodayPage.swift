import ReLifeKit
import SwiftUI

/// Today: the character banner, quests and routines with check-off, goals with step buttons, and screen time.
struct TodayPage: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        PageScroll {
            VStack(spacing: Space.lg) {
                PageNotices()
                if let view = model.view {
                    CharacterCard(view: view)
                    if QuestList.isEmpty(view) {
                        EmptyToday()
                    } else {
                        HStack(alignment: .top, spacing: Space.lg) {
                            QuestsCard(view: view)
                            VStack(spacing: Space.lg) {
                                QuickLogCard()
                                if view.focus.seconds > 0 { ScreenTimeCard(focus: view.focus) }
                            }
                            .frame(width: 280)
                        }
                    }
                } else {
                    LoadingBlocks()
                }
            }
            .padding(Space.margin)
            .gridArea("today")
        }
        .background(CanvasBackground())
    }
}

/// The canvas: clean paper with one capsule-blue glow at the top right (the web's `--canvas-wash`).
struct CanvasBackground: View {
    var body: some View {
        ZStack {
            Tokens.bg
            RadialGradient(colors: [Tokens.pill.opacity(0.16), .clear], center: .topTrailing, startRadius: 0, endRadius: 520)
        }
        .ignoresSafeArea()
    }
}

/// Offline, session ended, server too old, queue notices, and the level-up banner. One place for every page.
struct PageNotices: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        VStack(spacing: Space.md) {
            if let banner = model.levelUpBanner {
                NoticeCard(symbol: "sparkles", tint: Tokens.medalGold, title: "Level up", message: banner,
                           actionTitle: "Nice") { model.levelUpBanner = nil }
            }
            switch model.phase {
            case .offline(let last):
                NoticeCard(symbol: "icloud.slash", title: Words.offline(lastUpdated: last, queued: model.queueCount, timeZone: model.timeZone),
                           actionTitle: "Retry") { Task { await model.refresh(force: true) } }
            case .serverTooOld:
                NoticeCard(symbol: "arrow.up.circle", title: Words.serverTooOld, message: nil,
                           actionTitle: "Open update guide") { model.openDashboard(path: "/docs/update") }
            case .clientTooOld(let minimum):
                NoticeCard(symbol: "arrow.up.circle", title: Words.clientTooOld(minimum: minimum))
            default:
                EmptyView()
            }
            if let notice = model.notice {
                NoticeCard(symbol: "tray.full", tint: Tokens.pill, title: notice, actionTitle: "Dismiss") { model.notice = nil }
            }
        }
    }
}

struct CharacterCard: View {
    var view: TodayView

    var body: some View {
        Card(padding: Space.xl) {
            HStack(alignment: .top, spacing: Space.xl) {
                Image(systemName: "capsule.lefthalf.filled")
                    .font(.system(size: 40))
                    .foregroundStyle(Tokens.pill)
                    .frame(width: Space.section + Space.md, height: Space.section * 2)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: Space.sm) {
                    Text(greeting(name: view.name))
                        .font(.system(.largeTitle, design: .rounded, weight: .bold))
                    HStack(spacing: Space.sm) {
                        LevelPill(level: view.character.level)
                        Text(view.character.title).font(.callout.weight(.semibold))
                        Text("· \(view.character.total.formattedXP) XP").font(.callout).foregroundStyle(.secondary)
                    }
                    XPBar(progress: Format.progress(view.character))
                    HStack {
                        Text(Format.xpToNext(view.character)).foregroundStyle(.secondary)
                        Spacer()
                        Text(Format.xpToday(view.character)).foregroundStyle(Tokens.pillInk).fontWeight(.medium)
                    }
                    .font(.caption)
                }
                StreakBadge(streak: view.character.streak, keptToday: view.character.doneToday, freezes: view.character.freezes)
            }
        }
        .gridProbe("character", area: "today")
    }

    private func greeting(name: String, now: Date = .now) -> String {
        let hour = Calendar.current.component(.hour, from: now)
        let part = hour < 12 ? "Morning" : hour < 18 ? "Afternoon" : "Evening"
        return "\(part), \(name)."
    }
}

extension Int {
    /// 23892 becomes "23,892".
    var formattedXP: String { formatted(.number.grouping(.automatic)) }
}

struct QuestsCard: View {
    @Environment(AppModel.self) private var model
    var view: TodayView

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: Space.md) {
                HStack {
                    Text("Quests").font(.headline)
                    Spacer()
                    Text("\(doneCount) of \(totalCount) done")
                        .font(.caption.weight(.semibold).monospacedDigit())
                        .foregroundStyle(.secondary)
                }
                if !view.quests.isEmpty {
                    SystemLabel(text: "System")
                    VStack(spacing: 0) {
                        ForEach(view.quests) { quest in
                            SystemQuestRow(quest: quest)
                            if quest.id != view.quests.last?.id { Divider() }
                        }
                    }
                }
                if !view.routines.isEmpty {
                    sectionTitle("Routines", trailing: "\(view.routines.filter { $0.status == .done }.count) of \(view.routines.count)")
                    VStack(spacing: 0) {
                        ForEach(view.routines) { routine in
                            RoutineRow(routine: routine, pending: model.pendingRows.contains("r:" + routine.id))
                            if routine.id != view.routines.last?.id { Divider() }
                        }
                    }
                }
                if !view.goals.isEmpty {
                    sectionTitle("Goals", trailing: nil)
                    VStack(spacing: 0) {
                        ForEach(view.goals) { goal in
                            GoalRow(goal: goal, pending: model.pendingRows.contains("g:" + goal.id))
                            if goal.id != view.goals.last?.id { Divider() }
                        }
                    }
                }
            }
        }
        .gridProbe("quests", area: "today", edge: nil)
    }

    private var cleared: Int { view.quests.filter { $0.status == .cleared }.count }
    private var doneCount: Int { cleared + view.done }
    private var totalCount: Int { view.quests.count + view.total }

    private func sectionTitle(_ title: String, trailing: String?) -> some View {
        HStack {
            Text(title).font(.caption.weight(.semibold)).foregroundStyle(.secondary)
            Spacer()
            if let trailing { Text(trailing).font(.caption.monospacedDigit()).foregroundStyle(.secondary) }
        }
        .padding(.top, Space.xs)
    }
}

struct SystemQuestRow: View {
    var quest: TodayView.Quest

    var body: some View {
        HStack(spacing: Space.md) {
            AreaMark(area: quest.area, rank: quest.rank)
            VStack(alignment: .leading, spacing: 0) {
                Text(quest.title)
                    .font(.callout)
                    .foregroundStyle(quest.status == .cleared ? .secondary : .primary)
                Text(subtitle).font(.caption).foregroundStyle(.secondary)
            }
            Spacer(minLength: Space.sm)
            trailing
        }
        .padding(.vertical, Space.sm)
        .accessibilityElement(children: .combine)
    }

    private var subtitle: String {
        switch quest.status {
        case .cleared: "Cleared · \(Format.area(quest.area))"
        case .failed: "Missed · \(Format.area(quest.area))"
        case .unverified: "Waiting for data · \(Format.area(quest.area))"
        case .cancelled: "Cancelled · \(Format.area(quest.area))"
        case .active: Format.quest(quest) ?? Format.area(quest.area)
        }
    }

    @ViewBuilder private var trailing: some View {
        switch quest.status {
        case .cleared:
            HStack(spacing: Space.xs) {
                Image(systemName: "checkmark")
                Text("+\(quest.xp) XP")
            }
            .font(.caption.weight(.semibold).monospacedDigit())
            .foregroundStyle(Tokens.good)
            .padding(.horizontal, Space.sm)
            .padding(.vertical, Space.xs)
            .background(Tokens.good.opacity(0.14), in: Capsule())
        case .active:
            XPChip(text: "+\(quest.xp) XP")
        default:
            EmptyView()
        }
    }
}

struct RoutineRow: View {
    @Environment(AppModel.self) private var model
    var routine: TodayView.Routine
    var pending: Bool

    var body: some View {
        HStack(spacing: Space.md) {
            CheckToggle(isOn: routine.status == .done, area: routine.area) {
                model.check(routine, done: routine.status != .done)
            }
            VStack(alignment: .leading, spacing: 0) {
                Text(routine.name)
                    .font(.callout)
                    .foregroundStyle(routine.status == .done || routine.status == .skipped ? .secondary : .primary)
                Text("\(Format.area(routine.area)) · \(routine.time)").font(.caption).foregroundStyle(.secondary)
            }
            Spacer(minLength: Space.sm)
            if pending {
                Image(systemName: "clock").foregroundStyle(.secondary).help("Waiting to send").accessibilityLabel("Waiting to send")
            }
            if routine.status == .skipped { Text("Skipped").font(.caption).foregroundStyle(.secondary) }
        }
        .padding(.vertical, Space.sm)
        .contentShape(Rectangle())
        .contextMenu {
            Button(routine.status == .done ? "Mark Not Done" : "Mark Done") { model.check(routine, done: routine.status != .done) }
            if routine.status == .pending || routine.status == .missed {
                Button("Skip for Today") {
                    Task { await model.perform(.check(scheduleId: routine.scheduleId, occurrence: routine.occurrence, status: .skipped),
                                               row: "r:" + routine.id, label: "Skipped") }
                }
            }
        }
        .accessibilityElement(children: .combine)
    }
}

struct GoalRow: View {
    @Environment(AppModel.self) private var model
    var goal: TodayView.Goal
    var pending: Bool

    var body: some View {
        HStack(spacing: Space.md) {
            AreaMark(area: goal.area, rank: nil)
            VStack(alignment: .leading, spacing: 0) {
                Text(goal.name).font(.callout)
                Text(Format.goal(goal)).font(.caption).foregroundStyle(.secondary)
            }
            Spacer(minLength: Space.sm)
            if pending { Image(systemName: "clock").foregroundStyle(.secondary).help("Waiting to send") }
            Button(Format.goalStep(goal)) { model.add(goal) }
                .controlSize(.small)
                .disabled(goal.value >= goal.target)
        }
        .padding(.vertical, Space.sm)
        .accessibilityElement(children: .combine)
    }
}

struct QuickLogCard: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        Card {
            Button { model.showQuickLog() } label: {
                HStack(spacing: Space.sm) {
                    Image(systemName: "sparkles").foregroundStyle(Tokens.pill)
                    Text("Log something…").foregroundStyle(.secondary)
                    Spacer()
                    Text(HotKeyCenter.describe(code: Prefs.hotKeyCode, modifiers: Prefs.hotKeyModifiers))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding(Space.md)
                .background(Tokens.surface2, in: RoundedRectangle(cornerRadius: Tokens.radiusSm, style: .continuous))
                .contentShape(Rectangle())
            }
            .buttonStyle(PressScaleStyle())
            .accessibilityLabel("Quick log")
        }
    }
}

struct ScreenTimeCard: View {
    var focus: TodayView.Focus

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: Space.md) {
                HStack {
                    Text("Screen time").font(.headline)
                    Spacer()
                    Text("Today").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                }
                FocusBreakdown(focus: focus)
            }
        }
    }
}

struct EmptyToday: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        ContentUnavailableView {
            Label("Nothing due today", systemImage: "checkmark.circle")
        } description: {
            Text("Add routines in \(Brand.name).")
        } actions: {
            Button("Open Today") { model.openDashboard(path: "/") }
        }
        .frame(maxWidth: .infinity, minHeight: 240)
    }
}
