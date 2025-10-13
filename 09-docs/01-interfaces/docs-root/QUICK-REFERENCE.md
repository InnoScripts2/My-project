# Киоск OBD-II: Краткая справка

## 🚀 Быстрый старт (DEV)

```bash
# 1. Установка зависимостей
npm install
cd 03-apps/02-application/kiosk-agent && npm install && cd ../../..

# 2. Запуск агента (терминал 1)
npm --prefix 03-apps/02-application/kiosk-agent run dev
# Ожидаемо: [agent] listening on :7070

# 3. Запуск фронтенда (терминал 2)
npm run static
# Ожидаемо: [static] serving on http://localhost:8080
#          [static] LAN URLs: http://192.168.x.x:8080

# 4. Открыть браузер
http://localhost:8080/
```

---

## 🔧 Настройка URL агента

### Вариант 1: URL-параметр (быстро)
```
http://localhost:8080/?agent=http://192.168.1.100:7070
```

### Вариант 2: Консоль браузера (F12)
```javascript
window.setAgentUrl('http://192.168.1.100:7070');
location.reload();
```

### Вариант 3: Проверка текущего
```javascript
console.log(window.AGENT_API_BASE);
```

---

## 📱 Android-приложение

### Сборка APK
```bash
npm run apk:doctor          # Проверка окружения
npm run apk:build           # Debug APK
npm run apk:build:release   # Release APK
```

### Установка
```bash
adb install -r 03-apps/02-application/android-kiosk/app/build/outputs/apk/debug/app-debug.apk
```

### Смена URL в приложении
1. **Долгое нажатие** на экран (3 секунды)
2. Ввести новый URL
3. Нажать "Сохранить"

Или через офлайн-экран → "Настроить URL"

---

## 🔌 OBD-II адаптер

### Проверка портов (Windows)
```powershell
Get-WmiObject Win32_PnPEntity | Where-Object { $_.Name -match "COM\d+" }
```

### API проверка
```bash
# Список портов
curl http://localhost:7070/api/serialports

# Подключение
curl -X POST http://localhost:7070/api/obd/open \
  -H "Content-Type: application/json" \
  -d '{"portPath":"COM3","baudRate":38400}'

# Чтение DTC
curl -X POST http://localhost:7070/api/obd/read-dtc

# Самопроверка
curl -X POST http://localhost:7070/api/obd/self-check \
  -H "Content-Type: application/json" \
  -d '{"attempts":3,"delayMs":500}'
```

---

## 🔥 Firewall (Windows)

### Открыть порты через PowerShell
```powershell
# Агент + фронтенд
New-NetFirewallRule -DisplayName "Kiosk Ports" `
  -Direction Inbound -LocalPort 7070,8080,8081 `
  -Protocol TCP -Action Allow -Profile Private
```

### Проверка
```powershell
Get-NetFirewallRule -DisplayName "Kiosk*"
```

---

## 🛠️ Устранение неполадок

### Агент не запускается (порт занят)
```bash
# Найти процесс
netstat -ano | findstr :7070

# Убить
taskkill /PID <PID> /F

# Или другой порт
set AGENT_PORT=7071
npm --prefix 03-apps/02-application/kiosk-agent run dev
```

### Фронтенд не видит агент
```javascript
// 1. Проверить URL
console.log(window.AGENT_API_BASE);

// 2. Изменить
window.setAgentUrl('http://192.168.1.100:7070');

// 3. Обновить
location.reload();
```

### Android черный экран
1. Проверить URL: открыть в Chrome `http://31.31.197.40/`
2. Долгое нажатие → сменить URL
3. Логи: `adb logcat -s KioskMainActivity`

---

## 📊 Тестирование

### Запуск тестов
```bash
# Агент
npm --prefix 03-apps/02-application/kiosk-agent test

# Линтеры
npm run lint
```

### Ожидаемо
```
# tests 33
# pass 33
# fail 0

Scanned 1 files, no errors found
```

---

## 📚 Полная документация

- **Оператор**: `docs/HOWTO-OPERATOR.md`
- **Техническая**: `docs/tech/AGENT_API_BASE_CONFIG.md`
- **Итоги**: `docs/DEPLOYMENT-SUMMARY.md`

---

## ✅ Контрольный список

### Перед запуском
- [ ] Node.js 20+ установлен
- [ ] `npm install` выполнен
- [ ] Порты 7070, 8080 открыты в firewall

### DEV режим
- [ ] Агент запущен (`:7070`)
- [ ] Фронтенд запущен (`:8080`)
- [ ] Браузер открыт на `localhost:8080`

### PROD режим
- [ ] Фронтенд выложен на `31.31.197.40`
- [ ] Агент запущен на киоске (`:7070`)
- [ ] AGENT_API_BASE настроен
- [ ] APK установлен на Android

### OBD-II
- [ ] Адаптер подключен (USB/Bluetooth)
- [ ] Порт определяется в Device Manager
- [ ] Самопроверка пройдена

---

**Версия**: 1.0 | **Дата**: 2024-01-20 | **Статус**: Готов к PROD
