import Foundation

// Presentation rules shared by the menu bar, the quick-log panel and the main window.
// The server computes XP, streaks and progress; nothing here scores anything. These only
// choose words and order (shared rules in the surfaces plan: glossary, game elements, state matrix).

/// The four menu bar states: count, all clear, tracking paused, your server can't be reached.
public enum BadgeState: Sendable, Equatable {
    case count(Int)
    case allClear
    case paused
    case unreachable

    /// Priority: unreachable beats paused beats the quest count.
    public static func make(view: TodayView?, reachable: Bool, trackingPaused: Bool) -> BadgeState {
        if !reachable { return .unreachable }
        if trackingPaused { return .paused }
        guard let view else { return .count(0) }
        return view.left > 0 ? .count(view.left) : .allClear
    }

    /// The text beside the icon: a number, a check, `off` or `!`.
    public var text: String {
        switch self {
        case let .count(n): n > 0 ? String(n) : ""
        case .allClear: "✓"
        case .paused: "off"
        case .unreachable: "!"
        }
    }

    public var accessibilityLabel: String {
        switch self {
        case let .count(n): n == 1 ? "1 quest left" : "\(n) quests left"
        case .allClear: "All clear"
        case .paused: "Activity tracking is off"
        case .unreachable: "Can't reach your \(Brand.name)"
        }
    }
}

/// The state matrix every surface shares.
public enum ConnectionPhase: Sendable, Equatable {
    case unpaired
    case pairing
    case loading
    case ready(updated: Date)
    case offline(lastUpdated: Date?)
    case sessionEnded(SessionEnd)
    case serverTooOld
    case clientTooOld(minimum: String)

    public var isSignedIn: Bool {
        switch self {
        case .loading, .ready, .offline, .serverTooOld, .clientTooOld: true
        case .unpaired, .pairing, .sessionEnded: false
        }
    }
}

public enum Words {
    public static func sessionEnded(_ reason: SessionEnd) -> String {
        switch reason {
        case .revoked: "This device was disconnected from \(Brand.name)."
        case .expired: "Your sign-in ended."
        }
    }

    public static let serverTooOld = "Update \(Brand.name) to use this version of the Mac app."

    public static func clientTooOld(minimum: String) -> String {
        "This version of \(Brand.name) for Mac is too old for your \(Brand.name). Update to \(minimum) or later."
    }

    /// "Offline · showing 10:42. 2 checks will send when the server is back."
    public static func offline(lastUpdated: Date?, queued: Int, timeZone: TimeZone = .current) -> String {
        var s = "Offline"
        if let lastUpdated { s += " · showing \(clock(lastUpdated, timeZone: timeZone))" }
        s += "."
        if queued > 0 { s += " \(queued == 1 ? "1 check" : "\(queued) checks") will send when \(Brand.name) is back." }
        return s
    }

    /// "Synced 2 min ago", "Synced now".
    public static func synced(_ date: Date, now: Date) -> String {
        let s = max(0, now.timeIntervalSince(date))
        if s < 60 { return "Synced now" }
        if s < 3600 { return "Synced \(Int(s / 60)) min ago" }
        if s < 86_400 { return "Synced \(Int(s / 3600)) h ago" }
        return "Synced \(Int(s / 86_400)) d ago"
    }

    /// "10:42" in the given zone, 24-hour like the dashboard's stamp.
    public static func clock(_ date: Date, timeZone: TimeZone = .current) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = timeZone
        f.dateFormat = "HH:mm"
        return f.string(from: date)
    }
}

public enum Format {
    /// "305 XP to Lv 22".
    public static func xpToNext(_ c: TodayView.Character) -> String {
        "\(max(0, c.next - c.total).grouped) XP to Lv \(c.level + 1)"
    }

    /// "+72 XP today".
    public static func xpToday(_ c: TodayView.Character) -> String {
        "+\(c.todayXp.grouped) XP today"
    }

    /// "12 day streak".
    public static func streak(_ n: Int) -> String {
        n == 1 ? "1 day streak" : "\(n) day streak"
    }

    /// 0 to 1, clamped.
    public static func progress(_ c: TodayView.Character) -> Double {
        min(1, max(0, c.progress))
    }

    /// "5h 12m", "48m", "0m".
    public static func duration(_ seconds: Double) -> String {
        let minutes = Int((seconds / 60).rounded(.down))
        let h = minutes / 60, m = minutes % 60
        if h > 0 { return m == 0 ? "\(h)h" : "\(h)h \(m)m" }
        return "\(m)m"
    }

    /// "1.25 of 3 L", "250 of 3000 ml": whole numbers without a decimal point.
    public static func goal(_ g: TodayView.Goal) -> String {
        "\(number(g.value)) of \(number(g.target))\(g.unit.isEmpty ? "" : " " + g.unit)"
    }

    /// "+250 ml".
    public static func goalStep(_ g: TodayView.Goal) -> String {
        "+\(number(g.step))\(g.unit.isEmpty ? "" : " " + g.unit)"
    }

    /// "1.25 of 3 L" for a System quest with a progress number.
    public static func quest(_ q: TodayView.Quest) -> String? {
        guard let progress = q.progress else { return nil }
        return "\(number(progress)) of \(number(q.target))\(q.unit.map { " " + $0 } ?? "")"
    }

    public static func number(_ n: Double) -> String {
        if n == n.rounded() { return Int(n).grouped }
        let s = String(format: "%.2f", n)
        return s.replacingOccurrences(of: #"0+$"#, with: "", options: .regularExpression)
    }

    public static func area(_ raw: String) -> String {
        raw.prefix(1).uppercased() + raw.dropFirst()
    }
}

extension Int {
    /// 23892 becomes "23,892" (fixed locale so tests are stable).
    var grouped: String {
        let s = String(abs(self))
        var out = ""
        for (i, c) in s.reversed().enumerated() {
            if i > 0, i % 3 == 0 { out.append(",") }
            out.append(c)
        }
        return (self < 0 ? "-" : "") + String(out.reversed())
    }
}

/// The rows the menu bar list and the Today page share, in the order the surfaces plan gives:
/// System quests first, then routines and goal steps.
public enum QuestRow: Sendable, Equatable, Identifiable {
    case system(TodayView.Quest)
    case routine(TodayView.Routine)
    case goal(TodayView.Goal)

    public var id: String {
        switch self {
        case let .system(q): "q:" + q.id
        case let .routine(r): "r:" + r.id
        case let .goal(g): "g:" + g.id
        }
    }

    public var title: String {
        switch self {
        case let .system(q): q.title
        case let .routine(r): r.name
        case let .goal(g): g.name
        }
    }
}

public enum QuestList {
    /// Rows still open: active System quests, pending or missed routines, goals under target.
    public static func open(_ view: TodayView) -> [QuestRow] {
        let q = view.quests.filter { $0.status == .active }.map(QuestRow.system)
        let r = view.routines.filter { $0.status == .pending || $0.status == .missed }.map(QuestRow.routine)
        let g = view.goals.filter { $0.value < $0.target }.map(QuestRow.goal)
        return q + r + g
    }

    /// Up to `limit` rows and how many more there are ("+3 more").
    public static func menuRows(_ view: TodayView, limit: Int = 5) -> (rows: [QuestRow], more: Int) {
        let all = open(view)
        return (Array(all.prefix(limit)), max(0, all.count - limit))
    }

    /// "All clear" when nothing is left, else "4 quests left".
    public static func headline(_ view: TodayView) -> String {
        if view.left == 0 { return view.total + view.quests.count == 0 ? "Nothing due today" : "All clear" }
        return view.left == 1 ? "1 quest left" : "\(view.left) quests left"
    }

    /// "Nothing due today. Add routines in the app." when there is nothing at all.
    public static func isEmpty(_ view: TodayView) -> Bool {
        view.quests.isEmpty && view.routines.isEmpty && view.goals.isEmpty
    }
}

/// What the quick-log panel offers for a typed line, besides the parsed log the server will make.
public enum QuickLogMatches {
    /// Open routines and goals whose name contains every typed word (case-insensitive), at most `limit`.
    public static func quests(_ text: String, in view: TodayView, limit: Int = 3) -> [QuestRow] {
        let words = text.lowercased().split(whereSeparator: { !$0.isLetter && !$0.isNumber }).map(String.init)
        guard !words.isEmpty else { return [] }
        return QuestList.open(view).filter { row in
            let title = row.title.lowercased()
            return words.allSatisfy { title.contains($0) }
        }.prefix(limit).map { $0 }
    }

    /// Shown for any non-empty line: the server parses the text, so the grammar has one home.
    public static func logTitle(_ text: String) -> String {
        "Log \(text.trimmingCharacters(in: .whitespacesAndNewlines))"
    }
}
