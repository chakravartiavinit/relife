import AppKit
import Foundation
import Observation

/// The Local server panel: shown when the server address is this Mac and the LaunchAgent `com.relife.app`
/// exists (`npm run service -- install`). Status, Start, Stop, Restart and Open log. Rebuilding stays in the CLI.
@Observable
final class LocalServer {
    enum Status: Equatable {
        case unknown
        case running(pid: Int?)
        case stopped
    }

    static let label = "com.relife.app"
    static var plistURL: URL {
        URL.homeDirectory.appending(path: "Library/LaunchAgents/\(label).plist")
    }
    static var logURL: URL {
        URL.homeDirectory.appending(path: "Library/Logs/ReLife/relife.log")
    }

    var status: Status = .unknown
    var busy = false
    var lastError: String?

    var isInstalled: Bool { FileManager.default.fileExists(atPath: Self.plistURL.path) }

    private var domain: String { "gui/\(getuid())" }

    func refresh() async {
        guard isInstalled else { status = .unknown; return }
        let result = await Shell.run("/bin/launchctl", ["print", "\(domain)/\(Self.label)"])
        guard result.status == 0 else { status = .stopped; return }
        let running = result.output.contains("state = running")
        let pid = result.output.components(separatedBy: "\n").first { $0.contains("pid = ") }
            .flatMap { Int($0.split(separator: "=").last?.trimmingCharacters(in: .whitespaces) ?? "") }
        status = running ? .running(pid: pid) : .stopped
    }

    func start() async {
        // Loaded but stopped: kickstart. Unloaded (after Stop): bootstrap the plist again.
        var r = await Shell.run("/bin/launchctl", ["kickstart", "\(domain)/\(Self.label)"])
        if r.status != 0 { r = await Shell.run("/bin/launchctl", ["bootstrap", domain, Self.plistURL.path]) }
        await finish(r)
    }

    func stop() async {
        await finish(await Shell.run("/bin/launchctl", ["bootout", "\(domain)/\(Self.label)"]))
    }

    func restart() async {
        var r = await Shell.run("/bin/launchctl", ["kickstart", "-k", "\(domain)/\(Self.label)"])
        if r.status != 0 { r = await Shell.run("/bin/launchctl", ["bootstrap", domain, Self.plistURL.path]) }
        await finish(r)
    }

    func openLog() {
        NSWorkspace.shared.open(Self.logURL)
    }

    private func finish(_ result: (status: Int32, output: String)) async {
        busy = true
        lastError = result.status == 0 ? nil : "launchctl said: \(result.output.trimmingCharacters(in: .whitespacesAndNewlines))"
        try? await Task.sleep(for: .seconds(1))
        await refresh()
        busy = false
    }
}

/// Runs a command off the main thread.
nonisolated enum Shell {
    @concurrent
    static func run(_ path: String, _ arguments: [String]) async -> (status: Int32, output: String) {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: path)
        process.arguments = arguments
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = pipe
        do {
            try process.run()
        } catch {
            return (127, String(describing: error))
        }
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        process.waitUntilExit()
        return (process.terminationStatus, String(data: data, encoding: .utf8) ?? "")
    }
}
