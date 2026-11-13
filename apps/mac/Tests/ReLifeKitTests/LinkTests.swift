import Foundation
import Testing
@testable import ReLifeKit

@Suite("Addresses, codes and links")
struct LinkTests {
    @Test("server addresses", arguments: [
        ("127.0.0.1:3030", "http://127.0.0.1:3030"),
        ("localhost:3030", "http://localhost:3030"),
        ("http://127.0.0.1:3030/", "http://127.0.0.1:3030"),
        ("relife.tail1234.ts.net", "https://relife.tail1234.ts.net"),
        ("  https://Relife.Example.com/some/path?x=1#f ", "https://relife.example.com"),
        ("http://192.168.1.5:3030", "http://192.168.1.5:3030"),
    ])
    func parse(input: String, expected: String) {
        #expect(ServerAddress.parse(input)?.absoluteString == expected)
    }

    @Test("not an address", arguments: ["", "   ", "two words", "ftp://host", "://x"])
    func rejects(input: String) {
        #expect(ServerAddress.parse(input) == nil)
    }

    @Test("loopback detection and display")
    func loopback() {
        #expect(ServerAddress.isLoopback(URL(string: "http://127.0.0.1:3030")!))
        #expect(ServerAddress.isLoopback(URL(string: "http://localhost:3030")!))
        #expect(!ServerAddress.isLoopback(URL(string: "https://relife.ts.net")!))
        #expect(ServerAddress.display(URL(string: "http://127.0.0.1:3030")!) == "127.0.0.1:3030")
        #expect(ServerAddress.origin(URL(string: "http://127.0.0.1:3030/")!) == "http://127.0.0.1:3030")
    }

    @Test("connect codes normalize look-alikes and format as XXXX-XXXX")
    func codes() {
        #expect(ConnectCode.normalize("k7fq-2m9x") == "K7FQ2M9X")
        #expect(ConnectCode.normalize("K7FQ 2M9X") == "K7FQ2M9X")
        #expect(ConnectCode.normalize("OILO-OILO") == "01100110") // O is 0, I and L are 1
        #expect(ConnectCode.normalize("K7FQ-2M9") == nil)
        #expect(ConnectCode.normalize("K7FQ-2M9U") == nil) // U is not in the alphabet
        #expect(ConnectCode.display("k7fq2m9x") == "K7FQ-2M9X")
        #expect(ConnectCode.display("nope") == "nope")
        #expect(ConnectCode.characters("K7FQ-2M9X") == ["K", "7", "F", "Q", "2", "M", "9", "X"])
    }

    @Test("relife:// links")
    func links() throws {
        let pair = try #require(RelifeLink(url: URL(string: "relife://pair?server=http%3A%2F%2F127.0.0.1%3A3030&s=abc123")!))
        #expect(pair == .pair(server: URL(string: "http://127.0.0.1:3030")!, secret: "abc123"))
        #expect(RelifeLink(url: URL(string: "relife://log?text=water%20250")!) == .log(text: "water 250"))
        #expect(RelifeLink(url: URL(string: "relife://open?path=/wealth")!) == .open(path: "/wealth"))
        #expect(RelifeLink(url: URL(string: "relife://today")!) == .today)
    }

    @Test("bad links are refused", arguments: [
        "relife://pair?server=http://x",       // no secret
        "relife://pair?s=abc",                 // no server
        "relife://log?text=%20",               // blank text
        "relife://open?path=//evil.example",   // protocol-relative path
        "relife://open?path=evil",             // not absolute
        "relife://unknown",
        "https://pair?server=x&s=y",
    ])
    func badLinks(raw: String) {
        #expect(RelifeLink(url: URL(string: raw)!) == nil)
    }

    @Test("versions compare numerically")
    func versions() {
        #expect(VersionCompare.isOlder("0.1.0", than: "0.10.0"))
        #expect(VersionCompare.isOlder("0.9", than: "0.9.1"))
        #expect(!VersionCompare.isOlder("1.0.0", than: "1.0"))
        #expect(!VersionCompare.isOlder("2.0", than: "1.9.9"))
    }
}
