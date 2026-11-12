import AppKit
import ReLifeKit
import SwiftUI

/// Progress: level, title, streak and best, freezes. Weekly quests, chests and the week per area are not part
/// of the Today view, so they stay in the dashboard (one tap away).
struct ProgressPage: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        PageScroll {
            VStack(spacing: Space.lg) {
                PageNotices()
                if let view = model.view {
                    Card(padding: Space.xl) {
                        VStack(alignment: .leading, spacing: Space.md) {
                            SystemLabel(text: "Level")
                            HStack(spacing: Space.sm) {
                                LevelPill(level: view.character.level)
                                Text(view.character.title).font(.title2.weight(.semibold))
                            }
                            XPBar(progress: Format.progress(view.character), height: Space.md)
                            HStack {
                                Text(Format.xpToNext(view.character)).foregroundStyle(.secondary)
                                Spacer()
                                Text("\(view.character.total.formattedXP) XP total").foregroundStyle(.secondary)
                            }
                            .font(.callout)
                            Text(Format.xpToday(view.character))
                                .font(.callout.weight(.medium))
                                .foregroundStyle(Tokens.pillInk)
                        }
                    }
                    HStack(alignment: .top, spacing: Space.lg) {
                        statCard(title: "Streak", symbol: view.character.doneToday ? "flame.fill" : "flame",
                                 tint: view.character.doneToday ? Tokens.medalGold : Tokens.ink3,
                                 value: Format.streak(view.character.streak),
                                 detail: view.character.doneToday ? "Kept today" : "Not kept yet today")
                        statCard(title: "Best streak", symbol: "trophy", tint: Tokens.medalGold,
                                 value: "\(view.character.best) days", detail: nil)
                        statCard(title: "Streak freezes", symbol: "snowflake", tint: Tokens.sky,
                                 value: "\(view.character.freezes)", detail: "Save a streak after a missed day")
                    }
                    Card {
                        HStack {
                            VStack(alignment: .leading, spacing: Space.xs) {
                                Text("Weekly quests, chests and the week per area").font(.callout.weight(.semibold))
                                Text("These live in the dashboard.").font(.callout).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Button("Open Progress in Browser") { model.openDashboard(path: "/progress") }
                        }
                    }
                } else {
                    LoadingBlocks()
                }
            }
            .padding(Space.margin)
            .gridArea("progress")
        }
        .background(CanvasBackground())
    }

    private func statCard(title: String, symbol: String, tint: Color, value: String, detail: String?) -> some View {
        Card {
            VStack(alignment: .leading, spacing: Space.sm) {
                Label(title, systemImage: symbol).font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                    .labelStyle(TintedIconLabelStyle(tint: tint))
                Text(value).font(.system(.title2, design: .rounded, weight: .bold).monospacedDigit())
                if let detail { Text(detail).font(.caption).foregroundStyle(.secondary) }
            }
        }
    }
}

/// A label whose icon carries a mark colour while the text stays plain.
struct TintedIconLabelStyle: LabelStyle {
    var tint: Color

    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: Space.xs) {
            configuration.icon.foregroundStyle(tint)
            configuration.title
        }
    }
}

/// Activity: today's time by kind (from the server, all sources) and what this Mac is recording right now.
struct ActivityPage: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        PageScroll {
            VStack(spacing: Space.lg) {
                PageNotices()
                if let view = model.view {
                    Card {
                        VStack(alignment: .leading, spacing: Space.md) {
                            HStack {
                                Text("Screen time today").font(.headline)
                                Spacer()
                                Text("All devices").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                            }
                            if view.focus.seconds > 0 {
                                FocusBreakdown(focus: view.focus)
                            } else {
                                Text("Nothing recorded yet today.").font(.callout).foregroundStyle(.secondary)
                            }
                        }
                    }
                } else {
                    LoadingBlocks(heights: [Space.section * 5])
                }
                ThisMacCard()
                Card {
                    HStack {
                        Text("Counts as, sites and the full breakdown").font(.callout.weight(.semibold))
                        Spacer()
                        Button("Open Activity in Browser") { model.openDashboard(path: "/activity") }
                    }
                }
            }
            .padding(Space.margin)
            .gridArea("activity")
        }
        .background(CanvasBackground())
    }
}

/// What the app-activity watcher is doing on this Mac.
struct ThisMacCard: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        let watcher = model.watcher
        Card {
            VStack(alignment: .leading, spacing: Space.md) {
                HStack {
                    Text("On this Mac").font(.headline)
                    Spacer()
                    SwitchRow("Track activity", isOn: Binding(get: { !model.trackingPaused }, set: { model.setTrackingPaused(!$0) }))
                        .toggleStyle(.switch)
                        .controlSize(.small)
                }
                HStack(spacing: Space.sm) {
                    Image(systemName: statusSymbol).foregroundStyle(model.trackingPaused ? Tokens.ink3 : Tokens.good)
                    Text(statusText).font(.callout)
                }
                let top = watcher.topApps.prefix(5)
                if !top.isEmpty {
                    Divider()
                    ForEach(Array(top), id: \.app) { item in
                        HStack {
                            Text(item.app).font(.callout)
                            Spacer()
                            Text(Format.duration(item.seconds)).font(.callout.monospacedDigit()).foregroundStyle(.secondary)
                        }
                    }
                    Text("Since ReLife opened today. The server keeps the full day.").font(.caption).foregroundStyle(.secondary)
                }
            }
        }
    }

    private var statusSymbol: String {
        model.trackingPaused ? "pause.circle" : "circle.fill"
    }

    private var statusText: String {
        if model.trackingPaused { return "Tracking is off. Nothing is recorded." }
        if let app = model.watcher.currentApp { return "Timing \(app)" }
        return "Waiting for you. Idle time is not counted."
    }
}

/// Hands the NSWindow a view lives in to a closure, so the model can show it again after it is closed.
struct WindowAccessor: NSViewRepresentable {
    var onWindow: (NSWindow) -> Void

    func makeNSView(context: Context) -> Probe {
        let probe = Probe()
        probe.onWindow = onWindow
        return probe
    }

    func updateNSView(_ nsView: Probe, context: Context) {}

    final class Probe: NSView {
        var onWindow: ((NSWindow) -> Void)?

        override func viewDidMoveToWindow() {
            super.viewDidMoveToWindow()
            if let window { onWindow?(window) }
        }
    }
}
