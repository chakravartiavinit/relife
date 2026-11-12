import Foundation

/// One write waiting for the server: a Today action or a batch of activity segments.
/// The app stores these in SwiftData (`PendingOp`); the rules live here so tests can run them.
public struct QueuedOp: Codable, Sendable, Equatable, Identifiable {
    public enum Kind: String, Codable, Sendable {
        case action
        case activity
    }

    /// A client-made id, sent as `Idempotency-Key`.
    public var id: UUID
    public var kind: Kind
    /// The JSON body: an encoded `TodayAction` or `ActivityBatch`.
    public var body: Data
    public var createdAt: Date
    public var attempts: Int
    public var lastAttemptAt: Date?

    public init(id: UUID = UUID(), kind: Kind, body: Data, createdAt: Date, attempts: Int = 0, lastAttemptAt: Date? = nil) {
        self.id = id
        self.kind = kind
        self.body = body
        self.createdAt = createdAt
        self.attempts = attempts
        self.lastAttemptAt = lastAttemptAt
    }

    public static func action(_ action: TodayAction, now: Date = Date(), id: UUID = UUID()) throws -> QueuedOp {
        QueuedOp(id: id, kind: .action, body: try JSONEncoder().encode(action), createdAt: now)
    }

    public static func activity(_ segments: [ActivitySegment], now: Date = Date(), id: UUID = UUID()) throws -> QueuedOp {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .custom { date, enc in
            var c = enc.singleValueContainer()
            try c.encode(ISO8601.string(date))
        }
        return QueuedOp(id: id, kind: .activity, body: try encoder.encode(ActivityBatch(segments: segments)), createdAt: now)
    }
}

public enum QueueRules {
    /// Writes older than this are dropped, and the count is reported.
    public static let maxAge: TimeInterval = 7 * 24 * 3600

    /// 5 s, 15 s, 1 min, 5 min, then every 5 min.
    public static func retryDelay(afterAttempts attempts: Int) -> TimeInterval {
        switch attempts {
        case ...0: 0
        case 1: 5
        case 2: 15
        case 3: 60
        default: 300
        }
    }

    /// Who the queue belongs to. When it changes (another server or another owner), the queue is cleared.
    public static func accountKey(origin: String, owner: String) -> String {
        origin.lowercased() + "|" + owner.lowercased()
    }

    public static func isExpired(_ op: QueuedOp, now: Date) -> Bool {
        now.timeIntervalSince(op.createdAt) > maxAge
    }

    /// Splits the queue into what to try now (oldest first) and what to drop as too old.
    /// `force` ignores the retry delay (on reconnect, on SSE hello and from the Retry button).
    public static func plan(_ ops: [QueuedOp], now: Date, force: Bool) -> (send: [QueuedOp], drop: [QueuedOp]) {
        let drop = ops.filter { isExpired($0, now: now) }
        let live = ops.filter { !isExpired($0, now: now) }.sorted { ($0.createdAt, $0.id.uuidString) < ($1.createdAt, $1.id.uuidString) }
        // Order matters (check then undo), so a write that is waiting for its retry holds back the ones after it.
        var send: [QueuedOp] = []
        for op in live {
            if !force, let last = op.lastAttemptAt, now.timeIntervalSince(last) < retryDelay(afterAttempts: op.attempts) { break }
            send.append(op)
        }
        return (send, drop)
    }

    public enum Outcome: Equatable, Sendable {
        /// Sent, or the server says it already has it.
        case sent
        /// Keep it, stop here: sending later in order still makes sense.
        case retryLater
        /// The server will never accept this write. Drop it.
        case reject
        /// The token is dead. Keep everything; the Connect screen takes over.
        case signedOut
    }

    public static func outcome(for error: ClientError) -> Outcome {
        switch error {
        case .unreachable, .serverTooOld: return .retryLater
        case .sessionEnded, .unauthorized: return .signedOut
        case let .api(status, api):
            if status >= 500 { return .retryLater }
            switch api.code {
            case .rateLimited, .unavailable: return .retryLater
            case .revoked, .expired, .unauthorized: return .signedOut
            case .badRequest, .notFound, .forbidden: return .reject
            }
        case let .invalidResponse(status): return status >= 500 ? .retryLater : .reject
        }
    }
}

/// What one flush did.
public struct FlushReport: Sendable, Equatable {
    public var sent: [UUID] = []
    public var rejected: [UUID] = []
    public var expired: [UUID] = []
    /// Ops that failed and stay queued, with their new attempt count.
    public var retained: [UUID: Int] = [:]
    public var signedOut = false
    public var unreachable = false

    public init() {}

    /// Everything that left the queue.
    public var removed: [UUID] { sent + rejected + expired }
}

public enum QueueFlusher {
    /// Sends the queue in order. Stops at the first write that needs a later retry (order is kept)
    /// and at a dead token. A rejected write is dropped and the flush goes on.
    public static func flush(_ ops: [QueuedOp], now: Date, force: Bool,
                             send: (QueuedOp) async throws -> Void) async -> FlushReport {
        var report = FlushReport()
        let (toSend, expired) = plan(ops, now: now, force: force)
        report.expired = expired.map(\.id)
        for op in toSend {
            do {
                try await send(op)
                report.sent.append(op.id)
            } catch let error as ClientError {
                switch QueueRules.outcome(for: error) {
                case .sent: report.sent.append(op.id)
                case .reject: report.rejected.append(op.id)
                case .retryLater:
                    report.retained[op.id] = op.attempts + 1
                    report.unreachable = error.isUnreachable
                    return report
                case .signedOut:
                    report.signedOut = true
                    return report
                }
            } catch {
                report.retained[op.id] = op.attempts + 1
                report.unreachable = true
                return report
            }
        }
        return report
    }

    private static func plan(_ ops: [QueuedOp], now: Date, force: Bool) -> ([QueuedOp], [QueuedOp]) {
        let p = QueueRules.plan(ops, now: now, force: force)
        return (p.send, p.drop)
    }
}

/// The notice shown when the queue is cleared because the device now belongs to another ReLife.
public enum QueueNotice {
    public static func accountChanged(dropped: Int) -> String? {
        guard dropped > 0 else { return nil }
        let things = dropped == 1 ? "1 unsent log was" : "\(dropped) unsent logs were"
        return "\(things) cleared because this device now belongs to another ReLife."
    }

    public static func expired(dropped: Int) -> String? {
        guard dropped > 0 else { return nil }
        let things = dropped == 1 ? "1 unsent log was" : "\(dropped) unsent logs were"
        return "\(things) dropped after 7 days offline."
    }
}
