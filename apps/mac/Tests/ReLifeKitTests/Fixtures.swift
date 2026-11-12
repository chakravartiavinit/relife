import Foundation

/// Where the contract fixtures live. The monorepo keeps them in packages/contract/fixtures (shared with the
/// TypeScript tests). Until that lands on this branch, a copy sits next to the tests; the shared folder wins when present.
enum Fixtures {
    static let directory: URL = {
        let here = URL(fileURLWithPath: #filePath)
        let shared = here.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent().appending(path: "packages/contract/fixtures", directoryHint: .isDirectory)
        if let override = ProcessInfo.processInfo.environment["RELIFE_FIXTURES_DIR"] { return URL(fileURLWithPath: override, isDirectory: true) }
        if FileManager.default.fileExists(atPath: shared.path) { return shared }
        return here.deletingLastPathComponent().appending(path: "Fixtures", directoryHint: .isDirectory)
    }()

    /// Every `<Schema>.<case>.json` file name.
    static func names() throws -> [String] {
        try FileManager.default.contentsOfDirectory(atPath: directory.path).filter { $0.hasSuffix(".json") }.sorted()
    }

    static func data(_ name: String) throws -> Data {
        try Data(contentsOf: directory.appending(path: name.hasSuffix(".json") ? name : name + ".json"))
    }

    static func decode<T: Decodable>(_ type: T.Type, _ name: String) throws -> T {
        try JSONDecoder().decode(T.self, from: data(name))
    }
}
