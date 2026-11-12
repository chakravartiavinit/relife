import Foundation
import ReLifeKit

/// Sample data for snapshots and the self-test: APP_SEED=1 with APP_STORE in /tmp makes the app look signed in
/// to a ReLife with a realistic character, System quests, routines, a goal and screen time. It never touches
/// a network or the Keychain (the token store is memory when APP_STORE is set).
@MainActor
enum SeedData {
    /// A Today view like the mockups: Lv 21 Vanguard, 4 kinds of screen time, one cleared System quest.
    static let todayJSON = """
    {
      "today": "2026-11-12", "name": "Chakra",
      "character": { "level": 21, "title": "Vanguard", "total": 23892, "floor": 22000, "next": 24197, "progress": 0.861,
                     "todayXp": 72, "streak": 57, "best": 61, "doneToday": true, "freezes": 2 },
      "quests": [
        { "id": "q1", "title": "Walk 6,000 steps", "area": "health", "rank": "D", "xp": 30, "status": "active",
          "progress": 3200, "target": 6000, "unit": "steps", "op": "gte" },
        { "id": "q2", "title": "Read 20 pages", "area": "mind", "rank": "E", "xp": 25, "status": "active",
          "progress": 8, "target": 20, "unit": "pages", "op": "gte" },
        { "id": "q3", "title": "30 min deep work", "area": "skills", "rank": "C", "xp": 40, "status": "cleared",
          "progress": 30, "target": 30, "unit": "min", "op": "gte" }
      ],
      "routines": [
        { "scheduleId": "r1", "occurrence": "2026-11-12T16:00:00.000Z", "time": "21:30", "name": "Meditate 10 min", "kind": "habit",
          "area": "mind", "status": "pending", "xp": 20 },
        { "scheduleId": "r2", "occurrence": "2026-11-12T15:30:00.000Z", "time": "21:00", "name": "Skincare", "kind": "habit",
          "area": "health", "status": "pending", "xp": 20 },
        { "scheduleId": "r3", "occurrence": "2026-11-12T10:00:00.000Z", "time": "this week", "name": "Call Mom", "kind": "habit",
          "area": "relationships", "status": "pending", "xp": 20 },
        { "scheduleId": "r4", "occurrence": "2026-11-12T01:42:00.000Z", "time": "07:12", "name": "Gym", "kind": "habit",
          "area": "health", "status": "done", "xp": 20 }
      ],
      "goals": [
        { "scheduleId": "g1", "name": "Drink 3 L water", "area": "health", "value": 1250, "target": 3000, "unit": "ml",
          "step": 250, "trackerSlug": "water" }
      ],
      "done": 1, "total": 5, "left": 6,
      "focus": { "seconds": 18720, "byKind": [
        { "kind": "work", "seconds": 9600 }, { "kind": "learning", "seconds": 3900 },
        { "kind": "communication", "seconds": 2880 }, { "kind": "entertainment", "seconds": 2340 } ] }
    }
    """

    static let meJSON = """
    { "name": "Chakra Vartiavinit", "timezone": "Asia/Kolkata", "prefs": { "theme": "system" },
      "device": { "id": "d1", "kind": "mac", "name": "MacBook Pro", "scopes": ["full"] } }
    """

    static let sampleView: TodayView = {
        // The JSON above is fixed, so a failure here is a programming error caught by the self-test.
        // swiftlint:disable:next force_try
        try! JSONDecoder().decode(TodayView.self, from: Data(todayJSON.utf8))
    }()

    static let sampleMe: Me = {
        // swiftlint:disable:next force_try
        try! JSONDecoder().decode(Me.self, from: Data(meJSON.utf8))
    }()

    static var requested: Bool {
        ProcessInfo.processInfo.environment["APP_SEED"] == "1" && Store.isOverridden
    }

    static func insertIfRequested(into model: AppModel) {
        guard ProcessInfo.processInfo.environment["APP_SEED"] == "1" else { return }
        guard Store.isOverridden else {
            print("APP_SEED ignored: APP_STORE must be a file in /tmp")
            return
        }
        signIn(model)
    }

    /// Makes the model look signed in and up to date, with no network.
    static func signIn(_ model: AppModel) {
        model.serverURL = ServerAddress.local
        model.me = sampleMe
        model.view = sampleView
        model.lastUpdated = .now
        model.phase = .ready(updated: .now)
        model.onboarded = true
        model.pairing.opensBrowser = false
        model.notice = nil
        model.levelUpBanner = nil
    }
}
