import AppKit
import ApplicationServices

struct Target: Codable {
    var id: String
    var kind: String
    var app: String
    var bundleId: String
    var title: String
    var windowId: String?
    var tabId: String?
    var url: String?
    var pid: Int32?
}
struct Display: Codable {
    var id: String; var name: String
    var x: Double; var y: Double; var width: Double; var height: Double
    var primary: Bool
}
struct Permissions: Codable { var accessibility: Bool }
struct Request: Decodable {
    var op: String
    var target: Target?
    var displayId: String?
    var tabMode: String?
    var ignoreBundleId: String?
}
struct Response: Encodable {
    var ok = true
    var error: String?
    var targets: [Target]?
    var displays: [Display]?
    var permissions: Permissions?
    var target: Target?
    var outcome: String?
    var warnings: [String]?
}
struct NativeError: Error, CustomStringConvertible {
    var description: String
    init(_ message: String) { description = message }
}
let excludedBundle = "dev.cue.desktop"
let chromiumBundles: Set<String> = ["com.google.Chrome", "com.google.Chrome.beta", "com.google.Chrome.canary", "com.microsoft.edgemac", "com.brave.Browser", "com.vivaldi.Vivaldi", "com.operasoftware.Opera", "company.thebrowser.Browser"]
func browserKind(_ bundle: String) -> String? {
    if chromiumBundles.contains(bundle) { return "chromium" }
    if bundle == "com.apple.Safari" || bundle == "com.apple.SafariTechnologyPreview" { return "safari" }
    return nil
}
func scriptLiteral(_ value: String) -> String {
    "\"" + value.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"").replacingOccurrences(of: "\r", with: "\\r").replacingOccurrences(of: "\n", with: "\\n") + "\""
}
func runScript(_ source: String) throws -> NSAppleEventDescriptor {
    guard let script = NSAppleScript(source: "with timeout of 8 seconds\n" + source + "\nend timeout") else { throw NativeError("브라우저 제어 스크립트를 만들 수 없습니다.") }
    var error: NSDictionary?
    let result = script.executeAndReturnError(&error)
    if let error {
        let message = error[NSAppleScript.errorMessage] as? String ?? "알 수 없는 오류"
        throw NativeError("브라우저 제어 실패: \(message)")
    }
    return result
}
func text(_ value: NSAppleEventDescriptor?) -> String { value?.stringValue ?? "" }
