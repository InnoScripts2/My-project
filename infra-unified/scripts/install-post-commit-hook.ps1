param(
    [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path $PSScriptRoot -Parent -Parent
$hooksDir = Join-Path $repoRoot '.git' 'hooks'
if (-not (Test-Path -LiteralPath $hooksDir)) { throw ".git/hooks not found. Run inside git repo." }

$hook = @'
#!/usr/bin/env pwsh
try {
  pwsh -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot/post-commit-automation.ps1"
  exit $LASTEXITCODE
} catch {
  Write-Error $_
  exit 1
}
'@

$target = Join-Path $hooksDir 'post-commit'
if ((Test-Path -LiteralPath $target) -and -not $Force) {
    Write-Host "post-commit already exists. Use -Force to overwrite." -ForegroundColor Yellow
    exit 0
}
Set-Content -LiteralPath $target -Value $hook -Encoding UTF8
Write-Host "Installed post-commit hook at $target" -ForegroundColor Green
