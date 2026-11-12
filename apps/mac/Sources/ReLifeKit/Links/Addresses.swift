import Foundation

/// Turns what a person types ("127.0.0.1:3030", "relife.tail1234.ts.net") into a server origin.
public enum ServerAddress {
    public static let local = URL(string: "http://127.0.0.1:3030")!

    private static let loopback: Set<String> = ["127.0.0.1", "localhost", "[::1]", "::1"]

    /// An origin (scheme, host, port) or nil when the text is not an address. A bare loopback name
    /// gets http (the server has no TLS on this Mac); any other bare name gets https.
    public static func parse(_ text: String) -> URL? {
        var s = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !s.isEmpty, !s.contains(" ") else { return nil }
        if !s.contains("://") {
            let host = s.split(separator: ":").first.map(String.init) ?? s
            s = (loopback.contains(host.lowercased()) ? "http://" : "https://") + s
        }
        guard var parts = URLComponents(string: s),
              let scheme = parts.scheme?.lowercased(), scheme == "http" || scheme == "https",
              let host = parts.host, !host.isEmpty else { return nil }
        parts.scheme = scheme
        parts.host = host.lowercased()
        parts.path = ""
        parts.query = nil
        parts.fragment = nil
        parts.user = nil
        parts.password = nil
        return parts.url
    }

    public static func isLoopback(_ url: URL) -> Bool {
        guard let host = url.host?.lowercased() else { return false }
        return loopback.contains(host) || loopback.contains("[\(host)]")
    }

    /// The Keychain account for a server: its origin without a trailing slash.
    public static func origin(_ url: URL) -> String {
        var s = url.absoluteString
        while s.hasSuffix("/") { s.removeLast() }
        return s
    }

    /// "127.0.0.1:3030" for display.
    public static func display(_ url: URL) -> String {
        guard let host = url.host else { return url.absoluteString }
        let hostPart = host.contains(":") ? "[\(host)]" : host
        return url.port.map { "\(hostPart):\($0)" } ?? hostPart
    }
}

/// The 8-character connect code, shown as XXXX-XXXX. Crockford base32: no I, L, O or U; case-insensitive.
public enum ConnectCode {
    private static let alphabet = Set("0123456789ABCDEFGHJKMNPQRSTVWXYZ")

    /// Uppercases, drops spaces and hyphens, and maps the look-alikes (O to 0, I and L to 1).
    /// Returns nil unless exactly 8 valid characters remain.
    public static func normalize(_ text: String) -> String? {
        let cleaned = text.uppercased().filter { $0 != "-" && !$0.isWhitespace }.map { c -> Character in
            switch c {
            case "O": "0"
            case "I", "L": "1"
            default: c
            }
        }
        guard cleaned.count == 8, cleaned.allSatisfy({ alphabet.contains($0) }) else { return nil }
        return String(cleaned)
    }

    /// "K7FQ2M9X" becomes "K7FQ-2M9X". Text that is not a valid code is returned unchanged.
    public static func display(_ code: String) -> String {
        guard let n = normalize(code) else { return code }
        return "\(n.prefix(4))-\(n.suffix(4))"
    }

    /// The code as separate characters for the boxed display.
    public static func characters(_ code: String) -> [String] {
        (normalize(code) ?? code).map(String.init)
    }
}

/// `relife://` links: pair, log and open, so Raycast and scripts can drive the app.
public enum RelifeLink: Sendable, Equatable {
    /// `relife://pair?server=<origin>&s=<secret>`
    case pair(server: URL, secret: String)
    /// `relife://log?text=water%20250`
    case log(text: String)
    /// `relife://open?path=/wealth`, or `relife://today`
    case open(path: String)
    case today

    public init?(url: URL) {
        guard url.scheme?.lowercased() == "relife", let host = url.host?.lowercased() else { return nil }
        let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        func value(_ name: String) -> String? { items.first { $0.name == name }?.value }
        switch host {
        case "pair":
            guard let server = value("server").flatMap(ServerAddress.parse), let secret = value("s"), !secret.isEmpty else { return nil }
            self = .pair(server: server, secret: secret)
        case "log":
            guard let text = value("text")?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else { return nil }
            self = .log(text: text)
        case "open":
            guard let path = value("path"), path.hasPrefix("/"), !path.hasPrefix("//") else { return nil }
            self = .open(path: path)
        case "today":
            self = .today
        default:
            return nil
        }
    }
}

/// Compares dotted versions ("0.1.0" against "0.10.2"). Missing parts count as zero.
public enum VersionCompare {
    public static func isOlder(_ a: String, than b: String) -> Bool {
        let x = parts(a), y = parts(b)
        for i in 0..<max(x.count, y.count) {
            let l = i < x.count ? x[i] : 0, r = i < y.count ? y[i] : 0
            if l != r { return l < r }
        }
        return false
    }

    private static func parts(_ v: String) -> [Int] {
        v.split(separator: ".").map { Int($0.prefix { $0.isNumber }) ?? 0 }
    }
}
