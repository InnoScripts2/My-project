# Bluetooth/OBD-II Интеграция — Полное руководство

Этот документ описывает интеграцию Bluetooth устройств для диагностики OBD-II в проекте «Автосервис самообслуживания». Включает поддержку различных адаптеров, протоколов, специальные профили для Toyota/Lexus и требования к разрешениям.

## Содержание

1. [Обзор архитектуры](#1-обзор-архитектуры)
2. [Поддерживаемые адаптеры и транспорты](#2-поддерживаемые-адаптеры-и-транспорты)
3. [Протоколы OBD-II](#3-протоколы-obd-ii)
4. [Специфика Toyota и Lexus](#4-специфика-toyota-и-lexus)
5. [Разрешения Android](#5-разрешения-android)
6. [Настройка и использование](#6-настройка-и-использование)
7. [Troubleshooting](#7-troubleshooting)

---

## 1. Обзор архитектуры

### 1.1. Компоненты системы

```
┌────────────────────────────────────────┐
│         Kiosk Frontend (UI)            │
│  ┌──────────────────────────────────┐  │
│  │   Diagnostics Flow Screens       │  │
│  │   - Device selection             │  │
│  │   - Connection status            │  │
│  │   - Scanning progress            │  │
│  │   - Results display              │  │
│  └──────────────────────────────────┘  │
└─────────────────┬──────────────────────┘
                  │ HTTP API
                  ↓
┌─────────────────────────────────────────┐
│      Kiosk Agent (Local Server)         │
│  ┌───────────────────────────────────┐  │
│  │   ObdConnectionManager            │  │
│  │   - Connection pooling            │  │
│  │   - Auto-reconnect                │  │
│  │   - Protocol detection            │  │
│  └───────────────────────────────────┘  │
│  ┌───────────────────────────────────┐  │
│  │   Transport Layer                 │  │
│  │   - Bluetooth Classic (RFCOMM)    │  │
│  │   - Bluetooth LE (GATT)           │  │
│  │   - Serial/USB (COM)              │  │
│  └───────────────────────────────────┘  │
│  ┌───────────────────────────────────┐  │
│  │   Elm327Driver                    │  │
│  │   - AT commands                   │  │
│  │   - DTC reading/clearing          │  │
│  │   - PID queries                   │  │
│  └───────────────────────────────────┘  │
└─────────────────┬───────────────────────┘
                  │ Bluetooth/Serial
                  ↓
┌─────────────────────────────────────────┐
│     OBD-II Adapter (Hardware)           │
│  - ELM327-compatible                    │
│  - BLE adapters (open GATT)             │
│  - USB-Serial adapters                  │
└─────────────────┬───────────────────────┘
                  │ OBD-II Protocol
                  ↓
┌─────────────────────────────────────────┐
│     Vehicle ECU (12V System)            │
│  - Toyota/Lexus: ISO 15765-4 CAN        │
│  - Legacy: ISO 9141-2, KWP2000          │
└─────────────────────────────────────────┘
```

### 1.2. Ключевые принципы

- **Адаптивность**: Поддержка множества адаптеров без жёсткой привязки к конкретной модели
- **Устойчивость**: Автоматические ретраи, переподключение, обработка таймаутов
- **Безопасность**: Валидация команд, проверка ответов, защита от некорректных данных
- **Прозрачность**: Детальное логирование, метрики, диагностика проблем
- **Офлайн-работа**: Агент работает локально, не требует интернета для диагностики

---

## 2. Поддерживаемые адаптеры и транспорты

### 2.1. ELM327-совместимые адаптеры

**Протокол:** AT-команды поверх UART/Bluetooth/USB

**Типы:**
- Bluetooth Classic (SPP) — наиболее распространённые
- USB-Serial (CH340, FTDI, CP2102) — для стационарных установок
- WiFi (встречаются редко) — будущая поддержка

**Производители:**
- OBDLink, Veepeak, BAFX Products, Vgate, Konnwei, и т.д.
- Китайские клоны ELM327 v1.5/v2.1

**Требования:**
- Поддержка AT-команд (инициализация, выбор протокола)
- Firmware совместимая с ELM327 v1.3+
- Скорость 9600-115200 baud (обычно 38400)

### 2.2. BLE (Bluetooth Low Energy) адаптеры

**Протокол:** GATT (Generic Attribute Profile)

**Требования:**
- Открытый GATT профиль (документированный вендором)
- Характеристики для чтения/записи AT-команд
- UUID сервиса и характеристик

**Примечание:**
- Закрытые протоколы не поддерживаются без официального SDK
- Требуется документация от производителя

### 2.3. USB-Serial адаптеры

**Протокол:** Serial over USB (CDC ACM)

**Типы:**
- OBD-II USB кабели с чипами CH340, FTDI, CP2102
- Для Windows киоска с доступом к COM-порту

**Настройка:**
- Автоматическое определение COM-порта через `serialport` библиотеку
- Поддержка hot-plug (динамическое подключение/отключение)

---

## 3. Протоколы OBD-II

### 3.1. ISO 15765-4 (CAN)

**Основной протокол для современных автомобилей (2008+)**

**Параметры:**
- Скорость: 500 kbps или 250 kbps
- ID: 11-bit или 29-bit extended
- Формат: CAN 2.0A/2.0B

**Команды ELM327:**
```
ATSP6  — ISO 15765-4 CAN (11 bit ID, 500 kbaud)
ATSP7  — ISO 15765-4 CAN (29 bit ID, 500 kbaud)
ATSP8  — ISO 15765-4 CAN (11 bit ID, 250 kbaud)
ATSP9  — ISO 15765-4 CAN (29 bit ID, 250 kbaud)
```

**Использование:**
- Toyota/Lexus: `ATSP6` (500 kbaud, 11-bit)
- Альтернатива: `ATSP0` (автоопределение)

### 3.2. ISO 9141-2

**Legacy протокол (Toyota/Lexus до 2008)**

**Параметры:**
- Скорость: 10.4 kbps
- K-line интерфейс
- 5 baud init

**Команды ELM327:**
```
ATSP3  — ISO 9141-2
```

### 3.3. KWP2000 (ISO 14230)

**Legacy протокол (европейские авто)**

**Параметры:**
- Скорость: 10.4 kbps
- K-line интерфейс
- Fast init или 5 baud init

**Команды ELM327:**
```
ATSP4  — KWP2000 (5 baud init)
ATSP5  — KWP2000 (fast init)
```

### 3.4. Автоопределение протокола

```
ATSP0  — Automatic protocol detection
```

**Механизм:**
1. ELM327 перебирает протоколы в следующем порядке:
   - SAE J1850 PWM
   - SAE J1850 VPW
   - ISO 9141-2
   - ISO 14230-4 (KWP fast init)
   - ISO 14230-4 (KWP 5 baud init)
   - ISO 15765-4 CAN (11 bit ID, 500 kbaud)
   - ISO 15765-4 CAN (29 bit ID, 500 kbaud)
   - ISO 15765-4 CAN (11 bit ID, 250 kbaud)
   - ISO 15765-4 CAN (29 bit ID, 250 kbaud)
2. Останавливается на первом успешном ответе
3. Запоминает протокол для последующих команд

---

## 4. Специфика Toyota и Lexus

### 4.1. Рекомендуемые настройки

**Современные модели (2008+):**
```typescript
{
  protocol: 'ISO 15765-4',
  elmCommand: 'ATSP6',
  baudRate: 500000,
  timeout: 2000,
  headers: {
    request: '7E0',    // Generic OBD-II request
    response: '7E8'    // Generic OBD-II response
  }
}
```

**Legacy модели (до 2008):**
```typescript
{
  protocol: 'ISO 9141-2',
  elmCommand: 'ATSP3',
  baudRate: 10400,
  timeout: 5000,
  initSequence: '5 baud init'
}
```

### 4.2. Инициализация для Toyota/Lexus

**Последовательность команд:**

```typescript
async function initializeToyota(driver: Elm327Driver): Promise<void> {
  // 1. Reset adapter
  await driver.sendCommand('ATZ');
  await sleep(1500);
  
  // 2. Turn off echo
  await driver.sendCommand('ATE0');
  
  // 3. Turn off line feeds
  await driver.sendCommand('ATL0');
  
  // 4. Turn off spaces
  await driver.sendCommand('ATS0');
  
  // 5. Set protocol (CAN for modern, ISO for legacy)
  const year = getVehicleYear();
  const protocol = year >= 2008 ? 'ATSP6' : 'ATSP3';
  await driver.sendCommand(protocol);
  
  // 6. Set longer timeout for Toyota
  await driver.sendCommand('ATST64'); // 4 seconds (64 x 4ms * 16)
  
  // 7. Set headers (if needed)
  await driver.sendCommand('ATSH7E0');
  
  // 8. Verify connection
  const response = await driver.sendCommand('0100'); // Request supported PIDs
  if (!response.includes('41 00')) {
    throw new Error('Failed to initialize Toyota ECU');
  }
}
```

### 4.3. Особенности чтения DTC

**Режимы:**
- Mode 03: Stored DTCs (постоянные коды)
- Mode 07: Pending DTCs (временные коды)
- Mode 0A: Permanent DTCs (не удаляемые вручную)

**Формат Toyota DTC:**
```
P0420 → 04 20 (hex) → Catalyst System Efficiency Below Threshold
```

**Чтение:**
```typescript
// Mode 03: Read stored DTCs
const response = await driver.sendCommand('03');
// Response: 43 01 04 20 (1 code: P0420)

// Parse
const numCodes = parseInt(response.substr(3, 2), 16);
const codes = parseDtcResponse(response.substr(6));
```

### 4.4. Clear DTC для Toyota

**Команда:**
```typescript
await driver.sendCommand('04'); // Mode 04: Clear DTCs and freeze frame
```

**Требования:**
- Двигатель должен быть заглушён
- Зажигание включено (ON, не ACC)
- Логировать действие с timestamp и пользователем

---

## 5. Разрешения Android

### 5.1. Необходимые разрешения

**AndroidManifest.xml:**

```xml
<!-- Legacy Bluetooth (API < 31) -->
<uses-permission android:name="android.permission.BLUETOOTH" android:maxSdkVersion="30" />
<uses-permission android:name="android.permission.BLUETOOTH_ADMIN" android:maxSdkVersion="30" />

<!-- New Bluetooth (API 31+) -->
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
<uses-permission android:name="android.permission.BLUETOOTH_SCAN" 
    android:usesPermissionFlags="neverForLocation" />

<!-- Location (required for Bluetooth scan on all API levels) -->
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />

<!-- Bluetooth features (optional) -->
<uses-feature android:name="android.hardware.bluetooth" android:required="false" />
<uses-feature android:name="android.hardware.bluetooth_le" android:required="false" />
```

### 5.2. Runtime разрешения (Kotlin)

**Запрос при старте:**

```kotlin
private val requiredPermissions: Array<String>
    get() = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        arrayOf(
            Manifest.permission.BLUETOOTH_CONNECT,
            Manifest.permission.BLUETOOTH_SCAN,
            Manifest.permission.ACCESS_FINE_LOCATION
        )
    } else {
        arrayOf(
            Manifest.permission.BLUETOOTH,
            Manifest.permission.BLUETOOTH_ADMIN,
            Manifest.permission.ACCESS_FINE_LOCATION
        )
    }

private fun requestBluetoothPermissions() {
    val permissionsToRequest = requiredPermissions.filter {
        ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
    }
    
    if (permissionsToRequest.isNotEmpty()) {
        // Show explanation dialog
        AlertDialog.Builder(this)
            .setTitle("Разрешения для диагностики")
            .setMessage(
                "Для работы диагностики OBD-II требуется доступ к Bluetooth.\n\n" +
                "Приложение использует Bluetooth для подключения к адаптеру диагностики автомобиля.\n\n" +
                "Разрешение на местоположение требуется для сканирования Bluetooth устройств."
            )
            .setPositiveButton("Разрешить") { _, _ ->
                ActivityCompat.requestPermissions(
                    this,
                    permissionsToRequest.toTypedArray(),
                    BLUETOOTH_PERMISSION_REQUEST_CODE
                )
            }
            .setNegativeButton("Отмена") { _, _ ->
                // Continue without Bluetooth
            }
            .show()
    }
}

override fun onRequestPermissionsResult(
    requestCode: Int,
    permissions: Array<out String>,
    grantResults: IntArray
) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    
    when (requestCode) {
        BLUETOOTH_PERMISSION_REQUEST_CODE -> {
            val allGranted = grantResults.all { it == PackageManager.PERMISSION_GRANTED }
            if (!allGranted) {
                // Show limited functionality warning
                AlertDialog.Builder(this)
                    .setTitle("Ограниченная функциональность")
                    .setMessage("Без Bluetooth диагностика OBD-II недоступна.")
                    .setPositiveButton("OK", null)
                    .show()
            }
        }
    }
}
```

### 5.3. UX для отказа в разрешениях

**Сценарии:**

1. **Первый запрос** → Показать понятное объяснение
2. **Отказ** → Продолжить без Bluetooth, показать ограничения
3. **"Больше не спрашивать"** → Предложить открыть настройки

**Код для перехода в настройки:**

```kotlin
private fun openAppSettings() {
    val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
    intent.data = Uri.fromParts("package", packageName, null)
    startActivity(intent)
}
```

---

## 6. Настройка и использование

### 6.1. Конфигурация агента

**apps/kiosk-agent/.env:**

```env
# OBD-II retry policy
OBD_CONNECT_MAX_ATTEMPTS=5
OBD_CONNECT_BASE_DELAY_MS=1000
OBD_CONNECT_MAX_DELAY_MS=30000

OBD_INIT_MAX_ATTEMPTS=3
OBD_INIT_BASE_DELAY_MS=500

OBD_OPERATION_MAX_ATTEMPTS=3
```

### 6.2. API эндпоинты

**POST /api/obd/connect**

Подключение к адаптеру.

```json
{
  "transport": "bluetooth",
  "deviceAddress": "00:1D:A5:12:34:56",
  "protocol": "auto",
  "vehicleMake": "Toyota"
}
```

**Response:**
```json
{
  "ok": true,
  "state": "connected",
  "identity": "ELM327 v2.1",
  "protocol": "ISO 15765-4"
}
```

**GET /api/obd/status**

Статус подключения.

**Response:**
```json
{
  "state": "connected",
  "transport": "bluetooth",
  "identity": "ELM327 v2.1",
  "protocol": "ISO 15765-4",
  "lastConnectedAt": "2025-01-06T12:00:00Z",
  "metrics": {
    "totalCommands": 45,
    "successfulCommands": 43,
    "failedCommands": 2
  }
}
```

**POST /api/obd/read-dtc**

Чтение кодов неисправностей.

**Response:**
```json
{
  "ok": true,
  "dtcCount": 2,
  "dtcs": [
    {
      "code": "P0420",
      "description": "Catalyst System Efficiency Below Threshold (Bank 1)",
      "status": "stored"
    },
    {
      "code": "P0171",
      "description": "System Too Lean (Bank 1)",
      "status": "pending"
    }
  ]
}
```

**POST /api/obd/clear-dtc**

Сброс кодов (требует подтверждения).

**Request:**
```json
{
  "confirm": true
}
```

**Response:**
```json
{
  "ok": true,
  "cleared": 2,
  "timestamp": "2025-01-06T12:05:00Z"
}
```

### 6.3. Self-check для тестирования

**Запуск:**

```bash
npm --prefix apps/kiosk-agent run self-check:obd -- --port COM3
```

**Что проверяется:**

1. Подключение к адаптеру
2. Инициализация ELM327
3. Автоопределение протокола
4. Чтение supported PIDs
5. Чтение VIN (если доступен)
6. Чтение DTC
7. Проверка согласованности данных

**Лог:**

```
[INFO] Starting OBD-II self-check...
[INFO] Connecting to COM3...
[OK]   Connected successfully
[INFO] Initializing ELM327...
[OK]   ELM327 v2.1 detected
[INFO] Detecting protocol...
[OK]   Protocol: ISO 15765-4 CAN (11 bit, 500 kbaud)
[INFO] Reading VIN...
[OK]   VIN: JTMBD33V200000000
[INFO] Reading DTCs...
[OK]   DTCs: 1 stored, 0 pending
[INFO] Self-check completed: PASS
```

---

## 7. Troubleshooting

### 7.1. Адаптер не обнаружен

**Симптомы:**
- `obd_not_connected` в статусе
- Timeout при попытке подключения

**Решения:**

1. **Bluetooth:**
   - Проверьте, что Bluetooth включен на устройстве
   - Убедитесь, что адаптер в режиме сопряжения
   - Проверьте расстояние (макс. 10 метров)
   - Попробуйте переподключить адаптер к OBD-II разъёму

2. **Serial/USB:**
   - Проверьте подключение кабеля
   - Убедитесь, что драйвер установлен (CH340, FTDI)
   - Проверьте Device Manager (Windows) на наличие COM-порта

3. **Разрешения:**
   - Убедитесь, что Bluetooth/Location разрешения предоставлены
   - Проверьте настройки приложения в Android

### 7.2. Инициализация не проходит

**Симптомы:**
- `NO DATA` или `?` в ответах
- Timeout после `ATZ`

**Решения:**

1. Проверьте скорость порта (обычно 38400 baud)
2. Увеличьте timeout: `ATST64` (4 секунды)
3. Попробуйте другой протокол вручную: `ATSP6`
4. Сбросьте адаптер: отключите от OBD-II на 10 секунд

### 7.3. DTC не читаются

**Симптомы:**
- Пустой ответ на команду `03`
- Ошибка парсинга

**Решения:**

1. Убедитесь, что зажигание включено (ON)
2. Проверьте, что Check Engine Light (CEL) горит
3. Попробуйте режим 07 (pending codes)
4. Проверьте протокол: `ATDP` (должен показать текущий)

### 7.4. Медленные ответы

**Симптомы:**
- Каждая команда занимает > 5 секунд
- Timeout'ы на простых запросах

**Решения:**

1. Уменьшите timeout адаптера: `ATST32` (2 секунды)
2. Отключите лишние пробелы: `ATS0`
3. Отключите echo: `ATE0`
4. Проверьте качество Bluetooth связи

### 7.5. Несовместимый адаптер

**Симптомы:**
- Неожиданные ответы на AT-команды
- Неподдерживаемые команды

**Решения:**

1. Проверьте версию firmware: `ATI` или `AT@1`
2. Обновите firmware адаптера (если возможно)
3. Используйте проверенные модели: OBDLink, Veepeak
4. Избегайте дешёвых китайских клонов с неисправной прошивкой

---

## Итоговый чеклист

- [ ] Установлены Bluetooth разрешения в AndroidManifest
- [ ] Реализован runtime запрос разрешений с объяснением
- [ ] Настроена обработка отказа в разрешениях
- [ ] Протестировано подключение к ELM327 Bluetooth адаптеру
- [ ] Протестировано подключение к USB-Serial адаптеру
- [ ] Проверена инициализация для Toyota (CAN и ISO 9141-2)
- [ ] Проверено чтение DTC для Toyota
- [ ] Проверен Clear DTC с логированием
- [ ] Протестирован self-check на реальном адаптере
- [ ] Документированы edge cases и troubleshooting

---

**Версия документа:** 1.0  
**Дата создания:** 2025-01-06  
**Автор:** GitHub Copilot Agent
