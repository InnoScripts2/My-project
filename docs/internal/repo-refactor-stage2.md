# Stage 2 — План рефакторинга репозитория (2025-10-13)

## Текущее состояние Android-проектов

| Каталог | Назначение | Версия инструментов | Статус | План действий |
| --- | --- | --- | --- | --- |
| `apps-unified/android-kiosk` | WebView-оболочка киоска | AGP 8.x (Kotlin 1.9), compileSdk 34 | Актуальная база | Оставить как основной проект, добавить новые экраны и интеграции по мере миграции |
| `блок 2` (`BluetoothSPP`) | Демо-приложение SPP Bluetooth | AGP 1.0, jcenter | Устаревший | Перенести полезные паттерны подключения в wiki, каталог переместить в `archives/` |
| `блок 6` (`SerialPortSample`) | Современный sample последовательного порта | AGP 7.x (compileSdk 32) | Полезные модули | Извлечь модуль `serialport` и импортировать в `apps-unified/android-kiosk` как библиотеку `:serialport` |
| `apps/android-kiosk` | Ранний вариант оболочки | ? | Дубликат | Проверить содержимое; если нет уникального кода — перенести в `archives/` |
| `apps/kiosk` | Node/Electron фронтенд | Node.js/TypeScript | Удаляется | Выделить ассеты (иконки, тексты) перед удалением |

## Статус выполнения

- 2025-10-13 — каталог `apps/android-kiosk` перемещён в `archives/android-kiosk-legacy` для изоляции устаревшего кода.
- 2025-10-13 — модуль `serialport` из `блок 6` скопирован в `apps-unified/android-kiosk` и подключён к основному Android-проекту.
- 2025-10-13 — подготовлены каркасы `libs/cpp` (CMake + заголовки) и `libs/python` (pyproject, базовый пакет `selfservice_diagnostics`).
- 2025-10-13 — Node-проекты `apps/kiosk`, `apps/kiosk-admin`, `apps-unified/kiosk-agent`, `03-apps`, `04-packages`, `packages-unified` перенесены в `node-legacy/` (архив).

## Структура каталогов после Stage 2

```
apps-unified/
  android-kiosk/
    app/
    serialport/  ← новый модуль из блок 6
libs/
  cpp/
    include/
    src/
    cmake/
    tests/
  python/
    packages/
    scripts/
    tests/
archives/
  bluetoothspp/  ← бывший блок 2
  legacy-web/    ← apps/android-kiosk (если дублирует)
node-legacy/
  apps/kiosk-agent/
  apps/kiosk/
  apps-unified/kiosk-agent/
```

Каталоги `archives/` и `node-legacy/` хранятся до завершения миграции; содержат README с инструкциями и причинами переноса.

## Полезные артефакты для сохранения

- Иконки, изображения и сертификаты из `assets/`, `apps/kiosk`, `apps/kiosk-admin`, `apps-unified/kiosk-agent` — перенести в `assets/` подструктуру `legacy/`.
- Документация об операциях Node-проектов (`docs/history.md`, `docs/stage-0-checklist.md`) — перенести ссылки в Stage 3 план.
- Тестовые данные, SQL миграции — перенести в `db/archives/` до переиспользования.

## Обновление конфигурации

- `package.json`, `npm`-скрипты: заменить на набор утилит для Android/C++/Python; вынести команды в `tools/` (PowerShell/Gradle wrapper).
- `.gitignore`: удалить правила для Node.js build, добавить для CMake/build, Python venv.
- CI: удалить workflow, запускающие Node-пакеты; добавить задачи `gradlew build`, `ctest`, `pytest`.
- Документация `README.md`: добавить раздел «Новый стек», удалить упоминания Node.js.

## Этапы реализации

1. **Каталоги Android**
   - Создать `archives/` и перенести `блок 2` целиком.
   - Из `блок 6` скопировать модуль `serialport` в `apps-unified/android-kiosk/serialport` (с обновлением `settings.gradle`).
   - Проверить `apps/android-kiosk`; если функционал дублирует — переместить в `archives/legacy-web`.

2. **Подготовка libs**
   - В `libs/cpp` добавить минимальный `CMakeLists.txt` и заглушки API.
   - В `libs/python` сформировать `pyproject.toml` и структуру пакетов.

3. **Node.js архивирование**
   - Создать `node-legacy/`, переместить туда `apps/kiosk-agent`, `apps/kiosk`, `apps-unified/kiosk-agent`, `03-apps`, `04-packages`, `packages-unified` (после извлечения полезных модулей).
   - Сохранить только необходимые артефакты (иконки, сертификаты) в `assets/legacy`.

4. **Конфигурация**
   - Обновить корневой `README.md`, `docs/DEPLOYMENT.md`, `docs/structure-proposals.md`.
   - Настроить новые build-скрипты: `gradlew`, `cmake --build`, `pytest`.

5. **Контроль качества**
   - После переноса Android-модулей прогнать `./gradlew lintDebug assembleDebug`.
   - Настроить линтеры Python и C++ (clang-format, black) в `.editorconfig`.

## Риски и зависимости

- Лицензии сторонних проектов (блок 2, блок 6) — требуется проверить LGPL/MIT и совместимость.
- Вес APK: встраивание Python увеличит размер; нужно контролировать разделение модулей.
- Временное локальное дублирование кода до завершения переноса; нужно поддерживать каталог `archives/` вне основного сборочного процесса.

## Открытые вопросы

- Требуется ли сохранить функционал Electron-приложения для стендов? Если да — оформить отдельным репозиторием.
- Нужно выбрать инструмент для генерации отчётов (PDF) на Android без Node.js.
- Решить, будете ли владельцы поддерживать локальную базу DTC в SQLite или получать обновления по VPN.
