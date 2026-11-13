import Foundation
import Testing
@testable import ReLifeKit

private let t0 = Date(timeIntervalSince1970: 1_794_470_400)
private func at(_ s: Double) -> Date { t0.addingTimeInterval(s) }

private final class Counter: @unchecked Sendable {
    private let lock = NSLock()
    private var n = 0
    func next() -> String { lock.withLock { n += 1; return "seg-\(n)" } }
}

private func segmenter(_ tweak: (inout ActivitySegmenter.Config) -> Void = { _ in }) -> ActivitySegmenter {
    var config = ActivitySegmenter.Config()
    tweak(&config)
    let counter = Counter()
    return ActivitySegmenter(config: config, makeID: { counter.next() })
}

private func activate(_ app: String, bundle: String? = nil, _ s: Double) -> ActivityEvent {
    .appActivated(app: app, bundleId: bundle ?? "com.example.\(app.lowercased())", at: at(s))
}

@Suite("Activity segmenter")
struct SegmenterTests {
    @Test("switching apps closes the first stretch")
    func switching() {
        var s = segmenter()
        #expect(s.handle(activate("Xcode", 0)).isEmpty)
        let out = s.handle(activate("Safari", 600))
        #expect(out.count == 1)
        #expect(out[0].app == "Xcode")
        #expect(out[0].start == at(0) && out[0].end == at(600))
        #expect(out[0].source == "mac")
        #expect(out[0].bundleId == "com.example.xcode")
        #expect(out[0].id == "seg-1")
        #expect(s.current?.app == "Safari")
    }

    @Test("a flicker shorter than the minimum is dropped")
    func flicker() {
        var s = segmenter()
        _ = s.handle(activate("Xcode", 0))
        #expect(s.handle(activate("Finder", 100)).count == 1)
        #expect(s.handle(activate("Xcode", 101)).isEmpty) // Finder lasted 1 s
        #expect(s.current?.app == "Xcode")
    }

    @Test("going idle ends the stretch when the last input happened")
    func idle() {
        var s = segmenter()
        _ = s.handle(activate("Xcode", 0))
        #expect(s.handle(.idleSeconds(10, at: at(100))).isEmpty)
        // At t=400 the person has been idle for 200 s, so input stopped at t=200.
        let out = s.handle(.idleSeconds(200, at: at(400)))
        #expect(out.count == 1)
        #expect(out[0].end == at(200))
        #expect(!s.isRecording)
        // Back at t=1000 after 5 s without input: a new stretch begins at t=995.
        #expect(s.handle(.idleSeconds(5, at: at(1000))).isEmpty)
        #expect(s.current?.since == at(995))
    }

    @Test("sleep and wake")
    func sleepWake() {
        var s = segmenter()
        _ = s.handle(activate("Xcode", 0))
        #expect(s.handle(.sleep(at: at(300))).first?.end == at(300))
        #expect(s.handle(activate("Xcode", 400)).isEmpty) // an app event while asleep opens nothing
        #expect(!s.isRecording)
        _ = s.handle(.wake(at: at(900)))
        #expect(s.current?.since == at(900))
    }

    @Test("lock closes and unlock resumes")
    func lock() {
        var s = segmenter()
        _ = s.handle(activate("Mail", 0))
        #expect(s.handle(.lock(at: at(60))).count == 1)
        #expect(!s.isRecording)
        _ = s.handle(.unlock(at: at(500)))
        #expect(s.current?.since == at(500))
    }

    @Test("paused tracking records nothing until resumed")
    func paused() {
        var s = segmenter()
        _ = s.handle(activate("Mail", 0))
        #expect(s.handle(.paused(at: at(60))).count == 1)
        #expect(s.handle(activate("Safari", 100)).isEmpty)
        #expect(!s.isRecording)
        _ = s.handle(.resumed(at: at(200)))
        #expect(s.current?.app == "Safari")
    }

    @Test("excluded apps are never recorded and leave a gap")
    func excluded() {
        var s = segmenter { $0.excludedBundleIds = ["com.example.1password"] }
        _ = s.handle(activate("Xcode", 0))
        let out = s.handle(activate("1Password", 100))
        #expect(out.count == 1)
        #expect(!s.isRecording)
        #expect(s.handle(activate("Xcode", 200)).isEmpty)
        #expect(s.current?.since == at(200))
    }

    @Test("a long stretch is split by ticks")
    func split() {
        var s = segmenter { $0.maxSegment = 600 }
        _ = s.handle(activate("Xcode", 0))
        #expect(s.handle(.tick(at: at(300))).isEmpty)
        let out = s.handle(.tick(at: at(650)))
        #expect(out.count == 1 && out[0].end == at(650))
        #expect(s.current?.since == at(650))
    }

    @Test("quit closes what is open")
    func quit() {
        var s = segmenter()
        _ = s.handle(activate("Xcode", 0))
        #expect(s.handle(.quit(at: at(45))).first?.seconds == 45)
        #expect(s.handle(.quit(at: at(50))).isEmpty)
    }

    @Test("a clock that jumps back never makes overlapping stretches")
    func noOverlap() {
        var s = segmenter()
        _ = s.handle(activate("A", 0))
        let first = s.handle(activate("B", 100))
        _ = s.handle(activate("C", 50)) // the clock went back
        #expect(first.count == 1)
        #expect(s.current!.since >= first[0].end)
    }

    @Test("every segment gets its own id")
    func ids() {
        var s = segmenter()
        _ = s.handle(activate("A", 0))
        let a = s.handle(activate("B", 10))
        let b = s.handle(activate("C", 20))
        #expect(a[0].id != b[0].id)
    }

    @Test("the buffer posts about once a minute in batches of 500")
    func buffer() {
        var b = ActivityBuffer(now: at(0))
        #expect(!b.isDue(now: at(100))) // nothing pending
        let segs = (0..<501).map { ActivitySegment(id: "s\($0)", app: "A", bundleId: nil, start: at(Double($0)), end: at(Double($0) + 5)) }
        b.add(segs)
        #expect(!b.isDue(now: at(30)))
        #expect(b.isDue(now: at(60)))
        #expect(b.takeBatch(now: at(60)).count == 500)
        #expect(b.pending.count == 1)
        #expect(!b.isDue(now: at(90)))
        #expect(b.isDue(now: at(121)))
    }
}
