param(
    [int]$AgentPort = 7070,
    [int]$StaticPort = 8080,
    [switch]$Open,
    [switch]$Https,
    [string]$PfxPath,
    [string]$PfxPass
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

# Compute repo root: two levels up from current script directory
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

# Resolve npm path (npm.cmd on Windows, fallback to npm)
$npmPath = "npm.cmd"
try { $null = Get-Command npm.cmd -ErrorAction Stop } catch { $npmPath = "npm" }

# Load .env files (root and agent-specific). Existing environment variables take precedence.
function Import-Dotenv {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return }
    $lines = Get-Content -LiteralPath $Path
    foreach ($line in $lines) {
        $t = ($line -as [string]).Trim()
        if (-not $t -or $t.StartsWith('#')) { continue }
        $eq = $t.IndexOf('=')
        if ($eq -lt 1) { continue }
        $key = $t.Substring(0, $eq).Trim()
        $val = $t.Substring($eq + 1).Trim()
        if ($val.StartsWith('"') -and $val.EndsWith('"')) { $val = $val.Substring(1, $val.Length - 2) }
        elseif ($val.StartsWith("'") -and $val.EndsWith("'")) { $val = $val.Substring(1, $val.Length - 2) }
        if ([string]::IsNullOrWhiteSpace($key)) { continue }
        $current = [System.Environment]::GetEnvironmentVariable($key, 'Process')
        if ([string]::IsNullOrEmpty($current)) {
            [System.Environment]::SetEnvironmentVariable($key, $val, 'Process')
        }
    }
}

Import-Dotenv -Path (Join-Path $repoRoot '.env')
Import-Dotenv -Path (Join-Path $repoRoot '.env.local')
Import-Dotenv -Path (Join-Path $repoRoot 'apps/kiosk-agent/.env')
Import-Dotenv -Path (Join-Path $repoRoot 'apps/kiosk-agent/.env.local')

# Helper: check if TCP port is in use (quiet, no Test-NetConnection noise)
function Test-PortInUse {
    param([int]$Port)
    try {
        $client = New-Object System.Net.Sockets.TcpClient
        $client.Connect('127.0.0.1', $Port)
        $client.Close()
        return $true
    }
    catch { return $false }
}

# Pick a free port for static server starting from requested $StaticPort
$desiredStatic = $StaticPort
for ($i = 0; $i -lt 10 -and (Test-PortInUse -Port $desiredStatic); $i++) { $desiredStatic++ }
$StaticPort = $desiredStatic

# If AGENT_PORT is provided via env/.env, prefer it over default param
if ($env:AGENT_PORT) {
    try { $AgentPort = [int]$env:AGENT_PORT } catch { }
}

Write-Host "Starting agent on :$AgentPort and static server on :$StaticPort" -ForegroundColor Cyan

# Optional HTTPS for static server: set env for dev-static.cjs
$staticScheme = 'http'
if ($Https) {
    if (-not $PfxPath -and -not $env:HTTPS_PFX) {
        $certsDir = Join-Path $repoRoot 'certs'
        if (Test-Path -LiteralPath $certsDir) {
            $candidate = Get-ChildItem -Path $certsDir -Filter *.pfx -File -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($candidate) { $PfxPath = $candidate.FullName }
        }
    }
    if (-not $env:HTTPS_PFX -and $PfxPath) {
        $env:HTTPS_PFX = (Resolve-Path -LiteralPath $PfxPath).Path
    }
    # propagate passphrase if provided and not already set via env/.env
    if ($PfxPass -and -not $env:HTTPS_PASSPHRASE) {
        $env:HTTPS_PASSPHRASE = $PfxPass
    }
    $hasPfx = ($env:HTTPS_PFX -and (Test-Path -LiteralPath $env:HTTPS_PFX))
    $hasPem = ($env:HTTPS_CERT -and $env:HTTPS_KEY -and (Test-Path -LiteralPath $env:HTTPS_CERT) -and (Test-Path -LiteralPath $env:HTTPS_KEY))
    if ($hasPfx) {
        Write-Host "[static] HTTPS enabled with PFX: $($env:HTTPS_PFX)" -ForegroundColor Cyan
        if ($env:HTTPS_PASSPHRASE) { Write-Host "[static] Using PFX passphrase from env" -ForegroundColor DarkCyan }
        $staticScheme = 'https'
    }
    elseif ($hasPem) {
        Write-Host "[static] HTTPS enabled with PEM cert/key" -ForegroundColor Cyan
        $staticScheme = 'https'
    }
    else {
        Write-Warning "HTTPS requested but no PFX found. Falling back to HTTP. You can generate one via infra/scripts/generate-dev-cert.ps1"
    }
}

# Start agent (it will auto-increment its port on conflict). Provide AGENT_PORT env var to avoid clashing with static PORT
$env:AGENT_PORT = "$AgentPort"
$agent = Start-Process -PassThru -NoNewWindow -FilePath $npmPath -ArgumentList @("--prefix", "apps/kiosk-agent", "run", "dev") -WorkingDirectory $repoRoot

# Pass port for static server; dev-static.cjs reads PORT
$env:STATIC_PORT = "$StaticPort"
$env:PORT = "$StaticPort"
$static = Start-Process -PassThru -NoNewWindow -FilePath node -ArgumentList @("infra/scripts/dev-static.cjs") -WorkingDirectory $repoRoot

# Poll for agent readiness (listening http). Agent may bump port if initial is busy.
function Wait-AgentReady {
    param([int]$StartPort, [int]$MaxAttempts = 80, [int]$Range = 10)
    for ($i = 0; $i -lt $MaxAttempts; $i++) {
        for ($p = $StartPort; $p -le ($StartPort + $Range); $p++) {
            # Fast TCP readiness check
            try {
                $tcp = New-Object System.Net.Sockets.TcpClient
                $iar = $tcp.BeginConnect('127.0.0.1', $p, $null, $null)
                if ($iar.AsyncWaitHandle.WaitOne(500)) {
                    $tcp.EndConnect($iar)
                    $tcp.Close(); return $p
                }
                $tcp.Close()
            }
            catch { }
            # HTTP endpoint (optional)
            try {
                $resp = Invoke-WebRequest -Method Get -Uri ("http://127.0.0.1:{0}/devices/status" -f $p) -TimeoutSec 2
                if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 500) { return $p }
            }
            catch { }
        }
        Start-Sleep -Milliseconds 250
    }
    return $null
}

$finalAgentPort = Wait-AgentReady -StartPort $AgentPort
if ($finalAgentPort) {
    Write-Host "[ready] agent:  http://localhost:$finalAgentPort" -ForegroundColor Green
    Write-Host "[ready] static: ${staticScheme}://localhost:$StaticPort" -ForegroundColor Green
}
else {
    Write-Warning "Agent did not become ready within timeout. Check agent logs in the terminal running 'npm --prefix apps/kiosk-agent run dev'"
}

if ($Open) {
    $url = "${staticScheme}://localhost:$StaticPort/?dev=1"
    Write-Host "Opening $url" -ForegroundColor Green
    Start-Process $url | Out-Null
}

Write-Host "Press Ctrl+C to stop. Or close this window." -ForegroundColor Yellow

try {
    while ($true) {
        if ($agent.HasExited -or $static.HasExited) {
            Write-Warning "One of the processes exited. Stopping..."
            break
        }
        Start-Sleep -Seconds 1
    }
}
finally {
    if ($agent -and !$agent.HasExited) { try { $agent.Kill() } catch {} }
    if ($static -and !$static.HasExited) { try { $static.Kill() } catch {} }
}
