# Session 02 — Android Root Scaffolding

Дата: 03.11.2025
Диапазон: Фаза A, сессия 2 (старт)

## Выполненные действия
- Создан корневой `android/` Gradle-проект: добавлены `settings.gradle.kts`, `build.gradle.kts`, `gradle/libs.versions.toml`, `gradle.properties`.
- Настроены репозитории pluginManagement/dependencyResolution для `google()` и `mavenCentral()`; включена поддержка `TYPESAFE_PROJECT_ACCESSORS`.
- В `settings.gradle.kts` объявлены целевые модули `:app`, `:core`, `:feature-*`, `:platform-background`.
- В `libs.versions.toml` зафиксированы версии AGP 8.4.1, Kotlin 1.9.24, AndroidX, Room, Coroutines, JUnit, Mockito.
- Создан подмодуль `android/app` (Kotlin DSL `build.gradle.kts` с viewBinding, зависимостями из каталога версий, `proguard-rules.pro`).
- Перенесены базовые Android-артефакты из unified-проекта: `AndroidManifest.xml`, `MainActivity.kt` (c viewBinding и жестом настройки URL), ресурсы `values/`, `drawable/`, `layout/activity_main.xml`, `xml/network_security_config.xml`.

## Выводы
- Корневой Gradle-каталог готов к приёму модулей; `android/app` уже содержит перенесённый базовый UI и конфигурацию.
- Для сборки нужно добавить Gradle wrapper в `android/` или настроить использование существующего (`apps-unified/android-kiosk/gradlew`).
- Следом требуется вынести общие утилиты в `android/core` и подготовить шаблон тестовой инфраструктуры.

## Следующие шаги
1. Подготовить модуль `android/core` (build.gradle.kts, базовые утилиты, общие зависимости).
2. Продумать схему переноса BLE/diagnostics в `feature-obd-*` и описать требования к интерфейсам.
3. Добавить Gradle wrapper в `android/` или зафиксировать процедуру вызова wrapper из unified-проекта.
