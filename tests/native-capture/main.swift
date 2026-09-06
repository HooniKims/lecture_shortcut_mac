import AppKit

// Given a supported browser with an explicitly-created two-tab fixture window,
// When capture and return-focus run, Then identity and window geometry stay intact.
let bundle = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "com.citrolabs.ego.lite"
let originalFront = NSWorkspace.shared.frontmostApplication
func require(_ condition: Bool, _ message: String) throws {
    if !condition { throw NativeError(message) }
    print("PASS \(message)")
}
do {
    guard let app = runningApp(bundle) else { throw NativeError("Fixture browser is not running") }
    guard browserKind(bundle) != nil else { throw NativeError("Fixture browser is not supported") }
    let tab = try frontBrowserTab(app)
    try require(tab.target.kind == "tab" && tab.target.url == "https://example.com/#cue-native-capture-b", "exact foreground tab capture")
    let discovered = try browserTabs(app).filter { $0.target.windowId == tab.target.windowId }
    try require(discovered.count == 2 && discovered.filter(\.active).count == 1 && discovered.first(where: \.active)?.target.url == tab.target.url, "discovery includes both tabs and the correct active flag")
    let wid = try numericID(tab.target.windowId)
    let prefix = "tell application id \(scriptLiteral(bundle))\n"
    let beforeBounds = try runScript(prefix + "return bounds of window id \(wid)\nend tell").description
    let beforeCount = try runScript(prefix + "return count of windows\nend tell").int32Value
    let restored = try restoreFocus(tab.target)
    try require(restored.outcome == "restored", "return focus reports the original running window")
    let afterBounds = try runScript(prefix + "return bounds of window id \(wid)\nend tell").description
    let afterCount = try runScript(prefix + "return count of windows\nend tell").int32Value
    try require(beforeBounds == afterBounds && beforeCount == afterCount, "return focus keeps window bounds and count")
    let minimize = browserKind(bundle) == "safari" ? "miniaturized" : "minimized"
    _ = try runScript(prefix + "set \(minimize) of window id \(wid) to true\nend tell")
    let minimized = try restoreFocus(tab.target)
    let stayedMinimized = try runScript(prefix + "return \(minimize) of window id \(wid)\nend tell").booleanValue
    try require(minimized.outcome == "unavailable" && stayedMinimized, "return focus never unminimizes a window")
    _ = try runScript(prefix + "set \(minimize) of window id \(wid) to false\nend tell")
    var stale = tab.target
    stale.pid = -1
    let staleResult = try restoreFocus(stale)
    try require(staleResult.outcome == "unavailable", "stale process cannot receive focus")
    var missing = tab.target
    missing.windowId = "2147483647"
    let missingResult = try restoreFocus(missing)
    try require(missingResult.outcome == "unavailable", "closed window is not recreated")
    missing.bundleId = "dev.cue.test.missing-app"
    let missingApp = try restoreFocus(missing)
    try require(missingApp.outcome == "unavailable", "missing app is not launched")
    _ = originalFront?.activate(options: [])
} catch {
    _ = originalFront?.activate(options: [])
    fputs("FAIL \(error)\n", stderr)
    exit(1)
}
