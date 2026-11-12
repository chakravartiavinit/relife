import Foundation

/// A Server-Sent Events parser. Feed it one line at a time (no line break);
/// a blank line ends an event. Comment lines (": ping") and unknown fields are ignored.
public struct SSEParser: Sendable {
    public struct Message: Sendable, Equatable {
        public var event: String?
        public var data: String
        public var id: String?
    }

    private var event: String?
    private var dataLines: [String] = []
    private var id: String?

    public init() {}

    /// Returns a message when `line` completes one.
    public mutating func feed(line rawLine: String) -> Message? {
        let line = rawLine.hasSuffix("\r") ? String(rawLine.dropLast()) : rawLine
        if line.isEmpty {
            defer { event = nil; dataLines = []; id = nil }
            guard !dataLines.isEmpty else { return nil }
            return Message(event: event, data: dataLines.joined(separator: "\n"), id: id)
        }
        if line.hasPrefix(":") { return nil }
        let field: Substring
        var value: Substring = ""
        if let colon = line.firstIndex(of: ":") {
            field = line[line.startIndex..<colon]
            value = line[line.index(after: colon)...]
            if value.hasPrefix(" ") { value = value.dropFirst() }
        } else {
            field = Substring(line)
        }
        switch field {
        case "event": event = String(value)
        case "data": dataLines.append(String(value))
        case "id": id = String(value)
        default: break
        }
        return nil
    }
}

public enum SSEEvent {
    /// Decodes one message into an `Event`. When the JSON has no `type`, the SSE event name stands in
    /// for it. Unknown event types return nil, so a newer server never breaks an older app.
    public static func decode(_ message: SSEParser.Message) -> Event? {
        guard let raw = message.data.data(using: .utf8) else { return nil }
        let decoder = JSONDecoder()
        if let event = try? decoder.decode(Event.self, from: raw) { return event }
        guard let name = message.event,
              var object = (try? JSONSerialization.jsonObject(with: raw)) as? [String: Any],
              object["type"] == nil else { return nil }
        object["type"] = name
        guard let patched = try? JSONSerialization.data(withJSONObject: object) else { return nil }
        return try? decoder.decode(Event.self, from: patched)
    }
}

/// Reconnect delays for the event stream: 1 s, 2 s, 4 s ... up to 30 s, with no jitter so tests stay exact.
public enum Backoff {
    public static func delay(afterFailures failures: Int, cap: TimeInterval = 30) -> TimeInterval {
        guard failures > 0 else { return 0 }
        return min(cap, pow(2, Double(min(failures - 1, 10))))
    }
}
