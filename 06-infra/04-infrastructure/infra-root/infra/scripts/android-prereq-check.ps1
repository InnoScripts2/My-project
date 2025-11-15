param(
    [string]$ProjectDir = "$PSScriptRoot/../../apps/android-kiosk"
)

$ErrorActionPreference = 'Stop'

function Write-Result {
    param([string]$Label, [bool]$Ok, [string]$Extra)
    $mark = if ($Ok) { "[OK]" } else { "[FAIL]" }
    $color = if ($Ok) { 'Green' } else { 'Red' }
    Write-Host ("{0} {1}" -f $mark, $Label) -ForegroundColor $color
    if ($Extra) { Write-Host ("  -> {0}" -f $Extra) -ForegroundColor DarkGray }
}

# 1) Java (JDK 17+ required for AGP 8.x)
$javaOk = $false
$javaVersion = ''
try {
    if ($env:JAVA_HOME -and (Test-Path -LiteralPath (Join-Path $env:JAVA_HOME 'bin/java.exe'))) {
        $out = & (Join-Path $env:JAVA_HOME 'bin/java.exe') -version 2>&1
    }
    else {
        $out = & java -version 2>&1
    }
    if ($out) {
        $m = [regex]::Match(($out -join ' '), 'version "([0-9]+)(?:\.[0-9]+)?')
        if ($m.Success) { $javaVersion = $m.Groups[1].Value }
        if ([int]::TryParse($javaVersion, [ref]0) -and [int]$javaVersion -ge 17) { $javaOk = $true }
    }
}
catch {}
if ($javaOk) { $javaMsg = "version >= 17 detected" } else { $javaMsg = "Установите JDK 17 и настройте JAVA_HOME" }
Write-Result "Java (JDK 17+)" $javaOk $javaMsg

# 2) Android SDK
$sdkRoot = $env:ANDROID_SDK_ROOT
if (-not $sdkRoot) { $sdkRoot = $env:ANDROID_HOME }
$sdkOk = $false
if ($sdkRoot) {
    $platformTools = Join-Path $sdkRoot 'platform-tools'
    $buildTools = Join-Path $sdkRoot 'build-tools'
    $ptOk = Test-Path -LiteralPath $platformTools
    $btOk = Test-Path -LiteralPath $buildTools
    if ($ptOk -and $btOk) { $sdkOk = $true }
}
if ($sdkOk) { $sdkMsg = "SDK found: $sdkRoot" } else { $sdkMsg = "Настройте ANDROID_SDK_ROOT/ANDROID_HOME и установите platform-tools/build-tools" }
Write-Result "Android SDK" $sdkOk $sdkMsg

# 3) Gradle wrapper presence
$wrapperJar = Join-Path $ProjectDir 'gradle/wrapper/gradle-wrapper.jar'
$gradlew = Join-Path $ProjectDir 'gradlew.bat'
$wrapperOk = (Test-Path -LiteralPath $wrapperJar) -and (Test-Path -LiteralPath $gradlew)
if ($wrapperOk) { $wrapMsg = "Found wrapper jar and gradlew.bat" } else { $wrapMsg = "Выполните npm run apk:gradle:setup или откройте проект в Android Studio" }
Write-Result "Gradle Wrapper" $wrapperOk $wrapMsg

if (-not ($javaOk -and $sdkOk -and $wrapperOk)) {
    Write-Host "\nИтог: окружение не полностью готово к сборке. См. подсказки выше." -ForegroundColor Yellow
    exit 2
}

Write-Host "\nГотово к сборке: можно запускать 'npm run apk:build'" -ForegroundColor Green
