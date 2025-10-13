package com.selfservice.kiosk.bluetooth.connection

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.BluetoothStatusCodes
import android.content.Context
import android.os.Build
import android.util.Log
import com.selfservice.kiosk.bluetooth.models.AdapterConnection
import com.selfservice.kiosk.bluetooth.models.ConnectionState
import com.selfservice.kiosk.bluetooth.models.ScanResultModel
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.util.UUID

class BleGattConnection(
    private val context: Context,
    private val candidate: ScanResultModel
) : AdapterConnection {

    override val transport = ScanResultModel.Transport.BLE
    
    private val _state = MutableStateFlow<ConnectionState>(ConnectionState.Disconnected)
    override val state: StateFlow<ConnectionState> = _state.asStateFlow()

    private val bluetoothManager = context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
    private val bluetoothAdapter: BluetoothAdapter? = bluetoothManager.adapter
    
    private var bluetoothGatt: BluetoothGatt? = null
    private var txCharacteristic: BluetoothGattCharacteristic? = null
    private var rxCharacteristic: BluetoothGattCharacteristic? = null
    
    private var onConnectedDeferred: CompletableDeferred<Boolean>? = null
    private var onServicesDiscoveredDeferred: CompletableDeferred<Boolean>? = null
    private var onCharacteristicReadDeferred: CompletableDeferred<String>? = null
    private var notificationListener: ((ByteArray) -> Unit)? = null

    @SuppressLint("MissingPermission")
    suspend fun connect(retryCount: Int = 3): Boolean {
        if (bluetoothAdapter == null) {
            _state.value = ConnectionState.Error("Bluetooth adapter not available", "NO_ADAPTER")
            return false
        }

        val device = bluetoothAdapter.getRemoteDevice(candidate.macAddress)
        
        for (attempt in 1..retryCount) {
            Log.i(TAG, "Connection attempt $attempt/$retryCount to ${candidate.name} (${candidate.macAddress})")
            _state.value = ConnectionState.Connecting
            
            val success = attemptConnection(device)
            if (success) {
                Log.i(TAG, "Successfully connected to ${candidate.name}")
                _state.value = ConnectionState.Connected
                return true
            }
            
            if (attempt < retryCount) {
                val delayMs = calculateExponentialBackoff(attempt)
                Log.i(TAG, "Connection failed, retrying in ${delayMs}ms")
                delay(delayMs)
            }
        }
        
        Log.e(TAG, "Failed to connect after $retryCount attempts")
        _state.value = ConnectionState.Error("Connection failed after $retryCount attempts", "CONNECTION_FAILED")
        return false
    }

    @SuppressLint("MissingPermission")
    private suspend fun attemptConnection(device: BluetoothDevice): Boolean {
        onConnectedDeferred = CompletableDeferred()
        onServicesDiscoveredDeferred = CompletableDeferred()

        try {
            bluetoothGatt = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                device.connectGatt(context, false, gattCallback, BluetoothDevice.TRANSPORT_LE)
            } else {
                device.connectGatt(context, false, gattCallback)
            }

            val connected = onConnectedDeferred?.await() ?: false
            if (!connected) {
                close()
                return false
            }

            Log.i(TAG, "Requesting MTU")
            bluetoothGatt?.requestMtu(247)
            delay(500)

            Log.i(TAG, "Discovering services")
            bluetoothGatt?.discoverServices()

            val servicesDiscovered = onServicesDiscoveredDeferred?.await() ?: false
            if (!servicesDiscovered) {
                close()
                return false
            }

            val serialNumber = readSerialNumber()
            if (serialNumber != null) {
                Log.i(TAG, "Read serial number from DIS: $serialNumber")
                
                if (serialNumber != ScanResultModel.TARGET_SERIAL_NUMBER) {
                    Log.w(TAG, "Serial number mismatch: expected ${ScanResultModel.TARGET_SERIAL_NUMBER}, got $serialNumber")
                    _state.value = ConnectionState.Error(
                        "Serial number mismatch: $serialNumber",
                        "SERIAL_MISMATCH"
                    )
                    close()
                    return false
                }
            } else if (candidate.serialNumber == null) {
                Log.w(TAG, "Could not verify serial number")
            }

            setupCharacteristics()
            
            return txCharacteristic != null && rxCharacteristic != null
        } catch (e: Exception) {
            Log.e(TAG, "Connection error", e)
            close()
            return false
        }
    }

    fun registerNotificationListener(listener: (ByteArray) -> Unit) {
        notificationListener = listener
    }

    @SuppressLint("MissingPermission")
    suspend fun write(payload: ByteArray): Boolean {
        val gatt = bluetoothGatt ?: return false
        val characteristic = txCharacteristic ?: return false

        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            val result = gatt.writeCharacteristic(characteristic, payload, BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT)
            result == BluetoothStatusCodes.SUCCESS
        } else {
            @Suppress("DEPRECATION")
            characteristic.writeType = BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT
            @Suppress("DEPRECATION")
            characteristic.value = payload
            @Suppress("DEPRECATION")
            gatt.writeCharacteristic(characteristic)
        }
    }

    @SuppressLint("MissingPermission")
    private suspend fun readSerialNumber(): String? {
        val gatt = bluetoothGatt ?: return null
        
        val disService = gatt.getService(UUID.fromString(DIS_SERVICE_UUID))
        if (disService == null) {
            Log.w(TAG, "Device Information Service not found")
            return null
        }

        val serialNumberCharacteristic = disService.getCharacteristic(
            UUID.fromString(SERIAL_NUMBER_CHARACTERISTIC_UUID)
        )
        if (serialNumberCharacteristic == null) {
            Log.w(TAG, "Serial Number characteristic not found")
            return null
        }

        onCharacteristicReadDeferred = CompletableDeferred()
        
        val readSuccess = gatt.readCharacteristic(serialNumberCharacteristic)
        if (!readSuccess) {
            Log.w(TAG, "Failed to initiate serial number read")
            return null
        }

        return try {
            onCharacteristicReadDeferred?.await()
        } catch (e: Exception) {
            Log.e(TAG, "Error reading serial number", e)
            null
        }
    }

    @SuppressLint("MissingPermission")
    private fun setupCharacteristics() {
        val gatt = bluetoothGatt ?: return
        
        val uartService = gatt.getService(UUID.fromString(NORDIC_UART_SERVICE_UUID))
        if (uartService != null) {
            txCharacteristic = uartService.getCharacteristic(UUID.fromString(NORDIC_UART_TX_CHARACTERISTIC_UUID))
            rxCharacteristic = uartService.getCharacteristic(UUID.fromString(NORDIC_UART_RX_CHARACTERISTIC_UUID))
            
            if (rxCharacteristic != null) {
                gatt.setCharacteristicNotification(rxCharacteristic, true)
                
                val descriptor = rxCharacteristic!!.getDescriptor(UUID.fromString(CCCD_UUID))
                if (descriptor != null) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        gatt.writeDescriptor(descriptor, BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE)
                    } else {
                        @Suppress("DEPRECATION")
                        descriptor.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
                        @Suppress("DEPRECATION")
                        gatt.writeDescriptor(descriptor)
                    }
                }
            }
            
            Log.i(TAG, "UART characteristics setup: TX=${txCharacteristic != null}, RX=${rxCharacteristic != null}")
        } else {
            Log.w(TAG, "Nordic UART Service not found")
        }
    }

    private val gattCallback = object : BluetoothGattCallback() {
        @SuppressLint("MissingPermission")
        override fun onConnectionStateChange(gatt: BluetoothGatt?, status: Int, newState: Int) {
            when (newState) {
                BluetoothProfile.STATE_CONNECTED -> {
                    Log.i(TAG, "GATT connected")
                    onConnectedDeferred?.complete(true)
                }
                BluetoothProfile.STATE_DISCONNECTED -> {
                    Log.i(TAG, "GATT disconnected, status=$status")
                    onConnectedDeferred?.complete(false)
                    _state.value = ConnectionState.Disconnected
                    
                    if (status == 133) {
                        Log.e(TAG, "GATT error 133 (common connection issue)")
                    }
                }
            }
        }

        override fun onServicesDiscovered(gatt: BluetoothGatt?, status: Int) {
            if (status == BluetoothGatt.GATT_SUCCESS) {
                Log.i(TAG, "Services discovered successfully")
                val services = gatt?.services?.map { it.uuid.toString() } ?: emptyList()
                Log.d(TAG, "Available services: $services")
                onServicesDiscoveredDeferred?.complete(true)
            } else {
                Log.e(TAG, "Service discovery failed with status $status")
                onServicesDiscoveredDeferred?.complete(false)
            }
        }

        @Deprecated("Deprecated in Android 13")
        override fun onCharacteristicRead(
            gatt: BluetoothGatt?,
            characteristic: BluetoothGattCharacteristic?,
            status: Int
        ) {
            if (status == BluetoothGatt.GATT_SUCCESS && characteristic != null) {
                @Suppress("DEPRECATION")
                val value = characteristic.value?.toString(Charsets.UTF_8) ?: ""
                Log.d(TAG, "Characteristic read: ${characteristic.uuid}, value=$value")
                onCharacteristicReadDeferred?.complete(value)
            } else {
                onCharacteristicReadDeferred?.completeExceptionally(
                    Exception("Read failed with status $status")
                )
            }
        }

        override fun onCharacteristicChanged(
            gatt: BluetoothGatt?,
            characteristic: BluetoothGattCharacteristic?
        ) {
            if (characteristic == null) return
            val data = characteristic.value ?: return
            if (rxCharacteristic?.uuid == characteristic.uuid) {
                notificationListener?.invoke(data.copyOf())
            }
        }
    }

    @SuppressLint("MissingPermission")
    override suspend fun close() {
        Log.i(TAG, "Closing BLE connection")
        bluetoothGatt?.disconnect()
        bluetoothGatt?.close()
        bluetoothGatt = null
        txCharacteristic = null
        rxCharacteristic = null
        _state.value = ConnectionState.Disconnected
    }

    private fun calculateExponentialBackoff(attempt: Int): Long {
        return minOf(1000L * (1 shl attempt), 10000L)
    }

    companion object {
        private const val TAG = "BleGattConnection"
        
        private const val DIS_SERVICE_UUID = "0000180A-0000-1000-8000-00805F9B34FB"
        private const val SERIAL_NUMBER_CHARACTERISTIC_UUID = "00002A25-0000-1000-8000-00805F9B34FB"
        
        private const val NORDIC_UART_SERVICE_UUID = "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
        private const val NORDIC_UART_TX_CHARACTERISTIC_UUID = "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"
        private const val NORDIC_UART_RX_CHARACTERISTIC_UUID = "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"
        
        private const val CCCD_UUID = "00002902-0000-1000-8000-00805F9B34FB"
    }
}
