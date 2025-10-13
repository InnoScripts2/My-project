param(
    [string]$ProjectDir = "$PSScriptRoot/../../apps/android-kiosk",
    [string]$Task = "assembleDebug"
)

$ErrorActionPreference = 'Stop'

function Resolve-JavaHome {
    $jh = $env:JAVA_HOME
    if ($jh) {
        # Trim quotes around JAVA_HOME if present
        if ($jh.StartsWith('"') -and $jh.EndsWith('"')) { $jh = $jh.Trim('"') }
        $javaExe = Join-Path $jh 'bin/java.exe'
        if (Test-Path -LiteralPath $javaExe) { return $jh }
    }
    $candidates = @()
    if ($env:ProgramFiles) { $candidates += (Join-Path $env:ProgramFiles 'Android\Android Studio\jbr') }
    if (${env:ProgramFiles(x86)}) { $candidates += (Join-Path ${env:ProgramFiles(x86)} 'Android\Android Studio\jbr') }
    foreach ($cand in $candidates) {
        if (Test-Path -LiteralPath (Join-Path $cand 'bin/java.exe')) { return $cand }
    }
    return $null
}

# Ensure wrapper exists (force regenerate to avoid broken jar)
& (Join-Path $PSScriptRoot 'setup-gradle-wrapper.ps1') -Force | Out-Null

# Ensure Java
$javaHome = Resolve-JavaHome
if (-not $javaHome) {
    Write-Error "Java (JDK 17+) не найдена. Установите JDK 17 или поставьте Android Studio (есть JBR)."
}
$env:JAVA_HOME = $javaHome
# Prepend JAVA_HOME\bin to PATH for reliability
$env:PATH = (Join-Path $javaHome 'bin') + ";" + $env:PATH
Write-Host "[apk-build] Using JAVA_HOME=$javaHome" -ForegroundColor Cyan

# Run gradlew task with robust path handling
$gradlew = Resolve-Path (Join-Path $ProjectDir 'gradlew.bat')
if (-not (Test-Path -LiteralPath $gradlew)) { Write-Error "gradlew.bat не найден в $ProjectDir" }

Push-Location $ProjectDir
try {
    & $gradlew $Task
}
finally {
    Pop-Location
}
