import AppKit
import ApplicationServices

func frontBrowserTab(_ app: NSRunningApplication) throws -> BrowserTab {
    guard let bundle = app.bundleIdentifier, let kind = browserKind(bundle) else {
        throw NativeError("이 브라우저는 현재 개별 탭 등록을 지원하지 않습니다.")
    }
    let safari = kind == "safari"
    let result = try runScript("""
    tell application id \(scriptLiteral(bundle))
        if (count of windows) is 0 then error "열려 있는 브라우저 창이 없습니다."
        set w to front window
        set t to \(safari ? "current tab" : "active tab") of w
        set ti to \(safari ? "index of t" : "active tab index of w")
        return {id of w as text, \(safari ? "ti as text" : "id of t as text"), \(safari ? "name" : "title") of t as text, URL of t as text, ti}
    end tell
    """)
    guard result.numberOfItems == 5,
          let index = result.atIndex(5)?.int32Value, index > 0,
          !text(result.atIndex(1)).isEmpty, !text(result.atIndex(4)).isEmpty else {
        throw NativeError("현재 탭 정보를 읽지 못했습니다. 탭을 연 뒤 다시 등록하세요.")
    }
    let wid = text(result.atIndex(1)), tid = text(result.atIndex(2))
    let target = Target(id: bundle + ":tab:" + wid + ":" + tid, kind: "tab", app: app.localizedName ?? bundle,
                        bundleId: bundle, title: text(result.atIndex(3)), windowId: wid,
                        tabId: safari ? nil : tid, url: text(result.atIndex(4)), pid: app.processIdentifier)
    return BrowserTab(target: target, index: Int(index), active: true, frontWindow: true)
}

func restoreFocus(_ target: Target) throws -> Response {
    guard let app = runningApp(target.bundleId), target.pid == app.processIdentifier else {
        return Response(outcome: "unavailable")
    }
    if target.kind == "tab", let kind = browserKind(target.bundleId) {
        let wid = try numericID(target.windowId)
        // Return to the original window only. Never detach, reopen, move, or toggle it.
        let found = try runScript("""
        tell application id \(scriptLiteral(target.bundleId))
            if not (exists window id \(wid)) then return false
            if \(kind == "safari" ? "miniaturized" : "minimized") of window id \(wid) then return false
            set index of window id \(wid) to 1
            return true
        end tell
        """).booleanValue
        guard found else { return Response(outcome: "unavailable") }
    } else if target.kind == "window" {
        guard AXIsProcessTrusted() else { return Response(outcome: "unavailable") }
        let matches = windows(app.processIdentifier).filter { windowKey($0) == target.windowId }
        guard matches.count == 1, let window = matches.first, !isMinimized(window) else {
            return Response(outcome: "unavailable")
        }
        guard AXUIElementPerformAction(window, kAXRaiseAction as CFString) == .success else {
            throw NativeError("원래 창으로 돌아가지 못했습니다.")
        }
        _ = AXUIElementSetAttributeValue(AXUIElementCreateApplication(app.processIdentifier), kAXFocusedWindowAttribute as CFString, window)
    }
    guard app.activate(options: []) else { throw NativeError("원래 앱으로 돌아가지 못했습니다.") }
    return Response(outcome: "restored")
}
