# Session 01 — APK Baseline

Дата: 03.11.2025
Диапазон: сессия 1 (Фаза A)

## Build команды
- `apps-unified/android-kiosk`: `./gradlew :app:assembleRelease`
- `apps-unified/android-kiosk`: `./gradlew.bat -p ..\\..\\apps\\android-kiosk clean assembleRelease`
- `apps-unified/android-kiosk`: `./gradlew.bat -p ..\\..\\apps\\android-kiosk clean assembleRelease`

## Окружение
- JDK 17 (`JAVA_HOME` указывает на Temurin 17)
- Android SDK 34.0.0 (platforms;build-tools 34.0.0)
- Gradle wrapper `gradlew.bat` из `apps-unified/android-kiosk` (Gradle 8.7, AGP 8.4.1, Kotlin 1.9.24)
- Windows 11, PowerShell (`pwsh`) для запуска команд

## Результаты сборки
- `apps-unified/android-kiosk` → `app/build/outputs/apk/release/app-release-unsigned.apk` — 5 412 927 байт (≈5.16 MiB)
- `apps/android-kiosk` → сборка прервана (AAPT: отсутствуют ресурсы `mipmap/ic_launcher`, `string/app_name`, `style/AppTheme`; проект требовал восстановления ресурсов для baseline)
- Gradle предупреждения: дублированный `uses-feature` в модуле `serialport`, устаревшие API (`startActivityForResult`, `onBackPressed`, BLE GATT overrides)

## Недостающие ресурсы standalone-проекта
- `res/values/strings.xml` — требуется `app_name`
- `res/values/styles.xml` — требуется `AppTheme`
- `res/mipmap/ic_launcher.*` — отсутствует базовый лаунчер-икон
- Проверить `AndroidManifest.xml` на дополнительные ссылки перед повторной сборкой

## Выводы
- Проект `apps-unified/android-kiosk` собирается без ошибок; получен baseline для размера APK.
- Для `apps/android-kiosk` создан минимальный Gradle root (`build.gradle`, `settings.gradle`, `gradle.properties`), но выпуск невозможен из-за отсутствия базовых ресурсов; основной baseline фиксируем по unified-проекту.
- Для повторного снятия метрик необходимо восстановить ресурсы standalone-проекта или исключить его из дальнейших переносов.

## Следующие шаги
1. Обновить рабочий план `plan-80-session-roadmap.md` — baseline выбран, требования и дефицит ресурсов зафиксированы.
2. Подготовить список обязательных ресурсов для переноса, если требуется реанимировать `apps/android-kiosk` (см. выше).
3. При переходе к сессии 2 использовать данные окружения и baseline.
