import AppKit
import Observation
import ReLifeKit

/// Connect this Mac to a server. Flow B (the surfaces plan): this Mac shows a code, you approve it in the
/// dashboard or on a signed-in phone. Flow A: type a code from the dashboard's "Connect a device" sheet.
@Observable
final class PairingModel {
    enum Local: Equatable {
        case checking, found, missing
    }

    enum State: Equatable {
        case idle
        case requesting
        case waiting
        case denied
        case expired
        case failed(String)
    }

    weak var model: AppModel?
    var local: Local = .checking
    var state: State = .idle
    var server: URL?
    var started: PairRequestStarted?
    var typedCode = ""
    var typedCodeError: String?
    /// Snapshots set this so no browser window opens.
    @ObservationIgnored var opensBrowser = true
    @ObservationIgnored private var pollTask: Task<Void, Never>?

    var expiresAt: Date? { started?.expiry }

    var displayCode: String? { started.map { ConnectCode.display($0.userCode) } }

    // MARK: - Where is the server

    /// "On this Mac": look for the server at 127.0.0.1:3030.
    func discoverLocal() async {
        local = .checking
        let client = ReLifeClient(baseURL: ServerAddress.local, clientVersion: AppModel.version)
        do {
            let hello = try await client.hello()
            local = hello.app == "relife" ? .found : .missing
        } catch {
            local = .missing
        }
    }

    // MARK: - Flow B: show a code, wait for approval

    func start(server: URL) async {
        cancel()
        self.server = server
        state = .requesting
        started = nil
        let client = ReLifeClient(baseURL: server, clientVersion: AppModel.version)
        do {
            let hello = try await client.hello()
            if VersionCompare.isOlder(AppModel.version, than: hello.minClient.mac) {
                state = .failed(Words.clientTooOld(minimum: hello.minClient.mac))
                return
            }
            let v = ProcessInfo.processInfo.operatingSystemVersion
            let started = try await client.startPairing(kind: .mac, name: model?.deviceName ?? "Mac",
                                                        platform: "macOS \(v.majorVersion).\(v.minorVersion)")
            self.started = started
            state = .waiting
            if opensBrowser, let url = URL(string: started.approveUrl) { NSWorkspace.shared.open(url) }
            pollTask = Task { [weak self] in await self?.poll(client: client, started: started) }
        } catch ClientError.serverTooOld {
            state = .failed(Words.serverTooOld)
        } catch ClientError.api(_, let error) where error.code == .rateLimited {
            state = .failed("Too many tries. Wait a few minutes.")
        } catch {
            state = .failed("Can't reach \(Brand.name) at \(ServerAddress.display(server)).")
        }
    }

    private func poll(client: ReLifeClient, started: PairRequestStarted) async {
        var failures = 0
        while !Task.isCancelled {
            try? await Task.sleep(for: .seconds(max(2, started.interval)))
            if Task.isCancelled { return }
            if let end = started.expiry, end < .now {
                state = .expired
                return
            }
            do {
                switch try await client.poll(started) {
                case .pending:
                    failures = 0
                case .denied:
                    state = .denied
                    return
                case .expired:
                    state = .expired
                    return
                case let .approved(token, device):
                    guard let token, let server else {
                        state = .failed("\(Brand.name) approved this Mac but sent no sign-in. Try again.")
                        return
                    }
                    state = .idle
                    await model?.completePairing(server: server, token: token, device: device)
                    return
                }
            } catch {
                failures += 1
                if failures >= 5 {
                    state = .failed("Lost the connection to \(Brand.name).")
                    return
                }
            }
        }
    }

    /// Opens the approve page again (the code stays the same).
    func openApprovePage() {
        guard let started, let url = URL(string: started.approveUrl) else { return }
        NSWorkspace.shared.open(url)
    }

    func cancel() {
        pollTask?.cancel()
        pollTask = nil
        if state == .waiting || state == .requesting { state = .idle }
    }

    // MARK: - Flow A: a typed code or a link's secret

    func redeemTyped(server: URL) async {
        guard let code = ConnectCode.normalize(typedCode) else {
            typedCodeError = "A connect code has 8 letters and numbers, like K7FQ-2M9X."
            return
        }
        typedCodeError = nil
        await redeem(server: server, secret: nil, code: code)
    }

    func redeem(server: URL, secret: String?, code: String?) async {
        cancel()
        self.server = server
        state = .requesting
        let client = ReLifeClient(baseURL: server, clientVersion: AppModel.version)
        let v = ProcessInfo.processInfo.operatingSystemVersion
        do {
            let result = try await client.redeem(secret: secret, code: code, name: model?.deviceName ?? "Mac",
                                                 platform: "macOS \(v.majorVersion).\(v.minorVersion)")
            guard let token = result.token else {
                state = .failed("\(Brand.name) sent no sign-in. Try again.")
                return
            }
            state = .idle
            await model?.completePairing(server: server, token: token, device: result.device)
        } catch ClientError.api(_, let error) {
            typedCodeError = error.message
            state = .idle
        } catch {
            typedCodeError = "Can't reach \(Brand.name) at \(ServerAddress.display(server))."
            state = .idle
        }
    }
}
