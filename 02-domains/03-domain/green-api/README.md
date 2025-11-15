# @selfservice/green-api

Модуль для интеграции с Green API WhatsApp для отправки отчётов.

## Установка

```bash
npm install @selfservice/green-api
```

## Использование

### Базовая настройка

```typescript
import { GreenApiClient, ReportSender } from '@selfservice/green-api';

// Конфигурация из Green API Console
const config = {
  idInstance: '1105335604',
  apiTokenInstance: 'e13f48d7cc5644290dcdf8adaea56ccf1326c642892149...',
  apiUrl: 'https://1105.api.green-api.com' // опционально
};

// Создание клиента
const client = new GreenApiClient(config);

// Или создание отправителя отчётов
const reportSender = new ReportSender(config);
```

### Отправка текстового сообщения

```typescript
const result = await client.sendMessage({
  chatId: '79963153818@c.us', // Номер получателя
  message: 'Привет! Это тестовое сообщение.',
  linkPreview: true
});

if (result.success) {
  console.log('Сообщение отправлено:', result.data);
} else {
  console.error('Ошибка:', result.error);
}
```

### Отправка диагностического отчёта

```typescript
const report = {
  timestamp: new Date().toISOString(),
  vehicleId: 'AUTO-001',
  vin: '1HGBH41JXMN109186',
  diagnosticCodes: ['P0420', 'P0171'],
  sensors: {
    'Температура двигателя': '92°C',
    'Обороты': '850 RPM',
    'Скорость': '0 км/ч'
  },
  summary: 'Обнаружены ошибки системы катализатора и топливной смеси'
};

const reportConfig = {
  recipientPhone: '79963153818@c.us',
  includeDetails: true,
  sendAsFile: true
};

const result = await reportSender.sendDiagnosticReport(report, reportConfig);
```

### Отправка файла

```typescript
// По URL
await client.sendFileByUrl({
  chatId: '79963153818@c.us',
  urlFile: 'https://example.com/report.pdf',
  fileName: 'diagnostic_report.pdf',
  caption: 'Отчёт диагностики'
});

// Загрузкой
const fileBuffer = Buffer.from('содержимое файла');
await client.sendFileByUpload({
  chatId: '79963153818@c.us',
  file: fileBuffer,
  fileName: 'report.txt',
  caption: 'Детальный отчёт'
});
```

### Отправка локации

```typescript
await client.sendLocation({
  chatId: '79963153818@c.us',
  latitude: 55.7558,
  longitude: 37.6173,
  nameLocation: 'Киоск самообслуживания',
  address: 'Москва, Красная площадь'
});
```

### Отправка контакта

```typescript
await client.sendContact({
  chatId: '79963153818@c.us',
  contact: {
    phoneContact: '79123456789',
    firstName: 'Иван',
    lastName: 'Петров',
    company: 'Автосервис'
  }
});
```

### Отправка опроса

```typescript
await client.sendPoll({
  chatId: '79963153818@c.us',
  message: 'Оцените качество обслуживания',
  options: ['Отлично', 'Хорошо', 'Удовлетворительно', 'Плохо'],
  multipleAnswers: false
});
```

### Отправка интерактивных кнопок

```typescript
await client.sendInteractiveButtons(
  '79963153818@c.us',
  'Выберите действие:',
  'Нажмите кнопку для выбора',
  [
    { buttonId: '1', buttonText: 'Получить отчёт' },
    { buttonId: '2', buttonText: 'Связаться с поддержкой' }
  ]
);
```

### Получение входящих уведомлений

```typescript
const notification = await client.receiveNotification();
if (notification.success && notification.data) {
  console.log('Получено уведомление:', notification.data);

  // Удаляем обработанное уведомление
  await client.deleteNotification(notification.data.receiptId);
}
```

### Получение настроек инстанса

```typescript
const settings = await client.getSettings();
if (settings.success) {
  console.log('Настройки:', settings.data);
}
```

## API

### GreenApiClient

Основной клиент для работы с Green API.

#### Методы:

- `sendMessage(options)` - отправка текстового сообщения
- `sendFileByUrl(options)` - отправка файла по URL
- `sendFileByUpload(options)` - отправка файла загрузкой
- `sendLocation(options)` - отправка геолокации
- `sendContact(options)` - отправка контакта
- `sendPoll(options)` - отправка опроса
- `sendInteractiveButtons(...)` - отправка интерактивных кнопок
- `forwardMessages(...)` - пересылка сообщений
- `getSettings()` - получение настроек инстанса
- `receiveNotification()` - получение входящих уведомлений
- `deleteNotification(receiptId)` - удаление уведомления
- `downloadFile(chatId, idMessage)` - загрузка файла

### ReportSender

Специализированный класс для отправки отчётов.

#### Методы:

- `sendDiagnosticReport(report, config)` - отправка диагностического отчёта
- `sendNotification(phone, message)` - простое уведомление
- `sendReportWithLocation(report, config, lat, lon, name)` - отчёт с локацией
- `getClient()` - получение базового клиента

## Формат номера телефона

Номера должны быть в формате: `79XXXXXXXXX@c.us`

Пример: `79963153818@c.us`

## Переменные окружения

Рекомендуется хранить credentials в `.env`:

```
GREEN_API_INSTANCE_ID=1105335604
GREEN_API_TOKEN=e13f48d7cc5644290dcdf8adaea56ccf1326c642892149...
```

## Лицензия

ISC
