import Foundation
import Testing
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
@testable import ReLifeKit

private let base = URL(string: "http://127.0.0.1:3030")!

private func client(_ transport: MockTransport, token: String? = "rlf_m_test", ended: @escaping @Sendable (SessionEnd) -> Void = { _ in }) -> ReLifeClient {
    ReLifeClient(baseURL: base, token: token, clientVersion: "0.1.0", transport: transport, onSessionEnded: ended)
}

@Suite("API client")
struct ClientTests {
    @Test("hello is public and needs no token")
    func hello() async throws {
        let t = MockTransport()
        try t.reply(fixture: "Hello.self-host")
        let hello = try await client(t, token: nil).hello()
        #expect(hello.mode == .selfHost)
        let r = try #require(t.requests.first)
        #expect(r.url?.absoluteString == "http://127.0.0.1:3030/api/v1/hello")
        #expect(r.value(forHTTPHeaderField: "Authorization") == nil)
        #expect(r.value(forHTTPHeaderField: ReLifeClient.clientHeader) == "mac/0.1.0")
    }

    @Test("a 404 on hello means the server is too old")
    func tooOld() async throws {
        let t = MockTransport()
        t.reply(404, json: #"{"error":"not found"}"#)
        await #expect(throws: ClientError.serverTooOld) { try await client(t).hello() }
    }

    @Test("today sends the bearer token and decodes the view with its ok flag")
    func today() async throws {
        let t = MockTransport()
        var json = try String(data: Fixtures.data("TodayView.full"), encoding: .utf8)!
        json = json.replacingOccurrences(of: "{", with: #"{"ok":true,"#, options: [], range: json.range(of: "{"))
        t.reply(json: json)
        let view = try await client(t).today()
        #expect(view.character.level == 7)
        let r = try #require(t.requests.first)
        #expect(r.value(forHTTPHeaderField: "Authorization") == "Bearer rlf_m_test")
        #expect(r.url?.path == "/api/v1/today")
    }

    @Test("an action posts its body with an Idempotency-Key")
    func act() async throws {
        let t = MockTransport()
        try t.reply(fixture: "TodayActionResult.plain")
        let key = UUID()
        let result = try await client(t).act(.log(text: "water 250"), idempotencyKey: key)
        #expect(result.ok)
        let r = try #require(t.requests.first)
        #expect(r.httpMethod == "POST")
        #expect(r.url?.path == "/api/v1/today/actions")
        #expect(r.value(forHTTPHeaderField: "Idempotency-Key") == key.uuidString.lowercased())
        #expect(r.bodyJSON?["action"] as? String == "log")
        #expect(r.bodyJSON?["text"] as? String == "water 250")
    }

    @Test("401 revoked ends the session and calls the hook once")
    func revoked() async throws {
        let t = MockTransport()
        t.reply(401, json: #"{"ok":false,"error":{"code":"revoked","message":"This device was disconnected."}}"#)
        let ended = EndedBox()
        await #expect(throws: ClientError.sessionEnded(.revoked)) { try await client(t, ended: { ended.set($0) }).today() }
        #expect(ended.value == .revoked)
    }

    @Test("401 expired ends the session")
    func expired() async throws {
        let t = MockTransport()
        t.reply(401, json: #"{"ok":false,"error":{"code":"expired","message":"Sign in again."}}"#)
        let ended = EndedBox()
        await #expect(throws: ClientError.sessionEnded(.expired)) { try await client(t, ended: { ended.set($0) }).me() }
        #expect(ended.value == .expired)
    }

    @Test("a plain 401 is unauthorized and does not end the session")
    func unauthorized() async throws {
        let t = MockTransport()
        t.reply(401, json: #"{"ok":false,"error":{"code":"unauthorized","message":"Sign in."}}"#)
        let ended = EndedBox()
        await #expect(throws: ClientError.unauthorized) { try await client(t, ended: { ended.set($0) }).today() }
        #expect(ended.value == nil)
    }

    @Test("a dead network is unreachable and transient")
    func unreachable() async throws {
        let t = MockTransport()
        t.fail(with: URLError(.notConnectedToInternet))
        do {
            _ = try await client(t).today()
            Issue.record("should have thrown")
        } catch let error as ClientError {
            #expect(error.isUnreachable)
            #expect(error.isTransient)
        }
    }

    @Test("a call that needs a token fails before the network without one")
    func noToken() async throws {
        let t = MockTransport()
        await #expect(throws: ClientError.unauthorized) { try await client(t, token: nil).today() }
        #expect(t.requests.isEmpty)
    }

    @Test("pairing flow B: start, poll pending, poll approved")
    func pairing() async throws {
        let t = MockTransport()
        try t.reply(fixture: "PairRequestStarted.basic")
        let c = client(t, token: nil)
        let started = try await c.startPairing(name: "MacBook Pro", platform: "macOS 26")
        #expect(started.userCode == "K7M2-9QXD")
        var r = try #require(t.requests.last)
        #expect(r.url?.path == "/api/v1/pair/requests")
        #expect(r.value(forHTTPHeaderField: "Authorization") == nil)
        #expect(r.bodyJSON?["kind"] as? String == "mac")
        #expect(r.bodyJSON?["name"] as? String == "MacBook Pro")

        try t.reply(fixture: "PairPoll.pending")
        #expect(try await c.poll(started) == .pending)
        r = try #require(t.requests.last)
        #expect(r.url?.path == "/api/v1/pair/requests/\(started.id)/poll")
        #expect(r.bodyJSON?["pollSecret"] as? String == started.pollSecret)

        try t.reply(fixture: "PairPoll.approved")
        guard case let .approved(token, device) = try await c.poll(started) else { Issue.record("not approved"); return }
        #expect(token != nil)
        #expect(device.kind == .mac)
    }

    @Test("redeem sends the normalized code and asks for a mac device")
    func redeem() async throws {
        let t = MockTransport()
        try t.reply(fixture: "PairRedeemResult.native")
        let result = try await client(t, token: nil).redeem(code: "k7fq 2m9x", name: "MacBook Pro")
        #expect(result.token != nil)
        let r = try #require(t.requests.first)
        #expect(r.url?.path == "/api/v1/pair/redeem")
        #expect(r.bodyJSON?["code"] as? String == "K7FQ2M9X")
        #expect(r.bodyJSON?["kind"] as? String == "mac")
    }

    @Test("activity posts mac segments with ISO dates")
    func activity() async throws {
        let t = MockTransport()
        t.reply(json: #"{"ok":true,"saved":1}"#)
        let start = Date(timeIntervalSince1970: 1_794_470_400)
        let segment = ActivitySegment(id: "abc", app: "Xcode", bundleId: "com.apple.dt.Xcode", start: start, end: start.addingTimeInterval(90))
        try await client(t).postActivity(ActivityBatch(segments: [segment]), idempotencyKey: UUID())
        let r = try #require(t.requests.first)
        #expect(r.url?.path == "/api/v1/activity")
        let seg = try #require((r.bodyJSON?["segments"] as? [[String: Any]])?.first)
        #expect(seg["source"] as? String == "mac")
        #expect(seg["app"] as? String == "Xcode")
        #expect(seg["bundleId"] as? String == "com.apple.dt.Xcode")
        #expect(seg["start"] as? String == "2026-11-12T08:00:00.000Z")
        #expect(seg["end"] as? String == "2026-11-12T08:01:30.000Z")
    }

    @Test("events decodes the stream and skips comments and unknown types")
    func events() async throws {
        let t = MockTransport()
        t.lines = [
            ": connected", "",
            #"data: {"type":"hello","version":"1"}"#, "",
            "event: data", #"data: {"version":"2"}"#, "",
            #"data: {"type":"from-the-future"}"#, "",
            #"data: {"type":"device.revoked","id":"d1"}"#, "",
        ]
        var got: [Event] = []
        for try await e in client(t).events() { got.append(e) }
        #expect(got == [.hello(version: "1"), .data(version: "2"), .deviceRevoked(id: "d1")])
        #expect(t.requests.first?.value(forHTTPHeaderField: "Accept") == "text/event-stream")
    }
}

final class EndedBox: @unchecked Sendable {
    private let lock = NSLock()
    private var _value: SessionEnd?
    var value: SessionEnd? { lock.withLock { _value } }
    func set(_ v: SessionEnd) { lock.withLock { _value = v } }
}
