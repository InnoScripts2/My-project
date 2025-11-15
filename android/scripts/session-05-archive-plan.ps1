#[CmdletBinding()]
param(
    [switch]$Execute
)

$ErrorActionPreference = 'Stop'

Write-Warning 'Скрипт перенесён в android/tools/session-05-archive-plan.ps1'

$forwardScript = Join-Path $PSScriptRoot '..\tools\session-05-archive-plan.ps1'

if (-not (Test-Path -LiteralPath $forwardScript)) {
    throw "Не найден целевой скрипт: $forwardScript"
}

& $forwardScript @PSBoundParameters
