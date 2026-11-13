import Foundation
import Testing
@testable import ReLifeKit

private let t0 = Date(timeIntervalSince1970: 1_794_470_400)

private func op(_ id: Int, at offset: TimeInterval = 0, attempts: Int = 0, last: TimeInterval? = nil) -> QueuedOp {
    QueuedOp(id: UUID(uuidString: String(format: "00000000-0000-0000-0000-%012d", id))!, kind: .action, body: Data("{}".utf8),
             createdAt: t0.addingTimeInterval(offset), attempts: attempts, lastAttemptAt: last.map { t0.addingTimeInterval($0) })
}

@Suite("Offline queue")
struct QueueTests {
    @Test("writes go out oldest first")
    func order() {
        let plan = QueueRules.plan([op(2, at: 20), op(1, at: 10), op(3, at: 30)], now: t0.addingTimeInterval(60), force: false)
        #expect(plan.send.map(\.createdAt.timeIntervalSince1970) == [10, 20, 30].map { t0.timeIntervalSince1970 + $0 })
    }

    @Test("writes older than 7 days are dropped")
    func expiry() {
        let now = t0.addingTimeInterval(8 * 86_400)
        let plan = QueueRules.plan([op(1), op(2, at: 7.5 * 86_400)], now: now, force: false)
        #expect(plan.drop.count == 1)
        #expect(plan.send.count == 1)
        #expect(!QueueRules.isExpired(op(3, at: 2 * 86_400), now: now))
    }

    @Test("a write waiting for its retry holds back the ones after it")
    func backoffHoldsOrder() {
        let now = t0.addingTimeInterval(100)
        let waiting = op(1, at: 0, attempts: 2, last: 95) // retry after 15 s, tried 5 s ago
        let later = op(2, at: 10)
        #expect(QueueRules.plan([waiting, later], now: now, force: false).send.isEmpty)
        #expect(QueueRules.plan([waiting, later], now: now, force: true).send.count == 2)
        #expect(QueueRules.plan([waiting, later], now: now.addingTimeInterval(20), force: false).send.count == 2)
    }

    @Test("retry delays grow to 5 minutes")
    func delays() {
        #expect([0, 1, 2, 3, 4, 9].map(QueueRules.retryDelay(afterAttempts:)) == [0, 5, 15, 60, 300, 300])
    }

    @Test("errors map to outcomes")
    func outcomes() {
        #expect(QueueRules.outcome(for: .unreachable("x")) == .retryLater)
        #expect(QueueRules.outcome(for: .sessionEnded(.revoked)) == .signedOut)
        #expect(QueueRules.outcome(for: .api(status: 422, error: .init(code: .badRequest, message: ""))) == .reject)
        #expect(QueueRules.outcome(for: .api(status: 429, error: .init(code: .rateLimited, message: ""))) == .retryLater)
        #expect(QueueRules.outcome(for: .api(status: 503, error: .init(code: .unavailable, message: ""))) == .retryLater)
        #expect(QueueRules.outcome(for: .api(status: 500, error: .init(code: .notFound, message: ""))) == .retryLater)
        #expect(QueueRules.outcome(for: .invalidResponse(status: 502)) == .retryLater)
    }

    @Test("a flush sends everything in order when the server is up")
    func flushAll() async {
        let sent = Box<[UUID]>([])
        let ops = [op(2, at: 2), op(1, at: 1), op(3, at: 3)]
        let report = await QueueFlusher.flush(ops, now: t0.addingTimeInterval(60), force: true) { sent.append($0.id) }
        #expect(sent.value == [ops[1].id, ops[0].id, ops[2].id])
        #expect(report.sent.count == 3)
        #expect(report.removed.count == 3)
    }

    @Test("a flush stops at the first network failure and keeps the rest")
    func flushStops() async {
        let ops = [op(1, at: 1), op(2, at: 2), op(3, at: 3)]
        let calls = Box<Int>(0)
        let report = await QueueFlusher.flush(ops, now: t0.addingTimeInterval(60), force: true) { op in
            calls.mutate { $0 += 1 }
            if op.id == ops[1].id { throw ClientError.unreachable("offline") }
        }
        #expect(calls.value == 2)
        #expect(report.sent == [ops[0].id])
        #expect(report.retained == [ops[1].id: 1])
        #expect(report.unreachable)
    }

    @Test("a rejected write is dropped and the flush goes on")
    func flushRejects() async {
        let ops = [op(1, at: 1), op(2, at: 2)]
        let report = await QueueFlusher.flush(ops, now: t0.addingTimeInterval(60), force: true) { op in
            if op.id == ops[0].id { throw ClientError.api(status: 422, error: .init(code: .badRequest, message: "bad")) }
        }
        #expect(report.rejected == [ops[0].id])
        #expect(report.sent == [ops[1].id])
    }

    @Test("a dead token stops the flush and keeps everything")
    func flushSignedOut() async {
        let ops = [op(1, at: 1), op(2, at: 2)]
        let report = await QueueFlusher.flush(ops, now: t0.addingTimeInterval(60), force: true) { _ in throw ClientError.sessionEnded(.revoked) }
        #expect(report.signedOut)
        #expect(report.removed.isEmpty)
    }

    @Test("expired writes are reported by the flush")
    func flushExpired() async {
        let now = t0.addingTimeInterval(10 * 86_400)
        let report = await QueueFlusher.flush([op(1, at: 0), op(2, at: 9.5 * 86_400)], now: now, force: true) { _ in }
        #expect(report.expired.count == 1)
        #expect(report.sent.count == 1)
    }

    @Test("queued ops carry the encoded body")
    func bodies() throws {
        let a = try QueuedOp.action(.add(scheduleId: "s1", amount: 250), now: t0)
        let json = try #require(try JSONSerialization.jsonObject(with: a.body) as? [String: Any])
        #expect(json["action"] as? String == "add")
        let seg = ActivitySegment(id: "x", app: "Safari", bundleId: nil, start: t0, end: t0.addingTimeInterval(60))
        let b = try QueuedOp.activity([seg], now: t0)
        let batch = try #require(try JSONSerialization.jsonObject(with: b.body) as? [String: Any])
        #expect((batch["segments"] as? [Any])?.count == 1)
        #expect(b.kind == .activity)
    }

    @Test("notices say how many were cleared")
    func notices() {
        #expect(QueueNotice.accountChanged(dropped: 0) == nil)
        #expect(QueueNotice.accountChanged(dropped: 2) == "2 unsent logs were cleared because this device now belongs to another \(Brand.name).")
        #expect(QueueNotice.accountChanged(dropped: 1)?.hasPrefix("1 unsent log was") == true)
        #expect(QueueNotice.expired(dropped: 3) == "3 unsent logs were dropped after 7 days offline.")
    }
}

final class Box<T>: @unchecked Sendable {
    private let lock = NSLock()
    private var _value: T
    init(_ value: T) { _value = value }
    var value: T { lock.withLock { _value } }
    func mutate(_ f: (inout T) -> Void) { lock.withLock { f(&_value) } }
}

extension Box where T == [UUID] {
    func append(_ id: UUID) { mutate { $0.append(id) } }
}

@Suite("Queued writes use the client")
struct QueuedSendTests {
    private let client: (MockTransport) -> ReLifeClient = {
        ReLifeClient(baseURL: URL(string: "http://127.0.0.1:3030")!, token: "rlf_m_t", clientVersion: "0.1.0", transport: $0)
    }

    @Test("an action goes out with its own id as the idempotency key")
    func action() async throws {
        let t = MockTransport()
        try t.reply(fixture: "TodayActionResult.plain")
        let op = try QueuedOp.action(.add(scheduleId: "s1", amount: 250), now: t0)
        try await op.send(using: client(t))
        let r = try #require(t.requests.first)
        #expect(r.value(forHTTPHeaderField: "Idempotency-Key") == op.id.uuidString.lowercased())
        #expect(r.bodyJSON?["amount"] as? Double == 250)
    }

    @Test("an activity batch goes out as stored")
    func activity() async throws {
        let t = MockTransport()
        t.reply(json: #"{"ok":true}"#)
        let seg = ActivitySegment(id: "x", app: "Safari", bundleId: nil, start: t0, end: t0.addingTimeInterval(60))
        let op = try QueuedOp.activity([seg], now: t0)
        try await op.send(using: client(t))
        let r = try #require(t.requests.first)
        #expect(r.url?.path == "/api/v1/activity")
        #expect(r.httpBody == op.body)
    }
}
