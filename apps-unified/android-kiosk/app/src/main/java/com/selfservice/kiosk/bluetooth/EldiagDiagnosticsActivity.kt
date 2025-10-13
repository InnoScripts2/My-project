package com.selfservice.kiosk.bluetooth

import android.os.Bundle
import android.util.Log
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.selfservice.kiosk.bluetooth.connection.ConnectionFactory
import com.selfservice.kiosk.bluetooth.data.ElmCommandHandler
import com.selfservice.kiosk.bluetooth.data.toElmTransport
import com.selfservice.kiosk.bluetooth.models.AdapterConnection
import com.selfservice.kiosk.bluetooth.models.ConnectionState
import com.selfservice.kiosk.bluetooth.models.ScanResultModel
import com.selfservice.kiosk.bluetooth.permissions.BluetoothPermissionManager
import com.selfservice.kiosk.bluetooth.scanner.UnifiedBluetoothScanner
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch

class EldiagDiagnosticsActivity : AppCompatActivity() {

    private lateinit var permissionManager: BluetoothPermissionManager
    private lateinit var scanner: UnifiedBluetoothScanner
    
    private var scanJob: Job? = null
    private var connection: AdapterConnection? = null
    private var elmHandler: ElmCommandHandler? = null
    
    private val foundDevices = mutableListOf<ScanResultModel>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        permissionManager = BluetoothPermissionManager(this)
        scanner = UnifiedBluetoothScanner(this)
        
        checkPermissionsAndStart()
    }

    private fun checkPermissionsAndStart() {
        when (val status = permissionManager.checkPermissions()) {
            is BluetoothPermissionManager.PermissionStatus.Granted -> {
                checkBluetoothAndLocationEnabled()
            }
            is BluetoothPermissionManager.PermissionStatus.Denied -> {
                showPermissionExplanation()
            }
        }
    }

    private fun showPermissionExplanation() {
        AlertDialog.Builder(this)
            .setTitle("Разрешения для диагностики")
            .setMessage(
                "Для работы диагностики OBD-II требуется доступ к Bluetooth.\n\n" +
                "Приложение использует Bluetooth для подключения к адаптеру диагностики автомобиля.\n\n" +
                "Разрешение на местоположение требуется для сканирования Bluetooth устройств."
            )
            .setPositiveButton("Разрешить") { _, _ ->
                permissionManager.requestPermissions(
                    this,
                    BluetoothPermissionManager.BLUETOOTH_PERMISSION_REQUEST_CODE
                )
            }
            .setNegativeButton("Отмена") { _, _ ->
                finish()
            }
            .show()
    }

    private fun checkBluetoothAndLocationEnabled() {
        if (!permissionManager.isBluetoothEnabled()) {
            AlertDialog.Builder(this)
                .setTitle("Bluetooth выключен")
                .setMessage("Для работы диагностики требуется включить Bluetooth")
                .setPositiveButton("Включить") { _, _ ->
                    startActivityForResult(
                        permissionManager.createEnableBluetoothIntent(),
                        BluetoothPermissionManager.BLUETOOTH_ENABLE_REQUEST_CODE
                    )
                }
                .setNegativeButton("Отмена") { _, _ ->
                    finish()
                }
                .show()
            return
        }

        if (!permissionManager.isLocationEnabled()) {
            AlertDialog.Builder(this)
                .setTitle("Определение местоположения выключено")
                .setMessage("Для сканирования Bluetooth устройств требуется включить определение местоположения")
                .setPositiveButton("OK", null)
                .show()
            return
        }

        startScan()
    }

    private fun startScan() {
        Log.i(TAG, "Starting device scan")
        Toast.makeText(this, "Поиск адаптера Eldiag...", Toast.LENGTH_SHORT).show()
        
        foundDevices.clear()
        
        scanJob = lifecycleScope.launch {
            try {
                scanner.startScan().collect { devices ->
                    foundDevices.clear()
                    foundDevices.addAll(devices)
                    
                    Log.i(TAG, "Found ${devices.size} Eldiag devices")
                    
                    val targetDevice = devices.find { it.isTargetDevice }
                    if (targetDevice != null) {
                        Log.i(TAG, "Found target device: ${targetDevice.name} (${targetDevice.macAddress})")
                        stopScanAndConnect(targetDevice)
                    } else if (devices.isNotEmpty()) {
                        Log.i(TAG, "Found devices but no target match yet")
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Scan error", e)
                Toast.makeText(this@EldiagDiagnosticsActivity, "Ошибка сканирования: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun stopScanAndConnect(device: ScanResultModel) {
        lifecycleScope.launch {
            scanner.stopScan()
            scanJob?.cancel()
            
            connectToDevice(device)
        }
    }

    private fun connectToDevice(device: ScanResultModel) {
        Log.i(TAG, "Connecting to device: ${device.name} (${device.macAddress})")
        Toast.makeText(this, "Подключение к ${device.name}...", Toast.LENGTH_SHORT).show()
        
        lifecycleScope.launch {
            connection = ConnectionFactory.connect(this@EldiagDiagnosticsActivity, device)
            
            if (connection == null) {
                Log.e(TAG, "Failed to connect")
                Toast.makeText(this@EldiagDiagnosticsActivity, "Не удалось подключиться", Toast.LENGTH_SHORT).show()
                return@launch
            }
            
            launch {
                connection?.state?.collect { state ->
                    handleConnectionState(state)
                }
            }
            
            val transport = connection?.toElmTransport()
            if (transport == null) {
                Log.e(TAG, "Failed to create transport")
                Toast.makeText(this@EldiagDiagnosticsActivity, "Ошибка создания транспорта", Toast.LENGTH_SHORT).show()
                return@launch
            }
            
            elmHandler = ElmCommandHandler(transport)
            
            initializeAndDiagnose()
        }
    }

    private fun handleConnectionState(state: ConnectionState) {
        when (state) {
            is ConnectionState.Disconnected -> {
                Log.i(TAG, "Connection state: Disconnected")
            }
            is ConnectionState.Connecting -> {
                Log.i(TAG, "Connection state: Connecting")
            }
            is ConnectionState.Connected -> {
                Log.i(TAG, "Connection state: Connected")
                Toast.makeText(this, "Подключено", Toast.LENGTH_SHORT).show()
            }
            is ConnectionState.Error -> {
                Log.e(TAG, "Connection error: ${state.message} (${state.code})")
                Toast.makeText(this, "Ошибка подключения: ${state.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun initializeAndDiagnose() {
        lifecycleScope.launch {
            val handler = elmHandler ?: return@launch
            
            Log.i(TAG, "Initializing ELM327")
            Toast.makeText(this@EldiagDiagnosticsActivity, "Инициализация адаптера...", Toast.LENGTH_SHORT).show()
            
            handler.initializeElm().onSuccess {
                Log.i(TAG, "ELM327 initialized successfully")
                Toast.makeText(this@EldiagDiagnosticsActivity, "Адаптер инициализирован", Toast.LENGTH_SHORT).show()
                
                readDiagnosticData()
            }.onFailure { error ->
                Log.e(TAG, "Failed to initialize ELM327", error)
                Toast.makeText(this@EldiagDiagnosticsActivity, "Ошибка инициализации: ${error.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun readDiagnosticData() {
        lifecycleScope.launch {
            val handler = elmHandler ?: return@launch
            
            Log.i(TAG, "Reading diagnostic data")
            
            handler.getVoltage().onSuccess { voltage ->
                Log.i(TAG, "Battery voltage: $voltage")
            }
            
            handler.getProtocol().onSuccess { protocol ->
                Log.i(TAG, "Protocol: $protocol")
            }
            
            handler.readDtc().onSuccess { dtcCodes ->
                Log.i(TAG, "DTC codes: $dtcCodes")
                
                if (dtcCodes.isEmpty()) {
                    Toast.makeText(this@EldiagDiagnosticsActivity, "Ошибки не обнаружены", Toast.LENGTH_SHORT).show()
                } else {
                    showDtcResults(dtcCodes)
                }
            }.onFailure { error ->
                Log.e(TAG, "Failed to read DTCs", error)
                Toast.makeText(this@EldiagDiagnosticsActivity, "Ошибка чтения DTC: ${error.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun showDtcResults(dtcCodes: List<String>) {
        AlertDialog.Builder(this)
            .setTitle("Обнаружены ошибки")
            .setMessage("Коды ошибок:\n\n${dtcCodes.joinToString("\n")}")
            .setPositiveButton("Сбросить ошибки") { _, _ ->
                clearDtc()
            }
            .setNegativeButton("Закрыть", null)
            .show()
    }

    private fun clearDtc() {
        lifecycleScope.launch {
            val handler = elmHandler ?: return@launch
            
            Log.i(TAG, "Clearing DTCs")
            Toast.makeText(this@EldiagDiagnosticsActivity, "Сброс ошибок...", Toast.LENGTH_SHORT).show()
            
            handler.clearDtc().onSuccess {
                Log.i(TAG, "DTCs cleared successfully")
                Toast.makeText(this@EldiagDiagnosticsActivity, "Ошибки сброшены", Toast.LENGTH_SHORT).show()
            }.onFailure { error ->
                Log.e(TAG, "Failed to clear DTCs", error)
                Toast.makeText(this@EldiagDiagnosticsActivity, "Ошибка сброса: ${error.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        
        when (requestCode) {
            BluetoothPermissionManager.BLUETOOTH_PERMISSION_REQUEST_CODE -> {
                checkPermissionsAndStart()
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        
        lifecycleScope.launch {
            scanJob?.cancel()
            scanner.stopScan()
            connection?.close()
        }
    }

    companion object {
        private const val TAG = "EldiagDiagnostics"
    }
}
