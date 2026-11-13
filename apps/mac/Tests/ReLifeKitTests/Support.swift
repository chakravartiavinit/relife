import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif
@testable import ReLifeKit

/// A fake network: returns scripted answers and records every request.
final class MockTransport: HTTPTransport, @unchecked Sendable {
    struct Reply {
        var status: Int
        var body: Data
    }

    private let lock = NSLock()
    private var replies: [Reply] = []
    private var failure: Error?
    private var _requests: [URLRequest] = []
    var lines: [String] = []

    var requests: [URLRequest] { lock.withLock { _requests } }

    func reply(_ status: Int = 200, json: String) {
        lock.withLock { replies.append(Reply(status: status, body: Data(json.utf8))) }
    }

    func reply(_ status: Int = 200, fixture: String) throws {
        let data = try Fixtures.data(fixture)
        lock.withLock { replies.append(Reply(status: status, body: data)) }
    }

    func fail(with error: Error) {
        lock.withLock { failure = error }
    }

    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let next: Reply? = try lock.withLock {
            _requests.append(request)
            if let failure { throw failure }
            return replies.isEmpty ? nil : replies.removeFirst()
        }
        guard let reply = next else { throw URLError(.cannotConnectToHost) }
        let response = HTTPURLResponse(url: request.url!, statusCode: reply.status, httpVersion: "HTTP/1.1", headerFields: nil)!
        return (reply.body, response)
    }

    func lines(_ request: URLRequest) -> AsyncThrowingStream<String, Error> {
        lock.withLock { _requests.append(request) }
        let lines = self.lines
        return AsyncThrowingStream { continuation in
            for line in lines { continuation.yield(line) }
            continuation.finish()
        }
    }
}

extension URLRequest {
    var bodyJSON: [String: Any]? {
        httpBody.flatMap { (try? JSONSerialization.jsonObject(with: $0)) as? [String: Any] }
    }
}
