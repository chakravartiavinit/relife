import Testing
@testable import ReLifeKit

@Suite("SSE parser and backoff")
struct SSETests {
    private func feed(_ lines: [String]) -> [SSEParser.Message] {
        var p = SSEParser()
        return lines.compactMap { p.feed(line: $0) }
    }

    @Test("a blank line ends an event")
    func basic() {
        let m = feed(["event: data", #"data: {"a":1}"#, "id: 7", ""])
        #expect(m == [.init(event: "data", data: #"{"a":1}"#, id: "7")])
    }

    @Test("several data lines join with a newline")
    func multiline() {
        #expect(feed(["data: one", "data: two", ""]).first?.data == "one\ntwo")
    }

    @Test("comments, unknown fields and blank-only events are ignored")
    func ignored() {
        #expect(feed([": ping", "retry: 3000", "", "foo: bar", ""]).isEmpty)
    }

    @Test("CRLF line ends work and a space after the colon is optional")
    func crlf() {
        #expect(feed(["data:x\r", "\r"]).first?.data == "x")
    }

    @Test("state resets between events")
    func reset() {
        let m = feed(["event: a", "data: 1", "", "data: 2", ""])
        #expect(m[0].event == "a")
        #expect(m[1].event == nil)
    }

    @Test("the event name fills in a missing type")
    func nameAsType() {
        let m = SSEParser.Message(event: "ping", data: "{}", id: nil)
        #expect(SSEEvent.decode(m) == .ping)
        #expect(SSEEvent.decode(.init(event: nil, data: "{}", id: nil)) == nil)
        #expect(SSEEvent.decode(.init(event: nil, data: "not json", id: nil)) == nil)
    }

    @Test("backoff doubles up to the cap")
    func backoff() {
        #expect(Backoff.delay(afterFailures: 0) == 0)
        #expect([1, 2, 3, 4, 5, 6, 20].map { Backoff.delay(afterFailures: $0) } == [1, 2, 4, 8, 16, 30, 30])
    }
}
