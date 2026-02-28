$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Resolve-Path (Join-Path $ScriptDir "..\\..\\..")
$TemplatePath = Join-Path $ScriptDir "ai_proxy.server_launcher.json.template"
$OutputManifestPath = Join-Path $ScriptDir "ai_proxy.server_launcher.json"
$HostScriptPath = Join-Path $ScriptDir "host.js"
$HostLauncherPath = Join-Path $ScriptDir "host.cmd"

if (-not (Test-Path $TemplatePath)) {
  throw "Template not found: $TemplatePath"
}

if (-not $env:AI_PROXY_EXTENSION_ID) {
  throw "Please set AI_PROXY_EXTENSION_ID before running this script."
}

$NodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (-not $NodeCommand) {
  throw "Node.js was not found in PATH. Please install Node.js first."
}

$NodePath = $NodeCommand.Source
$launcherContent = @(
  "@echo off"
  "`"$NodePath`" `"$HostScriptPath`""
) -join "`r`n"
Set-Content -Path $HostLauncherPath -Value $launcherContent -Encoding ASCII

$escapedLauncherPath = $HostLauncherPath.Replace("\", "\\")
$manifest = Get-Content $TemplatePath -Raw
$manifest = $manifest.Replace("REPLACE_WITH_HOST_LAUNCHER_PATH", $escapedLauncherPath)
$manifest = $manifest.Replace("REPLACE_WITH_YOUR_EXTENSION_ID", $env:AI_PROXY_EXTENSION_ID)
Set-Content -Path $OutputManifestPath -Value $manifest -Encoding UTF8

$registryPath = "HKCU:\\Software\\Google\\Chrome\\NativeMessagingHosts\\ai_proxy.server_launcher"
New-Item -Path $registryPath -Force | Out-Null
Set-ItemProperty -Path $registryPath -Name "(Default)" -Value $OutputManifestPath

Write-Host "Installed native host manifest:"
Write-Host "  $OutputManifestPath"
Write-Host "Host launcher:"
Write-Host "  $HostLauncherPath"
Write-Host "Registry key:"
Write-Host "  $registryPath"
Write-Host ""
Write-Host "Tip: set environment variable AI_PROXY_PROJECT_DIR to your repo path:"
Write-Host "  $ProjectRoot"
