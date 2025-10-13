# Настройка Green API для отправки отчётов

## Шаг 1: Регистрация в Green API

1. Перейдите на [console.green-api.com](https://console.green-api.com)
2. Зарегистрируйтесь или войдите в аккаунт
3. Создайте новый инстанс WhatsApp

## Шаг 2: Получение credentials

После создания инстанса вы получите:
- **idInstance** - ID вашего инстанса (например: `1105335604`)
- **apiTokenInstance** - токен для доступа к API (например: `e13f48d7cc5644290dcdf8adaea56ccf1326c642892149...`)

Эти данные видны на скриншотах в вашей консоли.

## Шаг 3: Настройка инстанса

### Основные настройки (GetSettings)

Из скриншота видны текущие настройки:
```json
{
  "wid": "79963153818@c.us",
  "countryInstance": "",
  "delaySendMessagesMilliseconds": 500,
  "markIncomingMessagesReaded": "no",
  "deleteMessagesWebhook": "no",
  "editedMessageWebhook": "yes",
  "incomingWebhook": "yes",
  "outgoingWebhook": "yes",
  "outgoingMessageWebhook": "yes",
  "outgoingAPIMessageWebhook": "yes",
  "incomingCallWebhook": "yes",
  "keepOnlineStatus": "yes",
  "statusInstanceWebhook": "yes"
}
```

### Рекомендуемые настройки для отчётов

- **outgoingWebhook**: `yes` - для подтверждения отправки
- **delaySendMessagesMilliseconds**: `500` - задержка между сообщениями
- **keepOnlineStatus**: `yes` - оставаться онлайн

## Шаг 4: Настройка в проекте

### 4.1 Установка зависимостей

```bash
cd packages/green-api
npm install
```

### 4.2 Создание .env файла

Скопируйте `.env.example` в `.env`:

```bash
cp .env.example .env
```

Заполните данные из Green API Console:

```env
GREEN_API_INSTANCE_ID=1105335604
GREEN_API_TOKEN=e13f48d7cc5644290dcdf8adaea56ccf1326c642892149...
GREEN_API_URL=https://1105.api.green-api.com
GREEN_API_RECIPIENT_PHONE=79963153818@c.us
```

### 4.3 Формат номера телефона

Номер получателя должен быть в формате `79XXXXXXXXX@c.us`:
- `79963153818@c.us` - правильно ✅
- `+79963153818` - неправильно ❌
- `89963153818` - неправильно ❌

## Шаг 5: Тестирование

### Тест отправки простого сообщения

```typescript
import { GreenApiClient } from '@selfservice/green-api';

const client = new GreenApiClient({
  idInstance: '1105335604',
  apiTokenInstance: 'ваш-токен'
});

// Отправка тестового сообщения
const result = await client.sendMessage({
  chatId: '79963153818@c.us',
  message: '🤖 Тест отправки сообщения из киоска'
});

console.log(result);
```

### Тест отправки отчёта

```typescript
import { ReportSender } from '@selfservice/green-api';

const sender = new ReportSender({
  idInstance: '1105335604',
  apiTokenInstance: 'ваш-токен'
});

const report = {
  timestamp: new Date().toISOString(),
  vehicleId: 'TEST-001',
  vin: '1HGBH41JXMN109186',
  diagnosticCodes: ['P0420', 'P0171'],
  sensors: {
    'Температура': '92°C',
    'Обороты': '850 RPM'
  },
  summary: 'Тестовый отчёт диагностики'
};

await sender.sendDiagnosticReport(report, {
  recipientPhone: '79963153818@c.us',
  includeDetails: true
});
```

## Шаг 6: Интеграция в приложение киоска

### 6.1 В apps/kiosk-agent

Добавьте в `package.json`:

```json
{
  "dependencies": {
    "@selfservice/green-api": "workspace:*"
  }
}
```

### 6.2 Использование в коде агента

```typescript
import { greenApiReporter } from '@selfservice/green-api/examples/kiosk-integration';

// После завершения диагностики
await greenApiReporter.sendDiagnosticComplete({
  vin: obdData.vin,
  dtcCodes: obdData.troubleCodes,
  sensorData: obdData.sensors
});

// При ошибке
await greenApiReporter.sendErrorNotification('OBD адаптер не подключён');

// Дневная статистика
await greenApiReporter.sendDailyStats({
  totalDiagnostics: 25,
  successfulDiagnostics: 23,
  failedDiagnostics: 2,
  revenue: 12500
});
```

## Доступные методы API

Согласно скриншотам Green API Console:

### Отправка
- ✅ SendMessage - текстовые сообщения
- ✅ SendFileByUrl - файлы по URL
- ✅ SendFileByUpload - загрузка файлов
- ✅ SendLocation - геолокация
- ✅ SendContact - контакты
- ✅ SendPoll - опросы
- ✅ SendInteractiveButtons - интерактивные кнопки
- ✅ ForwardMessages - пересылка сообщений

### Получение
- ✅ ReceiveNotification - входящие уведомления
- ✅ DeleteNotification - удаление уведомлений
- ✅ DownloadFile - скачивание файлов
- ✅ GetSettings - настройки инстанса

## Мониторинг

### Проверка статуса инстанса

```typescript
const settings = await client.getSettings();
console.log('Instance status:', settings.data?.wid);
```

### Получение входящих сообщений

```typescript
const notification = await client.receiveNotification();
if (notification.success && notification.data) {
  console.log('Новое уведомление:', notification.data);
  await client.deleteNotification(notification.data.receiptId);
}
```

## Лимиты и ограничения

- Задержка между сообщениями: 500мс (настраивается)
- Максимальный размер файла: уточните в документации Green API
- Рекомендуется не более 100 сообщений в минуту

## Поддержка

При возникновении проблем:
1. Проверьте статус инстанса в консоли
2. Убедитесь, что WhatsApp подключён
3. Проверьте формат номера телефона
4. Проверьте права доступа к API

## Полезные ссылки

- [Green API Documentation](https://green-api.com/docs/)
- [API Reference](https://green-api.com/docs/api/)
- [Console](https://console.green-api.com)
