import AppKit
import WebKit

final class App: NSObject, NSApplicationDelegate, WKNavigationDelegate {
    var windows: [NSWindow] = []
    var views: [WKWebView] = []
    var status: NSStatusItem!
    var timer: Timer?
    var busy = false
    var local = false
    var generation = 0
    var preset = "Drift"
    var lastfm: [String]?
    var presets: [String] = []
    let worker = DispatchQueue(label: "playback")

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.accessory)
        if let url = Bundle.main.url(forResource: "presets", withExtension: "json", subdirectory: "web"),
           let data = try? Data(contentsOf: url),
           let object = try? JSONSerialization.jsonObject(with: data) as? [String: [String]] {
            presets = object.keys.sorted()
        }
        status = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        status.button?.title = "≋"
        let menu = NSMenu()
        let paletteMenu = NSMenu()
        for name in presets { let item = NSMenuItem(title: name, action: #selector(selectPreset(_:)), keyEquivalent: ""); item.target = self; paletteMenu.addItem(item) }
        let paletteItem = NSMenuItem(title: "Palette", action: nil, keyEquivalent: ""); paletteItem.submenu = paletteMenu; menu.addItem(paletteItem)
        for (title, action) in [("Sync Spotify / Music", #selector(enableLocal)), ("Connect Last.fm…", #selector(connectLastFm)), ("Quit", #selector(quit))] {
            let item = NSMenuItem(title: title, action: action, keyEquivalent: ""); item.target = self; menu.addItem(item)
        }
        status.menu = menu
        rebuildWindows()
        NotificationCenter.default.addObserver(self, selector: #selector(rebuildWindows), name: NSApplication.didChangeScreenParametersNotification, object: nil)
        NSWorkspace.shared.notificationCenter.addObserver(self, selector: #selector(sleep), name: NSWorkspace.willSleepNotification, object: nil)
        NSWorkspace.shared.notificationCenter.addObserver(self, selector: #selector(wake), name: NSWorkspace.didWakeNotification, object: nil)
        timer = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in self?.poll() }
    }
    @objc func rebuildWindows() {
        windows.forEach { $0.orderOut(nil) }; windows.removeAll(); views.removeAll()
        guard let url = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "web") else { return }
        for screen in NSScreen.screens {
            let window = NSWindow(contentRect: screen.frame, styleMask: .borderless, backing: .buffered, defer: false)
            window.level = NSWindow.Level(rawValue: Int(CGWindowLevelForKey(.desktopWindow)) + 1)
            window.collectionBehavior = [.canJoinAllSpaces, .stationary, .ignoresCycle]
            window.ignoresMouseEvents = true; window.isReleasedWhenClosed = false
            let view = WKWebView(frame: NSRect(origin: .zero, size: screen.frame.size))
            view.navigationDelegate = self; window.contentView = view
            var components = URLComponents(url: url, resolvingAgainstBaseURL: false)!
            components.query = "wallpaper=1"
            view.loadFileURL(components.url!, allowingReadAccessTo: url.deletingLastPathComponent())
            window.orderBack(nil); windows.append(window); views.append(view)
        }
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        if let lastfm { call("lastfm", lastfm, views: [webView]) }
        else if !local { call("preset", [preset], views: [webView]) }
    }
    func call(_ name: String, _ args: [Any], views targets: [WKWebView]? = nil) {
        guard let data = try? JSONSerialization.data(withJSONObject: args), let json = String(data: data, encoding: .utf8) else { return }
        for view in targets ?? views { view.evaluateJavaScript("window.wallpaper?.\(name)(...\(json))", completionHandler: nil) }
    }
    @objc func selectPreset(_ sender: NSMenuItem) { generation += 1; local = false; lastfm = nil; preset = sender.title; call("preset", [preset]); status.button?.toolTip = preset }
    @objc func enableLocal() { generation += 1; local = true; lastfm = nil; call("preset", [preset]); poll() }
    @objc func connectLastFm() {
        let alert = NSAlert(); alert.messageText = "Last.fm sync"; alert.informativeText = "Your public API key, not your account password. Only held in memory."
        let stack = NSStackView(); stack.orientation = .vertical; stack.frame = NSRect(x: 0, y: 0, width: 320, height: 60)
        let user = NSTextField(); user.placeholderString = "Username"
        let key = NSTextField(); key.placeholderString = "API key"
        stack.addArrangedSubview(user); stack.addArrangedSubview(key); alert.accessoryView = stack
        alert.addButton(withTitle: "Connect"); alert.addButton(withTitle: "Cancel")
        if alert.runModal() == .alertFirstButtonReturn && !user.stringValue.isEmpty && !key.stringValue.isEmpty {
            generation += 1; local = false; lastfm = [user.stringValue, key.stringValue]; call("lastfm", lastfm!)
        }
    }
    @objc func sleep() { call("pause", []) }
    @objc func wake() { call("resume", []); poll() }
    @objc func quit() { NSApp.terminate(nil) }
    func poll() {
        guard local && !busy else { return }; busy = true
        let ticket = generation
        worker.async {
            // Checking runningApplications avoids launching players or stealing focus.
            let running = Set(NSWorkspace.shared.runningApplications.compactMap(\.bundleIdentifier))
            var track: [String: String]?
            for (bundle, app) in [("com.spotify.client", "Spotify"), ("com.apple.Music", "Music")] where running.contains(bundle) {
                let art = app == "Spotify" ? "artwork url of current track" : "\"\""
                let script = "tell application \"\(app)\"\nif player state is not playing then return \"\"\nreturn (name of current track) & linefeed & (artist of current track) & linefeed & (album of current track) & linefeed & (\(art))\nend tell"
                let process = Process(); process.executableURL = URL(fileURLWithPath: "/usr/bin/osascript"); process.arguments = ["-e", script]
                let output = Pipe(); let errors = Pipe(); process.standardOutput = output; process.standardError = errors
                do {
                    try process.run()
                    let data = output.fileHandleForReading.readDataToEndOfFile(); process.waitUntilExit()
                    if process.terminationStatus != 0 { continue }
                    let lines = (String(data: data, encoding: .utf8) ?? "").components(separatedBy: "\n")
                    if lines.count < 4 || lines[0].isEmpty { continue }
                    var artwork = lines[3]
                    if app == "Music" {
                        let export = "tell application \"Music\" to return raw data of artwork 1 of current track"
                        var error: NSDictionary?
                        if let result = NSAppleScript(source: export)?.executeAndReturnError(&error),
                           let image = NSImage(data: result.data), let tiff = image.tiffRepresentation,
                           let bitmap = NSBitmapImageRep(data: tiff), let png = bitmap.representation(using: .png, properties: [:]) {
                            artwork = "data:image/png;base64," + png.base64EncodedString()
                        }
                    }
                    if let url = URL(string: artwork), url.scheme == "https", let data = try? Data(contentsOf: url) {
                        artwork = "data:image/jpeg;base64," + data.base64EncodedString()
                    }
                    track = ["id": lines.prefix(3).joined(separator: "\u{0}"), "title": lines[0], "artwork": artwork]
                    break
                } catch { continue }
            }
            DispatchQueue.main.async {
                self.busy = false
                guard self.local && ticket == self.generation, let track else { return }
                if track["artwork"]?.isEmpty == false { self.call("track", [track]) }
                else { self.status.button?.toolTip = "No album artwork from this player; use Last.fm or a preset." }
            }
        }
    }
}
let app = NSApplication.shared
let delegate = App()
app.delegate = delegate
app.run()
