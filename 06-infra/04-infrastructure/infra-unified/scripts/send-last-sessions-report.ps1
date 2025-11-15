param(
    [int]$Sessions = 5,
    [Parameter(Mandatory = $true)][string]$ApiUrl,
    [Parameter(Mandatory = $true)][string]$InstanceId,
    [Parameter(Mandatory = $true)][string]$ApiToken,
    [string]$ChatId,
    [string]$To,
    [string]$AuthorName = 'Егор'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$scriptsRoot = $PSScriptRoot
$reportScript = Join-Path $scriptsRoot 'repo-change-report.cjs'

$node = (Get-Command node -ErrorAction SilentlyContinue)
if (-not $node) { throw 'node is required' }

if (-not $ChatId) {
    if (-not $To) { throw 'Provide -ChatId or -To' }
    $digits = ($To -replace '\D', '')
    if (-not $digits) { throw 'Invalid -To phone' }
    $ChatId = "$digits@c.us"
}

if ($Sessions -lt 1) { $Sessions = 1 }

Write-Host ("[send-last] Build report for last {0} changes" -f $Sessions) -ForegroundColor Cyan
$env:JSON = '1'
$json = node $reportScript --prev=("HEAD~{0}" -f $Sessions) | Out-String
Remove-Item Env:JSON -ErrorAction SilentlyContinue

try { $rep = $json | ConvertFrom-Json } catch { $rep = $null }
if (-not $rep) { throw 'Failed to build change report' }

$when = Get-Date -Format 'dd.MM.yyyy HH:mm'
$ins = if ($rep.insertions) { [int]$rep.insertions } else { 0 }
$del = if ($rep.deletions) { [int]$rep.deletions } else { 0 }
$linesChanged = $ins + $del
$total = if ($rep.files) { [int]$rep.files } else { 0 }

$lines = @()
$lines += 'Короткий отчёт об обновлении проекта'
$lines += "Когда: $when"
$lines += ("Охват: последние {0} изменений" -f $Sessions)
if ($rep.subject) { $lines += ("Описание: {0}" -f $rep.subject) }
if ($AuthorName) { $lines += ("Кто сделал: {0}" -f $AuthorName) }
if ($null -ne $total) { $lines += ("Что изменилось: добавили {0}, обновили {1}, удалили {2}. Всего затронуто: {3} файл(ов)." -f $rep.added, $rep.modified, $rep.deleted, $rep.files) }
$lines += ("Объём правок: {0} строк." -f $linesChanged)
$lines += 'Если потребуется пояснение, просто ответьте на это сообщение.'
$text = [string]::Join([Environment]::NewLine, $lines)

$senderScript = Join-Path $scriptsRoot 'send-whatsapp-green.ps1'
Write-Host ("[send-last] Send to {0}" -f $ChatId) -ForegroundColor Cyan
& $senderScript -ApiUrl $ApiUrl -InstanceId $InstanceId -ApiToken $ApiToken -ChatId $ChatId -Text $text -File $rep.path | Out-Null
Write-Host '[send-last] Done' -ForegroundColor Green
