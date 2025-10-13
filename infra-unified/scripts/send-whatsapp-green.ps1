param(
    [Parameter(Mandatory = $true)][string]$ApiUrl,
    [Parameter(Mandatory = $true)][string]$InstanceId,
    [Parameter(Mandatory = $true)][string]$ApiToken,
    [string]$ChatId,
    [string]$To,
    [string]$Text,
    [string]$File
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $ChatId) {
    if (-not $To) { throw "Provide -ChatId or -To" }
    $digits = ($To -replace '\D', '')
    if (-not $digits) { throw "Invalid -To phone" }
    $ChatId = "$digits@c.us"
}

if (-not $Text -and $File) {
    try {
        $content = Get-Content -Path $File -Raw -ErrorAction Stop
        $limit = 3900
        if ($content.Length -gt $limit) { $Text = $content.Substring(0, $limit) + "`n…" } else { $Text = $content }
    }
    catch {
        $Text = "Не удалось прочитать файл отчёта: $([System.IO.Path]::GetFileName($File))"
    }
}
elseif ($Text -and $File) {
    # Combine summary header and file content under it within WhatsApp text limit
    try {
        $content = Get-Content -Path $File -Raw -ErrorAction Stop
    }
    catch {
        $content = "(не удалось прочитать файл отчёта)"
    }
    $limit = 3900
    $header = ($Text.TrimEnd()) + "`n`n"
    $remaining = [Math]::Max(0, $limit - $header.Length)
    if ($content.Length -gt $remaining) {
        $Text = $header + $content.Substring(0, $remaining) + "`n…"
    }
    else {
        $Text = $header + $content
    }
}
if (-not $Text) { throw "Nothing to send: provide -Text or -File" }

$base = $ApiUrl.TrimEnd('/')
$uri = "$base/waInstance$InstanceId/sendMessage/$ApiToken"
$payload = @{ chatId = $ChatId; message = $Text; linkPreview = $true; typePreview = 'small' }
$json = $payload | ConvertTo-Json -Depth 5

try {
    $resp = Invoke-RestMethod -Method Post -Uri $uri -ContentType 'application/json' -Body $json -TimeoutSec 20
    $id = $resp.idMessage
    Write-Output (ConvertTo-Json @{ ok = $true; provider = 'green'; chatId = $ChatId; id = $id; raw = $resp })
}
catch {
    $err = $_.Exception.Message
    if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $err = $_.ErrorDetails.Message }
    Write-Error "Green-API error: $err"
    exit 1
}
