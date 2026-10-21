import AppKit
import ApplicationServices

// Fake only the OS boundary; execute the production browser action and resolver.
struct BrowserTab { var target: Target; var index: Int; var active: Bool; var frontWindow: Bool }
var fixtures: [BrowserTab] = []
var created: BrowserTab?
var concurrentTab: BrowserTab?
var scripts: [String] = []
func runningApp(_ bundle: String) -> NSRunningApplication? { NSRunningApplication.current }
func openApp(_ target: Target) throws -> NSRunningApplication { NSRunningApplication.current }
func browserTabs(_ app: NSRunningApplication) throws -> [BrowserTab] { fixtures }
func runScript(_ source: String) throws -> NSAppleEventDescriptor {
    scripts.append(source)
    if source.contains("make new") {
        guard let created else { throw NativeError("Unexpected reopen") }
        if let concurrentTab { fixtures.append(concurrentTab) }
        fixtures.append(created)
        return NSAppleEventDescriptor(string: created.target.windowId!)
    }
    return NSAppleEventDescriptor(boolean: false)
}
func text(_ value: NSAppleEventDescriptor?) -> String { value?.stringValue ?? "" }
func selectedDisplay(_ id: String?) throws -> Display? { nil }
func movedFrame(_ frame: CGRect, _ display: Display) -> CGRect { frame }
func attribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? { nil }
func elementAttribute(_ element: AXUIElement, _ name: String) -> AXUIElement? { nil }
func check(_ condition: Bool, _ message: String) {
    guard condition else { fputs("FAIL: \(message)\n", stderr); exit(1) }
}
let pid = NSRunningApplication.current.processIdentifier
func tab(_ bundle: String, _ wid: String, _ tid: String, _ url: String) -> BrowserTab {
    BrowserTab(target: Target(id: bundle + ":tab:" + wid + ":" + tid, kind: "tab", app: "Browser", bundleId: bundle, title: "Current", windowId: wid, tabId: bundle == "com.apple.Safari" ? nil : tid, url: url, pid: pid), index: 1, active: true, frontWindow: true)
}
for bundle in ["com.google.Chrome", "com.apple.Safari"] {
    let url = "https://example.com/lesson"
    let original = tab(bundle, "10", "20", url)
    let unrelated = tab(bundle, "11", "21", url)
    let opened = tab(bundle, "12", "22", url)
    if bundle == "com.google.Chrome" {
        fixtures = [unrelated]
    } else {
        // The unrelated Safari tab appears during creation, after the initial scan.
        fixtures = []
    }
    concurrentTab = bundle == "com.apple.Safari" ? unrelated : nil
    created = opened
    scripts = []
    let reply = try browserAction(Request(op: "send", tabMode: "window"), original.target)
    check(reply.target?.id == opened.target.id, "\(bundle): reopened action must identify the created window")
    check(reply.outcome == "reopened", "\(bundle): reopened outcome")
    check(scripts.contains { $0.contains("return id of w as text") }, "\(bundle): creation must return window identity")
}
let original = tab("com.google.Chrome", "10", "20", "https://example.com/lesson")
let moved = tab("com.google.Chrome", "11", "20", "https://example.com/lesson")
fixtures = [moved];created = nil
let reply = try browserAction(Request(op: "send", tabMode: "window"), original.target)
check(reply.target?.id == moved.target.id, "moved tab response must match discovery")
print("Native browser actions: 7 checks passed")
