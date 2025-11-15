# Android WebView оболочка для киоска

Этот модуль — минимальный Android-проект, который разворачивает наш фронтенд в WebView. Подходит для быстрых APK-сборок.

- URL берётся из `res/values/strings.xml` (`kiosk_url`). Для эмулятора Android Studio localhost агента/статики доступен как `http://10.0.2.2:8080/`.
- Для реального телефона укажите URL ПК в одной сети Wi‑Fi, например `https://192.168.1.10:8443/` (с нашим dev‑сертификатом).
- Поддержан mixed content (для локального HTTP), но для PWA/Service Worker нужен HTTPS.

## Сборка

1) Установите Android Studio (или командно-строчные инструменты).
2) Если хотите собирать из консоли, добавьте Gradle в PATH (choco install gradle) или сначала откройте проект в Android Studio, чтобы он сгенерировал wrapper.
3) Сборка из корня репозитория:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -Command "npm run apk:build"

# Для релизной сборки (понадобится signingConfig):
pwsh -NoProfile -ExecutionPolicy Bypass -Command "npm run apk:build:release"
```

Примечания:

- Скрипт `infra/scripts/setup-gradle-wrapper.ps1` попытается сгенерировать gradle-wrapper.jar, если его нет. Для этого требуется установленный Gradle в PATH. Если его нет — откройте проект в Android Studio и запустите Sync, тогда wrapper появится автоматически.
- Убедитесь, что переменные среды Android SDK настроены (`ANDROID_HOME`/`ANDROID_SDK_ROOT`), а platform-tools и build-tools доступны в PATH.
