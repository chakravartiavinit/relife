import Foundation
import Testing
@testable import ReLifeKit

@Suite("Glance: badge, words and rows")
struct GlanceTests {
    private func full() throws -> TodayView { try Fixtures.decode(TodayView.self, "TodayView.full") }

    @Test("the four badge states and their priority")
    func badge() throws {
        let view = try full()
        #expect(BadgeState.make(view: view, reachable: true, trackingPaused: false) == .count(view.left))
        #expect(BadgeState.make(view: view, reachable: true, trackingPaused: true) == .paused)
        #expect(BadgeState.make(view: view, reachable: false, trackingPaused: true) == .unreachable)
        var clear = view
        clear.left = 0
        #expect(BadgeState.make(view: clear, reachable: true, trackingPaused: false) == .allClear)
        #expect(BadgeState.count(4).text == "4")
        #expect(BadgeState.allClear.text == "✓")
        #expect(BadgeState.paused.text == "off")
        #expect(BadgeState.unreachable.text == "!")
        #expect(BadgeState.count(1).accessibilityLabel == "1 quest left")
    }

    @Test("signed-in phases")
    func phases() {
        #expect(!ConnectionPhase.unpaired.isSignedIn)
        #expect(!ConnectionPhase.sessionEnded(.revoked).isSignedIn)
        #expect(ConnectionPhase.offline(lastUpdated: nil).isSignedIn)
        #expect(ConnectionPhase.ready(updated: Date()).isSignedIn)
    }

    @Test("words match the surfaces plan")
    func words() {
        let tz = TimeZone(identifier: "UTC")!
        let at = Date(timeIntervalSince1970: 1_794_470_400 + 2 * 3600 + 42 * 60) // 10:42 UTC
        #expect(Words.offline(lastUpdated: at, queued: 2, timeZone: tz) == "Offline · showing 10:42. 2 checks will send when ReLife is back.")
        #expect(Words.offline(lastUpdated: nil, queued: 0, timeZone: tz) == "Offline.")
        #expect(Words.offline(lastUpdated: at, queued: 1, timeZone: tz).hasSuffix("1 check will send when ReLife is back."))
        #expect(Words.sessionEnded(.revoked) == "This device was disconnected from ReLife.")
        #expect(Words.sessionEnded(.expired) == "Your sign-in ended.")
        let now = Date(timeIntervalSince1970: 1_794_470_400)
        #expect(Words.synced(now, now: now.addingTimeInterval(20)) == "Synced now")
        #expect(Words.synced(now, now: now.addingTimeInterval(120)) == "Synced 2 min ago")
        #expect(Words.synced(now, now: now.addingTimeInterval(7200)) == "Synced 2 h ago")
    }

    @Test("character lines")
    func character() throws {
        var c = try full().character
        c.total = 23_892
        c.next = 24_197
        c.level = 21
        c.todayXp = 72
        #expect(Format.xpToNext(c) == "305 XP to Lv 22")
        #expect(Format.xpToday(c) == "+72 XP today")
        #expect(Format.streak(1) == "1 day streak")
        #expect(Format.streak(57) == "57 day streak")
        c.progress = 1.4
        #expect(Format.progress(c) == 1)
    }

    @Test("durations and numbers")
    func numbers() {
        #expect(Format.duration(5 * 3600 + 12 * 60) == "5h 12m")
        #expect(Format.duration(2 * 3600) == "2h")
        #expect(Format.duration(48 * 60 + 30) == "48m")
        #expect(Format.duration(0) == "0m")
        #expect(Format.number(250) == "250")
        #expect(Format.number(1.25) == "1.25")
        #expect(Format.number(1.5) == "1.5")
        #expect(Format.number(6000) == "6,000")
    }

    @Test("goal and quest progress lines")
    func lines() throws {
        let view = try full()
        let goal = try #require(view.goals.first)
        #expect(Format.goal(goal).contains(" of "))
        #expect(Format.goalStep(goal).hasPrefix("+"))
        let steps = try #require(view.quests.first { $0.unit == "steps" })
        #expect(Format.quest(steps) == "3,200 of 6,000 steps")
        let nulls = try Fixtures.decode(TodayView.self, "TodayView.nulls")
        #expect(Format.quest(nulls.quests[0]) == nil)
    }

    @Test("open rows put System quests first and skip done work")
    func openRows() throws {
        let view = try full()
        let rows = QuestList.open(view)
        #expect(rows.first.map { if case .system = $0 { true } else { false } } == true)
        #expect(!rows.contains { if case let .routine(r) = $0 { r.status == .done } else { false } })
        #expect(!rows.contains { if case let .system(q) = $0 { q.status == .cleared } else { false } })
        let menu = QuestList.menuRows(view, limit: 2)
        #expect(menu.rows.count == min(2, rows.count))
        #expect(menu.more == max(0, rows.count - 2))
        #expect(Set(rows.map(\.id)).count == rows.count)
    }

    @Test("headline")
    func headline() throws {
        var view = try full()
        view.left = 3
        #expect(QuestList.headline(view) == "3 quests left")
        view.left = 1
        #expect(QuestList.headline(view) == "1 quest left")
        view.left = 0
        #expect(QuestList.headline(view) == "All clear")
    }

    @Test("quick log offers matching open work")
    func matches() throws {
        let view = try full()
        let stretch = QuickLogMatches.quests("stretch", in: view)
        #expect(stretch.map(\.title) == ["Evening stretch"])
        #expect(QuickLogMatches.quests("evening  STRETCH", in: view).count == 1)
        #expect(QuickLogMatches.quests("", in: view).isEmpty)
        #expect(QuickLogMatches.quests("zzzz", in: view).isEmpty)
        #expect(QuickLogMatches.logTitle("  water 250 ") == "Log water 250")
    }
}
