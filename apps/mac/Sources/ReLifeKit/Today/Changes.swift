import Foundation

/// What changed between two Today views, for notifications (level up, quest cleared).
public enum TodayChange: Sendable, Equatable {
    case levelUp(level: Int, title: String)
    case questCleared(title: String, xp: Int)
}

public enum TodayChanges {
    /// Changes from `old` to `new`. A different date means a new day: nothing is reported, because quests
    /// reset at midnight and would look cleared or failed.
    public static func between(_ old: TodayView?, _ new: TodayView) -> [TodayChange] {
        guard let old, old.today == new.today else { return [] }
        var out: [TodayChange] = []
        if new.character.level > old.character.level {
            out.append(.levelUp(level: new.character.level, title: new.character.title))
        }
        for q in new.quests where q.status == .cleared {
            if let before = old.quests.first(where: { $0.id == q.id }), before.status == .active {
                out.append(.questCleared(title: q.title, xp: q.xp))
            }
        }
        return out
    }
}

/// The 21:00 warning: "2 System quests left · 3 h to go".
public enum QuestWarning {
    /// Local hour the warning fires.
    public static let hour = 21

    /// The notification text, or nil when it should not fire: too early, nothing left, or already sent today.
    public static func message(view: TodayView, now: Date, timeZone: TimeZone, lastWarnedDay: String?) -> String? {
        guard lastWarnedDay != view.today else { return nil }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        let parts = calendar.dateComponents([.hour, .minute], from: now)
        guard let h = parts.hour, let m = parts.minute, h >= hour else { return nil }
        let left = view.quests.filter { $0.status == .active }.count
        guard left > 0 else { return nil }
        let minutesToGo = (24 - h) * 60 - m
        let togo = minutesToGo >= 90 ? "\(Int((Double(minutesToGo) / 60).rounded())) h to go" : "\(minutesToGo) min to go"
        return "\(left == 1 ? "1 System quest" : "\(left) System quests") left · \(togo)"
    }
}

/// Shows the result of a tap at once, before the server answers. The server's view replaces it on arrival.
public enum Optimistic {
    public static func apply(_ action: TodayAction, to view: TodayView) -> TodayView {
        var v = view
        switch action {
        case let .check(scheduleId, occurrence, status):
            guard let i = v.routines.firstIndex(where: { $0.scheduleId == scheduleId && $0.occurrence == occurrence }) else { return v }
            let wasOpen = v.routines[i].status == .pending || v.routines[i].status == .missed
            v.routines[i].status = status.map { $0 == .done ? RoutineStatus.done : .skipped } ?? .pending
            let isOpen = v.routines[i].status == .pending
            if wasOpen && !isOpen { v.left = max(0, v.left - 1); v.done += v.routines[i].status == .done ? 1 : 0 }
            if !wasOpen && isOpen { v.left += 1; v.done = max(0, v.done - 1) }
        case let .add(scheduleId, amount):
            guard let i = v.goals.firstIndex(where: { $0.scheduleId == scheduleId }) else { return v }
            let wasOpen = v.goals[i].value < v.goals[i].target
            v.goals[i].value = max(0, v.goals[i].value + amount)
            let isOpen = v.goals[i].value < v.goals[i].target
            if wasOpen && !isOpen { v.left = max(0, v.left - 1); v.done += 1 }
            if !wasOpen && isOpen { v.left += 1; v.done = max(0, v.done - 1) }
        case .log:
            break // The server parses the text; nothing to show until it answers.
        }
        return v
    }

    /// The action that reverses another (the Undo button), or nil for a text log.
    public static func inverse(of action: TodayAction) -> TodayAction? {
        switch action {
        case let .check(id, occurrence, _): .check(scheduleId: id, occurrence: occurrence, status: nil)
        case let .add(id, amount): .add(scheduleId: id, amount: -amount)
        case .log: nil
        }
    }
}
