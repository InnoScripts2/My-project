param(
    [Parameter(Mandatory = $true)][string]$ApiUrl,
    [Parameter(Mandatory = $true)][string]$InstanceId,
    [Parameter(Mandatory = $true)][string]$ApiToken,
    [int]$PollIntervalSec = 8,
    [int]$DefaultSessions = 5,
    [string]$AuthorName,
    [switch]$Once
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-ReceiveNotification {
    param([string]$Base, [string]$InstanceId, [string]$Token)
    $uri = "$Base/waInstance$InstanceId/ReceiveNotification/$Token"
    try { return Invoke-RestMethod -Method Get -Uri $uri -TimeoutSec 20 } catch { return $null }
}

function Invoke-DeleteNotification {
    param([string]$Base, [string]$InstanceId, [string]$Token, [string]$ReceiptId)
    if (-not $ReceiptId) { return }
    $uri = "$Base/waInstance$InstanceId/DeleteNotification/$Token/$ReceiptId"
    try { Invoke-RestMethod -Method Delete -Uri $uri -TimeoutSec 20 | Out-Null } catch { }
}

function Get-SessionsFromText {
    param([string]$text, [int]$fallback)
    if (-not $text) { return $fallback }
    $m = [regex]::Match($text, '(?i)полный\s+отч[её]т(?:\s+(\d+))?')
    if ($m.Success) {
        if ($m.Groups.Count -ge 2 -and $m.Groups[1].Value) {
            $n = 0
            if ([int]::TryParse($m.Groups[1].Value, [ref]$n) -and $n -gt 0) { return $n }
        }
        return $fallback
    }
    return $null
}

$base = $ApiUrl.TrimEnd('/')
if (-not $AuthorName -or $AuthorName -eq '') { $AuthorName = if ($env:REPORT_AUTHOR_NAME) { $env:REPORT_AUTHOR_NAME } else { 'Егор' } }

Write-Host ("[recv] Start polling Green-API for commands (instance=$InstanceId) …") -ForegroundColor Cyan

do {
    $notif = Invoke-ReceiveNotification -Base $base -InstanceId $InstanceId -Token $ApiToken
    if (-not $notif) {
        if ($Once) { break }
        Start-Sleep -Seconds $PollIntervalSec
        continue
    }

    $receiptId = $notif.receiptId
    $body = $notif.body
    $chatId = $body.senderData.chatId
    $typeMessage = $body.messageData.typeMessage
    $textMessage = $body.messageData.textMessageData.textMessage

    $handled = $false
    try {
        if ($typeMessage -eq 'textMessage' -and $textMessage) {
            $sessions = Get-SessionsFromText -text $textMessage -fallback $DefaultSessions
            if ($null -ne $sessions) {
                # Команда распознана: "полный отчёт [N]"
                Write-Host ("[recv] Command matched: 'полный отчёт' (sessions={0}) from {1}" -f $sessions, $chatId) -ForegroundColor Green
                $sendScript = Join-Path $PSScriptRoot 'send-last-sessions-report.ps1'
                pwsh -NoProfile -ExecutionPolicy Bypass -File $sendScript -Sessions $sessions -ApiUrl $ApiUrl -InstanceId $InstanceId -ApiToken $ApiToken -ChatId $chatId -AuthorName $AuthorName | Out-Null
            }
        }
    }
    catch {
        Write-Warning ("[recv] Handler error: {0}" -f $_.Exception.Message)
    }
    finally {
        # Всегда удаляем уведомление, чтобы не зависало в очереди
    }

    if ($Once) { break }
} while ($true)

Write-Host '[recv] Stop' -ForegroundColor Cyan
