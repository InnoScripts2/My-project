# Анализ проблем сборки и Bluetooth подключения

**Дата:** 7 октября 2025
**Проект:** Автосервис самообслуживания
**Анализ:** Размер сборки и обнаружение Bluetooth OBD-II адаптеров

---

## Проблема 1: Размер собранного приложения (0.1 МБ при репозитории 6.24 ГБ)

### Текущее состояние

**Размер проекта:**
- Весь репозиторий: **6.24 ГБ**
- Собранное приложение (dist/): **0.1 МБ** (16 файлов)
- Разница: **~62x меньше**

**Что находится в dist/:**
```
dist/
├── ai/
├── api/
├── devices/
├── index.d.ts (TypeScript definitions)
├── index.js (главный файл)
├── selfcheck/
├── server.d.ts
└── server.js
```

### Причины такого маленького размера

#### 1. TypeScript компилирует только исходный код

**Текущая команда сборки:**
```json
"build": "tsc -p tsconfig.json && node scripts/copy-public.cjs"
```

**Что происходит:**
- `tsc` компилирует только `.ts` файлы из `src/` → `dist/`
- Создаются `.js` и `.d.ts` файлы (только ваш код)
- **НЕ включаются** `node_modules` зависимости

**Что НЕ попадает в сборку:**
- ❌ `node_modules/` (сотни МБ зависимостей)
- ❌ Нативные модули (`serialport`, `@abandonware/bluetooth-serial-port`)
- ❌ Конфигурационные файлы
- ❌ Статические ресурсы

### Почему репозиторий весит 6.24 ГБ

**Основные причины:**

1. **Множество node_modules:**
   - Корневая папка: `node_modules/`
   - `apps/kiosk-agent/node_modules/`
   - `apps/kiosk-frontend/node_modules/`
   - `apps/kiosk-admin/node_modules/`
   - `apps/android-kiosk/node_modules/`
   - `packages/*/node_modules/`
   - Каждая содержит дублирующиеся зависимости

2. **Вспомогательные ресурсы (1+ ГБ):**
   - `вспомогательные ресурсы/` - копии GitHub репозиториев
   - `доп ресурсы/` - APK файлы, библиотеки
   - Android Gradle кэш: `apps/android-kiosk/app/build/`

3. **Git история:**
   - `.git/` папка с полной историей коммитов

4. **Дублированные структуры:**
   - `apps/` и `03-apps/` (старая и новая структура)
   - `packages/` дублирование

### ❌ КРИТИЧЕСКАЯ ПРОБЛЕМА: Неправильная сборка

**Приложение НЕ будет работать без node_modules!**

При попытке запуска:
```bash
node dist/index.js
```

Вы получите ошибки:
```
Error: Cannot find module 'express'
Error: Cannot find module 'serialport'
Error: Cannot find module '@abandonware/bluetooth-serial-port'
```

### ✅ Правильное решение

#### Вариант 1: Развертывание с зависимостями (рекомендуется для Node.js)

**Структура развертывания:**
```
production/
├── dist/               # Скомпилированный код (0.1 МБ)
├── node_modules/       # Все зависимости (~200-300 МБ)
├── package.json        # Для npm install
├── config/             # Конфигурация
└── public/             # Статические файлы
```

**Команды развертывания:**
```bash
# На продакшн сервере/киоске
npm ci --production              # Установить только production зависимости
npm run build                    # Собрать TypeScript → JavaScript
node dist/index.js               # Запустить приложение
```

**Преимущества:**
- ✅ Работает "из коробки"
- ✅ Все зависимости на месте
- ✅ Легко обновлять

**Недостатки:**
- ❌ Размер ~300-400 МБ (с node_modules)
- ❌ Нужен Node.js на целевой системе

#### Вариант 2: Бандлинг в один исполняемый файл (для киоска)

Используйте **pkg** или **Vercel pkg** для создания standalone EXE:

**Установка:**
```bash
npm install -g pkg
```

**Добавить в package.json:**
```json
{
  "bin": "dist/index.js",
  "pkg": {
    "targets": ["node20-win-x64"],
    "assets": [
      "config/**/*",
      "public/**/*"
    ],
    "scripts": [
      "dist/**/*.js"
    ]
  },
  "scripts": {
    "build:exe": "npm run build && pkg . --out-path bin"
  }
}
```

**Сборка:**
```bash
npm run build:exe
```

**Результат:**
```
bin/
└── kiosk-agent.exe    # ~50-80 МБ (включает Node.js + ваш код + зависимости)
```

**Преимущества:**
- ✅ Один файл .exe
- ✅ Не требует Node.js на целевой системе
- ✅ ~50-80 МБ

**Недостатки:**
- ❌ Нативные модули требуют специальной настройки
- ❌ Bluetooth может не работать без дополнительных dll

#### Вариант 3: Webpack/esbuild бандлинг (средний путь)

**Установка:**
```bash
npm install --save-dev esbuild esbuild-plugin-copy
```

**Создать build.mjs:**
```javascript
import esbuild from 'esbuild';
import { copy } from 'esbuild-plugin-copy';

await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  outfile: 'bundle/server.js',
  external: [
    'serialport',
    '@abandonware/bluetooth-serial-port',
    'express',
    'pg-native'
  ],
  plugins: [
    copy({
      resolveFrom: 'cwd',
      assets: [
        { from: 'config/**/*', to: 'bundle/config' },
        { from: 'public/**/*', to: 'bundle/public' }
      ]
    })
  ]
});
```

**Результат:**
```
bundle/
├── server.js          # ~2-5 МБ (весь код в одном файле)
├── node_modules/      # Только нативные модули (~50 МБ)
├── config/
└── public/
```

**Размер:** ~60-80 МБ

---

## Проблема 2: Приложение не видит Bluetooth адаптер

### Текущая реализация

**Код обнаружения:**
```typescript
// apps/kiosk-agent/src/devices/obd/bluetoothAutoDetect.ts

const BLUETOOTH_MODULE_ID: string = '@abandonware/bluetooth-serial-port';

async function loadBluetoothSerialPort(logger) {
  try {
    const module = await import(BLUETOOTH_MODULE_ID);
    const ctor = module.BluetoothSerialPort;
    if (!ctor) {
      logger('bluetooth-auto-detect: module does not export BluetoothSerialPort');
      return null;
    }
    return ctor;
  } catch (error) {
    logger(`bluetooth-auto-detect: bluetooth module unavailable (${error.message})`);
    return null;
  }
}
```

### ❌ КРИТИЧЕСКИЕ ПРОБЛЕМЫ

#### 1. Пакет не установлен

**Проверка зависимостей:**
```bash
npm list --depth=0
```

**Результат:**
```
UNMET DEPENDENCY socket.io@^4.7.4
```

**В package.json НЕТ:**
```json
{
  "dependencies": {
    // ❌ Отсутствует @abandonware/bluetooth-serial-port
  }
}
```

**Решение:**
```bash
cd apps/kiosk-agent
npm install @abandonware/bluetooth-serial-port --save
```

#### 2. Нативный модуль требует компиляции

`@abandonware/bluetooth-serial-port` - это **нативный модуль** (C++ addon).

**Требования для Windows:**
- ✅ Node.js (установлен)
- ❌ Python 3.x (нужен для node-gyp)
- ❌ Visual Studio Build Tools (нужны для компиляции C++)
- ❌ Windows SDK

**Установка Build Tools:**
```bash
# От имени администратора
npm install --global windows-build-tools

# Или вручную скачать:
# Visual Studio 2022 Build Tools
# https://visualstudio.microsoft.com/downloads/
```

**После установки:**
```bash
npm install @abandonware/bluetooth-serial-port --build-from-source
```

#### 3. Windows Bluetooth Stack совместимость

**Проблема:** Windows использует Microsoft Bluetooth Stack, который имеет ограничения.

**Возможные причины неудачи:**
- Адаптер использует BLE (Bluetooth Low Energy), а код ищет Classic Bluetooth
- Windows блокирует доступ без прав администратора
- Требуется сопряжение через Settings → Bluetooth перед использованием

**Альтернативные библиотеки:**

```bash
# Для Windows более стабильна:
npm install bluetooth-serial-port-binding-win

# Или универсальная (с лучшей поддержкой Windows):
npm install @serial/bindings-cpp
```

#### 4. Логика обнаружения устройств

**Текущий код:**
```typescript
async function discoverDevices(
  BluetoothSerialPortCtor,
  timeoutMs = 15000,  // 15 секунд
  logger
) {
  const adapter = new BluetoothSerialPortCtor();
  const devices = [];

  adapter.on('found', (address, name) => {
    devices.push({ address, name });
  });

  adapter.inquire();  // Запуск сканирования

  // Ждем до timeout
}
```

**Проблемы:**
- Не показывает прогресс сканирования пользователю
- Таймаут 15 секунд может быть недостаточен
- Не запрашивает разрешения Bluetooth у Windows

### ✅ РЕШЕНИЯ

#### Решение 1: Установить отсутствующие зависимости

```bash
cd apps/kiosk-agent

# Установить Bluetooth модуль
npm install @abandonware/bluetooth-serial-port --save

# Установить socket.io
npm install socket.io --save

# Пересобрать нативные модули
npm rebuild
```

#### Решение 2: Добавить fallback на USB Serial

**Обновить ObdConnectionManager.ts:**
```typescript
async connect(options: ObdConnectOptions) {
  // Сначала пробуем Bluetooth
  if (options.transport === 'bluetooth' || options.transport === 'auto') {
    try {
      const btResult = await autoDetectBluetoothElm327({
        discoveryTimeoutMs: 20000, // Увеличить таймаут
        logger: this.logger
      });
      if (btResult) {
        this.driver = btResult.driver;
        return btResult;
      }
    } catch (error) {
      this.logger(`Bluetooth failed: ${error.message}`);
    }
  }

  // Fallback на USB Serial
  if (options.transport === 'serial' || options.transport === 'auto') {
    this.logger('Trying USB Serial ports...');
    const serialResult = await autoDetectElm327({
      portHints: options.portHints,
      logger: this.logger
    });
    if (serialResult) {
      this.driver = serialResult.driver;
      return serialResult;
    }
  }

  throw new Error('No OBD-II adapter found via Bluetooth or USB');
}
```

#### Решение 3: Добавить ручной выбор устройства

**Создать API endpoint для списка устройств:**
```typescript
// apps/kiosk-agent/src/api/routes/obd.routes.ts

app.get('/api/obd/bluetooth/scan', async (req, res) => {
  try {
    const BluetoothSerialPortCtor = await loadBluetoothSerialPort();
    if (!BluetoothSerialPortCtor) {
      return res.status(503).json({
        ok: false,
        error: 'bluetooth_unavailable',
        message: 'Bluetooth module not available'
      });
    }

    const adapter = new BluetoothSerialPortCtor();
    const devices = [];

    adapter.on('found', (address, name) => {
      devices.push({ address, name });
      // Отправляем через WebSocket для real-time обновления
      obdWebSocketHandler?.broadcast({
        type: 'bluetooth_device_found',
        device: { address, name }
      });
    });

    adapter.on('finished', () => {
      adapter.close();
      res.json({
        ok: true,
        devices,
        count: devices.length
      });
    });

    adapter.inquire();

    // Таймаут безопасности
    setTimeout(() => {
      try {
        adapter.close();
      } catch {}
      res.json({
        ok: true,
        devices,
        count: devices.length,
        timeout: true
      });
    }, 30000);

  } catch (error) {
    res.status(500).json({
      ok: false,
      error: 'scan_failed',
      message: error.message
    });
  }
});

app.post('/api/obd/bluetooth/connect', async (req, res) => {
  const { address, channel } = req.body;

  try {
    const result = await obdConnectionManager.connect({
      transport: 'bluetooth',
      bluetoothAddress: address,
      bluetoothChannel: channel,
      channelHints: channel ? [channel] : [1, 2, 3, 4, 5]
    });

    res.json({
      ok: true,
      connection: obdConnectionManager.getSnapshot()
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: 'connection_failed',
      message: error.message
    });
  }
});
```

#### Решение 4: UI с выбором устройства

**Обновить фронтенд:**
```html
<!-- apps/kiosk-frontend/index.html -->

<div id="bluetooth-scan" class="screen">
  <h2>Поиск OBD-II адаптера</h2>

  <button id="btn-scan-bluetooth">Сканировать Bluetooth</button>

  <div id="scan-progress" style="display:none">
    <p>Сканирование... <span id="scan-timer">0</span>с</p>
    <div class="spinner"></div>
  </div>

  <div id="device-list">
    <!-- Устройства будут добавлены через JS -->
  </div>

  <button id="btn-try-usb">Попробовать USB подключение</button>
</div>

<script>
document.getElementById('btn-scan-bluetooth').addEventListener('click', async () => {
  const scanProgress = document.getElementById('scan-progress');
  const deviceList = document.getElementById('device-list');

  scanProgress.style.display = 'block';
  deviceList.innerHTML = '';

  let timer = 0;
  const interval = setInterval(() => {
    timer++;
    document.getElementById('scan-timer').textContent = timer;
  }, 1000);

  // WebSocket для real-time обновлений
  const ws = new WebSocket('ws://localhost:7070/api/obd/stream');
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'bluetooth_device_found') {
      addDeviceToList(data.device);
    }
  };

  try {
    const response = await fetch('http://localhost:7070/api/obd/bluetooth/scan');
    const result = await response.json();

    clearInterval(interval);
    scanProgress.style.display = 'none';

    if (result.ok) {
      if (result.devices.length === 0) {
        deviceList.innerHTML = '<p>Устройства не найдены. Убедитесь, что Bluetooth адаптер включен и находится рядом.</p>';
      }
    }
  } catch (error) {
    clearInterval(interval);
    scanProgress.style.display = 'none';
    deviceList.innerHTML = `<p class="error">Ошибка сканирования: ${error.message}</p>`;
  }
});

function addDeviceToList(device) {
  const deviceList = document.getElementById('device-list');
  const div = document.createElement('div');
  div.className = 'device-item';
  div.innerHTML = `
    <h3>${device.name || 'Неизвестное устройство'}</h3>
    <p>${device.address}</p>
    <button onclick="connectToDevice('${device.address}')">Подключить</button>
  `;
  deviceList.appendChild(div);
}

async function connectToDevice(address) {
  try {
    const response = await fetch('http://localhost:7070/api/obd/bluetooth/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address })
    });

    const result = await response.json();
    if (result.ok) {
      alert('Подключено успешно!');
      // Перейти к следующему экрану
      showScreen('diagnostics');
    } else {
      alert(`Ошибка подключения: ${result.message}`);
    }
  } catch (error) {
    alert(`Ошибка: ${error.message}`);
  }
}
</script>
```

#### Решение 5: Проверка разрешений Windows

**Создать скрипт проверки:**
```javascript
// apps/kiosk-agent/scripts/check-bluetooth.js

import { spawn } from 'child_process';

async function checkBluetoothService() {
  return new Promise((resolve) => {
    const ps = spawn('powershell', [
      '-Command',
      'Get-Service -Name bthserv | Select-Object Status, StartType'
    ]);

    let output = '';
    ps.stdout.on('data', (data) => {
      output += data.toString();
    });

    ps.on('close', () => {
      console.log('Bluetooth Service Status:');
      console.log(output);

      if (output.includes('Running')) {
        console.log('✅ Bluetooth service is running');
      } else {
        console.log('❌ Bluetooth service is not running');
        console.log('   Run: net start bthserv');
      }
      resolve();
    });
  });
}

async function listBluetoothDevices() {
  return new Promise((resolve) => {
    const ps = spawn('powershell', [
      '-Command',
      'Get-PnpDevice -Class Bluetooth | Select-Object FriendlyName, Status'
    ]);

    let output = '';
    ps.stdout.on('data', (data) => {
      output += data.toString();
    });

    ps.on('close', () => {
      console.log('\nPaired Bluetooth Devices:');
      console.log(output);
      resolve();
    });
  });
}

async function checkNodeGyp() {
  return new Promise((resolve) => {
    const ps = spawn('node-gyp', ['--version']);

    ps.on('close', (code) => {
      if (code === 0) {
        console.log('✅ node-gyp is installed');
      } else {
        console.log('❌ node-gyp is not installed');
        console.log('   Run: npm install -g node-gyp');
      }
      resolve();
    });

    ps.on('error', () => {
      console.log('❌ node-gyp is not installed');
      console.log('   Run: npm install -g node-gyp');
      resolve();
    });
  });
}

console.log('=== Bluetooth Diagnostic Check ===\n');
await checkBluetoothService();
await listBluetoothDevices();
await checkNodeGyp();
console.log('\n=== Check Complete ===');
```

**Запуск:**
```bash
node apps/kiosk-agent/scripts/check-bluetooth.js
```

---

## План действий

### Этап 1: Исправление зависимостей (Критично)

```bash
cd apps/kiosk-agent

# 1. Установить отсутствующие пакеты
npm install @abandonware/bluetooth-serial-port socket.io --save

# 2. Установить build tools (если не установлены)
npm install --global windows-build-tools

# 3. Пересобрать нативные модули
npm rebuild

# 4. Проверить установку
npm list @abandonware/bluetooth-serial-port
```

### Этап 2: Тестирование Bluetooth

```bash
# Создать и запустить диагностику
node scripts/check-bluetooth.js

# Запустить агент в dev режиме
npm run dev

# В другом терминале протестировать API
curl http://localhost:7070/api/obd/bluetooth/scan
```

### Этап 3: Правильная сборка

**Вариант A: Development развертывание**
```bash
# На продакшн машине
git clone <repo>
cd apps/kiosk-agent
npm ci --production
npm run build
node dist/index.js
```

**Вариант B: Standalone executable**
```bash
# Добавить pkg в package.json
npm install -g pkg
npm run build
pkg . --targets node20-win-x64 --out-path bin

# Результат: bin/kiosk-agent.exe (~50-80 МБ)
```

### Этап 4: Обновление UI

1. Добавить экран выбора Bluetooth устройства
2. Показать прогресс сканирования
3. Добавить кнопку "Попробовать USB"
4. Отобразить ошибки подключения

---

## Выводы

### Проблема сборки

**Текущая сборка НЕ работоспособна** - она содержит только скомпилированный TypeScript код без зависимостей.

**Правильный размер:**
- С node_modules: **300-400 МБ**
- Standalone .exe: **50-80 МБ**
- Текущие 0.1 МБ - это только ваш код

### Проблема Bluetooth

**Критические причины:**
1. ❌ Пакет `@abandonware/bluetooth-serial-port` не установлен
2. ❌ Отсутствуют build tools для компиляции нативного модуля
3. ❌ Возможно требуется запуск от администратора
4. ❌ UI не показывает процесс сканирования

**После исправления:**
- ✅ Приложение сможет сканировать Bluetooth устройства
- ✅ Пользователь увидит список доступных адаптеров
- ✅ Можно будет выбрать нужное устройство вручную
- ✅ Fallback на USB Serial при неудаче Bluetooth

---

## Рекомендации

1. **Немедленно:**
   - Установить `@abandonware/bluetooth-serial-port`
   - Установить `socket.io`
   - Пересобрать нативные модули

2. **В ближайшее время:**
   - Настроить правильную сборку с pkg или bundler
   - Добавить UI для выбора Bluetooth устройств
   - Создать диагностический скрипт

3. **Для продакшн:**
   - Использовать Electron для киоска (лучшая поддержка нативных модулей)
   - Упаковать с помощью electron-builder
   - Включить все нативные dll в installer

4. **Документация:**
   - Добавить требования к системе (Visual Studio Build Tools)
   - Описать процесс установки на чистую Windows машину
   - Создать troubleshooting guide для Bluetooth

