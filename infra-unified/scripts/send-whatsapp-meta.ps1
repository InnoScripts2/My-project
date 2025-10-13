param(
    [Parameter(Mandatory = $true)][string]$Token,
    [Parameter(Mandatory = $true)][string]$PhoneId,
    [Parameter(Mandatory = $true)][string]$To,
    [string]$Text,
    [string]$File
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$uri = "https://graph.facebook.com/v20.0/$($PhoneId)/messages"
$headers = @{ Authorization = "Bearer $Token" }

# Подготовка текста: либо из параметра, либо из файла (с усечением)
if (-not $Text -and $File) {
    try {
        $content = Get-Content -Path $File -Raw -ErrorAction Stop
        $limit = 3900
        if ($content.Length -gt $limit) {
            $Text = $content.Substring(0, $limit) + "`n…"
        }
        else {
            $Text = $content
        }
    }
    catch {
        $Text = "Не удалось прочитать файл отчёта: $([System.IO.Path]::GetFileName($File))"
    }
}
elseif ($Text -and $File) {
    try { $content = Get-Content -Path $File -Raw -ErrorAction Stop } catch { $content = "(failed to read report file)" }
    $limit = 3900
    $header = ($Text.TrimEnd()) + "`n`n"
    $remaining = [Math]::Max(0, $limit - $header.Length)
    if ($content.Length -gt $remaining) { $Text = $header + $content.Substring(0, $remaining) + "`n…" } else { $Text = $header + $content }
}
if (-not $Text) { throw "Nothing to send: provide -Text or -File" }

# Готовим тело запроса
$bodyObj = @{
    messaging_product = 'whatsapp'
    to                = $To
    type              = 'text'
    text              = @{ body = $Text }
}
$json = $bodyObj | ConvertTo-Json -Depth 5

try {
    $resp = Invoke-RestMethod -Method Post -Uri $uri -Headers $headers -ContentType 'application/json' -Body $json -TimeoutSec 20
    $id = $resp.messages[0].id
    if ($id) {
        Write-Output (ConvertTo-Json @{ ok = $true; provider = 'meta'; to = $To; id = $id })
    }
    else {
        Write-Output (ConvertTo-Json @{ ok = $true; provider = 'meta'; to = $To; raw = $resp })
    }
}
catch {
    $err = $_.Exception.Message
    if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $err = $_.ErrorDetails.Message }
    Write-Error "WhatsApp API error: $err"
    exit 1
}
