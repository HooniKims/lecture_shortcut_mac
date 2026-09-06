import AppKit
import ApplicationServices

func capture(_ request: Request) throws -> Response {
    guard let app = NSWorkspace.shared.frontmostApplication, let bundle = app.bundleIdentifier,
          bundle != excludedBundle, bundle != request.ignoreBundleId else { throw NativeError("등록할 앱이나 탭을 먼저 앞으로 가져온 뒤 빠른 등록 단축키를 누르세요.") }
    let window = AXIsProcessTrusted() ? elementAttribute(AXUIElementCreateApplication(app.processIdentifier), kAXFocusedWindowAttribute) : nil
    let captureDisplay = window.flatMap(frame).flatMap { bounds in
        allDisplays().first { CGRect(x: $0.x, y: $0.y, width: $0.width, height: $0.height).contains(CGPoint(x: bounds.midX, y: bounds.midY)) }
    }
    if browserKind(bundle) != nil { return Response(target: try frontBrowserTab(app).target, captureDisplay: captureDisplay) }
    if isBrowserApp(app) { throw NativeError("이 브라우저는 현재 개별 탭 등록을 지원하지 않습니다. Chrome, Safari, Edge 등 지원되는 브라우저에서 탭을 등록하세요.") }
    if let window {
        return Response(target: Target(id: bundle + ":window:" + windowKey(window), kind: "window", app: app.localizedName ?? bundle, bundleId: bundle, title: windowTitle(window), windowId: windowKey(window), pid: app.processIdentifier), captureDisplay: captureDisplay)
    }
    return Response(target: appTarget(app))
}
func handle(_ request: Request) throws -> Response {
    switch request.op {
    case "permissions": return Response(permissions: Permissions(accessibility: AXIsProcessTrusted()))
    case "requestPermissions":
        let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
        let trusted = AXIsProcessTrustedWithOptions(options)
        if !trusted, let settings = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility") { NSWorkspace.shared.open(settings) }
        return Response(permissions: Permissions(accessibility: trusted))
    case "displays": return Response(displays: allDisplays())
    case "snapshot": return snapshot(request)
    case "capture": return try capture(request)
    case "restoreFocus":
        guard let target = request.target else { throw NativeError("돌아갈 대상이 없습니다.") }
        return try restoreFocus(target)
    case "toggle", "prepare", "send":
        guard let target = request.target else { throw NativeError("등록할 대상이 없습니다.") }
        if target.kind == "tab" || (target.kind == "window" && browserKind(target.bundleId) != nil && target.windowId?.allSatisfy(\.isNumber) == true) { return try browserAction(request, target) }
        return try genericAction(request, target)
    default: throw NativeError("지원하지 않는 명령입니다: \(request.op)")
    }
}
if CommandLine.arguments.contains("--help") {
    print("Cue native helper: send one JSON request on stdin. Ops: snapshot, displays, permissions, requestPermissions, capture, restoreFocus, toggle, prepare, send.")
    exit(0)
}
let response: Response
do {
    guard let line = readLine(), let data = line.data(using: .utf8) else { throw NativeError("JSON 요청이 필요합니다.") }
    let request = try JSONDecoder().decode(Request.self, from: data)
    response = try handle(request)
} catch { response = Response(ok: false, error: String(describing: error)) }
let encoder = JSONEncoder()
encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
if let data = try? encoder.encode(response), let output = String(data: data, encoding: .utf8) { print(output) }
else { print("{\"ok\":false,\"error\":\"응답을 만들 수 없습니다.\"}") }
