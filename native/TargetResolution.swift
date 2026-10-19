import Foundation

func findBrowserTarget(_ target: Target, tabs: [BrowserTab], pid: Int32) throws -> BrowserTab? {
    let sameProcess = target.pid == pid
    if target.kind == "tab" {
        // A Chromium tab ID identifies a specific tab for the process lifetime.
        // If it is gone, a same-URL tab is not a replacement for it.
        if sameProcess, browserKind(target.bundleId) != "safari", let id = target.tabId {
            return tabs.first { $0.target.tabId == id }
        }
        guard let url = target.url else { return nil }
        let sameWindow = sameProcess ? tabs.filter { $0.target.url == url && $0.target.windowId == target.windowId } : []
        let matches = sameWindow.isEmpty ? tabs.filter { $0.target.url == url } : sameWindow
        guard matches.count <= 1 else { throw NativeError("같은 주소의 탭이 여러 개입니다. 원하는 탭을 다시 등록하세요.") }
        return matches.first
    }
    if sameProcess { return tabs.first { $0.target.windowId == target.windowId && $0.active } }
    let matches = tabs.filter { $0.active && $0.target.title == target.title }
    guard matches.count <= 1 else { throw NativeError("같은 이름의 브라우저 창이 여러 개입니다. 원하는 창을 다시 등록하세요.") }
    return matches.first
}

func resolvedWindowTarget(_ target: Target, windowId: String, title: String, pid: Int32?) -> Target {
    var updated = target
    updated.windowId = windowId
    updated.title = title
    updated.pid = pid
    if target.kind == "window" { updated.id = target.bundleId + ":window:" + windowId }
    return updated
}

func resolvedBrowserTarget(_ target: Target, chosen: BrowserTab) -> Target {
    if target.kind == "tab" { return chosen.target }
    return resolvedWindowTarget(target, windowId: chosen.target.windowId ?? "", title: chosen.target.title, pid: chosen.target.pid)
}
