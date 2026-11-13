import Foundation

// Hand-written Codable twins of packages/contract (zod). Drift is caught by
// Tests/ReLifeKitTests/ContractTests.swift, which decodes every contract fixture.

// MARK: - Shared

public enum DeviceKind: String, Codable, Sendable, CaseIterable {
    case browser, phone, mac, `extension`, cli
}

public enum Scope: String, Codable, Sendable, CaseIterable {
    case full, companion, ingest
}

public enum ActivityKind: String, Codable, Sendable, CaseIterable {
    case learning, work, entertainment, social, communication, shopping, news, other
}

public struct DeviceInfo: Codable, Sendable, Equatable, Identifiable {
    public var id: String
    public var kind: DeviceKind
    public var name: String
    public var scopes: [Scope]

    public init(id: String, kind: DeviceKind, name: String, scopes: [Scope]) {
        self.id = id
        self.kind = kind
        self.name = name
        self.scopes = scopes
    }
}

// MARK: - Errors

public enum ApiErrorCode: String, Codable, Sendable {
    case unauthorized, revoked, expired, forbidden
    case badRequest = "bad_request"
    case rateLimited = "rate_limited"
    case notFound = "not_found"
    case unavailable
}

/// `{ ok: false, error: { code, message } }`
public struct ApiError: Decodable, Sendable, Equatable {
    public var code: ApiErrorCode
    public var message: String

    private enum CodingKeys: String, CodingKey { case error }
    private enum ErrorKeys: String, CodingKey { case code, message }

    public init(code: ApiErrorCode, message: String) {
        self.code = code
        self.message = message
    }

    public init(from decoder: Decoder) throws {
        let outer = try decoder.container(keyedBy: CodingKeys.self)
        let inner = try outer.nestedContainer(keyedBy: ErrorKeys.self, forKey: .error)
        // An unknown code from a newer server is treated as `unavailable`, not a decode failure.
        let raw = try inner.decode(String.self, forKey: .code)
        code = ApiErrorCode(rawValue: raw) ?? .unavailable
        message = try inner.decode(String.self, forKey: .message)
    }
}

// MARK: - Hello, Me

public enum ServerMode: String, Codable, Sendable {
    case selfHost = "self-host"
    case cloud
}

public struct Hello: Codable, Sendable, Equatable {
    public var app: String
    public var apiVersion: Int
    public var version: String
    public var mode: ServerMode
    /// The owner's first name, only with a valid device token.
    public var name: String?
    public var minClient: MinClient

    public struct MinClient: Codable, Sendable, Equatable {
        public var `extension`: String
        public var mac: String
    }
}

public enum ThemePreference: String, Codable, Sendable {
    case light, dark, system
}

public struct Me: Codable, Sendable, Equatable {
    public var name: String
    public var timezone: String
    public var prefs: Prefs
    public var device: DeviceInfo

    public struct Prefs: Codable, Sendable, Equatable {
        public var theme: ThemePreference
    }
}

// MARK: - Today

public enum QuestRank: String, Codable, Sendable, CaseIterable {
    case e = "E", d = "D", c = "C", b = "B", a = "A", s = "S"
}

public enum QuestStatus: String, Codable, Sendable {
    case active, cleared, failed, unverified, cancelled
}

public enum RoutineStatus: String, Codable, Sendable {
    case done, skipped, pending, missed
}

public enum QuestOp: String, Codable, Sendable {
    case gte, lte
}

public struct TodayView: Codable, Sendable, Equatable {
    /// The user's local date, YYYY-MM-DD.
    public var today: String
    /// First name.
    public var name: String
    public var character: Character
    public var quests: [Quest]
    public var routines: [Routine]
    public var goals: [Goal]
    public var done: Int
    public var total: Int
    /// What the menu bar badge counts: routines and goals still open plus System quests not yet cleared.
    public var left: Int
    public var focus: Focus

    public struct Character: Codable, Sendable, Equatable {
        public var level: Int
        public var title: String
        public var total: Int
        public var floor: Int
        public var next: Int
        public var progress: Double
        public var todayXp: Int
        public var streak: Int
        public var best: Int
        public var doneToday: Bool
        public var freezes: Int
    }

    public struct Quest: Codable, Sendable, Equatable, Identifiable {
        public var id: String
        public var title: String
        public var area: String
        public var rank: QuestRank
        public var xp: Int
        public var status: QuestStatus
        public var progress: Double?
        public var target: Double
        public var unit: String?
        public var op: QuestOp
    }

    public struct Routine: Codable, Sendable, Equatable, Identifiable {
        public var scheduleId: String
        /// ISO instant.
        public var occurrence: String
        /// The occurrence formatted in the user's zone ("9:00 pm").
        public var time: String
        public var name: String
        public var kind: String
        public var area: String
        public var status: RoutineStatus
        public var xp: Int

        public var id: String { scheduleId + "@" + occurrence }
    }

    public struct Goal: Codable, Sendable, Equatable, Identifiable {
        public var scheduleId: String
        public var name: String
        public var area: String
        public var value: Double
        public var target: Double
        public var unit: String
        /// The quick-add amount (water +250).
        public var step: Double
        public var trackerSlug: String

        public var id: String { scheduleId }
    }

    public struct Focus: Codable, Sendable, Equatable {
        public var seconds: Double
        public var byKind: [Kind]

        public struct Kind: Codable, Sendable, Equatable {
            public var kind: ActivityKind
            public var seconds: Double
        }
    }
}

/// GET /api/v1/today returns the view plus `ok: true`. The extra key is ignored on decode.
public typealias TodayResponse = TodayView

public enum CheckStatus: String, Codable, Sendable {
    case done, skipped
}

/// POST /api/v1/today/actions body.
public enum TodayAction: Codable, Sendable, Equatable {
    /// `status: nil` undoes the check.
    case check(scheduleId: String, occurrence: String, status: CheckStatus?)
    case add(scheduleId: String, amount: Double)
    case log(text: String)

    private enum Keys: String, CodingKey { case action, scheduleId, occurrence, status, amount, text }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        switch try c.decode(String.self, forKey: .action) {
        case "check":
            self = .check(scheduleId: try c.decode(String.self, forKey: .scheduleId),
                          occurrence: try c.decode(String.self, forKey: .occurrence),
                          status: try c.decodeIfPresent(CheckStatus.self, forKey: .status))
        case "add":
            self = .add(scheduleId: try c.decode(String.self, forKey: .scheduleId),
                        amount: try c.decode(Double.self, forKey: .amount))
        case "log":
            self = .log(text: try c.decode(String.self, forKey: .text))
        default:
            throw DecodingError.dataCorruptedError(forKey: .action, in: c, debugDescription: "unknown action")
        }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Keys.self)
        switch self {
        case let .check(scheduleId, occurrence, status):
            try c.encode("check", forKey: .action)
            try c.encode(scheduleId, forKey: .scheduleId)
            try c.encode(occurrence, forKey: .occurrence)
            // The server requires the key: an explicit null undoes the check.
            try c.encode(status, forKey: .status)
        case let .add(scheduleId, amount):
            try c.encode("add", forKey: .action)
            try c.encode(scheduleId, forKey: .scheduleId)
            try c.encode(amount, forKey: .amount)
        case let .log(text):
            try c.encode("log", forKey: .action)
            try c.encode(text, forKey: .text)
        }
    }
}

public struct XpNews: Codable, Sendable, Equatable {
    public var levelUp: LevelUp?
    public var unlocked: [Unlocked]
    public var chests: Int?

    public struct LevelUp: Codable, Sendable, Equatable {
        public var level: Int
        public var title: String
        public var from: Int
        public var newTitle: Bool
    }

    public struct Unlocked: Codable, Sendable, Equatable {
        public var key: String
        public var name: String
        public var tier: String
        public var xp: Int
    }

    public var isEmpty: Bool { levelUp == nil && unlocked.isEmpty && (chests ?? 0) == 0 }
}

public struct TodayActionResult: Codable, Sendable, Equatable {
    public var ok: Bool
    public var message: String
    public var news: XpNews
    public var view: TodayView
}

// MARK: - Activity

/// One stretch of focused time on this Mac. `id` makes re-sends safe.
public struct ActivitySegment: Codable, Sendable, Equatable, Identifiable {
    public var id: String
    public var source: String
    public var app: String
    public var bundleId: String?
    public var start: Date
    public var end: Date

    public init(id: String, app: String, bundleId: String?, start: Date, end: Date) {
        self.id = id
        self.source = "mac"
        self.app = app
        self.bundleId = bundleId
        self.start = start
        self.end = end
    }

    public var seconds: TimeInterval { end.timeIntervalSince(start) }
}

/// POST /api/v1/activity. The Mac app only sends segments; courses and rules stay with the extension.
public struct ActivityBatch: Codable, Sendable, Equatable {
    public var segments: [ActivitySegment]

    public init(segments: [ActivitySegment]) {
        self.segments = segments
    }
}

// MARK: - Pairing

public enum PairKind: String, Codable, Sendable {
    case mac, `extension`, phone, browser
}

public struct PairRequestStart: Codable, Sendable, Equatable {
    public var kind: PairKind
    public var name: String
    public var platform: String?

    public init(kind: PairKind, name: String, platform: String? = nil) {
        self.kind = kind
        self.name = name
        self.platform = platform
    }
}

public struct PairRequestStarted: Codable, Sendable, Equatable {
    public var id: String
    /// 8 Crockford base32 characters, shown as XXXX-XXXX.
    public var userCode: String
    public var pollSecret: String
    public var approveUrl: String
    public var expiresAt: String
    /// Seconds between polls.
    public var interval: Double

    public var expiry: Date? { ISO8601.date(expiresAt) }
}

public enum PairPoll: Codable, Sendable, Equatable {
    case pending
    case denied
    case expired
    case approved(token: String?, device: DeviceInfo)

    private enum Keys: String, CodingKey { case status, token, device }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        switch try c.decode(String.self, forKey: .status) {
        case "pending": self = .pending
        case "denied": self = .denied
        case "expired": self = .expired
        case "approved":
            self = .approved(token: try c.decodeIfPresent(String.self, forKey: .token),
                             device: try c.decode(DeviceInfo.self, forKey: .device))
        default:
            throw DecodingError.dataCorruptedError(forKey: .status, in: c, debugDescription: "unknown status")
        }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Keys.self)
        switch self {
        case .pending: try c.encode("pending", forKey: .status)
        case .denied: try c.encode("denied", forKey: .status)
        case .expired: try c.encode("expired", forKey: .status)
        case let .approved(token, device):
            try c.encode("approved", forKey: .status)
            try c.encodeIfPresent(token, forKey: .token)
            try c.encode(device, forKey: .device)
        }
    }
}

public struct PairPollBody: Codable, Sendable, Equatable {
    public var pollSecret: String
}

public struct PairRedeem: Codable, Sendable, Equatable {
    public var secret: String?
    public var code: String?
    public var kind: PairKind?
    public var name: String?
    public var platform: String?

    public init(secret: String? = nil, code: String? = nil, kind: PairKind? = nil, name: String? = nil, platform: String? = nil) {
        self.secret = secret
        self.code = code
        self.kind = kind
        self.name = name
        self.platform = platform
    }
}

public struct PairRedeemResult: Codable, Sendable, Equatable {
    public var ok: Bool
    public var device: DeviceInfo
    public var token: String?
    public var next: String?
}

// MARK: - Events (SSE)

public enum PairingStatus: String, Codable, Sendable {
    case pending, approved, redeemed, denied, expired
}

/// One decoded Server-Sent Event. The JSON data carries its own `type`.
public enum Event: Codable, Sendable, Equatable {
    case hello(version: String)
    case data(version: String)
    case pairing(id: String, status: PairingStatus)
    case deviceRevoked(id: String)
    case ping

    private enum Keys: String, CodingKey { case type, version, id, status }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        switch try c.decode(String.self, forKey: .type) {
        case "hello": self = .hello(version: try c.decode(String.self, forKey: .version))
        case "data": self = .data(version: try c.decode(String.self, forKey: .version))
        case "pairing":
            self = .pairing(id: try c.decode(String.self, forKey: .id), status: try c.decode(PairingStatus.self, forKey: .status))
        case "device.revoked": self = .deviceRevoked(id: try c.decode(String.self, forKey: .id))
        case "ping": self = .ping
        default:
            throw DecodingError.dataCorruptedError(forKey: .type, in: c, debugDescription: "unknown event type")
        }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Keys.self)
        switch self {
        case let .hello(version):
            try c.encode("hello", forKey: .type)
            try c.encode(version, forKey: .version)
        case let .data(version):
            try c.encode("data", forKey: .type)
            try c.encode(version, forKey: .version)
        case let .pairing(id, status):
            try c.encode("pairing", forKey: .type)
            try c.encode(id, forKey: .id)
            try c.encode(status, forKey: .status)
        case let .deviceRevoked(id):
            try c.encode("device.revoked", forKey: .type)
            try c.encode(id, forKey: .id)
        case .ping:
            try c.encode("ping", forKey: .type)
        }
    }
}

// MARK: - ISO 8601

/// ISO 8601 with or without fractional seconds, as the server sends and expects.
public enum ISO8601 {
    public static func date(_ string: String) -> Date? {
        let frac = ISO8601DateFormatter()
        frac.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = frac.date(from: string) { return d }
        let plain = ISO8601DateFormatter()
        plain.formatOptions = [.withInternetDateTime]
        return plain.date(from: string)
    }

    public static func string(_ date: Date) -> String {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f.string(from: date)
    }
}
