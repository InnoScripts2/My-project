package com.selfservice.kiosk.bluetooth.connection

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothSocket
import android.content.Context
import android.util.Log
import com.selfservice.kiosk.bluetooth.models.AdapterConnection
import com.selfservice.kiosk.bluetooth.models.ConnectionState
import com.selfservice.kiosk.bluetooth.models.ScanResultModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.util.UUID

class ClassicSppConnection(
    private val context: Context,
    private val candidate: ScanResultModel
) : AdapterConnection {

    override val transport = ScanResultModel.Transport.CLASSIC
    
    private val _state = MutableStateFlow<ConnectionState>(ConnectionState.Disconnected)
    override val state: StateFlow<ConnectionState> = _state.asStateFlow()

    private val bluetoothManager = context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
    private val bluetoothAdapter: BluetoothAdapter? = bluetoothManager.adapter
    
    private var socket: BluetoothSocket? = null
    var inputStream: InputStream? = null
        private set
    var outputStream: OutputStream? = null
        private set

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
    private suspend fun attemptConnection(device: BluetoothDevice): Boolean = withContext(Dispatchers.IO) {
        try {
            if (bluetoothAdapter?.isDiscovering == true) {
                bluetoothAdapter.cancelDiscovery()
            }

            socket = device.createRfcommSocketToServiceRecord(SPP_UUID)
            
            if (socket == null) {
                Log.e(TAG, "Failed to create RFCOMM socket")
                return@withContext false
            }

            Log.i(TAG, "Connecting to SPP socket")
            socket?.connect()
            
            inputStream = socket?.inputStream
            outputStream = socket?.outputStream
            
            if (inputStream == null || outputStream == null) {
                Log.e(TAG, "Failed to get I/O streams")
                close()
                return@withContext false
            }

            Log.i(TAG, "SPP connection established")
            true
        } catch (e: IOException) {
            Log.e(TAG, "SPP connection error", e)
            close()
            false
        } catch (e: Exception) {
            Log.e(TAG, "Unexpected connection error", e)
            close()
            false
        }
    }

    override suspend fun close() {
        Log.i(TAG, "Closing SPP connection")
        
        withContext(Dispatchers.IO) {
            try {
                inputStream?.close()
            } catch (e: Exception) {
                Log.e(TAG, "Error closing input stream", e)
            }
            
            try {
                outputStream?.close()
            } catch (e: Exception) {
                Log.e(TAG, "Error closing output stream", e)
            }
            
            try {
                socket?.close()
            } catch (e: Exception) {
                Log.e(TAG, "Error closing socket", e)
            }
        }
        
        inputStream = null
        outputStream = null
        socket = null
        _state.value = ConnectionState.Disconnected
    }

    private fun calculateExponentialBackoff(attempt: Int): Long {
        return minOf(1000L * (1 shl attempt), 10000L)
    }

    companion object {
        private const val TAG = "ClassicSppConnection"
        private val SPP_UUID: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
    }
}
