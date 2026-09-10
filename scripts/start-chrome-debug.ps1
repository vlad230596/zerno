# Запускает Chrome for Testing с отдельным профилем и открытым CDP-портом,
# чтобы в нём можно было авторизоваться в Дзен-мани и работать с данными
# из агента (scripts/cdp.mjs).
#
#   pwsh scripts/start-chrome-debug.ps1
#
# Профиль живёт в %LOCALAPPDATA%\zerro\chrome-profile — вне репозитория,
# иначе вотчер vite падает на временных файлах Chrome.
# Порт 9222 — у CashFlow свой, 9223, чтобы не пересекались.

param(
    [int]$DebugPort = 9222,
    [string]$StartUrl = 'http://localhost:3000',
    [string]$BrowserExecutable,
    # Профиль намеренно вне репозитория: вотчер vite лезет в любую папку
    # внутри проекта и падает с EBUSY на временных файлах Chrome.
    [string]$ProfileDirectory = "$env:LOCALAPPDATA\zerro\chrome-profile"
)

if (-not $BrowserExecutable) {
    $candidates = @(
        'D:\Projects\CashFlow\app\.local\browsers\chrome\win64-152.0.7977.64\chrome-win64\chrome.exe'
        "$env:LOCALAPPDATA\Google\Chrome for Testing\Application\chrome.exe"
        'C:\Program Files\Google\Chrome for Testing\Application\chrome.exe'
    )
    $BrowserExecutable = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
}

if (-not $BrowserExecutable) {
    throw 'Chrome for Testing не найден. Укажи путь через -BrowserExecutable.'
}

$profileDirectory = $ProfileDirectory
New-Item -ItemType Directory -Force -Path $profileDirectory | Out-Null

$arguments = @(
    "--user-data-dir=$profileDirectory"
    '--profile-directory=Default'
    "--remote-debugging-port=$DebugPort"
    '--remote-debugging-address=127.0.0.1'
    '--no-first-run'
    '--no-default-browser-check'
    $StartUrl
)

Start-Process -FilePath $BrowserExecutable -ArgumentList $arguments

$debugEndpoint = "http://127.0.0.1:$DebugPort/json/version"
$chromeReady = $false
for ($attempt = 0; $attempt -lt 40; $attempt++) {
    try {
        $null = Invoke-RestMethod -Uri $debugEndpoint -TimeoutSec 1
        $chromeReady = $true
        break
    }
    catch {
        Start-Sleep -Milliseconds 250
    }
}

if (-not $chromeReady) {
    throw "Chrome не поднял DevTools на $debugEndpoint"
}

Write-Output "Chrome for Testing запущен: $BrowserExecutable"
Write-Output "CDP: http://127.0.0.1:$DebugPort"
Write-Output "Профиль: $profileDirectory"
