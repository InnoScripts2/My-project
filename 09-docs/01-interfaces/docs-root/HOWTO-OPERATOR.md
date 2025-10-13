# Быстрый старт киоска: Оператор

Этот документ описывает, как запустить киоск самообслуживания, настроить URL-адреса и проверить работу оборудования OBD-II.

## Содержание
- [Системные требования](#системные-требования)
- [Режимы работы](#режимы-работы)
- [Запуск в DEV режиме](#запуск-в-dev-режиме)
- [Запуск в PROD режиме](#запуск-в-prod-режиме)
- [Настройка AGENT_API_BASE](#настройка-agent_api_base)
- [Android-приложение](#android-приложение)
- [Проверка OBD-II адаптера](#проверка-obd-ii-адаптера)
- [Открытие портов брандмауэра Windows](#открытие-портов-брандмауэра-windows)
- [Устранение неполадок](#устранение-неполадок)

---

## Системные требования

### Для агента (kiosk-agent)
- **ОС**: Windows 10/11, Linux
- **Node.js**: v18+ (рекомендуется v20)
- **Порты**: 7070 (агент HTTP API)
- **Устройства**: COM-порт или Bluetooth для OBD-II адаптера ELM327

### Для фронтенда (kiosk-frontend)
- **Браузер**: Chrome 90+, Edge 90+, Firefox 88+
- **Порты**: 8080 или 8081 (для DEV статического сервера)
- **Сеть**: Доступ к агенту на порту 7070

### Для Android-приложения
- **ОС**: Android 7.0+ (API 24+)
- **Сеть**: WiFi или мобильные данные для доступа к http://31.31.197.40/

---

## Режимы работы

### DEV режим
- Локальная разработка на одной машине
- Фронтенд: http://localhost:8080/ или http://localhost:8081/
- Агент: http://localhost:7070/
- Кнопка "Пропустить" доступна через параметр `?dev=1`
- Симуляция платежей (если включена в агенте)

### PROD режим
- Боевое развертывание
- Фронтенд: http://31.31.197.40/
- Агент: на каждом киоске локально на порту 7070
- Никаких симуляций данных
- Кнопки "Пропустить" нет

---

## Запуск в DEV режиме

### 1. Установка зависимостей
```bash
# Корневой каталог
npm install

# Агент
cd apps/kiosk-agent
npm install
cd ../..
```

### 2. Запуск агента
```bash
# В отдельном терминале
cd apps/kiosk-agent
npm run dev
```
Агент должен запуститься на порту 7070. В консоли будет:
```
[agent] listening on :7070
```

### 3. Запуск статического сервера фронтенда
```bash
# В другом терминале
npm run static
```
Статический сервер должен запуститься на порту 8080 (или 8081, если 8080 занят). В консоли будет:
```
[static] serving .../apps/kiosk-frontend on http://localhost:8080
[static] LAN URLs:
  http://192.168.1.100:8080
```

### 4. Открыть браузер
```
http://localhost:8080/
```
Для включения DEV-кнопки "Пропустить":
```
http://localhost:8080/?dev=1
```

### 5. Подключить OBD-II адаптер (опционально)
- Вставьте ELM327 адаптер в USB (Serial) или включите Bluetooth
- В интерфейсе киоска перейдите в раздел "Диагностика OBD-II"
- Выберите порт (например, COM3 или Bluetooth адрес)
- Запустите самопроверку

---

## Запуск в PROD режиме

### 1. Подготовка фронтенда на хосте 31.31.197.40
Выложите содержимое `apps/kiosk-frontend/` на веб-сервер (nginx, Apache, etc.) по адресу:
```
http://31.31.197.40/
```

### 2. Запуск агента на каждом киоске
```bash
cd apps/kiosk-agent
npm run build
npm run start
```
Или через systemd/pm2 для автозапуска.

### 3. Настройка AGENT_API_BASE на фронтенде
Поскольку фронтенд загружается с 31.31.197.40, а агент работает локально на каждом киоске (127.0.0.1:7070 или LAN IP), нужно явно задать URL агента.

**Вариант 1: URL параметр (для быстрой проверки)**
```
http://31.31.197.40/?agent=http://192.168.1.100:7070
```

**Вариант 2: Программная установка в консоли браузера**
```javascript
window.setAgentUrl('http://192.168.1.100:7070');
// Затем обновите страницу
location.reload();
```

**Вариант 3: Предустановка в HTML**
Добавьте перед основным скриптом в `index.html`:
```html
<script>
  window.AGENT_API_BASE = 'http://192.168.1.100:7070';
</script>
```

---

## Настройка AGENT_API_BASE

Конфигурация `AGENT_API_BASE` определяет, куда фронтенд будет отправлять запросы API.

### Приоритет источников
1. **window.AGENT_API_BASE** (установлен в коде до загрузки фронтенда)
2. **URL параметр ?agent=...** (при загрузке страницы)
3. **localStorage.kiosk_agent_url** (сохранен ранее)
4. **Авто-детект** (localhost:7070 по умолчанию)

### Примеры
```javascript
// Через консоль браузера
window.setAgentUrl('http://192.168.1.100:7070');

// Проверка текущего значения
console.log(window.AGENT_API_BASE);
```

### Для разработчиков
При работе с локальным агентом в LAN:
1. Запустите агент: `npm --prefix apps/kiosk-agent run dev`
2. Узнайте LAN IP агента (из вывода `npm run static`)
3. Откройте фронтенд с параметром: `http://localhost:8080/?agent=http://192.168.1.100:7070`

---

## Android-приложение

### Дефолтный URL
По умолчанию Android WebView загружает:
```
http://31.31.197.40/
```
(Задано в `apps/android-kiosk/app/src/main/res/values/strings.xml`)

### Смена URL
#### Вариант 1: Долгое нажатие на экран
1. Удерживайте экран 3 секунды
2. В диалоге введите новый URL
3. Нажмите "Сохранить"

#### Вариант 2: Офлайн-экран
Если сервер недоступен:
1. Появится офлайн-экран
2. Нажмите "Настроить URL"
3. Введите новый URL
4. Нажмите "Повторить попытку"

### Сборка и установка APK
```bash
# Проверка окружения
npm run apk:doctor

# Сборка Debug APK
npm run apk:build

# Сборка Release APK
npm run apk:build:release
```
APK будет в:
```
apps/android-kiosk/app/build/outputs/apk/debug/app-debug.apk
```

Установка на устройство:
```bash
adb install -r apps/android-kiosk/app/build/outputs/apk/debug/app-debug.apk
```

---

## Проверка OBD-II адаптера

### 1. Проверка доступности COM-портов (Windows)
```powershell
# PowerShell
Get-WmiObject Win32_PnPEntity | Where-Object { $_.Name -match "COM\d+" } | Select-Object Name, DeviceID
```
Или через Device Manager: `devmgmt.msc`

### 2. Проверка через интерфейс киоска
1. Откройте фронтенд
2. Перейдите в раздел "Диагностика OBD-II"
3. Нажмите "Обновить список портов"
4. Выберите порт адаптера (например, COM3)
5. Нажмите "Запустить самопроверку"

### 3. Запуск самопроверки из CLI
```bash
cd apps/kiosk-agent
npm run self-check:obd
```

### 4. Проверка через API
```bash
# Получить статус подключения
curl http://localhost:7070/api/obd/status

# Список доступных портов
curl http://localhost:7070/api/serialports

# Подключиться к адаптеру
curl -X POST http://localhost:7070/api/obd/open \
  -H "Content-Type: application/json" \
  -d '{"portPath":"COM3","baudRate":38400}'

# Прочитать DTC коды
curl -X POST http://localhost:7070/api/obd/read-dtc

# Запустить самопроверку
curl -X POST http://localhost:7070/api/obd/self-check \
  -H "Content-Type: application/json" \
  -d '{"attempts":3,"delayMs":500}'
```

---

## Открытие портов брандмауэра Windows

Для доступа к агенту и фронтенду из LAN нужно открыть порты в Windows Firewall.

### Через GUI (Графический интерфейс)
1. Откройте **Windows Defender Firewall** → **Advanced Settings**
2. Выберите **Inbound Rules** → **New Rule...**
3. **Rule Type**: Port
4. **Protocol**: TCP, **Specific local ports**: 7070, 8080, 8081
5. **Action**: Allow the connection
6. **Profile**: Отметьте только **Private** (для домашней/рабочей сети)
7. **Name**: Kiosk Ports (Agent & Static)
8. Нажмите **Finish**

### Через PowerShell (Администратор)
```powershell
# Агент (порт 7070)
New-NetFirewallRule -DisplayName "Kiosk Agent API" -Direction Inbound -LocalPort 7070 -Protocol TCP -Action Allow -Profile Private

# Статический сервер (порты 8080, 8081)
New-NetFirewallRule -DisplayName "Kiosk Static Frontend" -Direction Inbound -LocalPort 8080,8081 -Protocol TCP -Action Allow -Profile Private
```

### Проверка правил
```powershell
Get-NetFirewallRule -DisplayName "Kiosk*" | Format-Table -Property DisplayName, Enabled, Direction, Action
```

### Удаление правил (если нужно)
```powershell
Remove-NetFirewallRule -DisplayName "Kiosk Agent API"
Remove-NetFirewallRule -DisplayName "Kiosk Static Frontend"
```

---

## Устранение неполадок

### Проблема: Агент не запускается
**Симптом**: `Error: listen EADDRINUSE: address already in use :::7070`

**Решение**:
```bash
# Найти процесс на порту 7070
netstat -ano | findstr :7070

# Убить процесс (замените PID)
taskkill /PID <PID> /F

# Или использовать другой порт
set AGENT_PORT=7071
npm --prefix apps/kiosk-agent run dev
```

### Проблема: Фронтенд не может подключиться к агенту
**Симптом**: "Агент недоступен. Проверьте подключение."

**Проверки**:
1. Агент запущен? `curl http://localhost:7070/health`
2. Порт открыт в firewall?
3. AGENT_API_BASE указывает на правильный URL?
4. CORS включен в агенте? (уже включен по умолчанию)

**Решение**:
```javascript
// В консоли браузера
console.log(window.AGENT_API_BASE);
window.setAgentUrl('http://192.168.1.100:7070');
location.reload();
```

### Проблема: OBD-II адаптер не найден
**Симптом**: Список портов пуст или "Устройство не отвечает"

**Проверки**:
1. Адаптер подключен к USB?
2. Драйверы установлены? (особенно для CH340/CH341 чипов)
3. COM-порт определяется в Device Manager?
4. Другое приложение не использует порт?

**Решение**:
```bash
# Проверить доступные порты через API
curl http://localhost:7070/api/serialports

# Попробовать подключиться вручную
curl -X POST http://localhost:7070/api/obd/open \
  -H "Content-Type: application/json" \
  -d '{"portPath":"COM3","baudRate":38400}'
```

### Проблема: Android приложение показывает черный экран
**Симптом**: Приложение запускается, но экран черный

**Решение**:
1. Проверить доступность URL: открыть в Chrome на устройстве `http://31.31.197.40/`
2. Если недоступен, сменить URL через долгое нажатие
3. Проверить логи: `adb logcat -s KioskMainActivity`
4. Убедиться, что `cleartextTrafficPermitted="true"` в `network_security_config.xml`

### Проблема: "AP isolation" блокирует LAN доступ
**Симптом**: Устройства подключены к одной WiFi, но не видят друг друга

**Решение**:
1. Войти в настройки роутера/точки доступа
2. Найти опцию "AP Isolation" / "Client Isolation"
3. Отключить её
4. Перезагрузить устройства

---

## Дополнительные ресурсы

- **Архитектурная документация**: `docs/tech/architecture.md`
- **Продуктовые сценарии**: `docs/product/flows.md`
- **Инструкции для разработчиков**: `.github/copilot-instructions.md`
- **Общие правила проекта**: `.github/instructions/instructions.instructions.md`

---

## Контакты поддержки

При возникновении проблем:
1. Проверьте логи агента: консоль или файлы (если настроено)
2. Проверьте консоль браузера (F12 → Console)
3. Проверьте статус устройств: `GET /devices/status`
4. Создайте issue в GitHub с логами и описанием проблемы

---

**Версия документа**: 1.0  
**Дата**: 2024-01-20  
**Для**: Операторы киосков самообслуживания
