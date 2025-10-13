# Автоматизированная сборка Android APK

Этот документ описывает процесс стабилизации Gradle wrapper и сборки Android APK для проекта киоска самообслуживания.

## Проблема

При запуске `gradlew` на машине разработчика возникала ошибка:
```
NoClassDefFoundError: org/gradle/wrapper/IDownload
```

Причины:
1. Отсутствовал или был повреждён `gradle-wrapper.jar`
2. Потенциальные проблемы с Unicode-путями (например, "Новая папка (3)")
3. Несоответствие кодировок при генерации wrapper

## Решение

### 1. Подготовленные файлы

В репозитории уже настроены следующие файлы:

- **`apps/android-kiosk/gradle/wrapper/gradle-wrapper.jar`** (43 KB)
  - Корректный wrapper jar для Gradle 8.7
  - Создан с использованием официального Gradle 8.7

- **`apps/android-kiosk/gradle.properties`**
  - Настроена UTF-8 кодировка: `org.gradle.jvmargs=-Dfile.encoding=UTF-8 -Dsun.jnu.encoding=UTF-8`
  - Оптимизирована память: `-Xmx2g`
  - Включён Gradle daemon для ускорения сборок

- **`apps/android-kiosk/local.properties`** (игнорируется Git)
  - Автоматически создаётся скриптом сборки
  - Содержит путь к Android SDK

- **`.gitignore`**
  - Исключает `.gradle/`, `build/`, `local.properties`
  - Исключает артефакты сборки `apps/artifacts/android/`

### 2. Автоматизированный скрипт сборки

Создан скрипт **`infra/scripts/apk-agent-build.ps1`**, который выполняет:

1. **Валидацию окружения**
   - Проверка Java 17+
   - Проверка Android SDK (platform-34, build-tools-34)

2. **Настройку переменных окружения**
   - `JAVA_HOME`, `ANDROID_SDK_ROOT`, `ANDROID_HOME`
   - UTF-8 кодировка через `JAVA_TOOL_OPTIONS`

3. **Создание конфигурационных файлов**
   - `local.properties` с путём к SDK
   - `gradle.properties` с оптимизациями

4. **Регенерацию Gradle wrapper** (при необходимости)
   - Использует установленный Gradle для генерации wrapper
   - Временно упрощает build.gradle для избежания проблем с зависимостями

5. **Валидацию wrapper**
   - Проверка `./gradlew --version`

6. **Сборку APK**
   - `./gradlew :app:assembleDebug --no-daemon --stacktrace`
   - Сохранение логов сборки

7. **Сохранение артефактов**
   - APK: `apps/artifacts/android/<timestamp>/app-debug.apk`
   - SHA256: `app-debug.apk.sha256`
   - Лог: `build.log`

## Использование на Windows

### Предварительные требования

1. **Java Development Kit 17+**
   - Установите JDK 17 (например, из [Adoptium](https://adoptium.net/))
   - Путь по умолчанию: `C:\Program Files\Java\jdk-17`

2. **Android SDK**
   - Установите Android Studio или Command Line Tools
   - Убедитесь, что установлены:
     - `platforms;android-34`
     - `build-tools;34.0.0` (или 34.0.1)
   - Путь по умолчанию: `C:\Users\<USER>\AppData\Local\Android\Sdk`

3. **Gradle** (для первичной генерации wrapper)
   - Установите через:
     - Chocolatey: `choco install gradle`
     - Scoop: `scoop install gradle`
     - Вручную: [gradle.org/releases](https://gradle.org/releases/)

### Запуск автоматической сборки

```powershell
# Из корня репозитория
pwsh -NoProfile -ExecutionPolicy Bypass -File .\infra\scripts\apk-agent-build.ps1

# С явными путями (если отличаются от умолчаний)
pwsh -NoProfile -ExecutionPolicy Bypass -File .\infra\scripts\apk-agent-build.ps1 `
  -JavaHome "C:\Program Files\Java\jdk-17" `
  -AndroidSdkRoot "C:\Users\Alexsey\AppData\Local\Android\Sdk"

# Только настройка wrapper (без сборки)
pwsh -NoProfile -ExecutionPolicy Bypass -File .\infra\scripts\apk-agent-build.ps1 -SkipBuild

# С подробным выводом
pwsh -NoProfile -ExecutionPolicy Bypass -File .\infra\scripts\apk-agent-build.ps1 -Verbose
```

### Ручная сборка (после настройки wrapper)

После успешного выполнения скрипта можно использовать wrapper напрямую:

```powershell
cd apps\android-kiosk

# Сборка debug APK
.\gradlew :app:assembleDebug

# Сборка release APK
.\gradlew :app:assembleRelease

# Очистка
.\gradlew clean

# Список всех задач
.\gradlew tasks
```

## Решение проблем

### Проблема с Unicode-путями

Если проект находится в папке с кириллицей или другими не-ASCII символами (например, "Новая папка (3)"), создайте NTFS junction:

```cmd
mklink /J C:\work\android-kiosk "C:\Users\Alexsey\Desktop\Новая папка (3)\apps\android-kiosk"
cd C:\work\android-kiosk
gradlew assembleDebug
```

### Ошибки подключения к репозиториям

Если при сборке возникают ошибки подключения к `dl.google.com` или `repo.maven.apache.org`:

1. Проверьте интернет-соединение
2. Проверьте настройки прокси (если используется)
3. Временно отключите антивирус/фаервол
4. Добавьте прокси в `gradle.properties`:
   ```properties
   systemProp.http.proxyHost=proxy.company.com
   systemProp.http.proxyPort=8080
   systemProp.https.proxyHost=proxy.company.com
   systemProp.https.proxyPort=8080
   ```

### Ошибки при генерации wrapper

Если автоматическая генерация wrapper не работает:

1. Убедитесь, что Gradle установлен и доступен в PATH:
   ```powershell
   gradle --version
   ```

2. Вручную регенерируйте wrapper:
   ```powershell
   cd apps\android-kiosk
   gradle wrapper --gradle-version 8.7 --distribution-type bin
   ```

3. Если проблемы сохраняются, скачайте Gradle 8.7 вручную и используйте его:
   ```powershell
   C:\gradle-8.7\bin\gradle wrapper --gradle-version 8.7
   ```

## Структура артефактов

После успешной сборки артефакты сохраняются в:

```
apps/artifacts/android/<timestamp>/
├── app-debug.apk          # Собранный APK
├── app-debug.apk.sha256   # Контрольная сумма
└── build.log              # Полный лог сборки
```

Где `<timestamp>` имеет формат `yyyyMMdd-HHmmss`, например: `20240102-143025`

## Техническая информация

### Версии

- **Gradle**: 8.7
- **Android Gradle Plugin (AGP)**: 8.4.1
- **Kotlin**: 1.9.24
- **Compile SDK**: 34
- **Min SDK**: 24
- **Target SDK**: 34
- **Java**: 17

### Совместимость

- AGP 8.4.1 требует Gradle 8.6+
- Проект использует Gradle 8.7 для стабильности
- JDK 17 минимально необходим для AGP 8.x

### Оптимизации

Файл `gradle.properties` содержит оптимизации:

```properties
# Кодировка UTF-8 для совместимости с путями
org.gradle.jvmargs=-Dfile.encoding=UTF-8 -Dsun.jnu.encoding=UTF-8 -Xmx2g

# Gradle daemon для ускорения сборок
org.gradle.daemon=true

# AndroidX (современная библиотека поддержки)
android.useAndroidX=true
android.enableJetifier=false
```

## Следующие шаги

После успешной сборки APK:

1. **Установка на устройство**
   ```cmd
   adb install apps\artifacts\android\<timestamp>\app-debug.apk
   ```

2. **Тестирование**
   - Запустите приложение на устройстве
   - Проверьте основной функционал киоска

3. **Подготовка к релизу**
   - Настройте подписание APK (keystore)
   - Соберите release версию: `gradlew :app:assembleRelease`
   - Оптимизируйте APK с помощью ProGuard/R8

## Поддержка

При возникновении проблем:

1. Проверьте лог сборки в `apps/artifacts/android/<timestamp>/build.log`
2. Запустите сборку с флагом `--stacktrace` для детального вывода
3. Убедитесь, что все зависимости могут быть загружены (интернет-соединение)
4. Проверьте версии Java, Gradle и Android SDK

---

**Примечание**: Этот процесс был автоматизирован фоновым ИИ-агентом в соответствии с требованиями проекта. Все изменения минимальны и направлены на стабилизацию сборки без модификации бизнес-логики приложения.
