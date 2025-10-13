param(
  [string]$WebhookUrl = $env:N8N_WEBHOOK_URL,
  [string]$WhatsappPhone = $env:WHATSAPP_PHONE
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $WebhookUrl) {
  $WebhookUrl = "https://innoservice.app.n8n.cloud/webhook-test/a5ff1e72-7e5c-47c5-8c5e-64e9c4537f52"
}

Write-Host "[auto] Trigger n8n webhook: $WebhookUrl" -ForegroundColor Cyan
try {
  $resp = Invoke-WebRequest -UseBasicParsing -Method GET -Uri $WebhookUrl -TimeoutSec 10
  Write-Host ("[auto] n8n status: {0}" -f $resp.StatusCode)
}
catch {
  Write-Warning ("[auto] n8n call failed: {0}" -f $_.Exception.Message)
}

Write-Host "[auto] Generate repo change report" -ForegroundColor Cyan
$node = (Get-Command node -ErrorAction SilentlyContinue)
if (-not $node) { throw "node is required" }

$script = Join-Path $PSScriptRoot 'repo-change-report.cjs'
$env:JSON = '1'
$json = node $script | Out-String
Remove-Item Env:JSON -ErrorAction SilentlyContinue

try { $report = $json | ConvertFrom-Json } catch { $report = $null }
if (-not $report) { throw "Failed to build change report" }
Write-Host ("[auto] Report ready: {0}" -f $report.path) -ForegroundColor Green

# Сформируем понятную, «человеческую» сводку (без тех. терминов и упоминаний ИИ/копилота)
$when = Get-Date -Format "dd.MM.yyyy HH:mm"
$total = if ($report.files) { [int]$report.files } else { $null }
$added = if ($report.added) { [int]$report.added } else { 0 }
$modified = if ($report.modified) { [int]$report.modified } else { 0 }
$deleted = if ($report.deleted) { [int]$report.deleted } else { 0 }
$insertions = if ($report.insertions) { [int]$report.insertions } else { 0 }
$deletions = if ($report.deletions) { [int]$report.deletions } else { 0 }
$linesChanged = $insertions + $deletions
$subject = $report.subject
# Устанавливаем человека-отправителя для понятности: по умолчанию «Егор», можно переопределить через REPORT_AUTHOR_NAME
$who = if ($env:REPORT_AUTHOR_NAME) { $env:REPORT_AUTHOR_NAME } else { 'Егор' }
$lines = @()
$lines += 'Короткий отчёт об обновлении проекта'
$lines += "Когда: $when"
if ($subject) { $lines += "Описание: $subject" }
if ($who) { $lines += "Кто сделал: $who" }
if ($null -ne $total) { $lines += "Что изменилось: добавили $added, обновили $modified, удалили $deleted. Всего затронуто: $total файл(ов)." }
$lines += "Объём правок: $linesChanged строк."
$lines += 'Если потребуется пояснение, просто ответьте на это сообщение.'
$summaryText = ($lines -join "`n")

# Правило отправки: каждые 3 сессии ИЛИ раньше, если объём правок превысил случайный порог 500–1000 строк
$stateFile = Join-Path $PSScriptRoot 'notify-state.json'
$sessionCount = 0
try {
  if (Test-Path $stateFile) {
    $st = Get-Content -Path $stateFile -Raw | ConvertFrom-Json
    if ($st -and $st.sessionCount -is [int]) { $sessionCount = [int]$st.sessionCount }
  }
}
catch { $sessionCount = 0 }

$sessionCount++  # текущая сессия
$randThreshold = Get-Random -Minimum 500 -Maximum 1001  # верхняя граница эксклюзивна
$shouldSendNow = $false
$triggerReason = ''
if ($linesChanged -ge $randThreshold) { $shouldSendNow = $true; $triggerReason = "bulk($linesChanged≥$randThreshold)" }
elseif ($sessionCount -ge 3) { $shouldSendNow = $true; $triggerReason = "every_3_sessions($sessionCount)" }

# Доп. триггер: если это merge-коммит в главную ветку и объём 500–1000 строк, отправляем отчёт
$defaultBranch = $env:DEFAULT_BRANCH
if (-not $defaultBranch -or $defaultBranch -eq '') { $defaultBranch = 'main' }
$isTargetMain = $report.branch -eq $defaultBranch
$isMerge = $report.isMerge -eq $true
if (-not $shouldSendNow -and $isTargetMain -and $isMerge -and $linesChanged -ge 500 -and $linesChanged -le 1000) {
  $shouldSendNow = $true
  $triggerReason = "merge_to_${defaultBranch}($linesChanged)"
}

if (-not $shouldSendNow) {
  # Сохраняем счётчик и выходим без отправки
  try { @{ sessionCount = $sessionCount } | ConvertTo-Json | Set-Content -Path $stateFile -Encoding utf8 -NoNewline } catch {}
  Write-Host ("[auto] Skip send: session {0}/3, lines {1} < random {2}" -f $sessionCount, $linesChanged, $randThreshold) -ForegroundColor Yellow
  exit 0
}

# Отправка в WhatsApp — 2 режима:
# 1) Прямо через WhatsApp Cloud API (если заданы WHATSAPP_TOKEN и WHATSAPP_PHONE_ID)
# 2) Через n8n (как было ранее), если токенов нет

if ($WhatsappPhone) {
  $hasDirect = ($env:WHATSAPP_TOKEN -and $env:WHATSAPP_PHONE_ID) -or ($env:META_WHATSAPP_TOKEN -and $env:META_WHATSAPP_PHONE_ID) -or ($env:GREEN_API_URL -and $env:GREEN_INSTANCE_ID -and $env:GREEN_API_TOKEN)
  if ($hasDirect) {
    Write-Host "[auto] Send WhatsApp via provider to $WhatsappPhone" -ForegroundColor Cyan
    try {
      if ($env:GREEN_API_URL -and $env:GREEN_INSTANCE_ID -and $env:GREEN_API_TOKEN) {
        # Prefer Green-API via PowerShell (proxy-friendly)
        $greenScript = Join-Path $PSScriptRoot 'send-whatsapp-green.ps1'
        if ($env:GREEN_CHAT_ID) {
          pwsh -NoProfile -ExecutionPolicy Bypass -File $greenScript -ApiUrl $env:GREEN_API_URL -InstanceId $env:GREEN_INSTANCE_ID -ApiToken $env:GREEN_API_TOKEN -ChatId $env:GREEN_CHAT_ID -Text $summaryText -File $report.path | Out-Null
        }
        else {
          pwsh -NoProfile -ExecutionPolicy Bypass -File $greenScript -ApiUrl $env:GREEN_API_URL -InstanceId $env:GREEN_INSTANCE_ID -ApiToken $env:GREEN_API_TOKEN -To $WhatsappPhone -Text $summaryText -File $report.path | Out-Null
        }
      }
      else {
        # Meta Cloud API via PowerShell
        $metaScript = Join-Path $PSScriptRoot 'send-whatsapp-meta.ps1'
        $metaToken = if ($env:WHATSAPP_TOKEN) { $env:WHATSAPP_TOKEN } elseif ($env:META_WHATSAPP_TOKEN) { $env:META_WHATSAPP_TOKEN } else { $null }
        $metaPhoneId = if ($env:WHATSAPP_PHONE_ID) { $env:WHATSAPP_PHONE_ID } elseif ($env:META_WHATSAPP_PHONE_ID) { $env:META_WHATSAPP_PHONE_ID } else { $null }
        if (-not $metaToken -or -not $metaPhoneId) { throw "Meta credentials are not set" }
        pwsh -NoProfile -ExecutionPolicy Bypass -File $metaScript -Token $metaToken -PhoneId $metaPhoneId -To $WhatsappPhone -Text $summaryText -File $report.path | Out-Null
      }
      Write-Host "[auto] WhatsApp message sent" -ForegroundColor Green
      # Сброс счётчика после успешной отправки
      try { @{ sessionCount = 0; lastReason = $triggerReason; lastLines = $linesChanged } | ConvertTo-Json | Set-Content -Path $stateFile -Encoding utf8 -NoNewline } catch {}
    }
    catch {
      Write-Warning ("[auto] WhatsApp Cloud API failed: {0}" -f $_.Exception.Message)
    }
  }
  else {
    # Fallback: через n8n
    $waUrl = "$WebhookUrl?event=repo_changes&phone=$WhatsappPhone&reportPath=$([Uri]::EscapeDataString($report.path))"
    Write-Host "[auto] Notify WhatsApp via n8n: $WhatsappPhone" -ForegroundColor Cyan
    try {
      $resp2 = Invoke-WebRequest -UseBasicParsing -Method GET -Uri $waUrl -TimeoutSec 10
      Write-Host ("[auto] WhatsApp trigger status: {0}" -f $resp2.StatusCode)
      # Сброс счётчика после успешной отправки
      try { @{ sessionCount = 0; lastReason = $triggerReason; lastLines = $linesChanged } | ConvertTo-Json | Set-Content -Path $stateFile -Encoding utf8 -NoNewline } catch {}
    }
    catch {
      Write-Warning ("[auto] WhatsApp trigger failed: {0}" -f $_.Exception.Message)
    }
  }
}
else {
  Write-Host "[auto] WHATSAPP_PHONE not set — skipping WhatsApp notification" -ForegroundColor Yellow
}

exit 0
