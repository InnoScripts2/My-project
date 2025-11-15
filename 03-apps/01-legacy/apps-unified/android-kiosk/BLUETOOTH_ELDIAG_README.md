# Android Bluetooth Eldiag Integration

This module provides comprehensive Bluetooth scanning, connection, and data exchange functionality for the KINGBOLEN Eldiag OBD-II adapter with serial number 979868808198.

## Architecture

### Package Structure

- `bluetooth.models` - Data models and interfaces
- `bluetooth.permissions` - Runtime permission management
- `bluetooth.scanner` - BLE and Classic Bluetooth scanning
- `bluetooth.connection` - GATT and SPP connection management
- `bluetooth.data` - ELM327 command protocol implementation

## Features

### 1. Permission Management

`BluetoothPermissionManager` handles runtime permissions for Android 8-14 (API 26-34):

- Android 12+ (API 31+): BLUETOOTH_SCAN, BLUETOOTH_CONNECT, ACCESS_FINE_LOCATION
- Android 11 and below: BLUETOOTH, BLUETOOTH_ADMIN, ACCESS_FINE_LOCATION
- Bluetooth and Location enablement checks

### 2. Device Scanning

#### BLE Scanner (`BleScanner`)

- Uses `BluetoothLeScanner` with `ScanFilter` by device name containing "ELDIAG" or "EDIAG"
- Parses `ScanRecord` for manufacturer data and service data
- Attempts to extract serial number from advertisement data
- 15-second scan timeout with manual stop capability
- Detailed logging of discovered devices and RSSI

#### Classic Bluetooth Scanner (`ClassicBluetoothScanner`)

- Uses `BluetoothAdapter.startDiscovery()` with `BroadcastReceiver`
- Filters devices by name containing "ELDIAG" or "EDIAG"
- 15-second discovery timeout

#### Unified Scanner (`UnifiedBluetoothScanner`)

- Combines BLE and Classic scanning
- Returns merged results sorted by:
  1. Target device match (serial number == 979868808198)
  2. Serial number availability
  3. RSSI strength

### 3. Connection Management

#### BLE GATT Connection (`BleGattConnection`)

- Connects via `connectGatt()` with `TRANSPORT_LE`
- Exponential backoff retry (3-5 attempts)
- MTU negotiation (up to 247 bytes)
- Service discovery and characteristic setup
- Device Information Service (DIS 0x180A) reading for serial number validation
- Nordic UART Service (NUS 6E400001-B5A3-F393-E0A9-E50E24DCCA9E) for data exchange
- Connection state monitoring via StateFlow
- Detailed error diagnostics (GATT status 133, service not found, etc.)

#### Classic SPP Connection (`ClassicSppConnection`)

- RFCOMM socket using SPP UUID (00001101-0000-1000-8000-00805F9B34FB)
- Background connection on IO dispatcher
- Exponential backoff retry
- InputStream/OutputStream access
- Connection state monitoring

### 4. Data Exchange

#### ELM327 Protocol Implementation

`ElmCommandHandler` provides:

- `initializeElm()` - Sequential AT command initialization (ATZ, ATE0, ATL0, ATS0, ATH0, ATSP0)
- `readPid(pid)` - Read OBD-II PIDs
- `readDtc()` - Read diagnostic trouble codes
- `clearDtc()` - Clear diagnostic trouble codes
- `getVoltage()` - Read battery voltage (ATRV)
- `getProtocol()` - Get active protocol (ATDP)

#### Transport Layers

**BLE Transport (`BleElmTransport`)**
- Writes to TX characteristic
- Reads from RX characteristic notifications
- Response buffering until ">" delimiter
- 3-second command timeout

**SPP Transport (`SppElmTransport`)**
- Coroutine-based writer/reader
- CRLF protocol handling
- Response buffering until ">" delimiter
- 3-second command timeout

#### Response Normalization

Both transports normalize responses by:
- Removing ">" prompts
- Filtering blank lines
- Removing "OK" responses
- Trimming whitespace

### 5. Data Models

#### ScanResultModel

```kotlin
data class ScanResultModel(
    val transport: Transport,        // BLE or CLASSIC
    val name: String,                 // Device name
    val macAddress: String,           // MAC address
    val rssi: Int,                    // Signal strength
    val serialNumber: String?,        // Serial number if available
    val source: Source                // ADVERTISEMENT or DISCOVERY
)
```

Target serial number: `979868808198`

#### ConnectionState

```kotlin
sealed class ConnectionState {
    object Disconnected
    object Connecting
    object Connected
    data class Error(val message: String, val code: String?)
}
```

## Usage Examples

### Scanning for Devices

```kotlin
val permissionManager = BluetoothPermissionManager(context)

// Check permissions
when (permissionManager.checkPermissions()) {
    is PermissionStatus.Granted -> {
        // Start scanning
        val scanner = UnifiedBluetoothScanner(context)
        
        scanner.startScan().collect { devices ->
            devices.forEach { device ->
                Log.i("Scan", "Found: ${device.name} (${device.macAddress})")
                if (device.isTargetDevice) {
                    Log.i("Scan", "Found target Eldiag device!")
                }
            }
        }
    }
    is PermissionStatus.Denied -> {
        // Request permissions
        permissionManager.requestPermissions(activity, PERMISSION_REQUEST_CODE)
    }
}
```

### Connecting to Device

```kotlin
val connection = ConnectionFactory.connect(context, scanResult)

if (connection != null) {
    connection.state.collect { state ->
        when (state) {
            is ConnectionState.Connected -> {
                Log.i("Connection", "Connected successfully")
                // Start data exchange
            }
            is ConnectionState.Error -> {
                Log.e("Connection", "Error: ${state.message} (${state.code})")
            }
        }
    }
} else {
    Log.e("Connection", "Failed to connect")
}
```

### ELM327 Commands

```kotlin
val transport = connection.toElmTransport()
val handler = ElmCommandHandler(transport)

// Initialize
handler.initializeElm().onSuccess {
    Log.i("ELM", "Initialized successfully")
}

// Read DTCs
handler.readDtc().onSuccess { codes ->
    Log.i("ELM", "DTCs: $codes")
}

// Clear DTCs
handler.clearDtc().onSuccess {
    Log.i("ELM", "DTCs cleared")
}
```

## Testing

Unit tests are provided for:

- `ScanRecordParserTest` - Serial number extraction from advertisement data
- `ElmResponseParserTest` - DTC parsing and response normalization

Run tests:
```bash
./gradlew test
```

## Troubleshooting

### Device Not Found

1. Verify Bluetooth and Location are enabled
2. Check permissions are granted (BLUETOOTH_SCAN, BLUETOOTH_CONNECT, ACCESS_FINE_LOCATION)
3. Ensure Eldiag adapter is powered (connected to OBD-II port with ignition on)
4. Check adapter is not connected to another device
5. Move closer to adapter (< 1-2 meters for BLE)

### Connection Failed

1. Check GATT error codes in logs
2. Status 133: Common connection issue, retry or restart Bluetooth
3. Service not found: Adapter may not support expected services
4. Serial number mismatch: Wrong device or need to read DIS after connection

### No Response to Commands

1. Verify connection state is Connected
2. Check command timeout settings
3. Ensure ELM327 initialization completed successfully
4. Check vehicle ECU is responsive (ignition on)

## Configuration

### Timeouts

- Scan timeout: 15 seconds (configurable in scanner classes)
- Connection timeout: 10-20 seconds with exponential backoff
- Command timeout: 3 seconds (configurable in transport classes)

### BLE Services

- Device Information Service (DIS): `0000180A-0000-1000-8000-00805F9B34FB`
- Serial Number Characteristic: `00002A25-0000-1000-8000-00805F9B34FB`
- Nordic UART Service (NUS): `6E400001-B5A3-F393-E0A9-E50E24DCCA9E`
- TX Characteristic: `6E400002-B5A3-F393-E0A9-E50E24DCCA9E`
- RX Characteristic: `6E400003-B5A3-F393-E0A9-E50E24DCCA9E`

If Eldiag uses different service UUIDs, update constants in `BleGattConnection`.

## Requirements

- Minimum SDK: 26 (Android 8.0)
- Target SDK: 34 (Android 14)
- Kotlin: 1.9.24+
- Coroutines: 1.8.0+

## Dependencies

```gradle
implementation 'androidx.core:core-ktx:1.13.1'
implementation 'androidx.lifecycle:lifecycle-runtime-ktx:2.8.0'
implementation 'org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.0'
```
