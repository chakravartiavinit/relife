import AppKit
import ReLifeKit
import SwiftUI

/// The global quick-log panel: a Spotlight-like, non-activating `NSPanel` in the upper third of the screen.
/// It is the one window that focuses its field on open (its only job is typing).
final class QuickLogPanel: NSPanel {
    var onResign: (() -> Void)?

    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }

    override func resignKey() {
        super.resignKey()
        onResign?()
    }

    override func cancelOperation(_ sender: Any?) {
        orderOut(nil)
    }
}

final class QuickLogPanelController {
    private var panel: QuickLogPanel?
    static let size = CGSize(width: 700, height: 420)

    var isVisible: Bool { panel?.isVisible ?? false }
    var window: NSWindow? { panel }

    func show(model: AppModel, text: String = "") {
        let panel = self.panel ?? makePanel()
        self.panel = panel
        let root = QuickLogView(initialText: text, onClose: { [weak self] in self?.hide() })
            .environment(model)
        let hosting = NSHostingView(rootView: root)
        hosting.sizingOptions = []
        panel.contentView = hosting
        position(panel)
        panel.makeKeyAndOrderFront(nil)
    }

    func hide() {
        panel?.orderOut(nil)
    }

    private func makePanel() -> QuickLogPanel {
        let panel = QuickLogPanel(contentRect: NSRect(origin: .zero, size: Self.size),
                                  styleMask: [.nonactivatingPanel, .borderless, .fullSizeContentView],
                                  backing: .buffered, defer: false)
        panel.level = .floating
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false
        panel.hidesOnDeactivate = false
        panel.isReleasedWhenClosed = false
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.onResign = { [weak panel] in panel?.orderOut(nil) }
        return panel
    }

    /// Centred horizontally, with the field in the upper third.
    private func position(_ panel: NSPanel) {
        let screen = NSScreen.main ?? NSScreen.screens.first
        let frame = screen?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        let x = frame.midX - Self.size.width / 2
        let y = frame.maxY - frame.height * 0.2 - Self.size.height
        panel.setFrame(NSRect(x: x, y: y, width: Self.size.width, height: Self.size.height), display: true)
    }
}

/// What a row in the panel does.
private enum QuickAction: Identifiable {
    case log(String)
    case complete(QuestRow)
    case openToday

    var id: String {
        switch self {
        case let .log(t): "log:" + t
        case let .complete(r): "do:" + r.id
        case .openToday: "today"
        }
    }
}

struct QuickLogView: View {
    @Environment(AppModel.self) private var model
    var initialText = ""
    var onClose: () -> Void
    @State private var text = ""
    @State private var selected = 0
    @FocusState private var focused: Bool

    var body: some View {
        VStack(spacing: Space.sm) {
            field
            results
            Spacer(minLength: 0)
        }
        .frame(width: 700, height: 420, alignment: .top)
        .onAppear {
            text = initialText
            focused = true
        }
        .onChange(of: text) { selected = 0 }
        .onKeyPress(.downArrow) {
            selected = min(selected + 1, max(0, actions.count - 1))
            return .handled
        }
        .onKeyPress(.upArrow) {
            selected = max(selected - 1, 0)
            return .handled
        }
        .onKeyPress(.escape) {
            onClose()
            return .handled
        }
    }

    private var actions: [QuickAction] {
        var out: [QuickAction] = []
        let clean = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if !clean.isEmpty { out.append(.log(clean)) }
        if let view = model.view {
            out += QuickLogMatches.quests(clean, in: view).map(QuickAction.complete)
        }
        out.append(.openToday)
        return out
    }

    private var field: some View {
        HStack(spacing: Space.md) {
            Image(systemName: "capsule.lefthalf.filled").font(.title2).foregroundStyle(Tokens.pill)
            InputField("Log something…", text: $text)
                .textFieldStyle(.plain)
                .font(.title2)
                .focused($focused)
                .onSubmit(run)
            Button(action: run) {
                HStack(spacing: Space.xs) {
                    Text("Log")
                    Image(systemName: "return")
                }
                .font(.callout.weight(.semibold))
                .foregroundStyle(Tokens.bg)
                .padding(.horizontal, Space.lg)
                .padding(.vertical, Space.sm)
                .background(Tokens.ink, in: Capsule())
            }
            .buttonStyle(PressScaleStyle())
            .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
        }
        .padding(.horizontal, Space.xl)
        .padding(.vertical, Space.md)
        .background(.regularMaterial, in: Capsule())
        .overlay(Capsule().strokeBorder(Tokens.hairline))
    }

    private var results: some View {
        VStack(alignment: .leading, spacing: Space.xs) {
            ForEach(Array(actions.enumerated()), id: \.element.id) { index, action in
                row(action, isSelected: index == selected)
                    .onTapGesture { selected = index; run() }
            }
            Text("Try: spent 120 chai · read 20 pages · gym done")
                .font(.caption)
                .foregroundStyle(.secondary)
                .padding(.horizontal, Space.md)
                .padding(.top, Space.sm)
        }
        .padding(Space.sm)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: Tokens.radiusLg, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Tokens.radiusLg, style: .continuous).strokeBorder(Tokens.hairline))
    }

    private func row(_ action: QuickAction, isSelected: Bool) -> some View {
        HStack(spacing: Space.md) {
            Image(systemName: symbol(action))
                .frame(width: Space.xxl + Space.sm, height: Space.xxl + Space.sm)
                .background(Tokens.surface2, in: RoundedRectangle(cornerRadius: Tokens.radiusSm, style: .continuous))
            VStack(alignment: .leading, spacing: 0) {
                Text(title(action)).font(.callout.weight(.semibold))
                Text(subtitle(action)).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            if isSelected { Image(systemName: "return").foregroundStyle(.secondary) }
        }
        .padding(Space.sm)
        .background(isSelected ? Tokens.pillWash : .clear, in: RoundedRectangle(cornerRadius: Tokens.radiusSm, style: .continuous))
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }

    private func symbol(_ a: QuickAction) -> String {
        switch a {
        case .log: "plus.circle"
        case .complete: "checkmark.circle"
        case .openToday: "macwindow"
        }
    }

    private func title(_ a: QuickAction) -> String {
        switch a {
        case let .log(t): QuickLogMatches.logTitle(t)
        case let .complete(r): "Check off \(r.title)"
        case .openToday: "Open Today"
        }
    }

    private func subtitle(_ a: QuickAction) -> String {
        switch a {
        case .log: "\(Brand.name) works out what this is"
        case let .complete(r):
            if case let .goal(g) = r { "Adds \(Format.goalStep(g).dropFirst()) · \(Format.goal(g))" } else { "Quest" }
        case .openToday: "Opens the \(Brand.name) window"
        }
    }

    private func run() {
        let items = actions
        guard items.indices.contains(selected) else { return }
        let action = items[selected]
        onClose()
        switch action {
        case let .log(t): model.log(t)
        case let .complete(row):
            switch row {
            case let .routine(r): model.check(r, done: true)
            case let .goal(g): model.add(g)
            case .system: model.showMainWindow(page: .today)
            }
        case .openToday: model.showMainWindow(page: .today)
        }
    }
}

/// The small result bar shown when the app is not the front app: "Logged water 250 ml · Undo".
final class HUDPanelController {
    static let shared = HUDPanelController()
    private var panel: NSPanel?
    private var hideTask: Task<Void, Never>?

    func present(_ message: HUDMessage, model: AppModel) {
        let panel = self.panel ?? makePanel()
        self.panel = panel
        let root = HUDView(message: message) { [weak self] in
            model.undo(message)
            self?.hide()
        }
        let hosting = NSHostingView(rootView: root)
        panel.contentView = hosting
        let size = hosting.fittingSize
        let frame = (NSScreen.main ?? NSScreen.screens.first)?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        panel.setFrame(NSRect(x: frame.midX - size.width / 2, y: frame.minY + Space.section * 2, width: size.width, height: size.height), display: true)
        panel.orderFrontRegardless()
        hideTask?.cancel()
        hideTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(4))
            if !Task.isCancelled { self?.hide() }
        }
    }

    func hide() {
        panel?.orderOut(nil)
    }

    private func makePanel() -> NSPanel {
        let panel = NSPanel(contentRect: .zero, styleMask: [.nonactivatingPanel, .borderless], backing: .buffered, defer: false)
        panel.level = .floating
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = true
        panel.isReleasedWhenClosed = false
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        return panel
    }
}
