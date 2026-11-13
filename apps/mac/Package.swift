// swift-tools-version: 6.2
import PackageDescription

// ReLifeKit (Foundation only) builds and tests on Linux too, so CI and agents without a Mac can run
// `swift test`. The app target needs AppKit and SwiftUI, so it exists on macOS only.
var targets: [Target] = [
    // API client, models, SSE parser, offline queue rules and the activity segmenter: no SwiftUI.
    .target(name: "ReLifeKit"),
    // The contract tests read packages/contract/fixtures by path (Fixtures.swift), so drift from the server is caught.
    .testTarget(name: "ReLifeKitTests", dependencies: ["ReLifeKit"]),
]
#if os(macOS)
targets.append(
    .executableTarget(
        name: "ReLife",
        dependencies: ["ReLifeKit"],
        // App code runs on the main thread unless you say otherwise.
        swiftSettings: [.defaultIsolation(MainActor.self)]
    )
)
#endif

let package = Package(
    name: "ReLife",
    platforms: [.macOS(.v26)],
    targets: targets
)
