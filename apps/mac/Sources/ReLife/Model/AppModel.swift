import AppKit
import Observation
import ReLifeKit
import SwiftData
import SwiftUI

/// The sidebar pages. Snapshot mode walks through every case.
enum SidebarPage: String, CaseIterable, Identifiable {
    case today, progress, activity

    var id: String { rawValue }

    var title: String {
        switch self {
        case .today: "Today"
        case .progress: "Progress"
        case .activity: "Activity"
        }
    }

    var symbol: String {
        switch self {
        case .today: "checkmark.circle"
        case .progress: "chart.line.uptrend.xyaxis"
        case .activity: "desktopcomputer"
        }
    }
}

/// A short message after a log: "Logged water 250 ml", with Undo when the action has an inverse.
struct HUDMessage: Equatable, Identifiable {
    let id = UUID()
    var text: String
    var undo: TodayAction?
    var isError = false
}

/// App-wide state. One server, one device token, one Today view; every surface reads from here.
@Observable
final class AppModel {
    static let shared = AppModel(container: Store.makeContainer(),
                                 tokens: Store.isOverridden ? MemoryTokenStore() : KeychainTokenStore())

    static let version = (Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String) ?? "0.1"

    let container: ModelContainer
    let tokens: TokenStore
    let pairing: PairingModel
    let watcher = ActivityWatcher()
    let hotKey = HotKeyCenter()
    let quickLog = QuickLogPanelController()
    let notifier = Notifier()
    let localServer = LocalServer()

    // Navigation
    var page: SidebarPage = SidebarPage(rawValue: Prefs.page ?? "") ?? .today {
        didSet { Prefs.page = page.rawValue }
    }
    var settingsTab: SettingsTab = SettingsTab(rawValue: Prefs.settingsTab ?? "") ?? .general {
        didSet { Prefs.settingsTab = settingsTab.rawValue }
    }
    var onboarding: OnboardingStep = .where
    var onboarded = Prefs.onboarded

    // Connection
    var serverURL: URL?
    var phase: ConnectionPhase = .unpaired
    var me: Me?
    var deviceName = Prefs.deviceName

    // Data
    var view: TodayView?
    var lastUpdated: Date?
    /// Rows with a write waiting in the offline queue (they show a clock).
    var pendingRows: Set<String> = []
    var queueCount = 0
    var trackingPaused = Prefs.trackingPaused

    // Notices
    var notice: String?
    var hud: HUDMessage?
    var levelUpBanner: String?

    /// Show the Dock icon even with no window open (Settings → General).
    var showInDock = Prefs.showInDock {
        didSet {
            Prefs.showInDock = showInDock
            DockPolicy.update()
        }
    }

    @ObservationIgnored weak var mainWindow: NSWindow?
    @ObservationIgnored var openMainWindow: (() -> Void)?
    @ObservationIgnored var openSettingsWindow: (() -> Void)?
    @ObservationIgnored private var liveTask: Task<Void, Never>?
    @ObservationIgnored private var periodicTask: Task<Void, Never>?
    @ObservationIgnored private var refreshing = false
    @ObservationIgnored private var hudTask: Task<Void, Never>?

    init(container: ModelContainer, tokens: TokenStore) {
        self.container = container
        self.tokens = tokens
        pairing = PairingModel()
        if let origin = Prefs.serverOrigin, let url = URL(string: origin), tokens.load(account: origin) != nil {
            serverURL = url
            view = loadCachedView()?.0
            lastUpdated = loadCachedView()?.1
            phase = .loading
        }
        pairing.model = self
        watcher.model = self
        refreshQueueCount()
    }

    // MARK: - Derived

    var isSignedIn: Bool { phase.isSignedIn }

    var showsOnboarding: Bool { !phase.isSignedIn || !onboarded }

    var reachable: Bool {
        if case .offline = phase { return false }
        return true
    }

    var badge: BadgeState {
        BadgeState.make(view: view, reachable: reachable, trackingPaused: trackingPaused)
    }

    var ownerName: String { me?.name.split(separator: " ").first.map(String.init) ?? view?.name ?? Prefs.ownerName ?? "there" }

    var timeZone: TimeZone { me.flatMap { TimeZone(identifier: $0.timezone) } ?? .current }

    /// The status line at the bottom of the menu bar window.
    var statusLine: String {
        switch phase {
        case .ready(let at): Words.synced(at, now: .now)
        case .offline(let last): Words.offline(lastUpdated: last, queued: queueCount, timeZone: timeZone)
        case .loading: "Connecting…"
        case .serverTooOld: "Update \(Brand.name)"
        case .clientTooOld: "Update \(Brand.name) for Mac"
        case .sessionEnded(let reason): Words.sessionEnded(reason)
        case .unpaired, .pairing: "Not connected"
        }
    }

    // MARK: - Start

    /// Starts everything that runs in the background. Called once at launch.
    func start() {
        hotKey.onPress = { [weak self] in self?.showQuickLog() }
        hotKey.register(code: Prefs.hotKeyCode, modifiers: Prefs.hotKeyModifiers)
        watcher.start()
        notifier.refreshStatus()
        guard isSignedIn else { return }
        Task { await self.connect() }
    }

    /// Checks the server, loads Today and opens the live stream.
    func connect() async {
        await checkServer()
        await refresh(force: true)
        if me == nil { await loadMe() }
        startBackgroundWork()
    }

    private func startBackgroundWork() {
        guard liveTask == nil else { return }
        liveTask = Task { [weak self] in await self?.runLive() }
        periodicTask = Task { [weak self] in await self?.runPeriodic() }
    }

    private func stopBackgroundWork() {
        liveTask?.cancel()
        periodicTask?.cancel()
        liveTask = nil
        periodicTask = nil
    }

    private func checkServer() async {
        guard let client = makeClient() else { return }
        do {
            let hello = try await client.hello()
            if VersionCompare.isOlder(Self.version, than: hello.minClient.mac) {
                phase = .clientTooOld(minimum: hello.minClient.mac)
            }
        } catch ClientError.serverTooOld {
            phase = .serverTooOld
        } catch {
            // Unreachable is handled by the refresh that follows.
        }
    }

    // MARK: - Client

    func makeClient(for url: URL? = nil, token: String? = nil) -> ReLifeClient? {
        guard let base = url ?? serverURL else { return nil }
        guard let token = token ?? tokens.load(account: ServerAddress.origin(base)) else { return nil }
        return ReLifeClient(baseURL: base, token: token, clientVersion: Self.version, onSessionEnded: { [weak self] reason in
            Task { @MainActor in self?.endSession(reason) }
        })
    }

    // MARK: - Today

    func refresh(force: Bool = false) async {
        guard !refreshing, let client = makeClient() else { return }
        if versionBlocked, !force { return }
        refreshing = true
        defer { refreshing = false }
        do {
            let fresh = try await client.today()
            accept(fresh, news: nil)
            await flushQueue(force: force)
        } catch ClientError.unreachable {
            markOffline()
        } catch ClientError.serverTooOld {
            phase = .serverTooOld
        } catch ClientError.unauthorized {
            endSession(.expired)
        } catch {
            // A 5xx or an unreadable answer: keep what we have, show offline.
            if case .ready = phase { markOffline() }
        }
    }

    private func markOffline() {
        guard isSignedIn, !versionBlocked else { return }
        phase = .offline(lastUpdated: lastUpdated)
    }

    /// Takes a view from the server: stores it, reports changes, and clears the offline state.
    func accept(_ fresh: TodayView, news: XpNews?) {
        let changes = TodayChanges.between(view, fresh)
        view = fresh
        lastUpdated = .now
        if !versionBlocked { phase = .ready(updated: .now) }
        cache(fresh)
        for change in changes { announce(change) }
        let sawLevelUp = changes.contains { if case .levelUp = $0 { true } else { false } }
        if let up = news?.levelUp, !sawLevelUp { announce(.levelUp(level: up.level, title: up.title)) }
    }

    /// The server or this app is too old: keep showing that notice instead of "ready".
    private var versionBlocked: Bool {
        switch phase {
        case .serverTooOld, .clientTooOld: true
        default: false
        }
    }

    private func announce(_ change: TodayChange) {
        switch change {
        case let .levelUp(level, title):
            // Celebrated once, on the surface you are looking at; elsewhere the new level just shows.
            if appIsInFront {
                levelUpBanner = "Level \(level) · \(title)"
            } else {
                notifier.post(id: "level-\(level)", title: "Level up", body: "You reached Lv \(level) · \(title).")
            }
        case let .questCleared(title, xp):
            if !appIsInFront { notifier.post(id: "quest-\(title)", title: "Quest cleared", body: "\(title) · +\(xp) XP") }
        }
    }

    var appIsInFront: Bool { !Headless.isActive && NSApp.isActive && NSApp.keyWindow != nil }

    // MARK: - Actions

    func check(_ routine: TodayView.Routine, done: Bool) {
        let action = TodayAction.check(scheduleId: routine.scheduleId, occurrence: routine.occurrence, status: done ? .done : nil)
        Task { await self.perform(action, row: "r:" + routine.id, label: done ? "Done" : "Undone") }
    }

    func add(_ goal: TodayView.Goal) {
        let action = TodayAction.add(scheduleId: goal.scheduleId, amount: goal.step)
        Task { await self.perform(action, row: "g:" + goal.id, label: "Added \(Format.goalStep(goal).dropFirst()) to \(goal.name)") }
    }

    func log(_ text: String) {
        let clean = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !clean.isEmpty else { return }
        Task { await self.perform(.log(text: clean), row: nil, label: "Logged \(clean)") }
    }

    func undo(_ hud: HUDMessage) {
        guard let action = hud.undo else { return }
        self.hud = nil
        Task { await self.perform(action, row: nil, label: "Undone", offerUndo: false) }
    }

    /// Optimistic: the screen changes at once. The write goes out with an idempotency key; when the
    /// server cannot be reached it joins the offline queue and the row shows a clock.
    func perform(_ action: TodayAction, row: String?, label: String, offerUndo: Bool = true) async {
        let key = UUID()
        if let v = view { view = Optimistic.apply(action, to: v) }
        guard let client = makeClient() else { return }
        do {
            let result = try await client.act(action, idempotencyKey: key)
            accept(result.view, news: result.news)
            if let row { pendingRows.remove(row) }
            show(HUDMessage(text: label, undo: offerUndo ? Optimistic.inverse(of: action) : nil))
        } catch let error as ClientError {
            switch QueueRules.outcome(for: error) {
            case .retryLater:
                enqueue(action, id: key)
                if let row { pendingRows.insert(row) }
                markOffline()
                show(HUDMessage(text: "Saved. It will send when \(Brand.name) is back.", undo: nil))
            case .reject:
                show(HUDMessage(text: rejectMessage(error), undo: nil, isError: true))
                await refresh(force: true)
            case .signedOut, .sent:
                break
            }
        } catch {
            show(HUDMessage(text: "Couldn't save. Try again.", undo: nil, isError: true))
            await refresh(force: true)
        }
    }

    private func rejectMessage(_ error: ClientError) -> String {
        if case let .api(_, api) = error, !api.message.isEmpty { return api.message }
        return "Try “water 250”, “mood 4” or “spent 120 chai”."
    }

    func show(_ message: HUDMessage) {
        hud = message
        // Away from the app's windows (a quick log from the shortcut), the bar floats on its own.
        if !appIsInFront, !Store.isOverridden { HUDPanelController.shared.present(message, model: self) }
        hudTask?.cancel()
        hudTask = Task { [weak self, id = message.id] in
            try? await Task.sleep(for: .seconds(4))
            if !Task.isCancelled, self?.hud?.id == id { self?.hud = nil }
        }
    }

    // MARK: - Offline queue

    private func enqueue(_ action: TodayAction, id: UUID) {
        guard let op = try? QueuedOp.action(action, now: .now, id: id) else { return }
        container.mainContext.insert(PendingOp(op))
        try? container.mainContext.save()
        refreshQueueCount()
    }

    func enqueueActivity(_ segments: [ActivitySegment]) {
        guard !segments.isEmpty, let op = try? QueuedOp.activity(segments, now: .now) else { return }
        container.mainContext.insert(PendingOp(op))
        try? container.mainContext.save()
        refreshQueueCount()
    }

    func refreshQueueCount() {
        queueCount = (try? container.mainContext.fetchCount(FetchDescriptor<PendingOp>())) ?? 0
    }

    /// Sends the queue oldest first. Runs on reconnect, on SSE hello and every minute.
    func flushQueue(force: Bool = false) async {
        guard let client = makeClient() else { return }
        let context = container.mainContext
        let stored = (try? context.fetch(FetchDescriptor<PendingOp>())) ?? []
        guard !stored.isEmpty else { return }
        let report = await QueueFlusher.flush(stored.map(\.value), now: .now, force: force) { op in
            try await op.send(using: client)
        }
        let removed = Set(report.removed)
        for op in stored {
            if removed.contains(op.uid) {
                context.delete(op)
            } else if let attempts = report.retained[op.uid] {
                op.attempts = attempts
                op.lastAttemptAt = .now
            }
        }
        try? context.save()
        refreshQueueCount()
        if queueCount == 0 { pendingRows = [] }
        if let text = QueueNotice.expired(dropped: report.expired.count) { notice = text }
        if !report.sent.isEmpty, !report.signedOut { await refreshAfterFlush() }
    }

    private func refreshAfterFlush() async {
        guard let client = makeClient(), let fresh = try? await client.today() else { return }
        accept(fresh, news: nil)
    }

    private func clearQueue() -> Int {
        let context = container.mainContext
        let stored = (try? context.fetch(FetchDescriptor<PendingOp>())) ?? []
        for op in stored { context.delete(op) }
        try? context.save()
        refreshQueueCount()
        pendingRows = []
        return stored.count
    }

    // MARK: - Cache

    private func cache(_ view: TodayView) {
        guard let data = try? JSONEncoder().encode(view) else { return }
        let context = container.mainContext
        let existing = (try? context.fetch(FetchDescriptor<CachedView>())) ?? []
        if let row = existing.first {
            row.json = data
            row.at = .now
        } else {
            context.insert(CachedView(key: "today", json: data, at: .now))
        }
        try? context.save()
    }

    private func loadCachedView() -> (TodayView, Date)? {
        guard let row = (try? container.mainContext.fetch(FetchDescriptor<CachedView>()))?.first,
              let view = try? JSONDecoder().decode(TodayView.self, from: row.json) else { return nil }
        return (view, row.at)
    }

    // MARK: - Live updates

    private func runLive() async {
        var failures = 0
        while !Task.isCancelled {
            guard let client = makeClient(), isSignedIn else { return }
            do {
                for try await event in client.events() {
                    failures = 0
                    await handle(event)
                }
            } catch {
                // fall through to the backoff
            }
            failures += 1
            if case .offline = phase {} else if failures >= 2 { markOffline() }
            try? await Task.sleep(for: .seconds(Backoff.delay(afterFailures: failures)))
        }
    }

    private func handle(_ event: Event) async {
        switch event {
        case .hello:
            await refresh(force: true)
        case .data:
            await refresh()
        case let .deviceRevoked(id):
            if id == Prefs.deviceID || Prefs.deviceID == nil { endSession(.revoked) }
        case .pairing, .ping:
            break
        }
    }

    /// Every minute: send queued writes, post activity, check the 21:00 warning, and retry when offline.
    private func runPeriodic() async {
        while !Task.isCancelled {
            try? await Task.sleep(for: .seconds(60))
            guard isSignedIn else { continue }
            if case .offline = phase { await refresh(force: true) } else { await flushQueue() }
            checkWarning()
        }
    }

    private func checkWarning() {
        guard Prefs.remindersOnMac, let view else { return }
        if let text = QuestWarning.message(view: view, now: .now, timeZone: timeZone, lastWarnedDay: Prefs.lastWarnedDay) {
            Prefs.lastWarnedDay = view.today
            notifier.post(id: "warning-\(view.today)", title: "System quests", body: text)
        }
    }

    // MARK: - Activity

    func postActivity(_ batch: [ActivitySegment]) async {
        guard !batch.isEmpty else { return }
        guard isSignedIn, let client = makeClient() else {
            enqueueActivity(batch)
            return
        }
        do {
            try await client.postActivity(ActivityBatch(segments: batch), idempotencyKey: UUID())
        } catch let error as ClientError {
            if QueueRules.outcome(for: error) != .reject { enqueueActivity(batch) }
        } catch {
            enqueueActivity(batch)
        }
    }

    func setTrackingPaused(_ paused: Bool) {
        trackingPaused = paused
        Prefs.trackingPaused = paused
        watcher.setPaused(paused)
    }

    // MARK: - Pairing and sessions

    /// A new device token arrived (approved request or redeemed code).
    func completePairing(server: URL, token: String, device: DeviceInfo) async {
        let origin = ServerAddress.origin(server)
        tokens.save(token, account: origin)
        Prefs.serverOrigin = origin
        Prefs.deviceID = device.id
        serverURL = server
        deviceName = device.name
        phase = .loading
        await loadMe()
        if let me {
            let key = QueueRules.accountKey(origin: origin, owner: me.name)
            if let old = Prefs.queueAccount, old != key {
                notice = QueueNotice.accountChanged(dropped: clearQueue())
                view = nil
            }
            Prefs.queueAccount = key
            Prefs.ownerName = me.name
        }
        onboarding = .reminders
        await connect()
    }

    func loadMe() async {
        guard let client = makeClient() else { return }
        if let me = try? await client.me() {
            self.me = me
            Prefs.ownerName = me.name
        }
    }

    /// The token is dead (revoked on the server, or expired). Clear it and show Connect with the reason.
    func endSession(_ reason: SessionEnd) {
        if let url = serverURL { tokens.delete(account: ServerAddress.origin(url)) }
        stopBackgroundWork()
        phase = .sessionEnded(reason)
        onboarding = .where
    }

    /// Settings → Account → Disconnect: sign out on the server (best effort) and here.
    func disconnect() async {
        if let client = makeClient() { try? await client.disconnect() }
        if let url = serverURL { tokens.delete(account: ServerAddress.origin(url)) }
        stopBackgroundWork()
        view = nil
        me = nil
        lastUpdated = nil
        Prefs.serverOrigin = nil
        Prefs.deviceID = nil
        Prefs.onboarded = false
        onboarded = false
        onboarding = .where
        phase = .unpaired
    }

    func finishOnboarding() {
        Prefs.onboarded = true
        onboarded = true
    }

    // MARK: - Windows and links

    func openDashboard(path: String = "/") {
        guard let base = serverURL ?? URL(string: "http://127.0.0.1:3030"),
              let url = URL(string: path, relativeTo: base)?.absoluteURL else { return }
        NSWorkspace.shared.open(url)
    }

    func showMainWindow(page: SidebarPage? = nil) {
        if let page { self.page = page }
        NSApp.setActivationPolicy(.regular)
        if let window = mainWindow {
            window.makeKeyAndOrderFront(nil)
        } else if let openMainWindow {
            openMainWindow()
        } else {
            NSWorkspace.shared.open(Bundle.main.bundleURL)
        }
        NSApp.activate()
    }

    func showSettings(tab: SettingsTab? = nil) {
        if let tab { settingsTab = tab }
        NSApp.setActivationPolicy(.regular)
        openSettingsWindow?()
        NSApp.activate()
    }

    func showQuickLog() {
        guard isSignedIn else {
            showMainWindow()
            return
        }
        quickLog.show(model: self)
    }

    /// `relife://` links: pair, log, open, today.
    func handle(url: URL) {
        guard let link = RelifeLink(url: url) else { return }
        switch link {
        case let .pair(server, secret):
            confirmPair(server: server, secret: secret)
        case let .log(text):
            log(text)
        case let .open(path):
            openDashboard(path: path)
        case .today:
            showMainWindow(page: .today)
        }
    }

    /// A `relife://pair` link only opens this question; nothing happens without a click.
    private func confirmPair(server: URL, secret: String) {
        showMainWindow()
        let alert = NSAlert()
        alert.messageText = "Connect to \(ServerAddress.display(server))?"
        alert.informativeText = "This Mac will sign in to the \(Brand.name) at \(ServerAddress.display(server)). Only continue if you started this from your own \(Brand.name)."
        alert.addButton(withTitle: "Connect")
        alert.addButton(withTitle: "Cancel")
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        Task { await self.pairing.redeem(server: server, secret: secret, code: nil) }
    }
}

/// Dock icon only while an app window is open (Settings → General can keep it).
enum DockPolicy {
    @MainActor
    static func update() {
        let hasWindow = NSApp.windows.contains { $0.isVisible && $0.canBecomeMain && !($0 is NSPanel) }
        NSApp.setActivationPolicy(Prefs.showInDock || hasWindow ? .regular : .accessory)
    }
}
