param(
    [int]$Port = 7081
)

$ErrorActionPreference = 'Stop'

$base = "http://127.0.0.1:$Port"
# В DEV используем ключ по умолчанию, можно переопределить переменной окружения AGENT_API_KEY
$apiKey = $env:AGENT_API_KEY
if ([string]::IsNullOrWhiteSpace($apiKey)) { $apiKey = 'dev-local-key' }
Write-Host "Checking agent at $base ..."

$fail = $false

# Ждём готовности /api/health до 25 секунд, затем fallback /health
function Wait-Ready($url, $maxSec) {
    $deadline = (Get-Date).AddSeconds($maxSec)
    do {
        try {
            $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 -Uri $url
            if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 300) { return $true }
        }
        catch { }
        Start-Sleep -Seconds 1
    } while ((Get-Date) -lt $deadline)
    return $false
}

function Test-Endpoint($path) {
    try {
        $url = "$base$path"
        $headers = @{}
        if ($path -like '/api/*' -and $path -ne '/api/health' -and $path -ne '/api/status' -and $path -ne '/api/auth/ping') {
            $headers['x-api-key'] = $apiKey
        }
        $res = Invoke-WebRequest -UseBasicParsing -TimeoutSec 8 -Method GET -Uri $url -Headers $headers
        Write-Host ("{0} -> {1}" -f $path, $res.StatusCode)
        if ($res.StatusCode -lt 200 -or $res.StatusCode -ge 300) { $script:fail = $true }
    }
    catch {
        Write-Host ("{0} -> ERROR: {1}" -f $path, $_.Exception.Message)
        $script:fail = $true
    }
}

if (-not (Wait-Ready -url "$base/api/health" -maxSec 25)) {
    [void](Wait-Ready -url "$base/health" -maxSec 10)
}

Test-Endpoint '/health'
Test-Endpoint '/api/health'
Test-Endpoint '/api/status'
Test-Endpoint '/api/auth/ping'

# Login test (dev creds)
try {
    $loginUrl = "$base/api/auth/login"
    $payload = @{ username = 'admin'; password = 'admin' } | ConvertTo-Json
    $res = Invoke-WebRequest -UseBasicParsing -TimeoutSec 10 -Method POST -Uri $loginUrl -ContentType 'application/json' -Body $payload
    Write-Host ("/api/auth/login -> {0}" -f $res.StatusCode)
    if ($res.StatusCode -lt 200 -or $res.StatusCode -ge 300) { $fail = $true }
}
catch {
    Write-Host ("/api/auth/login -> ERROR: {0}" -f $_.Exception.Message)
    $fail = $true
}

if ($fail) { exit 1 }
