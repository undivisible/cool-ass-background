#!/bin/sh
set -eu
ROOT=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
cd "$ROOT"
bun run build
APP="$ROOT/out/Background.app"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources/web"
cp -R dist/. "$APP/Contents/Resources/web/"
swiftc -target "$(uname -m)-apple-macosx13.0" apps/macos/main.swift -o "$APP/Contents/MacOS/background" -framework AppKit -framework WebKit -O
cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>dev.undivisible.background</string><key>CFBundleName</key><string>Background</string><key>CFBundleExecutable</key><string>background</string><key>CFBundleVersion</key><string>2</string><key>CFBundleShortVersionString</key><string>0.1.1</string><key>LSMinimumSystemVersion</key><string>13.0</string><key>LSUIElement</key><true/><key>NSAppleEventsUsageDescription</key><string>Read the playing track and album artwork from Spotify or Music to color your wallpaper.</string>
</dict></plist>
PLIST
codesign --force --deep --sign - "$APP"
ditto -c -k --keepParent "$APP" "$ROOT/out/cool-ass-background-macos-$(uname -m).zip"
