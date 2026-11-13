import Foundation

/// What the app's watcher tells the segmenter. All times are wall-clock instants.
public enum ActivityEvent: Sendable, Equatable {
    /// `NSWorkspace.didActivateApplicationNotification`: a different app is now in front.
    case appActivated(app: String, bundleId: String?, at: Date)
    /// A periodic check of `CGEventSource.secondsSinceLastEventType`. Idle starts and ends from this.
    case idleSeconds(Double, at: Date)
    /// Sleep, screen lock and screen saver close the current stretch.
    case sleep(at: Date)
    case wake(at: Date)
    case lock(at: Date)
    case unlock(at: Date)
    /// The person paused tracking in the menu, or turned it back on.
    case paused(at: Date)
    case resumed(at: Date)
    /// A heartbeat (every few seconds): splits a very long stretch so it reaches the server.
    case tick(at: Date)
    /// The app is quitting: close what is open.
    case quit(at: Date)
}

/// Turns watcher events into closed segments `{ id, source: 'mac', app, bundleId, start, end }`.
/// A pure value type: no clocks, no AppKit, so it is unit tested.
///
/// A stretch is open while an app is in front and the person is present: not idle, not asleep,
/// not locked, not paused, and the app is not excluded.
public struct ActivitySegmenter: Sendable {
    public struct Config: Sendable, Equatable {
        /// No input for this long counts as away.
        public var idleThreshold: TimeInterval = 180
        /// Shorter stretches are flicker (Cmd-Tab through apps) and are dropped.
        public var minSegment: TimeInterval = 3
        /// A longer stretch is split, so it is saved while it is still going.
        public var maxSegment: TimeInterval = 30 * 60
        /// Bundle ids that are never recorded.
        public var excludedBundleIds: Set<String> = []

        public init() {}
    }

    private struct Open {
        var app: String
        var bundleId: String?
        var start: Date
    }

    public var config: Config
    private let makeID: @Sendable () -> String
    private var front: (app: String, bundleId: String?)?
    private var open: Open?
    private var isIdle = false
    private var isAsleep = false
    private var isLocked = false
    private var isPaused = false
    private var lastEnd: Date = .distantPast

    public init(config: Config = Config(), makeID: @escaping @Sendable () -> String = { UUID().uuidString.lowercased() }) {
        self.config = config
        self.makeID = makeID
    }

    /// True while a stretch is being timed.
    public var isRecording: Bool { open != nil }
    public var current: (app: String, since: Date)? { open.map { ($0.app, $0.start) } }

    /// Feeds one event and returns the segments it closed (zero, one or two).
    public mutating func handle(_ event: ActivityEvent) -> [ActivitySegment] {
        var out: [ActivitySegment] = []
        switch event {
        case let .appActivated(app, bundleId, at):
            front = (app, bundleId)
            close(at: at, into: &out)
            reopen(at: at)
        case let .idleSeconds(seconds, at):
            let nowIdle = seconds >= config.idleThreshold
            if nowIdle, !isIdle {
                isIdle = true
                // Idleness began when the last input happened, not when we noticed.
                close(at: max(at.addingTimeInterval(-seconds), open?.start ?? at), into: &out)
            } else if !nowIdle, isIdle {
                isIdle = false
                reopen(at: at.addingTimeInterval(-seconds))
            }
        case let .sleep(at):
            isAsleep = true
            close(at: at, into: &out)
        case let .wake(at):
            isAsleep = false
            reopen(at: at)
        case let .lock(at):
            isLocked = true
            close(at: at, into: &out)
        case let .unlock(at):
            isLocked = false
            reopen(at: at)
        case let .paused(at):
            isPaused = true
            close(at: at, into: &out)
        case let .resumed(at):
            isPaused = false
            reopen(at: at)
        case let .tick(at):
            if let o = open, at.timeIntervalSince(o.start) >= config.maxSegment {
                close(at: at, into: &out)
                reopen(at: at)
            }
        case let .quit(at):
            close(at: at, into: &out)
        }
        return out
    }

    private var allowed: Bool {
        guard let front, !isIdle, !isAsleep, !isLocked, !isPaused else { return false }
        if let id = front.bundleId, config.excludedBundleIds.contains(id) { return false }
        return true
    }

    private mutating func reopen(at: Date) {
        guard open == nil, allowed, let front else { return }
        // Never start before the last stretch ended (a clock that went backwards must not overlap).
        open = Open(app: front.app, bundleId: front.bundleId, start: max(at, lastEnd))
    }

    private mutating func close(at: Date, into out: inout [ActivitySegment]) {
        guard let o = open else { return }
        open = nil
        let end = max(at, o.start)
        lastEnd = end
        guard end.timeIntervalSince(o.start) >= config.minSegment else { return }
        out.append(ActivitySegment(id: makeID(), app: o.app, bundleId: o.bundleId, start: o.start, end: end))
    }
}

/// Collects closed segments and decides when to post them: about every minute, in batches of at most 500.
public struct ActivityBuffer: Sendable {
    public static let maxBatch = 500
    public static let interval: TimeInterval = 60

    public private(set) var pending: [ActivitySegment] = []
    private var lastFlush: Date

    public init(now: Date) {
        lastFlush = now
    }

    public mutating func add(_ segments: [ActivitySegment]) {
        pending.append(contentsOf: segments)
    }

    public func isDue(now: Date) -> Bool {
        !pending.isEmpty && now.timeIntervalSince(lastFlush) >= Self.interval
    }

    /// Takes up to one batch. The caller posts it, or queues it when the server is not reachable.
    public mutating func takeBatch(now: Date) -> [ActivitySegment] {
        lastFlush = now
        let batch = Array(pending.prefix(Self.maxBatch))
        pending.removeFirst(batch.count)
        return batch
    }
}
