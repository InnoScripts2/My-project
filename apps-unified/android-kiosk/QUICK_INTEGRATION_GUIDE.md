# Quick Integration Guide

This guide shows how to quickly integrate Eldiag Bluetooth functionality into your Android application.

## Step 1: Add Permissions to AndroidManifest.xml

Already done in `apps-unified/android-kiosk/app/src/main/AndroidManifest.xml`:

```xml
<!-- Legacy Bluetooth (API < 31) -->
<uses-permission android:name="android.permission.BLUETOOTH" android:maxSdkVersion="30" />
<uses-permission android:name="android.permission.BLUETOOTH_ADMIN" android:maxSdkVersion="30" />

<!-- New Bluetooth (API 31+) -->
<uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
<uses-permission android:name="android.permission.BLUETOOTH_SCAN" />

<!-- Location (required for BLE scan) -->
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />

<!-- Features -->
<uses-feature android:name="android.hardware.bluetooth" android:required="false" />
<uses-feature android:name="android.hardware.bluetooth_le" android:required="false" />
```

## Step 2: Check and Request Permissions

```kotlin
import com.selfservice.kiosk.bluetooth.permissions.BluetoothPermissionManager

class MainActivity : AppCompatActivity() {
    private lateinit var permissionManager: BluetoothPermissionManager
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        permissionManager = BluetoothPermissionManager(this)
        
        when (permissionManager.checkPermissions()) {
            is BluetoothPermissionManager.PermissionStatus.Granted -> {
                // Ready to scan
                startScanning()
            }
            is BluetoothPermissionManager.PermissionStatus.Denied -> {
                // Request permissions
                permissionManager.requestPermissions(
                    this,
                    BluetoothPermissionManager.BLUETOOTH_PERMISSION_REQUEST_CODE
                )
            }
        }
    }
    
    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        
        if (requestCode == BluetoothPermissionManager.BLUETOOTH_PERMISSION_REQUEST_CODE) {
            when (permissionManager.checkPermissions()) {
                is BluetoothPermissionManager.PermissionStatus.Granted -> startScanning()
                else -> showError("Permissions denied")
            }
        }
    }
}
```

## Step 3: Scan for Eldiag Devices

```kotlin
import com.selfservice.kiosk.bluetooth.scanner.UnifiedBluetoothScanner
import kotlinx.coroutines.launch
import androidx.lifecycle.lifecycleScope

private lateinit var scanner: UnifiedBluetoothScanner

fun startScanning() {
    scanner = UnifiedBluetoothScanner(this)
    
    lifecycleScope.launch {
        scanner.startScan().collect { devices ->
            // Update UI with found devices
            updateDeviceList(devices)
            
            // Check for target device
            val targetDevice = devices.find { it.isTargetDevice }
            if (targetDevice != null) {
                // Found the Eldiag with serial 979868808198
                stopScanAndConnect(targetDevice)
            }
        }
    }
}

fun stopScanAndConnect(device: ScanResultModel) {
    lifecycleScope.launch {
        scanner.stopScan()
        connectToDevice(device)
    }
}
```

## Step 4: Connect to Device

```kotlin
import com.selfservice.kiosk.bluetooth.connection.ConnectionFactory
import com.selfservice.kiosk.bluetooth.models.AdapterConnection
import com.selfservice.kiosk.bluetooth.models.ConnectionState

private var connection: AdapterConnection? = null

fun connectToDevice(device: ScanResultModel) {
    lifecycleScope.launch {
        connection = ConnectionFactory.connect(this@MainActivity, device)
        
        if (connection == null) {
            showError("Failed to connect")
            return@launch
        }
        
        // Monitor connection state
        launch {
            connection?.state?.collect { state ->
                when (state) {
                    is ConnectionState.Connected -> {
                        showMessage("Connected!")
                        initializeElm()
                    }
                    is ConnectionState.Connecting -> {
                        showMessage("Connecting...")
                    }
                    is ConnectionState.Disconnected -> {
                        showMessage("Disconnected")
                    }
                    is ConnectionState.Error -> {
                        showError("Error: ${state.message}")
                    }
                }
            }
        }
    }
}
```

## Step 5: Initialize ELM327 and Send Commands

```kotlin
import com.selfservice.kiosk.bluetooth.data.toElmTransport
import com.selfservice.kiosk.bluetooth.data.ElmCommandHandler

private var elmHandler: ElmCommandHandler? = null

fun initializeElm() {
    lifecycleScope.launch {
        val transport = connection?.toElmTransport()
        if (transport == null) {
            showError("Failed to create transport")
            return@launch
        }
        
        elmHandler = ElmCommandHandler(transport)
        
        // Initialize ELM327
        elmHandler?.initializeElm()?.onSuccess {
            showMessage("ELM327 initialized")
            readDiagnosticData()
        }?.onFailure { error ->
            showError("Init failed: ${error.message}")
        }
    }
}

fun readDiagnosticData() {
    lifecycleScope.launch {
        val handler = elmHandler ?: return@launch
        
        // Read battery voltage
        handler.getVoltage().onSuccess { voltage ->
            Log.i(TAG, "Voltage: $voltage")
        }
        
        // Read protocol
        handler.getProtocol().onSuccess { protocol ->
            Log.i(TAG, "Protocol: $protocol")
        }
        
        // Read DTCs
        handler.readDtc().onSuccess { codes ->
            if (codes.isEmpty()) {
                showMessage("No errors found")
            } else {
                showDtcCodes(codes)
            }
        }.onFailure { error ->
            showError("DTC read failed: ${error.message}")
        }
    }
}

fun clearDtc() {
    lifecycleScope.launch {
        elmHandler?.clearDtc()?.onSuccess {
            showMessage("DTCs cleared")
        }?.onFailure { error ->
            showError("Clear failed: ${error.message}")
        }
    }
}
```

## Step 6: Cleanup

```kotlin
override fun onDestroy() {
    super.onDestroy()
    
    lifecycleScope.launch {
        scanner.stopScan()
        connection?.close()
    }
}
```

## Complete Minimal Example

```kotlin
package com.selfservice.kiosk

import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.selfservice.kiosk.bluetooth.permissions.BluetoothPermissionManager
import com.selfservice.kiosk.bluetooth.scanner.UnifiedBluetoothScanner
import com.selfservice.kiosk.bluetooth.connection.ConnectionFactory
import com.selfservice.kiosk.bluetooth.data.toElmTransport
import com.selfservice.kiosk.bluetooth.data.ElmCommandHandler
import kotlinx.coroutines.launch

class MinimalDiagnosticsActivity : AppCompatActivity() {
    
    private lateinit var permissionManager: BluetoothPermissionManager
    private lateinit var scanner: UnifiedBluetoothScanner
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        permissionManager = BluetoothPermissionManager(this)
        scanner = UnifiedBluetoothScanner(this)
        
        // 1. Check permissions
        when (permissionManager.checkPermissions()) {
            is BluetoothPermissionManager.PermissionStatus.Granted -> scan()
            else -> permissionManager.requestPermissions(this, 1001)
        }
    }
    
    private fun scan() {
        lifecycleScope.launch {
            // 2. Scan for devices
            scanner.startScan().collect { devices ->
                devices.find { it.isTargetDevice }?.let { device ->
                    scanner.stopScan()
                    
                    // 3. Connect
                    val connection = ConnectionFactory.connect(this@MinimalDiagnosticsActivity, device)
                    if (connection != null) {
                        // 4. Create transport and handler
                        val transport = connection.toElmTransport()
                        val handler = ElmCommandHandler(transport!!)
                        
                        // 5. Initialize and read DTCs
                        handler.initializeElm().onSuccess {
                            handler.readDtc().onSuccess { codes ->
                                println("DTCs: $codes")
                            }
                        }
                    }
                }
            }
        }
    }
    
    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == 1001) scan()
    }
}
```

## Advanced Usage

### Custom Transport Configuration

```kotlin
// Adjust timeout for slow connections
class CustomSppTransport(connection: ClassicSppConnection) : SppElmTransport(connection) {
    companion object {
        private const val COMMAND_TIMEOUT_MS = 5000L // 5 seconds instead of 3
    }
}
```

### Manual Device Entry

```kotlin
// If device is visible in system settings but not found programmatically
val manualDevice = ScanResultModel(
    transport = ScanResultModel.Transport.CLASSIC,
    name = "ELDIAG",
    macAddress = "00:11:22:33:44:55", // From system settings
    rssi = -60,
    serialNumber = null,
    source = ScanResultModel.Source.DISCOVERY
)

val connection = ConnectionFactory.connect(context, manualDevice)
```

### Custom BLE Service UUIDs

If Eldiag uses different UUIDs, update `BleGattConnection.kt`:

```kotlin
companion object {
    // Update these with actual Eldiag UUIDs
    private const val ELDIAG_SERVICE_UUID = "XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
    private const val ELDIAG_TX_UUID = "XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
    private const val ELDIAG_RX_UUID = "XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
}
```

## Troubleshooting

See `DIAGNOSTIC_CHECKLIST.md` for complete troubleshooting guide.

### Quick Checks

1. **Device not found:** Check Bluetooth and Location are enabled, permissions granted
2. **Connection fails:** Check device is powered, not connected elsewhere, retry connection
3. **Commands fail:** Check initialization completed, increase timeout, check vehicle ECU is on
4. **GATT error 133:** Restart Bluetooth, unpair device, reboot Android device

## Next Steps

1. See `BLUETOOTH_ELDIAG_README.md` for complete API documentation
2. See `EldiagDiagnosticsActivity.kt` for full example with UI
3. See `DIAGNOSTIC_CHECKLIST.md` for troubleshooting
4. Run unit tests: `./gradlew test`

## Support

For issues, provide:
- Android version and device model
- Logcat output: `adb logcat -s BleScanner:D BleGattConnection:D ElmCommandHandler:D`
- Bluetooth settings screenshots
- Steps to reproduce
