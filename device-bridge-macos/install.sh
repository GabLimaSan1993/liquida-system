#!/bin/bash
set -euo pipefail

PAIR_CODE="${1:-}"
if [ -z "$PAIR_CODE" ]; then
  echo "Uso: ./install.sh CODIGO_DE_PAREAMENTO"
  exit 1
fi

if ! command -v brew >/dev/null 2>&1; then
  echo "Homebrew não encontrado. Instale em https://brew.sh e execute novamente."
  exit 1
fi

brew list android-platform-tools >/dev/null 2>&1 || brew install --cask android-platform-tools
brew list libimobiledevice >/dev/null 2>&1 || brew install libimobiledevice
brew list go >/dev/null 2>&1 || brew install go

APP_DIR="$HOME/Library/Application Support/LiquidaBridge"
LOG_DIR="$HOME/Library/Logs/LiquidaBridge"
PLIST="$HOME/Library/LaunchAgents/com.liquida.devicebridge.plist"

mkdir -p "$APP_DIR" "$LOG_DIR" "$HOME/Library/LaunchAgents"

go build -trimpath -ldflags="-s -w" -o "$APP_DIR/liquida-device-bridge" .

"$APP_DIR/liquida-device-bridge" --pair "$PAIR_CODE"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.liquida.devicebridge</string>
  <key>ProgramArguments</key>
  <array>
    <string>$APP_DIR/liquida-device-bridge</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$LOG_DIR/bridge.log</string>
  <key>StandardErrorPath</key>
  <string>$LOG_DIR/bridge-error.log</string>
  <key>ProcessType</key>
  <string>Background</string>
</dict>
</plist>
EOF

launchctl bootout "gui/$(id -u)" "$PLIST" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl kickstart -k "gui/$(id -u)/com.liquida.devicebridge"

echo "Liquida Bridge instalado e iniciado."
