import AppKit
import ApplicationServices

func openApp(_ target: Target) throws -> NSRunningApplication {
    guard let url = NSWorkspace.shared.urlForApplication(withBundleIdentifier: target.bundleId) else { throw NativeError("\(target.app) 앱이 설치되어 있지 않습니다.") }
    let config = NSWorkspace.OpenConfiguration()
    config.activates = false
    var completed = false
    var opened: NSRunningApplication?
    var failure: Error?
    NSWorkspace.shared.openApplication(at: url, configuration: config) { app, error in
        opened = app; failure = error; completed = true
    }
    let deadline = Date().addingTimeInterval(10)
    while !completed && Date() < deadline { RunLoop.current.run(until: Date().addingTimeInterval(0.02)) }
    if let opened { return opened }
    throw NativeError("\(target.app)을 열 수 없습니다: \(failure?.localizedDescription ?? "응답 시간 초과")")
}
func genericAction(_ request: Request, _ target: Target) throws -> Response {
    guard AXIsProcessTrusted() else { throw NativeError("시스템 설정 > 개인정보 보호 및 보안 > 손쉬운 사용에서 Cue를 허용하세요.") }
    var reopened = false
    let app: NSRunningApplication
    if let existing = runningApp(target.bundleId) { app = existing } else { app = try openApp(target); reopened = true }
    var candidates = windows(app.processIdentifier)
    if candidates.isEmpty && reopened {
        let deadline = Date().addingTimeInterval(3)
        while candidates.isEmpty && Date() < deadline { Thread.sleep(forTimeInterval: 0.1); candidates = windows(app.processIdentifier) }
    }
    let axApp = AXUIElementCreateApplication(app.processIdentifier)
    let focused = elementAttribute(axApp, kAXFocusedWindowAttribute)
    let window: AXUIElement?
    if target.kind == "app" { window = focused ?? candidates.first }
    else {
        let exact = candidates.filter { windowKey($0) == target.windowId && (target.pid == app.processIdentifier || windowTitle($0) == target.title) }
        let byTitle = candidates.filter { windowTitle($0) == target.title }
        let matches = exact.isEmpty ? byTitle : exact
        guard matches.count <= 1 else { throw NativeError("같은 이름의 창이 여러 개입니다. 목록에서 해당 창을 다시 등록하세요.") }
        window = matches.first
        if window == nil { throw NativeError("등록한 창이 닫혔습니다. \(target.app)을 연 뒤 창을 다시 등록하세요. 문서의 경로는 자동으로 복원할 수 없습니다.") }
    }
    guard let window else {
        _ = try runScript("tell application id \(scriptLiteral(target.bundleId)) to activate")
        if request.displayId != nil && allDisplays().count > 1 { throw NativeError("앱은 열었지만 이동할 창이 없습니다.") }
        return Response(target: target, outcome: reopened ? "reopened" : "shown")
    }
    let updated = resolvedWindowTarget(target, windowId: windowKey(window), title: windowTitle(window), pid: app.processIdentifier)
    let currentlyFront = NSWorkspace.shared.frontmostApplication?.processIdentifier == app.processIdentifier
    let sameWindow = focused.map { CFEqual($0, window) } ?? false
    if ["toggle", "prepare"].contains(request.op) && currentlyFront && sameWindow && !isMinimized(window) {
        guard AXUIElementSetAttributeValue(window, kAXMinimizedAttribute as CFString, kCFBooleanTrue) == .success else { throw NativeError("이 창은 최소화할 수 없습니다.") }
        return Response(target: updated, outcome: "minimized")
    }
    _ = AXUIElementSetAttributeValue(window, kAXMinimizedAttribute as CFString, kCFBooleanFalse)
    try moveAX(window, request.op == "prepare" ? nil : selectedDisplay(request.displayId))
    _ = try runScript("tell application id \(scriptLiteral(target.bundleId)) to activate")
    let raised = AXUIElementPerformAction(window, kAXRaiseAction as CFString)
    _ = AXUIElementSetAttributeValue(axApp, kAXFocusedWindowAttribute as CFString, window)
    guard raised == .success else { throw NativeError("선택한 창을 앞으로 가져오지 못했습니다.") }
    return Response(target: updated, outcome: request.op == "prepare" ? "prepared" : (reopened ? "reopened" : "shown"))
}
