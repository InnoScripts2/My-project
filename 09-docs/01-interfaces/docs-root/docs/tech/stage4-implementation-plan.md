# Stage 4 — план реализации Android-агента

## 1. Цель и границы

- Подготовить рабочий Android-киоск с Kotlin-сервисами, JNI к J2534 и обновленным UI.
- Скоординировать совместную реализацию Kotlin, C++ и сборочной инфраструктуры.
- Применить результаты Stage 3: сервисные карты, PassThru спецификации, лицензии.

## 2. Потоки работ

### 2.1 Kotlin-приложение (`apps-unified/android-kiosk/app`)
- Скелет `DiagnosticsSessionController`, `PassThruClient`, `SessionHeartbeatWorker` на основе `docs/tech/pass-thru-client-spec.md` и `docs/tech/protocol-service-cards.md`.
- Модули: `diagnostics-core` (модели, ошибки), `diagnostics-services` (оркестрация), `ui-flows` (экраны диагностики), `licensing` (отображение уведомлений).
- Интеграция с dev-режимом: флаг конфигурации без симуляции данных, кнопка «Пропустить» только при `BuildConfig.DEBUG`.
- Привязка к UI: обновить навигацию, внедрить статусы сканирования и оплат.

### 2.2 JNI и C++ слой (`apps-unified/android-kiosk/serialport` + новый `pass-thru-jni`)
- Создать модуль `pass-thru-jni` с задачами Gradle для сборки `libpassthru.so` (NDK 26, CMake toolchain).
- Реализовать обертку JNI, использующую контракт из `docs/tech/pass-thru-client-spec.md` (методы open, close, connect, read, write, ioctl).
- Подключить PassThru SDK: сравнить возможности `lib/` в `блок 4/` и задокументировать лицензии.
- Тесты уровня JNI: инструментальные (androidTest) и нативные (gtest) с моками драйвера.

### 2.3 Ресурсные пакеты и лицензии
- Перенести данные из `build/dtc-package` в формат Android assets (`diagnostics/dtc`, `diagnostics/did`).
- Обновить пайплайн `tools/data-migration/prepare_resources.py` для генерации zip и Gradle task `processDiagnosticsResources`.
- Внедрить экран лицензий, соблюдая `docs/tech/security-licensing-audit.md` и процедуры из `docs/internal/resource-update-procedure.md`.

### 2.4 Платежный контур и интеграция с агентом
- Имитация оплаты (DEV) через локальный HTTP (переиспользовать `functions/payments-webhook.ts`).
- Zipping Stage 3 результатов в единый `agent` сервис, включающий мониторинг USB и watchdog.
- Подготовить канал обмена данными с Windows locking устройством (описать в `docs/tech/lock-controller-plan.md`).

## 3. Артефакты и зависимые документы

| Артефакт | Назначение | Зависимости |
|----------|------------|-------------|
| `docs/tech/pass-thru-client-spec.md` | Контракт Kotlin-JNI | Требуется для модулей 2.1 и 2.2 |
| `docs/tech/protocol-service-cards.md` | Сценарии диагностики | Маппинг на `DiagnosticsSessionController` |
| `docs/tech/resource-conversion-audit.md` | Статус данных DTC/DID | Обновление пайплайна ресурсов |
| `docs/internal/resource-update-procedure.md` | Регламент обновления | Проверка лицензий перед сборкой |
| `docs/tech/security-licensing-audit.md` | Лицензионные требования | Экран уведомлений, README |

## 4. Индикаторы готовности Stage 4

- Сборка Gradle (`./gradlew assembleDebug`) проходит, `libpassthru.so` собирается и подключается.
- Юнит-тесты Kotlin (`./gradlew test`) и JNI (`ctest` через Gradle) успешно выполняются.
- UI демонстрирует полный поток диагностики с реальным адаптером в DEV окружении.
- Лицензионные уведомления и ресурсные пакеты поставляются в билд.
- Документация обновлена: `docs/windows-app-analysis.md`, `docs/tech/stage3-win-to-android-plan.md`, новый `docs/tech/lock-controller-plan.md`.

## 5. План действий и приоритеты

1. Подготовить структуру модулей в `apps-unified/android-kiosk` (создать пакеты, Gradle зависимости).
2. Настроить CMake/NDK и заглушки JNI с интеграцией в Kotlin.
3. Включить пайплайн ресурсов и лицензионный экран.
4. Объединить платежный мок и мониторинг адаптера.
5. Провести интеграционные тесты с адаптером и оформить результаты в `docs/tech/test-reports/stage4-smoke.md`.

## 6. Риски и смягчение

- Несовместимость PassThru SDK: подготовить fallback через серийный порт (каталог `блок 4/lib`).
- Ограничения железа киоска: предусмотреть конфигурационный файл с таймаутами и скоростями CAN.
- Лицензии сторонних компонентов: сверить перед публикацией, добавить авто-проверку в CI.

## 7. Следующие документы

- `docs/tech/lock-controller-plan.md` — детальная схема взаимодействия с замками.
- `docs/tech/test-reports/stage4-smoke.md` — шаблон отчета по смоук-тестам.
- Обновление `docs/tech/stage3-win-to-android-plan.md` с фактом старта Stage 4.
