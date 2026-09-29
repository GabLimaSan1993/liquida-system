#!/bin/bash
set -euo pipefail

PAIR_CODE="${1:-}"
if [ -z "$PAIR_CODE" ]; then
  echo "Uso: ./install-macos.sh CODIGO_DE_PAREAMENTO"
  exit 1
fi

APP_DIR="$HOME/Library/Application Support/LiquidaBridge"
LOG_DIR="$HOME/Library/Logs/LiquidaBridge"
PLIST="$HOME/Library/LaunchAgents/com.liquida.devicebridge.plist"
TOOLS_DIR="$HOME/.liquida-tools"

mkdir -p "$APP_DIR" "$LOG_DIR" "$HOME/Library/LaunchAgents" "$TOOLS_DIR"

install_user_go() {
  local arch go_arch go_version go_url
  arch="$(uname -m)"
  case "$arch" in
    arm64) go_arch="arm64" ;;
    x86_64) go_arch="amd64" ;;
    *)
      echo "Arquitetura macOS não suportada automaticamente: $arch"
      exit 1
      ;;
  esac

  echo "Homebrew/Go não disponível. Instalando Go localmente em $TOOLS_DIR..."
  go_version="$(curl -fsSL 'https://go.dev/VERSION?m=text' | head -n 1)"
  if [ -z "$go_version" ]; then
    echo "Não foi possível descobrir a versão atual do Go."
    exit 1
  fi

  go_url="https://go.dev/dl/${go_version}.darwin-${go_arch}.tar.gz"
  rm -rf "$TOOLS_DIR/go"
  curl -fL "$go_url" -o "$TOOLS_DIR/go.tar.gz"
  tar -xzf "$TOOLS_DIR/go.tar.gz" -C "$TOOLS_DIR"
  rm -f "$TOOLS_DIR/go.tar.gz"
}

install_user_adb() {
  echo "ADB não disponível. Instalando Android Platform Tools localmente em $TOOLS_DIR..."
  rm -rf "$TOOLS_DIR/platform-tools"
  curl -fL "https://dl.google.com/android/repository/platform-tools-latest-darwin.zip" -o "$TOOLS_DIR/platform-tools.zip"
  /usr/bin/unzip -oq "$TOOLS_DIR/platform-tools.zip" -d "$TOOLS_DIR"
  rm -f "$TOOLS_DIR/platform-tools.zip"
}

if command -v brew >/dev/null 2>&1; then
  echo "Homebrew encontrado. Instalando/validando dependências..."
  brew list android-platform-tools >/dev/null 2>&1 || brew install --cask android-platform-tools
  brew list libimobiledevice >/dev/null 2>&1 || brew install libimobiledevice
  brew list go >/dev/null 2>&1 || brew install go
else
  echo "Homebrew não encontrado ou indisponível para este usuário."
  echo "Usando instalação local sem sudo para o primeiro teste Android."

  if ! command -v go >/dev/null 2>&1 && [ ! -x "$TOOLS_DIR/go/bin/go" ]; then
    install_user_go
  fi

  if ! command -v adb >/dev/null 2>&1 && [ ! -x "$TOOLS_DIR/platform-tools/adb" ]; then
    install_user_adb
  fi

  echo "iPhone/iPad: libimobiledevice não será instalado neste modo sem administrador."
  echo "Android: suporte completo via ADB local."
fi

LOCAL_PATH="$TOOLS_DIR/go/bin:$TOOLS_DIR/platform-tools:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
export PATH="$LOCAL_PATH"

if ! command -v go >/dev/null 2>&1; then
  echo "Go não ficou disponível após a instalação."
  exit 1
fi

if ! command -v adb >/dev/null 2>&1; then
  echo "ADB não ficou disponível após a instalação."
  exit 1
fi

echo "Go: $(go version)"
echo "ADB: $(adb version | head -n 1)"

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
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>$LOCAL_PATH</string>
  </dict>
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

echo "Liquida Bridge Multidevice instalado e iniciado. Capacidade: até 12 aparelhos simultâneos."
echo "Modo atual: Android habilitado. iOS depende de libimobiledevice/Homebrew."
