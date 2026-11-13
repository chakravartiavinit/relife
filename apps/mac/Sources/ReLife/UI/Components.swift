import ReLifeKit
import SwiftUI

// The shared parts of the game elements spec: level, XP, streak, quest rows, status. Native system parts
// (controls, windows, materials) stay Apple's; these only carry the app's tokens and words.

// MARK: - Area colors

extension Tokens {
    /// A category color. Used for marks (chips, icons, bars), never for text (AGENTS.md UI bar).
    static func area(_ name: String) -> Color {
        switch name.lowercased() {
        case "health": catHealth
        case "mind": catMind
        case "skills": catSkills
        case "wealth": catWealth
        case "hobbies": catHobbies
        case "relationships", "people": catRelationships
        default: pill
        }
    }

    static func areaSymbol(_ name: String) -> String {
        switch name.lowercased() {
        case "health": "heart"
        case "mind": "brain.head.profile"
        case "skills": "graduationcap"
        case "wealth": "indianrupeesign.circle"
        case "hobbies": "paintpalette"
        case "relationships", "people": "person.2"
        default: "circle.dashed"
        }
    }

    static func kind(_ kind: ActivityKind) -> Color {
        switch kind {
        case .work: catSkills
        case .learning: catMind
        case .communication, .social: catRelationships
        case .entertainment: catHobbies
        case .shopping: catWealth
        case .news: catHealth
        case .other: ink3
        }
    }

    static func kindName(_ kind: ActivityKind) -> String {
        switch kind {
        case .work: "Deep work"
        case .learning: "Learning"
        case .communication: "Communication"
        case .social: "Social"
        case .entertainment: "Fun"
        case .shopping: "Shopping"
        case .news: "News"
        case .other: "Other"
        }
    }
}

// MARK: - Containers

/// A white card on the canvas. Concentric radius with the window, hairline instead of a shadow.
struct Card<Content: View>: View {
    var padding: CGFloat = Space.lg
    @ViewBuilder var content: Content

    var body: some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Tokens.surface, in: RoundedRectangle(cornerRadius: Tokens.radiusLg, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Tokens.radiusLg, style: .continuous).strokeBorder(Tokens.hairline))
    }
}

/// Mono area label with a capsule tick: "SYSTEM".
struct SystemLabel: View {
    var text: String
    var tint: Color = Tokens.pill

    var body: some View {
        HStack(spacing: Space.sm) {
            Capsule().fill(tint).frame(width: Space.xs, height: Space.md)
            Text(text.uppercased())
                .font(.system(.caption2, design: .monospaced, weight: .semibold))
                .tracking(1.4)
                .foregroundStyle(Tokens.pillInk)
        }
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Game elements

/// `Lv 12`: an ink pill, bold, tabular.
struct LevelPill: View {
    var level: Int

    var body: some View {
        Text("Lv \(level)")
            .font(.caption.weight(.bold).monospacedDigit())
            .foregroundStyle(Tokens.bg)
            .padding(.horizontal, Space.sm)
            .padding(.vertical, Space.xs)
            .background(Tokens.ink, in: Capsule())
    }
}

/// The XP progress capsule, filled in the capsule blue.
struct XPBar: View {
    var progress: Double
    var height: CGFloat = Space.sm

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule().fill(Tokens.surface2)
                Capsule().fill(Tokens.pill).frame(width: max(height, proxy.size.width * min(1, max(0, progress))))
            }
        }
        .frame(height: height)
        .accessibilityElement()
        .accessibilityLabel("XP progress")
        .accessibilityValue("\(Int((min(1, max(0, progress)) * 100).rounded())) percent")
    }
}

/// Flame (gold when kept today, quiet when not yet), the number, and freezes as a snowflake.
struct StreakBadge: View {
    var streak: Int
    var keptToday: Bool
    var freezes: Int
    var compact = false

    var body: some View {
        if compact {
            HStack(spacing: Space.xs) {
                Image(systemName: keptToday ? "flame.fill" : "flame")
                    .foregroundStyle(keptToday ? Tokens.medalGold : Tokens.ink3)
                Text("\(streak)").font(.callout.weight(.semibold).monospacedDigit())
            }
            .padding(.horizontal, Space.md)
            .padding(.vertical, Space.xs)
            .background(Tokens.medalGold.opacity(0.16), in: Capsule())
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(Format.streak(streak))
        } else {
            VStack(spacing: Space.xs) {
                Image(systemName: keptToday ? "flame.fill" : "flame")
                    .font(.title3)
                    .foregroundStyle(keptToday ? Tokens.medalGold : Tokens.ink3)
                Text("\(streak)").font(.system(.title, design: .rounded, weight: .bold).monospacedDigit())
                HStack(spacing: Space.xs) {
                    Text("day streak")
                    if freezes > 0 {
                        Image(systemName: "snowflake").foregroundStyle(Tokens.sky)
                        Text("\(freezes)")
                    }
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }
            .padding(Space.md)
            .frame(minWidth: 120)
            .background(Tokens.surface, in: RoundedRectangle(cornerRadius: Tokens.radiusMd, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Tokens.radiusMd, style: .continuous).strokeBorder(Tokens.hairline))
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(Format.streak(streak) + (freezes > 0 ? ", \(freezes) streak freezes" : ""))
        }
    }
}

/// An area icon in its wash, with the quest's rank letter when it has one.
struct AreaMark: View {
    var area: String
    var rank: QuestRank?

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            Image(systemName: Tokens.areaSymbol(area))
                .font(.callout)
                .foregroundStyle(Tokens.area(area))
                .frame(width: Space.xxl + Space.sm, height: Space.xxl + Space.sm)
                .background(Tokens.area(area).opacity(0.14), in: RoundedRectangle(cornerRadius: Tokens.radiusSm, style: .continuous))
            if let rank {
                Text(rank.rawValue)
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(Tokens.ink)
                    .frame(width: Space.lg, height: Space.lg)
                    .background(Tokens.surface, in: Circle())
                    .overlay(Circle().strokeBorder(Tokens.hairline))
                    .offset(x: Space.xs, y: Space.xs) // grid: ok badge overlaps the icon corner on purpose
            }
        }
        .frame(width: Space.xxl + Space.md, height: Space.xxl + Space.md, alignment: .topLeading)
        .accessibilityHidden(true)
    }
}

/// `circle` to `checkmark.circle.fill`. Colour changes at once (150 ms), the icon swaps with scale, opacity
/// and blur, a press scales to 0.96; Reduce Motion keeps only the colour change.
struct CheckToggle: View {
    var isOn: Bool
    var area: String
    var action: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Button(action: action) {
            Image(systemName: isOn ? "checkmark.circle.fill" : "circle")
                .font(.title3)
                .foregroundStyle(isOn ? Tokens.good : Tokens.area(area))
                .contentTransition(reduceMotion ? .identity : .symbolEffect(.replace))
                .animation(Tokens.outQuint(0.15), value: isOn)
        }
        .buttonStyle(PressScaleStyle())
        .accessibilityLabel(isOn ? "Done" : "Not done")
        .accessibilityAddTraits(.isToggle)
    }
}

/// Press feedback shared by every custom button: scale 0.96.
struct PressScaleStyle: ButtonStyle {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed && !reduceMotion ? 0.96 : 1)
            .animation(Tokens.outQuint(0.15), value: configuration.isPressed)
    }
}

/// A small XP or step capsule: "+40 XP", "+250 ml".
struct XPChip: View {
    var text: String
    var tone: Tone = .blue

    enum Tone { case blue, green, neutral }

    var body: some View {
        Text(text)
            .font(.caption.weight(.semibold).monospacedDigit())
            .foregroundStyle(tone == .blue ? Tokens.pillInk : tone == .green ? Tokens.good : Color.primary)
            .padding(.horizontal, Space.sm)
            .padding(.vertical, Space.xs)
            .background(tone == .blue ? Tokens.pillWash : tone == .green ? Tokens.good.opacity(0.14) : Tokens.surface2, in: Capsule())
    }
}

/// "Synced now", "Offline · showing 10:42" with its icon.
struct StatusPill: View {
    var phase: ConnectionPhase
    var queued: Int
    var timeZone: TimeZone

    var body: some View {
        HStack(spacing: Space.xs) {
            Image(systemName: symbol)
                .foregroundStyle(tint)
            Text(text)
        }
        .font(.caption)
        .padding(.horizontal, Space.md)
        .padding(.vertical, Space.xs)
        .background(.quaternary.opacity(0.6), in: Capsule())
        .accessibilityElement(children: .combine)
    }

    private var symbol: String {
        switch phase {
        case .ready: "circle.fill"
        case .offline: "icloud.slash"
        case .loading: "arrow.triangle.2.circlepath"
        default: "exclamationmark.circle"
        }
    }

    private var tint: Color {
        switch phase {
        case .ready: Tokens.good
        case .offline, .serverTooOld, .clientTooOld: Tokens.warn
        default: Tokens.ink3
        }
    }

    private var text: String {
        switch phase {
        case let .ready(at): Words.synced(at, now: .now)
        case let .offline(last): last.map { "Offline · showing \(Words.clock($0, timeZone: timeZone))" } ?? "Offline"
        case .loading: "Connecting…"
        case .serverTooOld, .clientTooOld: "Update needed"
        default: "Not connected"
        }
    }
}

/// A notice card: icon, words, one action.
struct NoticeCard: View {
    var symbol: String
    var tint: Color = Tokens.warn
    var title: String
    var message: String?
    var actionTitle: String?
    var action: (() -> Void)?

    var body: some View {
        HStack(alignment: .top, spacing: Space.md) {
            Image(systemName: symbol).foregroundStyle(tint).font(.title3)
            VStack(alignment: .leading, spacing: Space.xs) {
                Text(title).font(.callout.weight(.semibold))
                if let message { Text(message).font(.callout).foregroundStyle(.secondary) }
            }
            Spacer(minLength: Space.md)
            if let actionTitle, let action {
                Button(actionTitle, action: action).controlSize(.regular)
            }
        }
        .padding(Space.lg)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(tint.opacity(0.10), in: RoundedRectangle(cornerRadius: Tokens.radiusMd, style: .continuous))
        .accessibilityElement(children: .contain)
    }
}

/// Today's time by kind: one stacked bar and a legend.
struct FocusBreakdown: View {
    var focus: TodayView.Focus

    var body: some View {
        VStack(alignment: .leading, spacing: Space.md) {
            Text(Format.duration(focus.seconds))
                .font(.system(.title, design: .rounded, weight: .bold).monospacedDigit())
            GeometryReader { proxy in
                HStack(spacing: 2) {
                    ForEach(focus.byKind.filter { $0.seconds > 0 }, id: \.kind) { part in
                        Tokens.kind(part.kind)
                            .frame(width: max(2, proxy.size.width * part.seconds / max(1, focus.seconds)))
                    }
                }
                .clipShape(Capsule())
            }
            .frame(height: Space.sm)
            .background(Tokens.surface2, in: Capsule())
            LazyVGrid(columns: [GridItem(.flexible(), alignment: .leading)], spacing: Space.sm) {
                ForEach(focus.byKind.filter { $0.seconds > 0 }.sorted { $0.seconds > $1.seconds }.prefix(6), id: \.kind) { part in
                    HStack(spacing: Space.sm) {
                        Circle().fill(Tokens.kind(part.kind)).frame(width: Space.sm, height: Space.sm)
                        Text(Tokens.kindName(part.kind)).font(.callout).foregroundStyle(.secondary).lineLimit(1)
                        Spacer(minLength: Space.xs)
                        Text(Format.duration(part.seconds)).font(.callout.weight(.semibold).monospacedDigit()).lineLimit(1)
                    }
                }
            }
        }
        .accessibilityElement(children: .combine)
    }
}

/// Static tinted blocks sized like the content, shown after 500 ms of loading (no shimmer).
struct LoadingBlocks: View {
    var heights: [CGFloat] = [Space.section * 3, Space.section * 5]
    @State private var visible = false

    var body: some View {
        VStack(spacing: Space.lg) {
            ForEach(Array(heights.enumerated()), id: \.offset) { _, h in
                RoundedRectangle(cornerRadius: Tokens.radiusLg, style: .continuous)
                    .fill(Tokens.surface2)
                    .frame(height: h)
            }
        }
        .opacity(visible ? 1 : 0)
        .task {
            try? await Task.sleep(for: .milliseconds(500))
            visible = true
        }
        .accessibilityHidden(true)
    }
}

/// A page's scroll area. Under the headless render (APP_RENDER) it is a plain top-aligned stack, because
/// `ImageRenderer` cannot draw a `ScrollView` (AppKit-backed).
struct PageScroll<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        if HeadlessSnapshot.requested {
            content.frame(maxWidth: .infinity, alignment: .top)
        } else {
            ScrollView { content }
        }
    }
}

/// A text field. Under the headless render (APP_RENDER) it is a static line, because `ImageRenderer` draws a
/// placeholder for AppKit-backed controls.
struct InputField: View {
    var prompt: String
    @Binding var text: String

    init(_ prompt: String, text: Binding<String>) {
        self.prompt = prompt
        _text = text
    }

    var body: some View {
        if HeadlessSnapshot.requested {
            Text(text.isEmpty ? prompt : text)
                .foregroundStyle(text.isEmpty ? .secondary : .primary)
                .frame(maxWidth: .infinity, alignment: .leading)
        } else {
            TextField(prompt, text: $text)
        }
    }
}

/// A spinner. A static symbol under the headless render, for the same reason as `InputField`.
struct Spinner: View {
    var body: some View {
        if HeadlessSnapshot.requested {
            Image(systemName: "arrow.triangle.2.circlepath").foregroundStyle(.secondary)
        } else {
            ProgressView()
        }
    }
}

extension View {
    /// A link-style button. Plain accent text under the headless render (APP_RENDER), because `ImageRenderer`
    /// draws a placeholder for the AppKit link style.
    @ViewBuilder
    func linkButton() -> some View {
        if HeadlessSnapshot.requested {
            buttonStyle(.plain).foregroundStyle(Tokens.pill)
        } else {
            buttonStyle(.link)
        }
    }
}

/// A labelled switch. A static switch under the headless render (APP_RENDER), for the same reason as `InputField`.
struct SwitchRow: View {
    var title: String
    @Binding var isOn: Bool

    init(_ title: String, isOn: Binding<Bool>) {
        self.title = title
        _isOn = isOn
    }

    var body: some View {
        if HeadlessSnapshot.requested {
            HStack {
                Text(title)
                Spacer()
                Capsule().fill(isOn ? Tokens.pill : Tokens.surface3)
                    .frame(width: 40, height: 24)
                    .overlay(alignment: isOn ? .trailing : .leading) { Circle().fill(.white).padding(Space.xs) }
            }
        } else {
            Toggle(title, isOn: $isOn)
        }
    }
}
