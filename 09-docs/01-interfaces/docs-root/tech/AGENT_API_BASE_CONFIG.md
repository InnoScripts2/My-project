# Конфигурация AGENT_API_BASE - Техническая документация

Данный документ описывает механизм конфигурации базового URL агента во фронтенде киоска.

## Обзор

`AGENT_API_BASE` — это глобальная переменная JavaScript, определяющая базовый URL для всех API-запросов к агенту (kiosk-agent). Механизм разработан для гибкого развертывания в различных окружениях (DEV, QA, PROD).

---

## Архитектура

### Компоненты

1. **Фронтенд** (apps/kiosk-frontend/index.html)
   - Загружается с любого хоста (localhost:8080, 31.31.197.40, etc.)
   - Выполняет HTTP-запросы к агенту через `getApiBase()`

2. **Агент** (apps/kiosk-agent)
   - Работает локально на порту 7070
   - Предоставляет REST API для управления устройствами, сессиями, отчетами

3. **Конфигурационный скрипт** (в начале `<body>` index.html)
   - Определяет `window.AGENT_API_BASE` на основе приоритетов
   - Сохраняет значение в localStorage для последующих сессий

---

## Механизм определения URL

### Приоритет источников

```
1. window.AGENT_API_BASE (явно установлено до загрузки)
     ↓
2. URL-параметр ?agent=...
     ↓
3. localStorage.getItem('kiosk_agent_url')
     ↓
4. Авто-детект (по умолчанию: http://localhost:7070)
```

### Логика авто-детекта

```javascript
// Если фронтенд на 31.31.197.40 или IP-адресе
if (origin.includes('31.31.197.40') || origin.match(/^\d+\.\d+\.\d+\.\d+/)) {
  // На Android: агент локально
  const isAndroid = /android/i.test(navigator.userAgent);
  window.AGENT_API_BASE = isAndroid 
    ? 'http://localhost:7070'  // Агент на том же устройстве
    : 'http://localhost:7070'; // Или LAN IP, настраиваемый вручную
}
```

---

## Использование во фронтенде

### Функция `getApiBase()`

Все API-вызовы используют хелпер:

```javascript
const getApiBase = () => window.AGENT_API_BASE || 'http://localhost:7070';
```

**Примеры вызовов**:

```javascript
// Получить статус OBD
await fetch(`${getApiBase()}/api/obd/status`);

// Открыть сессию OBD
await fetch(`${getApiBase()}/api/obd/open`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ portPath: 'COM3', baudRate: 38400 })
});

// Генерация отчета
await fetch(`${getApiBase()}/reports/generate`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ data: reportPayload })
});
```

---

## Сценарии развертывания

### DEV: Локальная разработка

**Окружение**:
- Фронтенд: http://localhost:8080/
- Агент: http://localhost:7070/

**Конфигурация**: автоматическая (localhost:7070 по умолчанию)

**Команды**:
```bash
# Терминал 1: Агент
npm --prefix apps/kiosk-agent run dev

# Терминал 2: Статический сервер
npm run static
```

**URL**:
```
http://localhost:8080/
```

---

### DEV: LAN-тестирование (Windows + Android)

**Окружение**:
- Фронтенд: http://192.168.1.100:8080/ (LAN IP Windows)
- Агент: http://192.168.1.100:7070/
- Android: подключен к той же WiFi

**Конфигурация**: через URL-параметр

**Команды** (на Windows):
```bash
# Терминал 1: Агент
npm --prefix apps/kiosk-agent run dev

# Терминал 2: Статический сервер
npm run static
# Запомните LAN IP из вывода, например 192.168.1.100
```

**URL** (на Android Chrome):
```
http://192.168.1.100:8080/?agent=http://192.168.1.100:7070
```

**Открытие портов** (Windows):
```powershell
New-NetFirewallRule -DisplayName "Kiosk Dev" -Direction Inbound -LocalPort 7070,8080 -Protocol TCP -Action Allow -Profile Private
```

---

### PROD: Централизованный фронтенд, локальные агенты

**Окружение**:
- Фронтенд: http://31.31.197.40/ (единый сервер)
- Агент: локально на каждом киоске (127.0.0.1:7070 или LAN IP)

**Проблема**: кросс-ориджин запросы (CORS)

**Решение 1: Прямое указание URL**

```javascript
// В консоли браузера на киоске
window.setAgentUrl('http://127.0.0.1:7070');
location.reload();
```

**Решение 2: URL-параметр**

Настроить WebView/браузер на загрузку:
```
http://31.31.197.40/?agent=http://127.0.0.1:7070
```

**Решение 3: Предустановка в HTML**

Модифицировать `index.html` для PROD-сборки:
```html
<script>
  // Production override
  window.AGENT_API_BASE = 'http://127.0.0.1:7070';
</script>
```

**CORS в агенте**:
Агент уже поддерживает CORS (включен по умолчанию через `app.use(cors())`).

---

### PROD: Обратный прокси (альтернатива)

**Окружение**:
- Фронтенд: http://31.31.197.40/
- Обратный прокси: http://31.31.197.40/api/agent/* → http://KIOSK_IP:7070/*

**Преимущества**:
- Никаких проблем с CORS
- Единая точка входа
- Простая конфигурация фронтенда (same-origin)

**Недостатки**:
- Требуется сетевая инфраструктура (VPN/туннель до каждого киоска)
- Сложность масштабирования

**Nginx пример**:
```nginx
location /api/agent/ {
  proxy_pass http://kiosk-001.local:7070/;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
}
```

**Конфигурация фронтенда**:
```javascript
window.AGENT_API_BASE = '/api/agent';
```

---

## API для конфигурации

### `window.AGENT_API_BASE` (чтение/запись)

Текущий базовый URL агента.

**Пример**:
```javascript
console.log(window.AGENT_API_BASE);
// => "http://localhost:7070"

window.AGENT_API_BASE = "http://192.168.1.100:7070";
```

---

### `window.setAgentUrl(url)` (функция)

Устанавливает новый URL агента и сохраняет в localStorage.

**Параметры**:
- `url` (string): базовый URL агента

**Пример**:
```javascript
window.setAgentUrl('http://192.168.1.100:7070');
console.log('[config] Agent URL set to:', window.AGENT_API_BASE);
```

**Сохранение**:
```javascript
localStorage.setItem('kiosk_agent_url', url);
```

---

## Отладка

### Проверка текущей конфигурации

Откройте консоль браузера (F12 → Console):

```javascript
// Текущий URL агента
console.log(window.AGENT_API_BASE);

// Из localStorage
console.log(localStorage.getItem('kiosk_agent_url'));

// Тест доступности
fetch(`${window.AGENT_API_BASE}/health`)
  .then(r => r.json())
  .then(d => console.log('Agent health:', d))
  .catch(e => console.error('Agent unreachable:', e));
```

### Логи в консоли

При загрузке страницы в консоли появляется:
```
[config] Agent API Base: http://localhost:7070
```

### Переопределение в runtime

```javascript
// Временно, только для текущей сессии
window.AGENT_API_BASE = 'http://192.168.1.200:7070';

// Постоянно, с сохранением
window.setAgentUrl('http://192.168.1.200:7070');
location.reload();
```

---

## Тестирование

### Проверка всех вариантов конфигурации

**Тест 1: Дефолтное значение**
```bash
# URL без параметров
curl http://localhost:8080/
# Ожидаемо: AGENT_API_BASE = http://localhost:7070
```

**Тест 2: URL-параметр**
```bash
curl http://localhost:8080/?agent=http://192.168.1.100:7070
# Ожидаемо: AGENT_API_BASE = http://192.168.1.100:7070
# И значение сохранится в localStorage
```

**Тест 3: localStorage**
```javascript
// В консоли браузера
localStorage.setItem('kiosk_agent_url', 'http://test.local:7070');
location.reload();
// Ожидаемо: AGENT_API_BASE = http://test.local:7070
```

**Тест 4: Явная установка**
```html
<script>
  window.AGENT_API_BASE = 'http://explicit.host:7070';
</script>
<!-- Загрузка фронтенда -->
```
```javascript
// В консоли
console.log(window.AGENT_API_BASE);
// => "http://explicit.host:7070"
```

---

## Безопасность

### HTTPS vs HTTP

**Текущее состояние**: HTTP (31.31.197.40 без TLS)

**Ограничения**:
- Mixed content: если фронтенд на HTTPS, агент должен быть тоже HTTPS
- Современные браузеры могут блокировать HTTPS → HTTP запросы

**Переход на HTTPS**:
1. Получить доменное имя (например, kiosk.example.com)
2. Выпустить SSL-сертификат (Let's Encrypt)
3. Настроить nginx/Apache с TLS
4. Обновить URLs:
   - Фронтенд: https://kiosk.example.com/
   - Агент: https://kiosk.example.com/api/ (через обратный прокси)

**Для IP без домена**: самоподписанный сертификат возможен, но браузер будет предупреждать.

---

### CORS

**Политика в агенте**:
```typescript
app.use(cors());
```

Это разрешает запросы с любых origin. Для продакшна можно ограничить:

```typescript
app.use(cors({
  origin: ['http://31.31.197.40', 'http://localhost:8080'],
  credentials: true
}));
```

---

## Troubleshooting

### Ошибка: "AGENT_API_BASE is undefined"

**Причина**: конфигурационный скрипт не загрузился.

**Решение**: проверить, что скрипт конфигурации находится в начале `<body>`:
```html
<body>
  <script>
    (function() {
      // Конфигурация AGENT_API_BASE
    })();
  </script>
  <!-- Остальной контент -->
</body>
```

---

### Ошибка: "Failed to fetch"

**Причина**: агент недоступен или неверный URL.

**Проверки**:
1. Агент запущен? `curl http://localhost:7070/health`
2. URL правильный? `console.log(window.AGENT_API_BASE)`
3. Firewall открыт?
4. CORS настроен?

---

### Ошибка: "Mixed Content Blocked"

**Причина**: фронтенд на HTTPS, агент на HTTP.

**Решение**:
- Использовать HTTP для обоих (как сейчас)
- Или HTTPS для обоих (требует TLS на агенте)

---

## Миграция на новый хост

### Сценарий: переезд с 31.31.197.40 на kiosk.example.com

**Шаг 1**: Обновить дефолтный URL в Android
```xml
<!-- strings.xml -->
<string name="kiosk_url">https://kiosk.example.com/</string>
```

**Шаг 2**: Перенести фронтенд на новый хост

**Шаг 3**: Обновить конфигурацию агента (если нужно)
```javascript
// В index.html или через переменную окружения
window.AGENT_API_BASE = 'https://kiosk.example.com/api';
```

**Шаг 4**: Обновить приложения на устройствах

---

## Заключение

Механизм `AGENT_API_BASE` обеспечивает:
- Гибкость развертывания (DEV/PROD)
- Простоту конфигурации (URL-параметр, localStorage)
- Отладочность (консольные логи, runtime override)
- Совместимость с различными архитектурами (same-origin, CORS, reverse proxy)

---

**Версия документа**: 1.0  
**Дата**: 2024-01-20  
**Для**: Разработчики и DevOps
