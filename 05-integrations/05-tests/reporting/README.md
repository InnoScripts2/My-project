# Reporting Tests — Тесты генерации и отправки отчётов

## Назначение

Тесты интеграций, связанных с генерацией отчётов и их доставкой клиентам. Включает моки внешних сервисов (email/SMS провайдеры, storage) для изолированного тестирования.

## Цель

Обеспечить покрытие тестами:
- Генерация HTML/PDF отчётов для обеих услуг (толщинометрия, диагностика)
- Отправка отчётов через email/SMS
- Загрузка отчётов в облачное хранилище
- Получение signed URLs для просмотра отчётов
- Обработка ошибок доставки и повторные попытки

## Входы (тестовые данные)

- **Mock Report Data:**
  - `sessionId: string` — ID сессии
  - `serviceType: 'thickness' | 'diagnostics'` — тип услуги
  - `measurements?: Array<{ zone: string; value: number }>` — замеры (для толщинометрии)
  - `dtcCodes?: Array<{ code: string; description: string }>` — коды ошибок (для диагностики)
  - `clientContacts: { email?: string; phone?: string }` — контакты клиента

- **Mock Provider Responses:**
  - `emailProvider: { success: boolean; messageId?: string; error?: string }`
  - `smsProvider: { success: boolean; messageId?: string; error?: string }`
  - `storageProvider: { success: boolean; url?: string; error?: string }`

- **Test Scenarios:**
  - Успешная генерация и отправка
  - Сбой провайдера и retry логика
  - Отсутствие контактов клиента
  - Невалидные данные отчёта
  - DEV-режим (симуляция без реальной отправки)

## Выходы (assertions)

- **Report Generation:**
  - `reportId: string` — сгенерированный ID отчёта
  - `htmlPath: string` — путь к HTML файлу
  - `pdfPath?: string` — путь к PDF файлу (если включена генерация)
  - Валидность HTML разметки (no broken tags)

- **Delivery Status:**
  - `emailDelivered: boolean` — успешность отправки email
  - `smsDelivered: boolean` — успешность отправки SMS
  - `retryCount: number` — количество попыток
  - `deliveredAt?: Date` — время доставки

- **Storage Result:**
  - `uploaded: boolean` — файл загружен в storage
  - `publicUrl?: string` — публичный или signed URL
  - `expiresAt?: Date` — срок действия URL

## Принципы

- **Изоляция:** Моки для всех внешних зависимостей
- **Реалистичность:** Тестовые данные максимально приближены к продакшн
- **Полнота:** Покрытие happy path и error scenarios
- **Производительность:** Быстрые unit-тесты без реальных сетевых запросов

## Структура тестов

```
05-tests/reporting/
├── README.md (этот файл)
├── report-generation.test.ts      # Тесты генерации HTML/PDF
├── email-delivery.test.ts         # Тесты email провайдера
├── sms-delivery.test.ts           # Тесты SMS провайдера
├── storage-upload.test.ts         # Тесты загрузки в storage
├── end-to-end.test.ts             # E2E тесты полного потока
└── mocks/
    ├── email-provider.mock.ts     # Mock email провайдера
    ├── sms-provider.mock.ts       # Mock SMS провайдера
    └── storage-provider.mock.ts   # Mock storage провайдера
```

## Интеграция

Тестирует:
- `03-apps/kiosk-agent/src/reports/` — сервис генерации отчётов
- `02-application/comm/` — логика отправки сообщений
- `04-infrastructure/` — реализации провайдеров
