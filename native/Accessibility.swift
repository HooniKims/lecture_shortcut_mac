import AppKit
import ApplicationServices

func attribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
    var result: CFTypeRef?
    guard AXUIElementCopyAttributeValue(element, name as CFString, &result) == .success else { return nil }
    return result
}
func elementAttribute(_ element: AXUIElement, _ name: String) -> AXUIElement? {
    guard let value = attribute(element, name), CFGetTypeID(value) == AXUIElementGetTypeID() else { return nil }
    return unsafeBitCast(value, to: AXUIElement.self)
}
func windows(_ pid: Int32) -> [AXUIElement] {
    attribute(AXUIElementCreateApplication(pid), kAXWindowsAttribute) as? [AXUIElement] ?? []
}
func windowTitle(_ window: AXUIElement) -> String { attribute(window, kAXTitleAttribute) as? String ?? "" }
func windowKey(_ window: AXUIElement) -> String {
    var pid: pid_t = 0
    AXUIElementGetPid(window, &pid)
    if let rectangle = frame(window), let entries = CGWindowListCopyWindowInfo([.optionAll, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] {
        let matches = entries.filter { entry in
            guard entry[kCGWindowOwnerPID as String] as? Int32 == pid,
                  entry[kCGWindowLayer as String] as? Int == 0,
                  let dictionary = entry[kCGWindowBounds as String] as? NSDictionary,
                  let candidate = CGRect(dictionaryRepresentation: dictionary) else { return false }
            return abs(candidate.minX - rectangle.minX) < 2 && abs(candidate.minY - rectangle.minY) < 2 && abs(candidate.width - rectangle.width) < 2 && abs(candidate.height - rectangle.height) < 2
        }
        let named = matches.filter { ($0[kCGWindowName as String] as? String) == windowTitle(window) }
        let unique = named.isEmpty ? matches : named
        if unique.count == 1, let number = unique[0][kCGWindowNumber as String] as? NSNumber { return "cg:" + number.stringValue }
    }
    // AXIdentifier may be the same nib identifier in every document window.
    // A non-unique title deliberately fails selection rather than targeting a different window.
    return "title:" + windowTitle(window)
}
func isMinimized(_ window: AXUIElement) -> Bool { attribute(window, kAXMinimizedAttribute) as? Bool ?? false }
func frame(_ window: AXUIElement) -> CGRect? {
    guard let p = attribute(window, kAXPositionAttribute), CFGetTypeID(p) == AXValueGetTypeID(),
          let s = attribute(window, kAXSizeAttribute), CFGetTypeID(s) == AXValueGetTypeID() else { return nil }
    var point = CGPoint.zero
    var size = CGSize.zero
    guard AXValueGetValue(unsafeBitCast(p, to: AXValue.self), .cgPoint, &point),
          AXValueGetValue(unsafeBitCast(s, to: AXValue.self), .cgSize, &size) else { return nil }
    return CGRect(origin: point, size: size)
}
func allDisplays() -> [Display] {
    let screens = NSScreen.screens
    let top = screens.first?.frame.maxY ?? 0
    return screens.enumerated().map { index, screen in
        let f = screen.visibleFrame
        let number = screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber
        let localizedName = screen.localizedName
        let name = localizedName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "모니터 \(index + 1)" : localizedName
        return Display(id: number?.stringValue ?? String(index), name: name, x: f.minX, y: top - f.maxY, width: f.width, height: f.height, primary: index == 0)
    }
}
func selectedDisplay(_ id: String?) throws -> Display? {
    guard let id, !id.isEmpty else { return nil }
    let displays = allDisplays()
    guard let display = displays.first(where: { $0.id == id }) else {
        if displays.count == 1 { return displays.first }
        throw NativeError("선택한 모니터가 연결되어 있지 않습니다. 송출 모니터를 다시 선택하세요.")
    }
    return display
}
func movedFrame(_ original: CGRect, _ display: Display) -> CGRect {
    let displays = allDisplays()
    let originalDisplay = displays.max { a, b in
        original.intersection(CGRect(x: a.x, y: a.y, width: a.width, height: a.height)).area < original.intersection(CGRect(x: b.x, y: b.y, width: b.width, height: b.height)).area
    }
    let dx = original.minX - (originalDisplay?.x ?? original.minX)
    let dy = original.minY - (originalDisplay?.y ?? original.minY)
    // Keep the user's size. Oversized windows stay anchored so their title bar is reachable.
    let x = min(max(display.x + dx, display.x), display.x + max(0, display.width - original.width))
    let y = min(max(display.y + dy, display.y), display.y + max(0, display.height - original.height))
    return CGRect(x: x, y: y, width: original.width, height: original.height)
}
extension CGRect { var area: Double { isNull ? 0 : width * height } }
func moveAX(_ window: AXUIElement, _ display: Display?) throws {
    guard let display else { return }
    guard let original = frame(window) else { throw NativeError("이 창의 위치를 읽을 수 없습니다.") }
    var point = movedFrame(original, display).origin
    guard let value = AXValueCreate(.cgPoint, &point), AXUIElementSetAttributeValue(window, kAXPositionAttribute as CFString, value) == .success else {
        throw NativeError("이 창을 이동할 수 없습니다. 전체 화면을 해제한 뒤 다시 시도하세요.")
    }
}
func runningApp(_ bundle: String) -> NSRunningApplication? { NSRunningApplication.runningApplications(withBundleIdentifier: bundle).first { $0.activationPolicy == .regular && !$0.isTerminated } }
