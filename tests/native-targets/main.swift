import Foundation

var checks = 0
func check(_ condition: Bool, _ message: String) {
    checks += 1
    guard condition else { fputs("FAIL: \(message)\n", stderr); exit(1) }
}
func tab(_ window: String, _ id: String, pid: Int32 = 100, bundle: String = "com.google.Chrome") -> BrowserTab {
    BrowserTab(target: Target(id: bundle + ":tab:" + window + ":" + id, kind: "tab", app: "Browser", bundleId: bundle, title: "Current title", windowId: window, tabId: bundle == "com.apple.Safari" ? nil : id, url: "https://example.com/lesson", pid: pid), index: 1, active: true, frontWindow: true)
}
let saved = tab("10", "20").target
let moved = tab("11", "20")
let other = tab("10", "21")
check(try findBrowserTarget(saved, tabs: [other], pid: 100) == nil, "a closed tab must not resolve to a different tab with the same URL")
check(try findBrowserTarget(saved, tabs: [other, moved], pid: 100)?.target.id == moved.target.id, "stable tab ID survives a window move")
let resolved = resolvedBrowserTarget(saved, chosen: moved)
check(resolved.id == moved.target.id && resolved.windowId == "11", "returned identity must match fresh discovery after detach")
check(try findBrowserTarget(saved, tabs: [tab("30", "40", pid: 200)], pid: 200)?.target.tabId == "40", "after restart unique URL can restore the tab")
do {
    _ = try findBrowserTarget(saved, tabs: [moved, other], pid: 200)
    check(false, "ambiguous URLs after restart must fail")
} catch { check(true, "ambiguous URLs rejected") }
let safari = tab("12", "1", bundle: "com.apple.Safari")
let safariResolved = resolvedBrowserTarget(safari.target, chosen: safari)
check(safariResolved.tabId == nil && safariResolved.id == safari.target.id, "Safari uses discovered identity without inventing stable tab ID")
let window = Target(id: "com.google.Chrome:window:10", kind: "window", app: "Browser", bundleId: "com.google.Chrome", title: "Old title", windowId: "10", pid: 100)
let updatedWindow = resolvedBrowserTarget(window, chosen: moved)
check(updatedWindow.id == "com.google.Chrome:window:11" && updatedWindow.title == "Current title", "browser window metadata refreshes title and identity")
check(updatedWindow.tabId == nil && updatedWindow.url == nil, "window target must remain a window")
let generic = resolvedWindowTarget(window, windowId: "new", title: "Renamed", pid: 200)
check(generic.id == "com.google.Chrome:window:new" && generic.pid == 200, "generic restored window identity refreshes")
print("Native target resolution: \(checks) checks passed")
