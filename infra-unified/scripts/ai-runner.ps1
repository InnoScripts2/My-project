param(
    [string]$InputFile = 'outbox/copilot-micro-prompts.txt',
    [string]$OutputFile = 'outbox/ai-output.txt',
    [string]$Model = $env:AI_API_MODEL,
    [string]$ApiKey = $env:AI_API_KEY
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $InputFile)) { throw "Input file not found: $InputFile" }

# Попытка подхватить .env из корня репозитория, если переменные окружения не заданы
if (-not $ApiKey -or -not $Model) {
    $root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
    $envFile = Join-Path $root '.env'
    if (Test-Path $envFile) {
        $lines = Get-Content -Path $envFile -Encoding UTF8
        foreach ($line in $lines) {
            if ($line.Trim().StartsWith('#') -or -not $line.Contains('=')) { continue }
            $kv = $line.Split('=', 2)
            $k = $kv[0].Trim()
            $v = $kv[1].Trim().Trim('"').Trim("'")
            if ($k -eq 'AI_API_KEY' -and -not $ApiKey) { $ApiKey = $v }
            if ($k -eq 'AI_API_MODEL' -and -not $Model) { $Model = $v }
        }
    }
}

if (-not $ApiKey) { throw "AI_API_KEY is not set. Put it in .env and reload shell." }
if (-not $Model) { $Model = 'gemini-1.5-flash-latest' }

$prompts = Get-Content -Path $InputFile -Encoding UTF8 | Where-Object { $_.Trim().Length -gt 0 }
if ($prompts.Count -eq 0) { throw "No micro-prompts found in $InputFile" }

# Собираем один комбинированный промпт с инструкцией по краткому отчёту
$system = @(
    'Ты — инженер-ассистент. Выполняй микропромпты последовательно.',
    'После каждого шага делай краткий (1-2 строки) отчёт и предлагай следующий микропромпт.',
    'Если шаг требует команд — выпиши точные команды для Windows PowerShell.'
) -join "\n"

$combined = "# Системные указания\n$system\n\n# Микропромпты\n" + ($prompts -join "\n")

$body = @{ contents = @(@{ role = 'user'; parts = @(@{ text = $combined }) }) }

function Invoke-GeminiCall([string]$model) {
    $uri = "https://generativelanguage.googleapis.com/v1beta/models/$model:generateContent?key=$ApiKey"
    $json = $body | ConvertTo-Json -Depth 8
    try {
        $resp = Invoke-RestMethod -Method Post -Uri $uri -ContentType 'application/json' -Body $json
        return @{ ok = $true; resp = $resp }
    }
    catch {
        return @{ ok = $false; err = ($_ | Out-String) }
    }
}

$models = @($Model, 'gemini-1.5-pro-latest', 'gemini-1.5-flash', 'gemini-1.0-pro')
$lastErr = $null
foreach ($m in $models) {
    $res = Invoke-GeminiCall -model $m
    if ($res.ok) {
        $resp = $res.resp
        if ($null -eq $resp) { $lastErr = "Empty response from model $m"; continue }
        $cand = $resp.candidates | Select-Object -First 1
        if ($null -eq $cand) { $lastErr = ("No candidates (model $m). Raw: " + ($resp | ConvertTo-Json -Depth 8)); continue }
        $part = $cand.content.parts | Select-Object -First 1
        if ($null -eq $part -or -not $part.text) { $lastErr = ("No text (model $m). Raw: " + ($resp | ConvertTo-Json -Depth 8)); continue }
        $text = $part.text
        $text | Set-Content -Path $OutputFile -Encoding UTF8
        Write-Host "AI output saved to: $OutputFile (model: $m)"
        exit 0
    }
    else {
        $lastErr = "Model $m failed: " + $res.err
    }
}

if ($lastErr) {
    $lastErr | Set-Content -Path $OutputFile -Encoding UTF8
}
Write-Host "AI call failed; details written to $OutputFile" -ForegroundColor Yellow
exit 1
