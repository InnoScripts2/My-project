param(
    [string]$PfxPath,
    [int]$Port = 8080,
    [string]$PfxPass
)

$ErrorActionPreference = 'Stop'

# Find PFX if not provided
if (-not $PfxPath) {
    $candidate = Get-ChildItem -Path (Join-Path $PSScriptRoot '..\\..\\certs') -Filter *.pfx -File -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($candidate) { $PfxPath = $candidate.FullName }
}

if (-not $PfxPath -or -not (Test-Path -LiteralPath $PfxPath)) {
    Write-Error "PFX file not found. Provide -PfxPath or run generate-dev-cert.ps1 first."
}

$env:HTTPS_PFX = (Resolve-Path -LiteralPath $PfxPath).Path
Write-Host "[static:https] Using PFX: $($env:HTTPS_PFX)" -ForegroundColor Cyan

if ($PfxPass) {
    $env:HTTPS_PASSPHRASE = $PfxPass
    Write-Host "[static:https] Using PFX passphrase from param" -ForegroundColor DarkCyan
}

$env:PORT = "$Port"
$env:STATIC_PORT = "$Port"
Write-Host "[static:https] Serving on https://localhost:$Port" -ForegroundColor Green

node (Join-Path $PSScriptRoot 'dev-static.cjs')
