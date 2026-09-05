import AppKit
import ApplicationServices

func pressDetachMenu(_ app: NSRunningApplication) throws {
    let names: Set<String> = ["Move Tab to New Window", "Move tab to new window", "Move Tab to a New Window", "탭을 새 창으로 이동", "탭을 새로운 윈도우로 이동", "탭을 새 윈도우로 이동", "새로운 윈도우로 탭 이동", "タブを新しいウインドウに移動", "タブを新しいウィンドウに移動", "Tab in neues Fenster verschieben", "Déplacer l’onglet vers une nouvelle fenêtre"]
    func find(_ element: AXUIElement, depth: Int) -> AXUIElement? {
        guard depth < 5 else { return nil }
        if let title = attribute(element, kAXTitleAttribute) as? String, names.contains(title), attribute(element, kAXEnabledAttribute) as? Bool == true { return element }
        for child in attribute(element, kAXChildrenAttribute) as? [AXUIElement] ?? [] {
            if let found = find(child, depth: depth + 1) { return found }
        }
        return nil
    }
    let axApp = AXUIElementCreateApplication(app.processIdentifier)
    guard let menu = elementAttribute(axApp, kAXMenuBarAttribute), let item = find(menu, depth: 0) else {
        throw NativeError("이 브라우저의 ‘탭을 새 창으로 이동’ 메뉴를 찾지 못했습니다. 이동 방식을 ‘창 전체’로 바꾸세요.")
    }
    guard AXUIElementPerformAction(item, kAXPressAction as CFString) == .success else { throw NativeError("브라우저의 탭 분리 메뉴를 실행하지 못했습니다.") }
}
func numericID(_ value: String?) throws -> String {
    guard let value, !value.isEmpty, value.allSatisfy(\.isNumber) else { throw NativeError("브라우저 창 식별자가 올바르지 않습니다.") }
    return value
}
func browserAction(_ request: Request, _ target: Target) throws -> Response {
    guard let kind = browserKind(target.bundleId) else { throw NativeError("이 브라우저는 탭 제어를 제공하지 않습니다. 앱 또는 창을 등록하세요.") }
    let safari = kind == "safari"
    let app = try runningApp(target.bundleId) ?? openApp(target)
    var tabs = try browserTabs(app)
    var reopened = false
    var selection: BrowserTab?
    let sameProcess = target.pid == app.processIdentifier
    if target.kind == "tab" {
        if sameProcess, !safari, let id = target.tabId { selection = tabs.first { $0.target.tabId == id } }
        if selection == nil, let url = target.url {
            let sameWindow = sameProcess ? tabs.filter { $0.target.url == url && $0.target.windowId == target.windowId } : []
            let all = sameWindow.isEmpty ? tabs.filter { $0.target.url == url } : sameWindow
            if all.count > 1 { throw NativeError("같은 주소의 탭이 여러 개입니다. 원하는 탭을 다시 등록하세요.") }
            selection = all.first
        }
        if selection == nil {
            guard let url = target.url, let parsed = URL(string: url), ["http", "https", "file", "about", "chrome", "edge", "brave", "data"].contains(parsed.scheme?.lowercased() ?? "") else { throw NativeError("닫힌 탭을 다시 열 수 있는 주소가 없습니다.") }
            let create = safari ? "make new document with properties {URL:\(scriptLiteral(url))}" : "set w to make new window\nset URL of active tab of w to \(scriptLiteral(url))"
            _ = try runScript("tell application id \(scriptLiteral(target.bundleId))\n\(create)\nend tell")
            tabs = try browserTabs(app)
            selection = tabs.first { $0.target.url == url }
            reopened = true
        }
    } else {
        if sameProcess { selection = tabs.first { $0.target.windowId == target.windowId && $0.active } }
        else {
            let matches = tabs.filter { $0.active && $0.target.title == target.title }
            if matches.count == 1 { selection = matches.first }
            if matches.count > 1 { throw NativeError("같은 이름의 브라우저 창이 여러 개입니다. 원하는 창을 다시 등록하세요.") }
        }
        if selection == nil { throw NativeError("등록한 브라우저 창이 닫혔습니다. 목록에서 다시 등록하세요.") }
    }
    guard var chosen = selection else { throw NativeError("브라우저 탭이 아직 준비되지 않았습니다. 잠시 뒤 다시 시도하세요.") }
    var wid = try numericID(chosen.target.windowId)
    let prefix = "tell application id \(scriptLiteral(target.bundleId))\n"
    let minimized = try runScript(prefix + "return \(safari ? "miniaturized" : "minimized") of window id \(wid)\nend tell").booleanValue
    if ["toggle", "prepare"].contains(request.op) && app.isActive && chosen.frontWindow && chosen.active && !minimized && !reopened {
        _ = try runScript(prefix + "set \(safari ? "miniaturized" : "minimized") of window id \(wid) to true\nend tell")
        return Response(target: target, outcome: "minimized")
    }
    let activateTab = safari ? "set current tab of w to tab \(chosen.index) of w" : "set active tab index of w to \(chosen.index)"
    _ = try runScript(prefix + "set w to window id \(wid)\nset \(safari ? "miniaturized" : "minimized") of w to false\n\(activateTab)\nend tell")
    let display = try request.op == "prepare" ? nil : selectedDisplay(request.displayId)
    let sameTabs = tabs.filter { $0.target.windowId == chosen.target.windowId }
    // Detach only when showing on a selected monitor; prepare never moves a tab out of its original window.
    if target.kind == "tab", request.tabMode != "window", display != nil, sameTabs.count > 1 {
        guard AXIsProcessTrusted() else { throw NativeError("탭을 분리하려면 손쉬운 사용 권한이 필요합니다. 시스템 설정에서 Cue를 허용하세요.") }
        let previousBounds = try runScript(prefix + "return bounds of window id \(wid)\nend tell")
        _ = try runScript(prefix + "set index of window id \(wid) to 1\nactivate\nend tell")
        Thread.sleep(forTimeInterval: 0.12)
        try pressDetachMenu(app)
        let previousWindowIDs = Set(tabs.compactMap { $0.target.windowId })
        let deadline = Date().addingTimeInterval(3)
        var detached: BrowserTab?
        while Date() < deadline {
            Thread.sleep(forTimeInterval: 0.08)
            let current = try browserTabs(app)
            detached = current.first { candidate in
                !previousWindowIDs.contains(candidate.target.windowId ?? "") &&
                (safari ? candidate.target.url == chosen.target.url : candidate.target.tabId == chosen.target.tabId)
            }
            if detached != nil { break }
        }
        guard let detached else { throw NativeError("탭 분리를 확인하지 못했습니다. 브라우저에서 탭 위치를 확인한 뒤 다시 등록하세요.") }
        wid = try numericID(detached.target.windowId)
        chosen = detached
        if previousBounds.numberOfItems == 4 {
            let dimensions = (1...4).map { String(previousBounds.atIndex($0)?.int32Value ?? 0) }.joined(separator: ", ")
            _ = try runScript(prefix + "set bounds of window id \(wid) to {\(dimensions)}\nend tell")
        }
    }
    if let display {
        let bounds = try runScript(prefix + "return bounds of window id \(wid)\nend tell")
        guard bounds.numberOfItems == 4 else { throw NativeError("브라우저 창 위치를 읽지 못했습니다.") }
        let a = (1...4).map { Double(bounds.atIndex($0)?.int32Value ?? 0) }
        let next = movedFrame(CGRect(x: a[0], y: a[1], width: a[2] - a[0], height: a[3] - a[1]), display)
        _ = try runScript(prefix + "set bounds of window id \(wid) to {\(Int(next.minX)), \(Int(next.minY)), \(Int(next.maxX)), \(Int(next.maxY))}\nend tell")
    }
    _ = try runScript(prefix + "set index of window id \(wid) to 1\nactivate\nend tell")
    var updated = target
    updated.windowId = wid; updated.pid = app.processIdentifier
    if target.kind == "tab" { updated.title = chosen.target.title; updated.tabId = chosen.target.tabId; updated.url = chosen.target.url }
    return Response(target: updated, outcome: request.op == "prepare" ? "prepared" : (reopened ? "reopened" : "shown"))
}
