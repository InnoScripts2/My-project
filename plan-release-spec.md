# Техническое задание — Доведение приложения до релиза

Дата: 28.10.2025
Версия: 1.0
Автор: команда разработки

## Краткое назначение
Этот документ — исчерпывающее техзадание для разработки и выпуска киоскового Android‑приложения и сопутствующей инфраструктуры (BLE адаптеры KINGBOLEN Ediag Plus, отчёты, OTA, мониторинг). Цель — подготовить проект до бизнес‑релиза: стабильность BLE/UDS, безопасность, CI/CD, MDM, телеметрия, тестирование и документация.

---

## Scope (объём работ)
1. CI/CD, reproducible builds, подпись релизов, release gating.
2. Безопасность: хранение секретов, шифрование данных, защита OTA/прошивок.
3. Стабильность BLE/UDS: надежные сессии, ISO‑TP поверх BLE, восстановление и backoff.
4. Edge cache, offline‑first поведение и синхронизация.
5. Телеметрия/мониторинг/алерты (Prometheus/Grafana).
6. UX и доступность (WCAG, озвучивание, крупные CTA).
7. Платежи: интеграция PSP и соответствие PCI базовым требованиям.
8. MDM и управление парком устройств.
9. HIL и field тестирование, regression suite.
10. Документация релиза, runbooks, инструкции для Ops.

---

## Условия успеха / Acceptance criteria
- CI pipeline собирает релизный APK и создает подписанный артефакт в GitHub Releases.
- Все критические unit тесты и contract tests проходят в CI; интеграционные HIL тесты запускаются по расписанию.
- BLE/UDS сессии стабильны: подключение < X сек (см. `plan-performance-benchmarks.md`), чтение DTC < Y сек.
- OTA/firmware validation: неподписанные прошивки отклоняются, журналы версий доступны.
- Telemetry: основные метрики экспортируются в Prometheus и отображаются в Grafana; алерты срабатывают на тестовых триггерах.
- Edge‑cache корректно сохраняет и реплицирует данные при переходе offline→online.
- UX: ключевые сценарии валидированы на пилоте, accessibility checklist выполнен.

---

## Контракты и интерфейсы (кратко)
- BLE adapter ↔ app:
  - GATT services: control (power/save), data (ISO‑TP), telemetry (battery/RSSI), fw‑update.
  - Commands: `WAKE`, `POWER_SAVE`, `READ_DTC`, `CLEAR_DTC`, `FW_MANIFEST_REQUEST`.
- App ↔ Backend (if any): REST API / secure uplink for telemetry and reports — JSON schema в `plan-diagnostics-data-pipeline.md`.
- App ↔ Edge cache: локальное шифрованное SQLite/SQLCipher с таблицами `diagnostics`, `reports`, `sync_queue`.
- App ↔ Payment gateway: `createIntent`, `confirm`, `status` (idempotent operations + webhooks for DEV emulation).

---

## Детализация требований по областям

### 1) CI/CD и релизные артефакты
- Добавить/утвердить GitHub Actions workflow `android-release.yml` с этапами: lint/detekt, unit tests, build-release, sign (using CI secret keystore), upload release draft.
- Обеспечить SARIF и security report upload (Dependency‑Check/OWASP).
- Добавить Gradle task `releaseGate` для проверки coverage, detekt warnings, dependency audit.
- Хранение keystore: GitHub Secrets (keystore base64, alias, password) + инструкции в `docs/release/security.md`.

Deliverables: `/.github/workflows/android-release.yml`, Gradle tasks, docs.

### 2) Безопасность и секреты
- Интеграция Google Tink или Tink + Android Keystore для шифрования PII и серийников.
- Все серийники/IMEI/мак адреса должны храниться зашифрованными (AES‑GCM) и логироваться только в хешированном виде.
- Добавить процедуры ротации ключей и revoke: `plan-secrets-config.md` → реализация в `apps/kiosk-agent/src/security`.
- SAST/SCA: настроить Snyk/Dependabot/OWASP Dependency‑Check в CI.

Deliverables: `apps/kiosk-agent/src/security/*`, unit tests, `docs/release/security.md`.

### 3) BLE / UDS / ISO‑TP
- Реализовать/IP‑тестировать `UdsIsoTpChannel` поверх BLE: поддержка сегментации, reassembly, flow control, retry.
- `BleSessionStateMachine` с фазами handshake→diagnostics→closing, watchdog timers, MTU negotiation.
- `BleReconnectCoordinator` с backoff матрицей (exponential with jitter), max attempts configurable.
- `UdsCommandRouter` выполняет последовательность SID/DID/PID и валидацию ответов (schemas in `plan-diagnostics-data-pipeline.md`).
- Метрики: connect_time, reconnect_count, MTU_used, packet_loss_rate.

Deliverables: Kotlin modules in `apps/kiosk-agent/src/devices/ble` и тесты `UdsIsoTpChannelContractTest`.

### 4) Firmware / OTA validation
- Описать формат manifest: version, signed_hash, compatible_models, required_min_app_version.
- Модуль верификации подписи (public key в app config, rotate support) и логирования в `firmware_audit.log`.
- При загрузке: validate signature → validate compatibility → staged apply → smoke check → finalize/rollback.

Deliverables: `apps/kiosk-agent/src/firmware/*`, manifest spec, CI checks for signed images.

### 5) Edge cache и оффлайн-работа
- Таблицы: `diagnostics(id, session_id, payload_encrypted, timestamp, synced_flag)`, `sync_queue(id, resource, payload, retries)`.
- TTL: 30 дней для диагностических данных, policy: encrypted deletion after TTL.
- При подключении: two‑phase sync (post metadata → upload payloads) with idempotency keys.
- Конфликты: last‑write wins for telemetry, diagnostics immutable (append only).

Deliverables: module `packages/report` or `apps/kiosk-agent/src/cache` + integration tests.

### 6) Телеметрия и мониторинг
- Экспонировать Prometheus metrics endpoint (embedded http server) with metrics listed in `plan-device-monitoring.md`.
- Настроить Grafana dashboard «Device Fleet Health» и alert rules for: offline > 60m, high reconnect rate, UPS battery low.
- Local audit log for sensitive events (clear DTC, firmware apply) with retention policy.

Deliverables: `apps/kiosk-agent/src/telemetry`, Grafana dashboards JSON, Alertmanager rules.

### 7) UX и доступность
- Обновить screens: Attract → Welcome → Services → Flow for Thickness and Diagnostics → Paywall → Results.
- Screen states, timeout rules, dev flag for "Skip" disabled in PROD per `.github/instructions`.
- Accessibility: large touch targets, ARIA/announce events (TextToSpeech), contrast ratios, font scaling support.

Deliverables: `apps/kiosk-frontend/*`, accessibility checklist results.

### 8) Платежи
- Implement `PaymentGateway` interface with dev emulator + real PSP adapter (configurable via ENV).
- All payment flows idempotent and audited; receipts persisted encrypted; webhooks validated.
- PCI: ensure card data never stored; use PSP tokenization.

Deliverables: `apps/kiosk-agent/src/payments`, dev emulator, docs for PCI readiness.

### 9) MDM, fleet и ops
- MDM profile template (Android) for kiosk lockdown, remote wipe, app reinstall.
- `fleetctl.py` CLI and API endpoints for inventory sync and remote actions.
- Integration with `plan-device-fleet.md` DB schema.

Deliverables: `tools/device-fleet/fleetctl.py`, MDM profile samples, inventory DB migration.

### 10) Тестирование и HIL
- Unit tests for all new modules.
- Contract tests for BLE/UDS using emulator/simulator.
- HIL scripts for FT-01…FT-06, FT-PWR-01; runner `tools/hil/ft_runner.py` must produce structured JSON reports.
- Nightly regression job in CI to run smoke and upload results to `outbox/tests`.

Deliverables: tests, HIL scripts, CI configuration.

### 11) Документация и runbooks
- `plan-release-docs.md` — релизная документация для SRE и Ops.
- Runbooks: self‑check handling, incident triage, firmware rollback steps.
- User docs: short on‑screen help and printable leaflets (from `plan-user-support-materials.md`).

Deliverables: docs in `docs/release/*`, templates for release notes.

---

## Acceptance тесты (минимум)
- E2E: flow diagnostics (connect, read DTC, pay, show results) in < 10 min on staging device.
- Security: secrets encryption/decryption unit tests; SAST must show no high severity findings.
- Telemetry: simulate 100 devices posting metrics; Grafana dashboard updates and alert triggers.
- Firmware: attempt to apply unsigned image — operation must be rejected.
- Edge cache: create 50 offline sessions, bring online, ensure all uploaded and removed locally.

---

## Файлы для правок (рекомендуемый список)
- `apps/kiosk-agent/src/...` (ble, firmware, security, telemetry, payments, cache)
- `apps/kiosk-frontend/src/...` (screens, accessibility)
- `tools/device-fleet/fleetctl.py` (инвентарь)
- `tools/hil/ft_runner.py` (HIL runner)
- `docs/release/*`, `plan-*.md` (обновить по итогам работ)
- `/.github/workflows/android-release.yml` (новый)

---

## Риски и mitigation
- Непредсказуемость BLE на разных адаптерах — mitigation: добавить альтернативные адаптеры в тестах, MTU negotiation и aggressive retries.
- Утечка секретов — mitigation: SCA + keystore + audit logs + limited access.
- Ошибки в OTA — mitigation: staged rollout, canary, automatic rollback.

---

## Roadmap и оценки (время и владельцы)
Предложение по приоритетам: 1) CI/CD + security (2–3 спринта), 2) BLE/UDS runtime + tests (3–4 спринта), 3) Edge cache + telemetry (2 спринта), 4) UX + payments + MDM (2–3 спринта), 5) Pilot + docs (1–2 спринта).

Рекомендация: разбить на спринты по 2 недели, составить план‑релизы и checkpoints.

---

## PR checklist для задач
- [ ] Code compiles, all unit tests green
- [ ] Detekt/ESLint и форматтеры пройдены
- [ ] Security scan (Snyk/Dependency‑Check) — нет high/critical
- [ ] Добавлены/обновлены план‑файлы и документация
- [ ] Acceptance tests добавлены и зелёные
- [ ] Описание в PR с ссылками на план‑файлы

---

## Контакты и роли
- Device Fleet Owner — владение парком и релиз‑инвентарь.
- QA Lead — HIL и regression suite.
- Security Officer — SAST/SCA и ключи.
- DevOps — CI/CD и релизная механика.

---

Если хотите, я могу:
- добавить этот документ в `prompts.txt` как артефакт и пометить соответствующий промпт; или
- начать автоматически создавать предложенные GitHub Actions и базовую структуру кода (начать с CI audit).

Файл: `plan-release-spec.md` создан в корне репозитория.
