import Foundation

/// The contract fixtures, read straight from packages/contract/fixtures (shared with the TypeScript tests), so the
/// Mac client breaks when the server's shapes change. There is no copy next to the tests.
enum Fixtures {
    /// <repo>/apps/mac/Tests/ReLifeKitTests/Fixtures.swift -> <repo>/packages/contract/fixtures
    static let directory: URL = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        .deletingLastPathComponent().deletingLastPathComponent()
        .appending(path: "packages/contract/fixtures", directoryHint: .isDirectory)

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
