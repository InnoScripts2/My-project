# ✅ Чек-лист установки Green API

## Проверьте установку

### ✅ Шаг 1: Файлы созданы

- [x] `packages/green-api/package.json`
- [x] `packages/green-api/src/index.ts`
- [x] `packages/green-api/src/types.ts`
- [x] `packages/green-api/src/client.ts`
- [x] `packages/green-api/src/report-sender.ts`
- [x] `packages/green-api/src/client.test.ts`
- [x] `packages/green-api/examples/kiosk-integration.ts`
- [x] `packages/green-api/tsconfig.json`
- [x] `packages/green-api/README.md`
- [x] `packages/green-api/SETUP.md`
- [x] `packages/green-api/QUICKSTART.md`
- [x] `packages/green-api/test-send.js`
- [x] `packages/green-api/.env.example`
- [x] `packages/green-api/.gitignore`
- [x] `docs/GREEN_API_INTEGRATION.md`

### ✅ Шаг 2: Зависимости установлены

```bash
cd packages/green-api
npm install
```

Должно быть установлено:
- node-fetch@^3.3.2
- @types/node@^20.0.0
- typescript@^5.0.0

### ✅ Шаг 3: Настройте .env

1. Скопируйте `.env.example` в `.env`:
```bash
cd packages/green-api
cp .env.example .env
```

2. Заполните данные из Green API Console:
```env
GREEN_API_INSTANCE_ID=1105335604
GREEN_API_TOKEN=e13f48d7cc5644290dcdf8adaea56ccf1326c642892149...
GREEN_API_RECIPIENT_PHONE=79963153818@c.us
```

### ✅ Шаг 4: Запустите тесты

```bash
cd packages/green-api
node test-send.js
```

Ожидаемый результат:
```
🚀 Запуск тестов Green API

Instance ID: 1105335604
Получатель: 79963153818@c.us
Token: НАСТРОЕН ✅
──────────────────────────────────────────────────
🧪 Тест 1: Отправка простого сообщения...
✅ Сообщение отправлено успешно!

🧪 Тест 2: Отправка диагностического отчёта...
✅ Отчёт отправлен успешно!

🧪 Тест 3: Получение настроек инстанса...
✅ Настройки получены:
📱 WhatsApp ID: 79963153818@c.us
──────────────────────────────────────────────────
📊 Результаты:
Тест 1 (Сообщение): ✅ PASS
Тест 2 (Отчёт): ✅ PASS
Тест 3 (Настройки): ✅ PASS

✅ ВСЕ ТЕСТЫ ПРОЙДЕНЫ!
```

### ✅ Шаг 5: Проверьте WhatsApp

После запуска тестов вы должны получить 3 сообщения в WhatsApp:
1. 🤖 Тестовое сообщение из системы киоска
2. 📊 Отчёт диагностики с данными
3. Настройки должны отобразиться в консоли

### ✅ Шаг 6: Интеграция в проект

Добавьте в `apps/kiosk-agent/package.json`:
```json
{
  "dependencies": {
    "@selfservice/green-api": "workspace:*"
  }
}
```

Затем:
```bash
cd apps/kiosk-agent
npm install
```

### ✅ Шаг 7: Используйте в коде

```typescript
import { greenApiReporter } from '@selfservice/green-api/examples/kiosk-integration';

// После диагностики
await greenApiReporter.sendDiagnosticComplete({
  vin: '1HGBH41JXMN109186',
  dtcCodes: ['P0420'],
  sensorData: { temp: 92 }
});
```

## 🔍 Troubleshooting

### Ошибка: "Cannot find module '@selfservice/green-api'"

**Решение:**
1. Убедитесь, что вы в правильной директории
2. Запустите `npm install` в `packages/green-api`
3. В проекте-потребителе добавьте зависимость workspace

### Ошибка: "Instance not found" или "Unauthorized"

**Решение:**
1. Проверьте `.env` файл в `packages/green-api/`
2. Убедитесь, что `GREEN_API_INSTANCE_ID` и `GREEN_API_TOKEN` правильные
3. Проверьте статус инстанса в [console.green-api.com](https://console.green-api.com)

### Сообщения не доходят

**Решение:**
1. Проверьте формат номера: `79XXXXXXXXX@c.us` (не `+7` или `8`)
2. Убедитесь, что WhatsApp подключён в консоли Green API
3. Проверьте настройки webhook в консоли

### TypeScript ошибки "Cannot find name 'Buffer'"

**Решение:**
```bash
cd packages/green-api
npm install --save-dev @types/node
```

## 📱 Быстрая проверка через curl

### Тест 1: Отправка сообщения
```bash
curl -X POST "https://1105.api.green-api.com/waInstance1105335604/sendMessage/ВАШ_ТОКЕН" \
  -H "Content-Type: application/json" \
  -d '{"chatId":"79963153818@c.us","message":"Тест из curl"}'
```

### Тест 2: Получение настроек
```bash
curl "https://1105.api.green-api.com/waInstance1105335604/getSettings/ВАШ_ТОКЕН"
```

## ✨ Готово!

Если все тесты прошли успешно:
1. ✅ Модуль установлен и работает
2. ✅ Связь с Green API установлена
3. ✅ Можно интегрировать в приложение киоска

## 📚 Следующие шаги

1. Прочитайте полную документацию:
   - `packages/green-api/README.md`
   - `packages/green-api/SETUP.md`
   - `docs/GREEN_API_INTEGRATION.md`

2. Изучите примеры:
   - `packages/green-api/examples/kiosk-integration.ts`

3. Интегрируйте в свой проект:
   - Добавьте вызовы `greenApiReporter` в обработчики событий
   - Настройте переменные окружения для production

4. Настройте мониторинг:
   - Логирование отправленных отчётов
   - Метрики успешности отправки
   - Алерты при ошибках

## 🆘 Нужна помощь?

- Документация Green API: https://green-api.com/docs/
- Консоль: https://console.green-api.com
- Примеры в проекте: `packages/green-api/examples/`
- Технические документы: `docs/GREEN_API_INTEGRATION.md`
