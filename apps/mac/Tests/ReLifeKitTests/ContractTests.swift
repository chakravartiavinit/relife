import Foundation
import Testing
@testable import ReLifeKit

/// Decodes every contract fixture with the Swift model of the same name. A schema change that breaks a
/// fixture fails the TypeScript tests first, then fails here until the Swift models match.
@Suite("Contract fixtures")
struct ContractTests {
    /// Contract types only the web server, the phone's web push and the Android app use. The Mac app has no model for them.
    static let notForMac: Set<String> = ["HealthBatch", "HealthIngestResult", "PushAction", "PushActionResult", "PairJoin", "PairJoinResult", "PartyMemberView", "PartyView"]

    @Test("every fixture decodes", arguments: try Fixtures.names())
    func decodes(file: String) throws {
        let schema = String(file.split(separator: ".")[0])
        if Self.notForMac.contains(schema) { return }
        let data = try Fixtures.data(file)
        switch schema {
        case "TodayView": _ = try JSONDecoder().decode(TodayView.self, from: data)
        case "TodayActionResult": _ = try JSONDecoder().decode(TodayActionResult.self, from: data)
        case "TodayAction": _ = try JSONDecoder().decode(TodayAction.self, from: data)
        case "Hello": _ = try JSONDecoder().decode(Hello.self, from: data)
        case "Me": _ = try JSONDecoder().decode(Me.self, from: data)
        case "DeviceInfo": _ = try JSONDecoder().decode(DeviceInfo.self, from: data)
        case "PairRequestStart": _ = try JSONDecoder().decode(PairRequestStart.self, from: data)
        case "PairRequestStarted": _ = try JSONDecoder().decode(PairRequestStarted.self, from: data)
        case "PairPoll": _ = try JSONDecoder().decode(PairPoll.self, from: data)
        case "PairRedeem": _ = try JSONDecoder().decode(PairRedeem.self, from: data)
        case "PairRedeemResult": _ = try JSONDecoder().decode(PairRedeemResult.self, from: data)
        case "DeviceList": _ = try JSONDecoder().decode(DeviceList.self, from: data)
        case "DeviceRename": _ = try JSONDecoder().decode(DeviceRename.self, from: data)
        case "Event": _ = try JSONDecoder().decode(Event.self, from: data)
        case "ApiError": _ = try JSONDecoder().decode(ApiError.self, from: data)
        case "ActivityBatch":
            // The shared fixtures hold browser segments (the extension's shape). The Mac app only sends
            // `source: 'mac'` segments, so check the envelope here and the segment shape in ActivityTests.
            let object = try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
            #expect(object["segments"] is [Any])
        case "Pack":
            // Packs (routines, trackers and goals as shareable JSON) are read by the web app only: check the envelope.
            let object = try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
            #expect(object["format"] as? String == "relife.pack")
        default:
            Issue.record("no Swift model for fixture \(file)")
        }
    }

    @Test("every schema has a Swift decoder")
    func coverage() throws {
        let covered = Set(try Fixtures.names().map { String($0.split(separator: ".")[0]) })
        let known: Set = ["TodayView", "TodayActionResult", "TodayAction", "Hello", "Me", "DeviceInfo", "PairRequestStart", "PairRequestStarted",
                          "PairPoll", "PairRedeem", "PairRedeemResult", "DeviceList", "DeviceRename", "Event", "ApiError", "ActivityBatch", "Pack"]
        #expect(covered.subtracting(known).subtracting(Self.notForMac).isEmpty, "fixtures without a Swift model: \(covered.subtracting(known).subtracting(Self.notForMac))")
    }

    @Test("full view carries every part")
    func fullView() throws {
        let view = try Fixtures.decode(TodayView.self, "TodayView.full")
        #expect(view.character.level == 7)
        #expect(view.quests.contains { $0.status == .cleared })
        #expect(!view.routines.isEmpty && !view.goals.isEmpty)
        #expect(view.focus.byKind.first != nil)
    }

    @Test("a null quest progress and a skipped routine decode")
    func nulls() throws {
        let view = try Fixtures.decode(TodayView.self, "TodayView.nulls")
        #expect(view.quests[0].progress == nil)
        #expect(view.quests[0].unit == nil)
        #expect(view.routines[0].status == .skipped)
    }

    @Test("an empty view has no rows")
    func empty() throws {
        let view = try Fixtures.decode(TodayView.self, "TodayView.empty")
        #expect(QuestList.isEmpty(view))
        #expect(QuestList.headline(view) == "Nothing due today")
    }

    @Test("an approved poll with a token and one without (browser cookie)")
    func approved() throws {
        guard case let .approved(token, device) = try Fixtures.decode(PairPoll.self, "PairPoll.approved") else { Issue.record("not approved"); return }
        #expect(token?.hasPrefix("rlf_m_") == true)
        #expect(device.kind == .mac)
        guard case let .approved(cookieToken, cookieDevice) = try Fixtures.decode(PairPoll.self, "PairPoll.approved-cookie") else { Issue.record("not approved"); return }
        #expect(cookieToken == nil)
        #expect(cookieDevice.kind == .browser)
    }

    @Test("every action fixture round-trips to the same JSON")
    func actionsRoundTrip() throws {
        for name in ["TodayAction.check", "TodayAction.add", "TodayAction.log", "TodayAction.undo"] {
            let data = try Fixtures.data(name)
            let action = try JSONDecoder().decode(TodayAction.self, from: data)
            let encoded = try JSONEncoder().encode(action)
            let a = try JSONSerialization.jsonObject(with: data) as? NSDictionary
            let b = try JSONSerialization.jsonObject(with: encoded) as? NSDictionary
            #expect(a == b, "\(name) changed after a round trip")
        }
    }

    @Test("undo sends an explicit null status")
    func undoNull() throws {
        let action = try Fixtures.decode(TodayAction.self, "TodayAction.undo")
        guard case let .check(_, _, status) = action else { Issue.record("not a check"); return }
        #expect(status == nil)
        let json = try #require(String(data: JSONEncoder().encode(action), encoding: .utf8))
        #expect(json.contains("\"status\":null"))
    }

    @Test("every event fixture decodes to its type")
    func events() throws {
        guard case .hello = try Fixtures.decode(Event.self, "Event.hello") else { Issue.record("not hello"); return }
        guard case .data = try Fixtures.decode(Event.self, "Event.data") else { Issue.record("not data"); return }
        guard case .pairing(_, .redeemed) = try Fixtures.decode(Event.self, "Event.pairing") else { Issue.record("not pairing"); return }
        #expect(try Fixtures.decode(Event.self, "Event.ping") == .ping)
        guard case .deviceRevoked = try Fixtures.decode(Event.self, "Event.revoked") else { Issue.record("not revoked"); return }
    }

    @Test("a level-up result carries its news")
    func levelUp() throws {
        let result = try Fixtures.decode(TodayActionResult.self, "TodayActionResult.levelup")
        #expect(result.news.levelUp?.level == 8)
        #expect(!result.news.isEmpty)
        let plain = try Fixtures.decode(TodayActionResult.self, "TodayActionResult.plain")
        #expect(plain.news.levelUp == nil)
    }

    @Test("api errors map their code")
    func apiErrors() throws {
        #expect(try Fixtures.decode(ApiError.self, "ApiError.rate-limited").code == .rateLimited)
        #expect(try Fixtures.decode(ApiError.self, "ApiError.unauthorized").code == .unauthorized)
    }
}
