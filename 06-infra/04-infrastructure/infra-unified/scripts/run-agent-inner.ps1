param(
    [int]$Port = 7081
)

$ErrorActionPreference = 'Stop'

$agentRoot = "c:\Users\Alexsey\Desktop\My project\apps-unified\kiosk-agent"
$entry = Join-Path $agentRoot 'dist\main.js'
$logFile = Join-Path $agentRoot 'agent-dev.log'
$pidFile = Join-Path $agentRoot 'agent.pid'

if (-not (Test-Path $entry)) {
    Write-Host "Entry not found: $entry" -ForegroundColor Red
    Read-Host 'Press Enter to close'
    exit 1
}

$ts = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
# Ротация лога: переносим предыдущий лог, начинаем новый файл
if (Test-Path $logFile) {
    try { Move-Item -Path $logFile -Destination ($logFile + '.prev') -Force -ErrorAction Stop } catch { }
}
"=== agent start $ts (port=$Port) ===" | Out-File -FilePath $logFile -Encoding utf8 -Force

try {
    $node = (Get-Command node -ErrorAction Stop).Source
}
catch {
    Write-Host "Node.js not found in PATH" -ForegroundColor Red
    Read-Host 'Press Enter to close'
    exit 1
}

$env:AGENT_PORT = $Port
Write-Host "AGENT_PORT:" $env:AGENT_PORT
Write-Host "Starting node: $node $entry" -ForegroundColor Cyan
Write-Host "Logging to: $logFile"

# Сохраняем PID текущего pwsh-оболочки как маркер живости окна
try { "$PID" | Out-File -FilePath $pidFile -Encoding ascii -Force } catch { }

& $node "$entry" 2>&1 | Tee-Object -FilePath "$logFile" -Append
Write-Host "Agent exited with code" $LASTEXITCODE
try { if (Test-Path $pidFile) { Remove-Item $pidFile -Force } } catch { }
Read-Host 'Press Enter to close'
