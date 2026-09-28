param(
  [Parameter(Mandatory=$true, Position=0)]
  [string]$PairCode
)

$ErrorActionPreference = "Stop"

function Ensure-WingetPackage($Id, $CommandName, $FallbackPath = $null) {
  if (Get-Command $CommandName -ErrorAction SilentlyContinue) { return }
  if ($FallbackPath -and (Test-Path $FallbackPath)) { return }
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    throw "winget não encontrado. Instale/atualize o App Installer da Microsoft Store."
  }
  Write-Host "Instalando $Id..."
  winget install -e --id $Id --silent --accept-package-agreements --accept-source-agreements
}

Ensure-WingetPackage "Google.PlatformTools" "adb"
Ensure-WingetPackage "GoLang.Go" "go" "C:\Program Files\Go\bin\go.exe"

$WinGetLinks = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Links"
if (Test-Path $WinGetLinks) {
  $env:Path = "$WinGetLinks;$env:Path"
}

$GoExe = (Get-Command go -ErrorAction SilentlyContinue).Source
if (-not $GoExe) { $GoExe = "C:\Program Files\Go\bin\go.exe" }
if (-not (Test-Path $GoExe)) {
  throw "Go foi instalado, mas ainda não foi localizado. Feche e abra o PowerShell e execute novamente."
}

$AppDir = Join-Path $env:LOCALAPPDATA "LiquidaBridge"
New-Item -ItemType Directory -Force -Path $AppDir | Out-Null
$Exe = Join-Path $AppDir "liquida-device-bridge.exe"

& $GoExe build -trimpath -ldflags "-s -w" -o $Exe .
& $Exe --pair $PairCode

$Startup = [Environment]::GetFolderPath("Startup")
$ShortcutPath = Join-Path $Startup "Liquida Device Bridge.lnk"
$Shell = New-Object -ComObject WScript.Shell
$Shortcut = $Shell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $Exe
$Shortcut.WorkingDirectory = $AppDir
$Shortcut.WindowStyle = 7
$Shortcut.Save()

Get-Process "liquida-device-bridge" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Process -FilePath $Exe -WorkingDirectory $AppDir -WindowStyle Hidden

Write-Host ""
Write-Host "Liquida Bridge Multidevice instalado. Capacidade: até 12 aparelhos simultâneos."
Write-Host "Android: pronto via ADB. Ative Depuração USB e autorize este computador."
if (-not (Get-Command idevice_id -ErrorAction SilentlyContinue)) {
  Write-Warning "libimobiledevice não encontrado. Android está pronto; para iPhone no Windows instale os drivers Apple e libimobiledevice, ou use macOS."
} else {
  Write-Host "iPhone/iPad: libimobiledevice detectado."
}
