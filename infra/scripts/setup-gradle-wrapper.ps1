param(
    [string]$ProjectDir = "$PSScriptRoot/../../apps/android-kiosk",
    [string]$GradleVersion,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

# Normalize paths
$project = (Resolve-Path $ProjectDir).Path
$wrapperDir = Join-Path $project 'gradle/wrapper'
$wrapperJar = Join-Path $wrapperDir 'gradle-wrapper.jar'
$wrapperProps = Join-Path $wrapperDir 'gradle-wrapper.properties'

if (Test-Path -LiteralPath $wrapperJar) {
    if ($Force) {
        Write-Warning "[gradle] Принудительная регенерация wrapper: удаляю существующий gradle-wrapper.jar"
        try { Remove-Item -LiteralPath $wrapperJar -Force } catch {}
    }
    else {
        Write-Host "[gradle] Wrapper jar detected: $wrapperJar" -ForegroundColor Green
        exit 0
    }
}

# Resolve target Gradle version
if (-not $GradleVersion -and (Test-Path -LiteralPath $wrapperProps)) {
    $content = Get-Content -LiteralPath $wrapperProps -Raw
    $m = [regex]::Match($content, 'distributionUrl=.*gradle-([0-9]+\.[0-9]+(\.[0-9]+)?)-')
    if ($m.Success) { $GradleVersion = $m.Groups[1].Value }
}
if (-not $GradleVersion) { $GradleVersion = '8.7' }

function Test-GradleInstalled {
    try { Start-Process -NoNewWindow -FilePath gradle -ArgumentList '-v' -Wait -ErrorAction Stop | Out-Null; return $true } catch { return $false }
}

if (Test-GradleInstalled) {
    Push-Location $project
    try {
        Write-Host "[gradle] Generating wrapper for Gradle v$GradleVersion…" -ForegroundColor Cyan

        # Backup build files to avoid dependency resolution errors
        $settingsBak = Join-Path $project "settings.gradle.tmp"
        $buildBak = Join-Path $project "build.gradle.tmp"
        $hasSettings = Test-Path -LiteralPath (Join-Path $project "settings.gradle")
        $hasBuild = Test-Path -LiteralPath (Join-Path $project "build.gradle")

        if ($hasSettings) { Copy-Item -LiteralPath (Join-Path $project "settings.gradle") -Destination $settingsBak -Force }
        if ($hasBuild) { Copy-Item -LiteralPath (Join-Path $project "build.gradle") -Destination $buildBak -Force }

        # Temporarily simplify config to avoid network errors during wrapper generation
        Set-Content -LiteralPath (Join-Path $project "settings.gradle") -Value 'rootProject.name = "AndroidKiosk"' -Encoding UTF8
        Set-Content -LiteralPath (Join-Path $project "build.gradle") -Value '' -Encoding UTF8

        gradle wrapper --gradle-version $GradleVersion | Out-String | Write-Verbose

        # Restore original files
        if ($hasSettings) { Move-Item -LiteralPath $settingsBak -Destination (Join-Path $project "settings.gradle") -Force }
        if ($hasBuild) { Move-Item -LiteralPath $buildBak -Destination (Join-Path $project "build.gradle") -Force }

        if (-not (Test-Path -LiteralPath $wrapperJar)) { throw "gradle-wrapper.jar не появился. Проверьте вывод Gradle." }
        Write-Host "[gradle] Wrapper готов: $wrapperJar" -ForegroundColor Green
        exit 0
    }
    catch {
        # Restore files on error
        if (Test-Path -LiteralPath $settingsBak) {
            Move-Item -LiteralPath $settingsBak -Destination (Join-Path $project "settings.gradle") -Force
        }
        if (Test-Path -LiteralPath $buildBak) {
            Move-Item -LiteralPath $buildBak -Destination (Join-Path $project "build.gradle") -Force
        }
        throw $_
    }
    finally { Pop-Location }
}

# Fallback: download Gradle and run its gradle.bat to generate wrapper
Write-Warning "Gradle не найден в PATH. Использую временный Gradle для генерации wrapper."
if (-not (Test-Path -LiteralPath $wrapperDir)) { New-Item -ItemType Directory -Path $wrapperDir | Out-Null }

$distUrl = $null
if (Test-Path -LiteralPath $wrapperProps) {
    $props = Get-Content -LiteralPath $wrapperProps -Raw
    $m2 = [regex]::Match($props, 'distributionUrl=(.*)')
    if ($m2.Success) {
        $distUrl = $m2.Groups[1].Value.Trim()
        $distUrl = $distUrl -replace '\\:\/\/', '://'
        $distUrl = $distUrl -replace '\\:', ':'
    }
}
if (-not $distUrl) { $distUrl = "https://services.gradle.org/distributions/gradle-$GradleVersion-bin.zip" }

Write-Host "[gradle] Загрузка дистрибутива: $distUrl" -ForegroundColor Cyan
$tmpZip = Join-Path ([System.IO.Path]::GetTempPath()) ("gradle-$GradleVersion-bin.zip")
try { Invoke-WebRequest -Uri $distUrl -OutFile $tmpZip -UseBasicParsing -ErrorAction Stop }
catch { Write-Error "Не удалось скачать Gradle ($distUrl). Установите Gradle вручную или запустите Android Studio. $_" }

try {
    Add-Type -AssemblyName System.IO.Compression.FileSystem | Out-Null
    $extractDir = Join-Path ([System.IO.Path]::GetTempPath()) ("gradle-dist-" + [System.Guid]::NewGuid().ToString())
    New-Item -ItemType Directory -Path $extractDir | Out-Null
    [System.IO.Compression.ZipFile]::ExtractToDirectory($tmpZip, $extractDir)
    $gradleRoot = Get-ChildItem -Path $extractDir -Directory | Where-Object { $_.Name -like 'gradle-*' } | Select-Object -First 1
    if (-not $gradleRoot) { throw "Не удалось найти корневую папку Gradle после распаковки" }
    $gradleBat = Join-Path $gradleRoot.FullName 'bin/gradle.bat'
    if (-not (Test-Path -LiteralPath $gradleBat)) { throw "Не найден gradle.bat в распакованном архиве" }
    Write-Host "[gradle] Запуск временного Gradle для генерации wrapper…" -ForegroundColor Cyan

    # Backup build files to avoid dependency resolution errors
    $settingsBak = Join-Path $project "settings.gradle.tmp"
    $buildBak = Join-Path $project "build.gradle.tmp"
    $hasSettings = Test-Path -LiteralPath (Join-Path $project "settings.gradle")
    $hasBuild = Test-Path -LiteralPath (Join-Path $project "build.gradle")

    if ($hasSettings) { Copy-Item -LiteralPath (Join-Path $project "settings.gradle") -Destination $settingsBak -Force }
    if ($hasBuild) { Copy-Item -LiteralPath (Join-Path $project "build.gradle") -Destination $buildBak -Force }

    # Temporarily simplify config
    Set-Content -LiteralPath (Join-Path $project "settings.gradle") -Value 'rootProject.name = "AndroidKiosk"' -Encoding UTF8
    Set-Content -LiteralPath (Join-Path $project "build.gradle") -Value '' -Encoding UTF8

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $gradleBat
    $psi.WorkingDirectory = $project
    $psi.ArgumentList.Add('wrapper') | Out-Null
    $psi.ArgumentList.Add('--gradle-version') | Out-Null
    $psi.ArgumentList.Add($GradleVersion) | Out-Null
    $psi.RedirectStandardOutput = $false
    $psi.RedirectStandardError = $false
    $psi.UseShellExecute = $true
    $p = [System.Diagnostics.Process]::Start($psi)
    $p.WaitForExit()

    # Restore original files
    if ($hasSettings) { Move-Item -LiteralPath $settingsBak -Destination (Join-Path $project "settings.gradle") -Force }
    if ($hasBuild) { Move-Item -LiteralPath $buildBak -Destination (Join-Path $project "build.gradle") -Force }
    if ($p.ExitCode -ne 0) {
        Write-Warning "[gradle] Команда 'gradle wrapper' завершилась с кодом $($p.ExitCode). Пытаюсь применить резервный способ (копирование gradle-wrapper-*.jar из дистрибутива)."
        # fallback: copy wrapper jar from the extracted Gradle distribution
        try {
            $pluginsDir = Join-Path $gradleRoot.FullName 'lib/plugins'
            $wrapperPluginJar = Get-ChildItem -Path $pluginsDir -Filter 'gradle-wrapper-*.jar' -ErrorAction SilentlyContinue | Select-Object -First 1
            if (-not $wrapperPluginJar) { throw "Не найден gradle-wrapper-*.jar в $pluginsDir" }
            Copy-Item -LiteralPath $wrapperPluginJar.FullName -Destination $wrapperJar -Force
            if (-not (Test-Path -LiteralPath $wrapperJar)) { throw "Не удалось скопировать gradle-wrapper.jar" }
            Write-Host "[gradle] Резервно установлен wrapper jar: $wrapperJar" -ForegroundColor Yellow
            exit 0
        }
        catch {
            throw "gradle wrapper завершился с кодом $($p.ExitCode); резервный способ тоже не удался: $_"
        }
    }
    if (-not (Test-Path -LiteralPath $wrapperJar)) {
        # Если jar всё ещё отсутствует (редкий случай), попробуем резервный способ и без ошибки
        try {
            $pluginsDir = Join-Path $gradleRoot.FullName 'lib/plugins'
            $wrapperPluginJar = Get-ChildItem -Path $pluginsDir -Filter 'gradle-wrapper-*.jar' -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($wrapperPluginJar) {
                Copy-Item -LiteralPath $wrapperPluginJar.FullName -Destination $wrapperJar -Force
                Write-Host "[gradle] Wrapper jar скопирован из дистрибутива: $wrapperJar" -ForegroundColor Yellow
            }
        } catch {}
        if (-not (Test-Path -LiteralPath $wrapperJar)) { throw "gradle-wrapper.jar не появился после команды wrapper" }
    }
    Write-Host "[gradle] Wrapper сгенерирован: $wrapperJar" -ForegroundColor Green
    exit 0
}
catch {
    # Restore files on error
    if (Test-Path -LiteralPath (Join-Path $project "settings.gradle.tmp")) {
        Move-Item -LiteralPath (Join-Path $project "settings.gradle.tmp") -Destination (Join-Path $project "settings.gradle") -Force
    }
    if (Test-Path -LiteralPath (Join-Path $project "build.gradle.tmp")) {
        Move-Item -LiteralPath (Join-Path $project "build.gradle.tmp") -Destination (Join-Path $project "build.gradle") -Force
    }
    Write-Error "Не удалось сгенерировать wrapper через временный Gradle: $_"
}
finally {
    try { Remove-Item -LiteralPath $tmpZip -Force -ErrorAction SilentlyContinue } catch {}
    try { Remove-Item -LiteralPath $extractDir -Recurse -Force -ErrorAction SilentlyContinue } catch {}
}

Write-Host "Быстрые варианты установки Gradle (один из):" -ForegroundColor Yellow
Write-Host "  - Chocolatey: choco install gradle" -ForegroundColor Yellow
Write-Host "  - Scoop: scoop install gradle" -ForegroundColor Yellow
Write-Host "  - SDKMAN (bash): sdk install gradle" -ForegroundColor Yellow
exit 2
