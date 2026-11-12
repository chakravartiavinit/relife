import ReLifeKit
import ServiceManagement
import SwiftUI

/// First launch, and the Connect screen whenever the device is not signed in (the state matrix: "Connect screen
/// replaces content"). Four steps: where is your ReLife, connect, reminders, the shortcut.
struct OnboardingView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .top, spacing: Space.section) {
                VStack(alignment: .leading, spacing: Space.lg) {
                    SystemLabel(text: "Set up ReLife for Mac")
                    content
                    Spacer(minLength: 0)
                }
                .frame(maxWidth: 440, alignment: .leading)
                if model.onboarding == .connect { ApprovalCard().frame(width: 360) }
            }
            .padding(.horizontal, Space.section + Space.margin)
            .padding(.top, Space.section + Space.margin)
            Spacer(minLength: 0)
            footer
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(CanvasBackground())
        .gridArea("onboarding")
    }

    @ViewBuilder private var content: some View {
        switch model.onboarding {
        case .where: WhereStep()
        case .connect: ConnectStep()
        case .reminders: RemindersStep()
        case .shortcut: ShortcutStep()
        }
    }

    private var footer: some View {
        HStack(spacing: Space.md) {
            HStack(spacing: Space.xs) {
                ForEach(OnboardingStep.allCases, id: \.rawValue) { step in
                    Capsule()
                        .fill(step.rawValue <= model.onboarding.rawValue ? Tokens.pill : Tokens.surface2)
                        .frame(width: Space.xxl, height: Space.xs)
                }
            }
            Text("Step \(model.onboarding.number) of \(OnboardingStep.count)")
                .font(.caption)
                .foregroundStyle(.secondary)
            Spacer()
        }
        .padding(Space.margin)
        .padding(.horizontal, Space.section)
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Step 1: where

private struct WhereStep: View {
    @Environment(AppModel.self) private var model
    @State private var choice: Choice = .local
    @State private var address = ""
    @State private var addressError: String?

    enum Choice { case local, other, cloud }

    var body: some View {
        VStack(alignment: .leading, spacing: Space.lg) {
            Text(title).font(.system(.largeTitle, design: .rounded, weight: .bold))
            Text(subtitle).font(.callout).foregroundStyle(.secondary)
            if case let .sessionEnded(reason) = model.phase {
                NoticeCard(symbol: "person.crop.circle.badge.exclamationmark", title: Words.sessionEnded(reason))
            }
            if let notice = model.notice {
                NoticeCard(symbol: "tray.full", tint: Tokens.pill, title: notice)
            }
            Text("Where does your ReLife run?").font(.callout.weight(.semibold))
            option(.local, symbol: "laptopcomputer", title: "On this Mac", detail: localDetail, trailing: localBadge)
            option(.other, symbol: "server.rack", title: "On another computer", detail: "Self-hosted at home or on your own server.", trailing: nil) {
                TextField("https://relife.home", text: $address)
                    .textFieldStyle(.roundedBorder)
                    .onSubmit { addressError = nil }
                if let addressError { Text(addressError).font(.caption).foregroundStyle(Tokens.bad) }
            }
            option(.cloud, symbol: "cloud", title: "ReLife Cloud", detail: "Hosted for you. Not open yet.", trailing: AnyView(XPChip(text: "Soon", tone: .neutral)), disabled: true)
            HStack {
                Spacer()
                Button("Continue", action: next)
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .keyboardShortcut(.defaultAction)
                    .disabled(choice == .local && model.pairing.local != .found)
            }
        }
        .task { await model.pairing.discoverLocal() }
    }

    private var title: String {
        if case .sessionEnded = model.phase { return "Connect again" }
        return "Connect this Mac to your ReLife"
    }

    private var subtitle: String {
        "Your level, quests and quick log live in the menu bar. Pick where your ReLife runs, then approve this Mac once. It stays signed in."
    }

    private var localDetail: String {
        switch model.pairing.local {
        case .checking: "Looking for ReLife at 127.0.0.1:3030…"
        case .found: "Found ReLife at 127.0.0.1:3030"
        case .missing: "ReLife isn't running on this Mac. Run `npm run service -- install` in the ReLife folder."
        }
    }

    private var localBadge: AnyView? {
        switch model.pairing.local {
        case .found: AnyView(Label("Found", systemImage: "circle.fill").labelStyle(.titleAndIcon).font(.caption.weight(.semibold)).foregroundStyle(Tokens.good))
        case .missing: AnyView(Button("Retry") { Task { await model.pairing.discoverLocal() } }.controlSize(.small))
        case .checking: AnyView(ProgressView().controlSize(.small))
        }
    }

    private func option(_ value: Choice, symbol: String, title: String, detail: String, trailing: AnyView?, disabled: Bool = false,
                        @ViewBuilder extra: () -> some View = { EmptyView() }) -> some View {
        let selected = !disabled && choice == value
        return Button {
            if !disabled { choice = value }
        } label: {
            HStack(alignment: .top, spacing: Space.md) {
                Image(systemName: symbol)
                    .frame(width: Space.xxl + Space.sm, height: Space.xxl + Space.sm)
                    .background(Tokens.pillWash, in: RoundedRectangle(cornerRadius: Tokens.radiusSm, style: .continuous))
                VStack(alignment: .leading, spacing: Space.xs) {
                    Text(title).font(.callout.weight(.semibold))
                    Text(detail).font(.caption).foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                    extra()
                }
                Spacer(minLength: Space.sm)
                if let trailing { trailing }
                Image(systemName: selected ? "largecircle.fill.circle" : "circle")
                    .foregroundStyle(selected ? Tokens.pill : Tokens.ink3)
            }
            .padding(Space.md)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Tokens.surface, in: RoundedRectangle(cornerRadius: Tokens.radiusMd, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Tokens.radiusMd, style: .continuous)
                .strokeBorder(selected ? Tokens.pill : Tokens.hairline, lineWidth: selected ? 2 : 1))
            .opacity(disabled ? 0.55 : 1)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(disabled)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private func next() {
        let server: URL
        if choice == .local {
            server = ServerAddress.local
        } else if choice == .cloud {
            return
        } else {
            guard let url = ServerAddress.parse(address) else {
                addressError = "Enter an address like 192.168.1.5:3030 or relife.home."
                return
            }
            server = url
        }
        model.onboarding = .connect
        Task { await model.pairing.start(server: server) }
    }
}

// MARK: - Step 2: connect

private struct ConnectStep: View {
    @Environment(AppModel.self) private var model
    @State private var haveCode = false

    var body: some View {
        @Bindable var pairing = model.pairing
        VStack(alignment: .leading, spacing: Space.lg) {
            Text("Approve this Mac").font(.system(.largeTitle, design: .rounded, weight: .bold))
            Text("A prompt opens in your dashboard. Check that the code matches, then approve. Or scan the code with a phone where ReLife is signed in.")
                .font(.callout)
                .foregroundStyle(.secondary)
            LabeledContent("Server") { Text(pairing.server.map(ServerAddress.display) ?? "–").foregroundStyle(.secondary) }
            LabeledContent("This Mac is called") {
                TextField("Name", text: Binding(get: { model.deviceName }, set: { model.deviceName = $0; Prefs.deviceName = $0 }))
                    .textFieldStyle(.roundedBorder)
                    .frame(width: 200)
            }
            DisclosureGroup("Have a code instead?", isExpanded: $haveCode) {
                VStack(alignment: .leading, spacing: Space.sm) {
                    Text("Type the 8-character code from Settings → Devices → Connect a device.").font(.caption).foregroundStyle(.secondary)
                    HStack {
                        TextField("K7FQ-2M9X", text: $pairing.typedCode)
                            .textFieldStyle(.roundedBorder)
                            .font(.system(.body, design: .monospaced))
                            .frame(width: 160)
                            .onSubmit(redeem)
                        Button("Connect", action: redeem).disabled(pairing.typedCode.isEmpty)
                    }
                    if let error = pairing.typedCodeError { Text(error).font(.caption).foregroundStyle(Tokens.bad) }
                }
                .padding(.top, Space.sm)
            }
            HStack {
                Button("Back") {
                    model.pairing.cancel()
                    model.onboarding = .where
                }
                Spacer()
                Button("Approve in Browser") { model.pairing.openApprovePage() }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .disabled(model.pairing.started == nil)
            }
        }
    }

    private func redeem() {
        guard let server = model.pairing.server else { return }
        Task { await model.pairing.redeemTyped(server: server) }
    }
}

/// The code, its QR, the countdown and the waiting line.
struct ApprovalCard: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        let pairing = model.pairing
        Card(padding: Space.xl) {
            VStack(alignment: .leading, spacing: Space.lg) {
                SystemLabel(text: "Approve this Mac")
                Text("Approve from the ReLife you're signed in to").font(.headline)
                if let started = pairing.started, pairing.state == .waiting {
                    QRCodeView(text: started.approveUrl).frame(width: 176, height: 176).frame(maxWidth: .infinity)
                    CodeBoxes(code: started.userCode).frame(maxWidth: .infinity)
                    Countdown(expiresAt: pairing.expiresAt) { Task { await model.pairing.start(server: pairing.server ?? ServerAddress.local) } }
                        .frame(maxWidth: .infinity)
                }
                status(pairing)
            }
        }
    }

    @ViewBuilder private func status(_ pairing: PairingModel) -> some View {
        switch pairing.state {
        case .idle, .requesting:
            HStack(spacing: Space.sm) { ProgressView().controlSize(.small); Text("Asking ReLife for a code…") }.font(.callout)
        case .waiting:
            HStack(spacing: Space.sm) { ProgressView().controlSize(.small); Text("Waiting for approval…") }
                .font(.callout.weight(.semibold))
                .foregroundStyle(Tokens.pillInk)
                .frame(maxWidth: .infinity)
                .padding(Space.md)
                .background(Tokens.pillWash, in: RoundedRectangle(cornerRadius: Tokens.radiusSm, style: .continuous))
        case .expired:
            retry("This code expired.", symbol: "clock.badge.exclamationmark", pairing)
        case .denied:
            retry("The request was denied in ReLife.", symbol: "xmark.circle", pairing)
        case let .failed(message):
            retry(message, symbol: "exclamationmark.triangle", pairing)
        }
    }

    private func retry(_ message: String, symbol: String, _ pairing: PairingModel) -> some View {
        VStack(alignment: .leading, spacing: Space.sm) {
            Label(message, systemImage: symbol).font(.callout)
            Button("New code") { Task { await model.pairing.start(server: pairing.server ?? ServerAddress.local) } }
        }
    }
}

/// `K7P 4QX` as boxed characters.
struct CodeBoxes: View {
    var code: String

    var body: some View {
        let chars = ConnectCode.characters(code)
        HStack(spacing: Space.xs) {
            ForEach(Array(chars.enumerated()), id: \.offset) { index, c in
                if index == 4 { Spacer().frame(width: Space.sm) }
                Text(c)
                    .font(.system(.title3, design: .monospaced, weight: .bold))
                    .frame(width: Space.xxl + Space.xs, height: Space.section + Space.xs)
                    .background(Tokens.surface2, in: RoundedRectangle(cornerRadius: Tokens.radiusSm, style: .continuous))
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Connect code \(chars.joined(separator: " "))")
    }
}

struct Countdown: View {
    var expiresAt: Date?
    var onNewCode: () -> Void

    var body: some View {
        HStack(spacing: Space.lg) {
            Label {
                TimelineView(.periodic(from: .now, by: 1)) { context in
                    let left = max(0, Int((expiresAt ?? context.date).timeIntervalSince(context.date)))
                    Text("Expires in \(left / 60):\(String(format: "%02d", left % 60))").monospacedDigit()
                }
            } icon: { Image(systemName: "clock") }
            Button { onNewCode() } label: { Label("New code", systemImage: "arrow.clockwise") }
                .buttonStyle(.plain)
        }
        .font(.caption)
        .foregroundStyle(.secondary)
    }
}

// MARK: - Step 3: reminders and login

private struct RemindersStep: View {
    @Environment(AppModel.self) private var model
    @State private var reminders = Prefs.remindersOnMac
    @State private var login = true
    @State private var denied = false

    var body: some View {
        VStack(alignment: .leading, spacing: Space.lg) {
            Text("Get reminders on this Mac?").font(.system(.largeTitle, design: .rounded, weight: .bold))
            Text("Level ups, cleared quests and a warning at 21:00 when System quests are left. ReLife asks for permission only when you turn this on.")
                .font(.callout)
                .foregroundStyle(.secondary)
            Card {
                VStack(alignment: .leading, spacing: Space.md) {
                    Toggle("Reminders on this Mac", isOn: $reminders)
                        .onChange(of: reminders) { _, on in enableReminders(on) }
                    Divider()
                    Toggle("Open at login", isOn: $login)
                }
            }
            if denied {
                NoticeCard(symbol: "bell.slash", title: "Notifications are off for ReLife", message: "Turn them on in System Settings, then try again.",
                           actionTitle: "Open System Settings") { model.notifier.openSystemSettings() }
            }
            HStack {
                Spacer()
                Button("Continue") {
                    LaunchAtLogin.set(login)
                    model.onboarding = .shortcut
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .keyboardShortcut(.defaultAction)
            }
        }
    }

    private func enableReminders(_ on: Bool) {
        Prefs.remindersOnMac = on
        guard on else { return }
        Task {
            let granted = await model.notifier.requestAuthorization()
            if !granted, !Store.isOverridden {
                reminders = false
                Prefs.remindersOnMac = false
                denied = true
            }
        }
    }
}

// MARK: - Step 4: the shortcut

private struct ShortcutStep: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        VStack(alignment: .leading, spacing: Space.lg) {
            Text("Log anything from anywhere").font(.system(.largeTitle, design: .rounded, weight: .bold))
            Text("Press the shortcut in any app, type “water 250” or “spent 120 chai”, and press Return.")
                .font(.callout)
                .foregroundStyle(.secondary)
            Card {
                HStack {
                    Text(HotKeyCenter.describe(code: Prefs.hotKeyCode, modifiers: Prefs.hotKeyModifiers))
                        .font(.system(.title2, design: .rounded, weight: .semibold))
                        .padding(.horizontal, Space.lg)
                        .padding(.vertical, Space.sm)
                        .background(Tokens.surface2, in: RoundedRectangle(cornerRadius: Tokens.radiusSm, style: .continuous))
                    Spacer()
                    Button("Try it") { model.quickLog.show(model: model) }
                }
            }
            Text("You can change it in Settings → Shortcuts.").font(.caption).foregroundStyle(.secondary)
            HStack {
                Spacer()
                Button("Done") { model.finishOnboarding() }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .keyboardShortcut(.defaultAction)
            }
        }
    }
}

/// Launch at login with `SMAppService.mainApp`. The person approves once in System Settings.
enum LaunchAtLogin {
    static var isEnabled: Bool { SMAppService.mainApp.status == .enabled }

    static func set(_ on: Bool) {
        guard !Store.isOverridden else { return }
        do {
            if on { try SMAppService.mainApp.register() } else { try SMAppService.mainApp.unregister() }
        } catch {
            // Not fatal: Settings → General shows the real state.
        }
    }
}
