param(
  [ValidateSet('bootstrap', 'start-agent', 'health', 'start-admin', 'summarize', 'auto', 'ai')]
  [string]$Phase = 'bootstrap',
  [int]$Port = 7081
)

$ErrorActionPreference = 'Stop'

$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$agentRoot = Join-Path $root 'apps-unified\kiosk-agent'
$adminRoot = Join-Path $root 'apps-unified\kiosk-admin'
$scriptsRoot = Join-Path $root 'infra-unified\scripts'
$outbox = Join-Path $root 'outbox'
if (-not (Test-Path $outbox)) { New-Item -ItemType Directory -Path $outbox | Out-Null }

function Write-NextPrompt([string]$text) {
  $file = Join-Path $outbox 'copilot-next-prompt.txt'
  $text | Set-Content -Path $file -Encoding UTF8
  Write-Host "Next prompt saved to: $file"
}

function Write-MicroPrompts([string[]]$lines) {
  $file = Join-Path $outbox 'copilot-micro-prompts.txt'
  $content = $lines -join "`n"
  $content | Set-Content -Path $file -Encoding UTF8
  Write-Host "Micro-prompts saved to: $file"
}

function Test-PortListening([int]$p) {
  try {
    $c = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction Stop
    return $c
  }
  catch { return $null }
}

function Test-Http([string]$url, [int]$timeout = 5) {
  try {
    $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec $timeout -Uri $url
    return @{ ok = ($r.StatusCode -ge 200 -and $r.StatusCode -lt 300); code = $r.StatusCode; body = $r.Content }
  }
  catch {
    return @{ ok = $false; code = 0; body = $_.Exception.Message }
  }
}

function Wait-HttpReady([string]$url, [int]$maxWaitSec = 25) {
  $deadline = (Get-Date).AddSeconds($maxWaitSec)
  do {
    $res = Test-Http -url $url -timeout 5
    if ($res.ok) { return $true }
    Start-Sleep -Seconds 1
  } while ((Get-Date) -lt $deadline)
  return $false
}

function Read-Tail([string]$file, [int]$lines = 80) {
  if (-not (Test-Path $file)) { return "<no log file: $file>" }
  try { return (Get-Content -Path $file -Tail $lines -ErrorAction Stop) -join "`n" }
  catch { return "<failed to read log: $file>" }
}

function Start-Agent([int]$p) {
  $startScript = Join-Path $scriptsRoot 'start-agent.ps1'
  if (-not (Test-Path $startScript)) { throw "start-agent.ps1 not found: $startScript" }
  Start-Process -FilePath 'pwsh.exe' -ArgumentList @('-NoProfile', '-NoLogo', '-ExecutionPolicy', 'Bypass', '-File', $startScript, '-Port', "$p", '-Mode', 'dist') -WorkingDirectory $agentRoot -WindowStyle Normal | Out-Null
  Write-Host "Agent start requested in new window (port $p)."
}

function Start-Admin() {
  if (-not (Test-Path (Join-Path $adminRoot 'package.json'))) { throw "Admin folder not found: $adminRoot" }
  Start-Process -FilePath 'pwsh.exe' -ArgumentList @('-NoProfile', '-NoLogo', '-Command', 'npm run dev') -WorkingDirectory $adminRoot -WindowStyle Normal | Out-Null
  Write-Host "Admin dev server requested in new window."
}

switch ($Phase) {
  'bootstrap' {
    Write-Host "Workspace:" $root
    $portState = Test-PortListening -p $Port
    $health = Test-Http -url "http://127.0.0.1:${Port}/api/health"
    $status = Test-Http -url "http://127.0.0.1:${Port}/api/status"
    $ping = Test-Http -url "http://127.0.0.1:${Port}/api/auth/ping"

    $report = @()
    $report += "Agent listening on ${Port}: " + ($(if ($portState) { 'YES' } else { 'NO' }))
    $report += "/api/health: " + ($health.code)
    $report += "/api/status: " + ($status.code)
    $report += "/api/auth/ping: " + ($ping.code)
    $reportText = ($report -join "`n")
    Write-Host $reportText

    $next = @()
    $next += "Продолжай:"
    if (-not $portState) { $next += "1) Подними агента на 7081 (используй start-agent.ps1)." }
    if (-not $health.ok) { $next += "2) Проверь health-check.ps1 и исправь ошибки запуска." }
    $next += "3) Запусти админку (npm run dev) и проверь вход admin/admin."
    $next += "Сообщи краткий статус: listening/health/login."
    Write-NextPrompt ($next -join " `n")
  }
  'start-agent' {
    Start-Agent -p $Port
    Start-Sleep -Seconds 2
    $state = Test-PortListening -p $Port
    if ($state) { Write-Host "Agent is listening." } else { Write-Host "Agent not listening yet." }
    Write-NextPrompt "Проверь /api/health и /api/auth/ping. Если 200 — запусти админку и войди admin/admin."
  }
  'health' {
    # Подождём готовности HTTP, чтобы уменьшить ложные таймауты
    $ready = Wait-HttpReady -url "http://127.0.0.1:${Port}/api/health" -maxWaitSec 25
    if (-not $ready) {
      # fallback: проверка /health (некоторые сборки могут экспонировать только его)
      $ready = Wait-HttpReady -url "http://127.0.0.1:${Port}/health" -maxWaitSec 10
    }
    $hc = Join-Path $scriptsRoot 'health-check.ps1'
    if (-not (Test-Path $hc)) { throw "health-check.ps1 not found: $hc" }
    pwsh -NoProfile -ExecutionPolicy Bypass -File $hc -Port $Port
    $exitCode = $LASTEXITCODE
    if ($exitCode -ne 0) {
      $logPath = Join-Path $agentRoot 'agent-dev.log'
      $tail = Read-Tail -file $logPath -lines 120
      Write-NextPrompt ("health-check упал (код $exitCode). Продолжай с диагностикой: проверь логи агента и порты, перезапусти процесс, опиши причину.\nПоследние строки лога агента:\n" + $tail)
      exit $exitCode
    }
    else {
      Write-NextPrompt "health-check зелёный. Запусти админку (npm run dev) и войди admin/admin. Опиши результат."
    }
  }
  'start-admin' {
    Write-NextPrompt "Проверь http://127.0.0.1:${Port}/api/health и /api/auth/ping. Если 200 — запусти админку и войди admin/admin."
    Write-NextPrompt "Открой http://localhost:5173/admin/ и выполни вход admin/admin. При ошибке пришли статус POST /api/auth/login из DevTools."
  }
  'summarize' {
    $portState = Test-PortListening -p $Port
    [void](Wait-HttpReady -url "http://127.0.0.1:${Port}/api/health" -maxWaitSec 10)
    $health = Test-Http -url "http://127.0.0.1:${Port}/api/health"
    $ping = Test-Http -url "http://127.0.0.1:${Port}/api/auth/ping"
    $summary = @()
    $summary += "listening: " + ($(if ($portState) { 'yes' } else { 'no' }))
    $summary += "api/health: " + $health.code
    $summary += "api/auth/ping: " + $ping.code
    $text = ($summary -join "; ")
    Write-Host $text
    Write-NextPrompt ("Сводка: {0}. Продолжай следующий шаг сценария (логин в админку/диагностика)." -f $text)
  }
  'auto' {
    # 1) Проверка и запуск агента
    $micro = @()
    $state = Test-PortListening -p $Port
    if (-not $state) {
      Start-Agent -p $Port
      # Ждём готовности HTTP эндпойнта
      $ready = Wait-HttpReady -url "http://127.0.0.1:${Port}/api/health" -maxWaitSec 25
      if (-not $ready) { [void](Wait-HttpReady -url "http://127.0.0.1:${Port}/health" -maxWaitSec 10) }
      $state = $ready -or (Test-PortListening -p $Port)
    }
    $micro += "Микропромпт A: Проверь, что агент слушает порт ${Port} (по /api/health и /api/auth/ping). Если нет — предложи конкретные правки в start-agent.ps1/run-agent-inner.ps1."

    # 2) Health-check
    $hcScript = Join-Path $scriptsRoot 'health-check.ps1'
    $hcOk = $false
    if (Test-Path $hcScript) {
      pwsh -NoProfile -ExecutionPolicy Bypass -File $hcScript -Port $Port
      $hcOk = ($LASTEXITCODE -eq 0)
    }
    $micro += "Микропромпт B: Проанализируй вывод health-check (код: " + ($(if ($hcOk) { '0' } else { '!=0' })) + ") и предложи точечные исправления в конфигурации/коде."

    # 3) Запуск админки
    Start-Admin
    $micro += "Микропромпт C: Открой http://localhost:5173/admin/ и выполни вход admin/admin. Если ошибка — запроси статус POST /api/auth/login (HTTP-код, тело), заголовки и консольные логи."

    # 4) Сводка и следующий шаг
    $health = Test-Http -url "http://127.0.0.1:${Port}/api/health"
    $ping = Test-Http -url "http://127.0.0.1:${Port}/api/auth/ping"
    $summary = "listening=" + ($(if ($state) { 'yes' } else { 'no' })) + ", health=" + $health.code + ", ping=" + $ping.code
    Write-Host "Summary: $summary"

    Write-MicroPrompts $micro
    $logInfo = ""
    if (-not $health.ok -or -not $state) {
      $logPath = Join-Path $agentRoot 'agent-dev.log'
      $tail = Read-Tail -file $logPath -lines 120
      $logInfo = "\nПоследние строки лога агента:\n" + $tail
    }
    Write-NextPrompt (@(
        "Используй микропромпты A→B→C последовательно. После каждого — дай краткий отчёт (1-2 строки) и предложи следующий микропромпт по итогу шага.",
        "Итоговая сводка среды: $summary" + $logInfo,
        "Когда вход в админку успешен — предложи финальную мини-проверку WS/SSE соединения и список метрик, которые стоит сверить."
      ) -join "`n")
  }
  'ai' {
    $ai = Join-Path $scriptsRoot 'ai-runner.ps1'
    if (-not (Test-Path $ai)) { throw "ai-runner.ps1 not found: $ai" }
    $aiInput = Join-Path $outbox 'copilot-micro-prompts.txt'
    $aiOutput = Join-Path $outbox 'ai-output.txt'
    pwsh -NoProfile -ExecutionPolicy Bypass -File $ai -InputFile $aiInput -OutputFile $aiOutput
    $text = Get-Content -Path $aiOutput -Encoding UTF8 | Out-String
    Write-NextPrompt ("Результат AI:\n" + $text + "\nПродолжи с учётом вывода: предложи следующий микропромпт или фиксацию результата.")
  }
  default { throw "Unknown phase: $Phase" }
}

Write-Host "Done."
