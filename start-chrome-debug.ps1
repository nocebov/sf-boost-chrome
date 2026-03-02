# start-chrome-debug.ps1
# Запускає Chrome з увімкненим remote debugging і завантаженим розширенням SF Boost.
#
# Використання:
#   .\start-chrome-debug.ps1
#
# Після запуску:
#   1. Відкрий chrome://extensions та скопіюй ID розширення
#   2. Створи .env.local: EXTENSION_ID=<твій-id>
#   3. Тепер можеш використовувати: bun run build:reload

param(
  [int]$DebugPort = 9222,
  [string]$ProfileDir = "$env:TEMP\chrome-sf-boost-dev"
)

$BrowserPaths = @(
  "$env:ProgramFiles\BraveSoftware\Brave-Browser\Application\brave.exe",
  "$env:ProgramFiles(x86)\BraveSoftware\Brave-Browser\Application\brave.exe",
  "$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\Application\brave.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "$env:ProgramFiles(x86)\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)

$ChromeExe = $BrowserPaths | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $ChromeExe) {
  Write-Error "Brave або Chrome не знайдено. Встанови один з браузерів або вкажи шлях вручну."
  exit 1
}

$ExtPath = Join-Path $PSScriptRoot ".output\chrome-mv3"

if (-not (Test-Path $ExtPath)) {
  Write-Host "⚠️  Папка .output\chrome-mv3 не знайдена. Запускаємо збірку..." -ForegroundColor Yellow
  & bun run build
  if ($LASTEXITCODE -ne 0) {
    Write-Error "Збірка завершилась з помилкою."
    exit 1
  }
}

Write-Host ""
Write-Host "🚀 Запускаємо Chrome..." -ForegroundColor Cyan
Write-Host "   Debug port : $DebugPort" -ForegroundColor Gray
Write-Host "   Профіль    : $ProfileDir" -ForegroundColor Gray
Write-Host "   Розширення : $ExtPath" -ForegroundColor Gray
Write-Host ""
Write-Host "📋 Після запуску:" -ForegroundColor Yellow
Write-Host "   1. Відкрий chrome://extensions" -ForegroundColor Yellow
Write-Host "   2. Скопіюй ID розширення SF Boost" -ForegroundColor Yellow
Write-Host "   3. Створи .env.local та запиши: EXTENSION_ID=<id>" -ForegroundColor Yellow
Write-Host ""

Start-Process $ChromeExe -ArgumentList @(
  "--remote-debugging-port=$DebugPort",
  "--load-extension=$ExtPath",
  "--user-data-dir=$ProfileDir"
)

Write-Host "✅ Chrome запущено!" -ForegroundColor Green
