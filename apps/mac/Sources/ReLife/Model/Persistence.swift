import Foundation
import ReLifeKit
import SwiftData

/// One write waiting for the server (a Today action or a batch of activity segments).
/// The rules (order, retry, 7-day drop) live in ReLifeKit's `QueueRules`.
@Model
final class PendingOp {
    var uid: UUID = UUID()
    var kind: String = "action"
    var body: Data = Data()
    var createdAt: Date = Date.now
    var attempts: Int = 0
    var lastAttemptAt: Date?

    init(_ op: QueuedOp) {
        uid = op.id
        kind = op.kind.rawValue
        body = op.body
        createdAt = op.createdAt
        attempts = op.attempts
        lastAttemptAt = op.lastAttemptAt
    }

    var value: QueuedOp {
        QueuedOp(id: uid, kind: QueuedOp.Kind(rawValue: kind) ?? .action, body: body, createdAt: createdAt,
                      attempts: attempts, lastAttemptAt: lastAttemptAt)
    }
}

/// The last Today view, shown while offline ("Offline · updated 10:42").
@Model
final class CachedView {
    var key: String = ""
    var json: Data = Data()
    var at: Date = Date.now

    init(key: String, json: Data, at: Date) {
        self.key = key
        self.json = json
        self.at = at
    }
}

/// Where the data lives: ~/Library/Application Support/<app name>/<app name>.store
enum Store {
    /// True when APP_STORE points somewhere else (tests, snapshots, seed data).
    static var isOverridden: Bool {
        !(ProcessInfo.processInfo.environment["APP_STORE"] ?? "").isEmpty
    }

    static var url: URL {
        if let path = ProcessInfo.processInfo.environment["APP_STORE"], !path.isEmpty {
            return URL(fileURLWithPath: path)
        }
        let dir = URL.applicationSupportDirectory.appending(path: Brand.name, directoryHint: .isDirectory)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appending(path: "\(Brand.name).store")
    }

    /// Opens the store. A store that will not open (damaged, or from a newer app) is moved aside as `.broken` and
    /// recreated; if that fails too, the app runs on an in-memory store so it still opens instead of crashing on every launch.
    static func makeContainer() -> ModelContainer {
        do {
            return try ModelContainer(for: PendingOp.self, CachedView.self, configurations: ModelConfiguration(url: url))
        } catch {
            NSLog("Could not open the database at %@: %@", url.path, String(describing: error))
        }
        if !isOverridden {
            let fm = FileManager.default
            let stamp = Int(Date().timeIntervalSince1970)
            for suffix in ["", "-wal", "-shm"] {
                let from = URL(fileURLWithPath: url.path + suffix)
                try? fm.moveItem(at: from, to: URL(fileURLWithPath: url.path + ".broken-\(stamp)" + suffix))
            }
            if let fresh = try? ModelContainer(for: PendingOp.self, CachedView.self, configurations: ModelConfiguration(url: url)) {
                return fresh
            }
        }
        do {
            return try ModelContainer(for: PendingOp.self, CachedView.self, configurations: ModelConfiguration(isStoredInMemoryOnly: true))
        } catch {
            fatalError("Could not open any database: \(error)")
        }
    }
}
