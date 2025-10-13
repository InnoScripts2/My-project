# Диагностический чеклист — Eldiag не обнаружен

Используйте этот чеклист для устранения проблем, когда адаптер KINGBOLEN Eldiag (серийный номер 979868808198) не обнаруживается приложением.

## 1. Проверка включенных служб

### Bluetooth
- [ ] Bluetooth включен в системных настройках Android
- [ ] Bluetooth не заблокирован режимом полёта
- [ ] Адаптер Bluetooth работает (проверить в системных настройках)

### Определение местоположения (Location)
- [ ] Location включен в системных настройках
- [ ] GPS/Network Location доступны
- [ ] Режим высокой точности активирован (для Android ≤11)

Примечание: Для Android 12+ (API 31+) разрешение на местоположение всё ещё требуется для BLE-сканирования, несмотря на флаг `neverForLocation`.

## 2. Проверка разрешений

### Для Android 12+ (API 31+)
- [ ] BLUETOOTH_SCAN — предоставлено
- [ ] BLUETOOTH_CONNECT — предоставлено
- [ ] ACCESS_FINE_LOCATION — предоставлено

### Для Android 11 и ниже (API ≤30)
- [ ] BLUETOOTH — предоставлено
- [ ] BLUETOOTH_ADMIN — предоставлено
- [ ] ACCESS_FINE_LOCATION — предоставлено

Проверка в коде:
```kotlin
val permissionManager = BluetoothPermissionManager(context)
when (permissionManager.checkPermissions()) {
    is PermissionStatus.Granted -> Log.i("Permissions", "All granted")
    is PermissionStatus.Denied -> Log.e("Permissions", "Some denied")
}
```

## 3. Проверка видимости устройства в системных настройках

### Системные настройки Android
1. Откройте Настройки → Подключённые устройства → Bluetooth
2. Убедитесь, что Bluetooth включен
3. Нажмите "Поиск устройств" или "Pair new device"
4. Проверьте, появляется ли "ELDIAG" или "EDIAG" в списке

Если устройство видно в системных настройках:
- [ ] Устройство отображается с именем "ELDIAG" или "EDIAG"
- [ ] Попробуйте подключиться вручную через системные настройки
- [ ] Используйте MAC-адрес из системных настроек для прямого подключения в приложении

Если устройство НЕ видно в системных настройках:
- Проблема не связана с приложением, см. пункт 4

## 4. Проверка адаптера Eldiag

### Питание
- [ ] Адаптер подключен к разъёму OBD-II автомобиля
- [ ] Зажигание автомобиля включено (не обязательно запущен двигатель)
- [ ] LED-индикатор на адаптере горит/мигает (если есть)

### Близость
- [ ] Расстояние между телефоном и адаптером менее 1-2 метров
- [ ] Нет металлических преград между устройствами
- [ ] Попробуйте переместить телефон ближе к разъёму OBD-II

### Режим работы
- [ ] Адаптер не подключен к другому телефону/приложению
- [ ] Адаптер не сопряжен с другим устройством
- [ ] Попробуйте выключить/включить зажигание (перезапуск адаптера)

Если адаптер имеет кнопку сброса:
- [ ] Нажмите кнопку сброса на адаптере
- [ ] Подождите 10-15 секунд для перезапуска

## 5. Проверка BLE-рекламы (для разработчиков)

### Проверка данных рекламы
Используйте логи для проверки BLE-рекламы:

```kotlin
// В BleScanner.kt
private fun processScanResult(result: ScanResult) {
    Log.d(TAG, "Device found: ${result.device.name}, MAC: ${result.device.address}, RSSI: ${result.rssi}")
    
    val scanRecord = result.scanRecord
    if (scanRecord != null) {
        Log.d(TAG, "Manufacturer data: ${scanRecord.manufacturerSpecificData}")
        Log.d(TAG, "Service UUIDs: ${scanRecord.serviceUuids}")
        Log.d(TAG, "Service data: ${scanRecord.serviceData}")
    }
}
```

Проверьте логи на:
- [ ] Устройства с именем, содержащим "ELDIAG" или "EDIAG"
- [ ] Manufacturer data содержит серийный номер
- [ ] Service data содержит серийный номер
- [ ] Доступные service UUIDs

Если данные рекламы не содержат серийный номер:
- [ ] Серийный номер будет считан через DIS (Device Information Service) после подключения
- [ ] Убедитесь, что BleGattConnection.readSerialNumber() вызывается

## 6. Проверка Classic Bluetooth

### Classic Discovery
Убедитесь, что Classic Bluetooth discovery запущен:

```kotlin
// В ClassicBluetoothScanner.kt
override fun startScan(): Flow<List<ScanResultModel>> {
    Log.i(TAG, "Starting Classic Bluetooth discovery")
    // ...
}
```

Проверьте логи на:
- [ ] "Starting Classic Bluetooth discovery"
- [ ] "Classic Bluetooth discovery started"
- [ ] "Found Eldiag candidate" для Classic устройств

Если Classic discovery не работает:
- [ ] Убедитесь, что адаптер поддерживает Classic Bluetooth (а не только BLE)
- [ ] Попробуйте сопрячь устройство вручную через системные настройки

## 7. Прямое подключение по MAC-адресу

Если устройство видно в системных настройках, но не находится программно:

```kotlin
// Создайте ScanResultModel вручную с известным MAC-адресом
val manualDevice = ScanResultModel(
    transport = ScanResultModel.Transport.CLASSIC, // или BLE
    name = "ELDIAG",
    macAddress = "XX:XX:XX:XX:XX:XX", // MAC из системных настроек
    rssi = -60,
    serialNumber = null,
    source = ScanResultModel.Source.DISCOVERY
)

// Попробуйте подключиться
val connection = ConnectionFactory.connect(context, manualDevice)
```

## 8. Проверка логов приложения

### Ключевые сообщения для поиска

BLE Scan:
```
[BleScanner] Starting BLE scan
[BleScanner] BLE scan started successfully
[BleScanner] Found Eldiag candidate: name=..., mac=..., rssi=...
[BleScanner] Extracted serial number from advertisement: ...
```

Classic Scan:
```
[ClassicBluetoothScanner] Starting Classic Bluetooth discovery
[ClassicBluetoothScanner] Classic Bluetooth discovery started
[ClassicBluetoothScanner] Found Eldiag candidate: name=..., mac=..., rssi=...
```

Connection:
```
[BleGattConnection] Connection attempt 1/3 to ...
[BleGattConnection] GATT connected
[BleGattConnection] Services discovered successfully
[BleGattConnection] Read serial number from DIS: ...
```

Ошибки:
```
[BleScanner] BLE scanner not available
[BleScanner] BLE scan failed with error code: ...
[BleGattConnection] GATT error 133 (common connection issue)
[BleGattConnection] Service not found
[BleGattConnection] Serial number mismatch: expected ..., got ...
```

## 9. Типичные проблемы и решения

### Проблема: "BLE scanner not available"
**Решение:**
- Проверьте, поддерживает ли устройство BLE (не все старые Android-устройства)
- Убедитесь, что Bluetooth включен
- Перезапустите Bluetooth или устройство

### Проблема: "Scan already in progress"
**Решение:**
- Дождитесь завершения предыдущего сканирования (15 сек)
- Или явно остановите сканирование: `scanner.stopScan()`

### Проблема: "GATT error 133"
**Решение:**
- Распространённая ошибка подключения BLE
- Отключите и снова включите Bluetooth
- Удалите сопряжение устройства в системных настройках
- Перезагрузите Android-устройство
- Попробуйте повторно подключиться (используется экспоненциальная задержка)

### Проблема: "Device Information Service not found"
**Решение:**
- Адаптер может не поддерживать DIS
- Проверьте доступные службы в логах
- Серийный номер может быть доступен через фирменную характеристику
- Обновите `BleGattConnection` с фирменными UUID службы Eldiag

### Проблема: "Serial number mismatch"
**Решение:**
- Подключено неправильное устройство Eldiag
- Проверьте MAC-адрес и имя устройства
- Убедитесь, что целевое устройство имеет серийный номер 979868808198

### Проблема: Устройство находится, но подключение не удаётся
**Решение:**
- Убедитесь, что адаптер не подключен к другому устройству
- Попробуйте перезапустить адаптер (выключить/включить зажигание)
- Попробуйте другой транспорт (BLE → Classic или Classic → BLE)
- Проверьте расстояние и помехи

## 10. Диагностические команды

### Проверка состояния Bluetooth
```bash
adb shell dumpsys bluetooth_manager
```

### Проверка разрешений приложения
```bash
adb shell dumpsys package com.selfservice.kiosk | grep permission
```

### Мониторинг логов BLE
```bash
adb logcat -s BleScanner:D BleGattConnection:D
```

### Мониторинг логов Classic
```bash
adb logcat -s ClassicBluetoothScanner:D ClassicSppConnection:D
```

## Дополнительная информация

### Технические характеристики Eldiag

- Транспорт: BLE и/или Classic Bluetooth
- Серийный номер: 979868808198
- Имя устройства: содержит "ELDIAG" или "EDIAG"

### BLE Службы (если известны)

- Device Information Service (DIS): `0000180A-0000-1000-8000-00805F9B34FB`
- Serial Number Characteristic: `00002A25-0000-1000-8000-00805F9B34FB`
- Nordic UART Service (NUS): `6E400001-B5A3-F393-E0A9-E50E24DCCA9E`

Если Eldiag использует другие UUID служб, обновите константы в `BleGattConnection.kt`.

### Поддержка

При возникновении проблем предоставьте следующую информацию:
1. Версия Android (API level)
2. Модель устройства Android
3. Модель адаптера Eldiag
4. Логи приложения (adb logcat)
5. Скриншоты системных настроек Bluetooth
6. Результаты выполнения чеклиста
