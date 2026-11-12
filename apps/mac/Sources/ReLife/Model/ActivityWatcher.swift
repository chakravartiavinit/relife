import AppKit
import CoreGraphics
import Observation
import ReLifeKit

/// The app-activity watcher, moved from the server's worker into the app (the server can't see this Mac in
/// hybrid or cloud mode). Event driven and permission free: `NSWorkspace` for the front app,
/// `CGEventSource.secondsSinceLastEventType` for idle, sleep and lock notifications to close a stretch.
/// The pure `ActivitySegmenter` in ReLifeKit turns those events into segments; this class only feeds it.
@Observable
final class ActivityWatcher {
    weak var model: AppModel?
    private(set) var isRunning = false
    /// The app being timed right now, nil while idle, locked, asleep, paused or excluded.
    private(set) var currentApp: String?
    /// Closed stretches today on this Mac, by app name, in seconds. Shown on the Activity page.
    private(set) var secondsByApp: [String: TimeInterval] = [:]

    @ObservationIgnored private var segmenter = ActivitySegmenter()
    @ObservationIgnored private var buffer = ActivityBuffer(now: .now)
    @ObservationIgnored private var observers: [(center: NotificationCenter, token: NSObjectProtocol)] = []
    @ObservationIgnored private var timer: Timer?
    @ObservationIgnored private var day = Calendar.current.startOfDay(for: .now)

    /// The apps that are never recorded: the person's list plus ReLife itself.
    static var excluded: Set<String> {
        Set(Prefs.excludedApps).union(["com.relife.mac"])
    }

    var topApps: [(app: String, seconds: TimeInterval)] {
        secondsByApp.map { ($0.key, $0.value) }.sorted { $0.1 > $1.1 }
    }

    func start() {
        guard !isRunning, !SelfTest.requested else { return }
        isRunning = true
        segmenter.config.excludedBundleIds = Self.excluded
        let nc = NSWorkspace.shared.notificationCenter
        observe(nc, NSWorkspace.didActivateApplicationNotification) { note in
            let app = note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication
            return (app?.localizedName ?? "Unknown", app?.bundleIdentifier)
        } event: { name, bundle in .appActivated(app: name, bundleId: bundle, at: .now) }
        observe(nc, NSWorkspace.willSleepNotification) { _ in ("", nil) } event: { _, _ in .sleep(at: .now) }
        observe(nc, NSWorkspace.didWakeNotification) { _ in ("", nil) } event: { _, _ in .wake(at: .now) }
        let dc = DistributedNotificationCenter.default()
        for name in ["com.apple.screenIsLocked", "com.apple.screensaver.didstart"] {
            observe(dc, Notification.Name(name)) { _ in ("", nil) } event: { _, _ in .lock(at: .now) }
        }
        for name in ["com.apple.screenIsUnlocked", "com.apple.screensaver.didstop"] {
            observe(dc, Notification.Name(name)) { _ in ("", nil) } event: { _, _ in .unlock(at: .now) }
        }
        if Prefs.trackingPaused { feed(.paused(at: .now)) }
        if let front = NSWorkspace.shared.frontmostApplication {
            feed(.appActivated(app: front.localizedName ?? "Unknown", bundleId: front.bundleIdentifier, at: .now))
        }
        timer = Timer.scheduledTimer(withTimeInterval: 10, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.heartbeat() }
        }
    }

    /// Registers one notification. `read` copies the Sendable parts out of the notification, because a
    /// `Notification` itself can't cross into the main actor under Swift 6.
    private func observe(_ center: NotificationCenter, _ name: Notification.Name,
                         read: @escaping @Sendable (Notification) -> (String, String?),
                         event: @escaping @Sendable (String, String?) -> ActivityEvent) {
        let token = center.addObserver(forName: name, object: nil, queue: .main) { [weak self] note in
            let (a, b) = read(note)
            MainActor.assumeIsolated { self?.feed(event(a, b)) }
        }
        observers.append((center, token))
    }

    /// Closes the open stretch and saves everything not yet sent. Called when the app quits.
    func stop() {
        guard isRunning else { return }
        isRunning = false
        timer?.invalidate()
        timer = nil
        for (center, token) in observers { center.removeObserver(token) }
        observers = []
        let closed = segmenter.handle(.quit(at: .now))
        record(closed)
        let rest = buffer.takeBatch(now: .now)
        model?.enqueueActivity(rest)
    }

    func setPaused(_ paused: Bool) {
        feed(paused ? .paused(at: .now) : .resumed(at: .now))
    }

    /// The person's excluded list changed.
    func excludedChanged() {
        segmenter.config.excludedBundleIds = Self.excluded
        if let front = NSWorkspace.shared.frontmostApplication {
            feed(.appActivated(app: front.localizedName ?? "Unknown", bundleId: front.bundleIdentifier, at: .now))
        }
    }

    private func feed(_ event: ActivityEvent) {
        record(segmenter.handle(event))
        currentApp = segmenter.current?.app
    }

    private func heartbeat() {
        let idle = CGEventSource.secondsSinceLastEventType(.combinedSessionState, eventType: CGEventType(rawValue: ~0)!)
        feed(.idleSeconds(idle, at: .now))
        feed(.tick(at: .now))
        if buffer.isDue(now: .now) { flush() }
    }

    private func record(_ segments: [ActivitySegment]) {
        guard !segments.isEmpty else { return }
        let today = Calendar.current.startOfDay(for: .now)
        if today != day {
            day = today
            secondsByApp = [:]
        }
        for s in segments { secondsByApp[s.app, default: 0] += s.seconds }
        buffer.add(segments)
    }

    private func flush() {
        let batch = buffer.takeBatch(now: .now)
        guard !batch.isEmpty, let model else { return }
        Task { await model.postActivity(batch) }
    }
}
