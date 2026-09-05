import AppKit
import ApplicationServices

func appTarget(_ app: NSRunningApplication) -> Target? {
    guard let bundle = app.bundleIdentifier else { return nil }
    return Target(id: bundle + ":app", kind: "app", app: app.localizedName ?? bundle, bundleId: bundle, title: "", pid: app.processIdentifier)
}
struct BrowserTab {
    var target: Target
    var index: Int
    var active: Bool
    var frontWindow: Bool
}
func browserTabs(_ app: NSRunningApplication) throws -> [BrowserTab] {
    guard let bundle = app.bundleIdentifier, let kind = browserKind(bundle) else { return [] }
    let safari = kind == "safari"
    let source = """
    tell application id \(scriptLiteral(bundle))
        set rows to {}
        set wi to 0
        repeat with w in windows
            set wi to wi + 1
            set ti to 0
            repeat with t in tabs of w
                set ti to ti + 1
                try
                    set tabTitle to \(safari ? "name" : "title") of t as text
                    set tabURL to URL of t as text
                    set tabIdentity to \(safari ? "ti as text" : "id of t as text")
                    set activeFlag to \(safari ? "(ti is index of current tab of w)" : "(ti is active tab index of w)")
                    set end of rows to {id of w as text, tabIdentity, tabTitle, tabURL, ti, activeFlag, wi is 1}
                end try
            end repeat
        end repeat
        return rows
    end tell
    """
    let result = try runScript(source)
    return (1...max(1, result.numberOfItems)).compactMap { i in
        guard let row = result.atIndex(i), row.numberOfItems == 7 else { return nil }
        let wid = text(row.atIndex(1)); let tid = text(row.atIndex(2)); let url = text(row.atIndex(4))
        let target = Target(id: bundle + ":tab:" + wid + ":" + tid, kind: "tab", app: app.localizedName ?? bundle, bundleId: bundle, title: text(row.atIndex(3)), windowId: wid, tabId: safari ? nil : tid, url: url, pid: app.processIdentifier)
        return BrowserTab(target: target, index: Int(row.atIndex(5)?.int32Value ?? 1), active: row.atIndex(6)?.booleanValue ?? false, frontWindow: row.atIndex(7)?.booleanValue ?? false)
    }
}
func browserWindowTargets(_ app: NSRunningApplication, tabs: [BrowserTab]) -> [Target] {
    var seen = Set<String>()
    return tabs.filter { $0.active }.compactMap { tab in
        guard let wid = tab.target.windowId, seen.insert(wid).inserted else { return nil }
        return Target(id: tab.target.bundleId + ":window:" + wid, kind: "window", app: tab.target.app, bundleId: tab.target.bundleId, title: tab.target.title, windowId: wid, pid: app.processIdentifier)
    }
}
func snapshot(_ request: Request) -> Response {
    var targets: [Target] = []
    var warnings: [String] = []
    let trusted = AXIsProcessTrusted()
    for app in NSWorkspace.shared.runningApplications where app.activationPolicy == .regular {
        guard let bundle = app.bundleIdentifier, bundle != excludedBundle, bundle != request.ignoreBundleId else { continue }
        if let target = appTarget(app) { targets.append(target) }
        if browserKind(bundle) != nil {
            do {
                let tabs = try browserTabs(app)
                targets += browserWindowTargets(app, tabs: tabs)
                targets += tabs.map(\.target)
                continue
            } catch { warnings.append("\(app.localizedName ?? bundle): 탭 목록을 읽지 못했습니다. 자동화 권한을 확인하세요. \(error)") }
        }
        if trusted {
            for window in windows(app.processIdentifier) {
                let title = windowTitle(window)
                guard !title.isEmpty else { continue }
                targets.append(Target(id: bundle + ":window:" + windowKey(window), kind: "window", app: app.localizedName ?? bundle, bundleId: bundle, title: title, windowId: windowKey(window), pid: app.processIdentifier))
            }
        }
    }
    if !trusted { warnings.append("손쉬운 사용 권한을 켜면 앱 창을 조회하고 이동할 수 있습니다.") }
    return Response(targets: targets, displays: allDisplays(), permissions: Permissions(accessibility: trusted), warnings: warnings)
}
