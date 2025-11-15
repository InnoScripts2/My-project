param(
    [int]$Port = 7081,
    [ValidateSet('dist', 'dev')][string]$Mode = 'dist'
)

$ErrorActionPreference = 'Stop'

Write-Host "Starting kiosk-agent on port $Port (mode: $Mode) in new window..."

$agentRoot = "c:\Users\Alexsey\Desktop\My project\apps-unified\kiosk-agent"
$entry = Join-Path $agentRoot 'dist\main.js'

if ($Mode -eq 'dist') {
    if (-not (Test-Path $entry)) {
        Write-Host "Building dist..."
        npm --prefix $agentRoot run build | Out-Null
    }
    $innerScript = "c:\Users\Alexsey\Desktop\My project\infra-unified\scripts\run-agent-inner.ps1"
    Start-Process -FilePath "pwsh.exe" -ArgumentList @('-NoProfile', '-NoLogo', '-File', $innerScript, '-Port', $Port) -WorkingDirectory $agentRoot -WindowStyle Normal
}
else {
    $inner = "$env:AGENT_PORT=$Port; npm run dev --workspace=apps-unified/kiosk-agent; Write-Host 'Dev exited with code' $LASTEXITCODE; Read-Host 'Press Enter to close'"
    Start-Process -FilePath "pwsh.exe" -ArgumentList @('-NoProfile', '-NoLogo', '-Command', $inner) -WorkingDirectory $agentRoot -WindowStyle Normal
}

Write-Host "Launched. Use http://127.0.0.1:$Port/api/health to verify."
