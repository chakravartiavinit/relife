import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

// MARK: - Errors

/// Why a signed-in device was signed out. Shown on the Connect screen.
public enum SessionEnd: Sendable, Equatable {
    case revoked
    case expired
}

public enum ClientError: Error, Sendable, Equatable {
    /// The server did not answer (no network, server stopped, timeout).
    case unreachable(String)
    /// 401 with `revoked` or `expired`: the token is dead. The client has already called `onSessionEnded`.
    case sessionEnded(SessionEnd)
    /// 401 without a reason, or no token on a call that needs one.
    case unauthorized
    /// `/api/v1/hello` is missing (404) or the API version is not 1: the server is older than this app.
    case serverTooOld
    /// A well-formed error from the server.
    case api(status: Int, error: ApiError)
    /// An answer this app cannot read.
    case invalidResponse(status: Int)

    public var isUnreachable: Bool {
        if case .unreachable = self { return true }
        return false
    }

    /// Whether trying the same call later can help.
    public var isTransient: Bool {
        switch self {
        case .unreachable: true
        case let .api(status, error): status >= 500 || error.code == .rateLimited || error.code == .unavailable
        case let .invalidResponse(status): status >= 500
        default: false
        }
    }
}

// MARK: - Transport

/// The network, behind a protocol so tests run without one.
public protocol HTTPTransport: Sendable {
    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse)
    /// Response body lines as they arrive (for Server-Sent Events). Throws when the connection drops.
    func lines(_ request: URLRequest) -> AsyncThrowingStream<String, Error>
}

public struct URLSessionTransport: HTTPTransport {
    private let session: URLSession

    public init(session: URLSession = .shared) {
        self.session = session
    }

    public func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
        return (data, http)
    }

    public func lines(_ request: URLRequest) -> AsyncThrowingStream<String, Error> {
        AsyncThrowingStream { continuation in
            #if canImport(Darwin)
            let session = self.session
            let task = Task {
                do {
                    let (bytes, response) = try await session.bytes(for: request)
                    guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
                        throw URLError(.badServerResponse)
                    }
                    for try await line in bytes.lines { continuation.yield(line) }
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
            continuation.onTermination = { _ in task.cancel() }
            #else
            // Linux has no streaming URLSession API; this build is only for running the tests.
            continuation.finish(throwing: URLError(.unsupportedURL))
            #endif
        }
    }
}

// MARK: - Client

/// A client of one ReLife server (local or cloud). Sends `X-ReLife-Client: mac/<version>` and, when
/// signed in, `Authorization: Bearer <token>`.
public struct ReLifeClient: Sendable {
    public let baseURL: URL
    public let token: String?
    public let clientVersion: String
    private let transport: HTTPTransport
    private let onSessionEnded: @Sendable (SessionEnd) -> Void

    public init(baseURL: URL, token: String? = nil, clientVersion: String, transport: HTTPTransport = URLSessionTransport(),
                onSessionEnded: @escaping @Sendable (SessionEnd) -> Void = { _ in }) {
        self.baseURL = baseURL
        self.token = token
        self.clientVersion = clientVersion
        self.transport = transport
        self.onSessionEnded = onSessionEnded
    }

    // MARK: Endpoints

    /// Public. Throws `.serverTooOld` when the server has no v1 API.
    public func hello() async throws -> Hello {
        do {
            let hello: Hello = try await get("/api/v1/hello", auth: token != nil)
            guard hello.app == "relife", hello.apiVersion == 1 else { throw ClientError.serverTooOld }
            return hello
        } catch let ClientError.api(status, _) where status == 404 {
            throw ClientError.serverTooOld
        } catch let ClientError.invalidResponse(status) where status == 404 {
            throw ClientError.serverTooOld
        }
    }

    public func me() async throws -> Me { try await get("/api/v1/me") }

    public func today() async throws -> TodayView { try await get("/api/v1/today") }

    /// Every write carries an Idempotency-Key, so a retry after a timeout is not counted twice.
    public func act(_ action: TodayAction, idempotencyKey: UUID) async throws -> TodayActionResult {
        try await post("/api/v1/today/actions", body: action, headers: ["Idempotency-Key": idempotencyKey.uuidString.lowercased()])
    }

    public func postActivity(_ batch: ActivityBatch, idempotencyKey: UUID? = nil) async throws {
        try await postActivity(body: try Self.encoder.encode(batch), idempotencyKey: idempotencyKey)
    }

    /// An already encoded batch (what the offline queue stores).
    public func postActivity(body: Data, idempotencyKey: UUID? = nil) async throws {
        let headers = idempotencyKey.map { ["Idempotency-Key": $0.uuidString.lowercased()] } ?? [:]
        let _: Empty = try await run(method: "POST", path: "/api/v1/activity", body: body, headers: headers, auth: true)
    }

    public func startPairing(kind: PairKind = .mac, name: String, platform: String? = nil) async throws -> PairRequestStarted {
        try await post("/api/v1/pair/requests", body: PairRequestStart(kind: kind, name: name, platform: platform), auth: false)
    }

    public func poll(_ started: PairRequestStarted) async throws -> PairPoll {
        try await post("/api/v1/pair/requests/\(started.id)/poll", body: PairPollBody(pollSecret: started.pollSecret), auth: false)
    }

    /// Flow A: a QR secret or a typed code. Native clients get the token in the body.
    public func redeem(secret: String? = nil, code: String? = nil, name: String, platform: String? = nil) async throws -> PairRedeemResult {
        precondition(secret != nil || code != nil, "redeem needs a secret or a code")
        let body = PairRedeem(secret: secret, code: code.flatMap(ConnectCode.normalize) ?? code, kind: .mac, name: name, platform: platform)
        return try await post("/api/v1/pair/redeem", body: body, auth: false)
    }

    /// `POST /api/v1/devices/me/revoke`: sign this device out on the server.
    public func disconnect() async throws {
        let _: Empty = try await post("/api/v1/devices/me/revoke", body: Empty())
    }

    /// The event stream. Ends (throws) when the connection drops; the caller reconnects with `Backoff`.
    public func events() -> AsyncThrowingStream<Event, Error> {
        let request: URLRequest
        do {
            request = try makeRequest(method: "GET", path: "/api/v1/events", body: nil, headers: ["Accept": "text/event-stream"], auth: true,
                                      timeout: 24 * 3600)
        } catch {
            return AsyncThrowingStream { $0.finish(throwing: error) }
        }
        let lines = transport.lines(request)
        return AsyncThrowingStream { continuation in
            let task = Task {
                var parser = SSEParser()
                do {
                    for try await line in lines {
                        if let message = parser.feed(line: line), let event = SSEEvent.decode(message) {
                            continuation.yield(event)
                        }
                    }
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: ClientError.unreachable(String(describing: error)))
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    // MARK: Plumbing

    private struct Empty: Codable {}

    private func get<T: Decodable>(_ path: String, auth: Bool = true) async throws -> T {
        try await run(method: "GET", path: path, body: nil, headers: [:], auth: auth)
    }

    private func post<T: Decodable, B: Encodable>(_ path: String, body: B, headers: [String: String] = [:], auth: Bool = true) async throws -> T {
        let data = try Self.encoder.encode(body)
        return try await run(method: "POST", path: path, body: data, headers: headers, auth: auth)
    }

    private func makeRequest(method: String, path: String, body: Data?, headers: [String: String], auth: Bool, timeout: TimeInterval = 15) throws -> URLRequest {
        guard let url = URL(string: path, relativeTo: baseURL)?.absoluteURL else { throw ClientError.unreachable("bad address") }
        var request = URLRequest(url: url, timeoutInterval: timeout)
        request.httpMethod = method
        request.setValue("mac/\(clientVersion)", forHTTPHeaderField: "X-ReLife-Client")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if auth {
            guard let token else { throw ClientError.unauthorized }
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let body {
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        for (k, v) in headers { request.setValue(v, forHTTPHeaderField: k) }
        return request
    }

    private func run<T: Decodable>(method: String, path: String, body: Data?, headers: [String: String], auth: Bool) async throws -> T {
        let request = try makeRequest(method: method, path: path, body: body, headers: headers, auth: auth)
        let data: Data
        let http: HTTPURLResponse
        do {
            (data, http) = try await transport.send(request)
        } catch let error as ClientError {
            throw error
        } catch {
            throw ClientError.unreachable(String(describing: error))
        }
        guard (200..<300).contains(http.statusCode) else { throw error(status: http.statusCode, data: data) }
        if T.self == Empty.self, let empty = Empty() as? T { return empty }
        do {
            return try Self.decoder.decode(T.self, from: data)
        } catch {
            throw ClientError.invalidResponse(status: http.statusCode)
        }
    }

    /// Maps a failed response to a `ClientError`. 401 with `revoked` or `expired` ends the session.
    private func error(status: Int, data: Data) -> ClientError {
        guard let api = try? Self.decoder.decode(ApiError.self, from: data) else {
            return status == 401 ? .unauthorized : .invalidResponse(status: status)
        }
        if status == 401 || status == 403 {
            switch api.code {
            case .revoked:
                onSessionEnded(.revoked)
                return .sessionEnded(.revoked)
            case .expired:
                onSessionEnded(.expired)
                return .sessionEnded(.expired)
            case .unauthorized:
                return .unauthorized
            default: break
            }
        }
        return .api(status: status, error: api)
    }

    private static let decoder = JSONDecoder()

    /// Dates go out as ISO 8601 with milliseconds, like the extension's segments.
    private static let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .custom { date, encoder in
            var c = encoder.singleValueContainer()
            try c.encode(ISO8601.string(date))
        }
        return e
    }()
}
