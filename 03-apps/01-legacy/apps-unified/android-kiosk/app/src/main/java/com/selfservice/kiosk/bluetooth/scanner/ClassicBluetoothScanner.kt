package com.selfservice.kiosk.bluetooth.scanner

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.util.Log
import com.selfservice.kiosk.bluetooth.models.ScanResultModel
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.launch

class ClassicBluetoothScanner(private val context: Context) : BluetoothScanner {

    private val bluetoothManager = context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
    private val bluetoothAdapter: BluetoothAdapter? = bluetoothManager.adapter
    
    private val foundDevices = mutableMapOf<String, ScanResultModel>()
    private var isScanning = false

    @SuppressLint("MissingPermission")
    override fun startScan(): Flow<List<ScanResultModel>> = callbackFlow {
        if (bluetoothAdapter == null) {
            Log.e(TAG, "Bluetooth adapter not available")
            close(Exception("Bluetooth adapter not available"))
            return@callbackFlow
        }

        if (isScanning) {
            Log.w(TAG, "Scan already in progress")
            close(Exception("Scan already in progress"))
            return@callbackFlow
        }

        foundDevices.clear()
        isScanning = true
        
        Log.i(TAG, "Starting Classic Bluetooth discovery")

        val receiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                when (intent?.action) {
                    BluetoothDevice.ACTION_FOUND -> {
                        val device = intent.getParcelableExtra<BluetoothDevice>(BluetoothDevice.EXTRA_DEVICE)
                        val rssi = intent.getShortExtra(BluetoothDevice.EXTRA_RSSI, Short.MIN_VALUE).toInt()
                        
                        device?.let { processDiscoveredDevice(it, rssi) }
                        trySend(foundDevices.values.toList())
                    }
                    
                    BluetoothAdapter.ACTION_DISCOVERY_FINISHED -> {
                        Log.i(TAG, "Classic Bluetooth discovery finished")
                        isScanning = false
                        close()
                    }
                    
                    BluetoothAdapter.ACTION_DISCOVERY_STARTED -> {
                        Log.i(TAG, "Classic Bluetooth discovery started")
                    }
                }
            }
        }

        val intentFilter = IntentFilter().apply {
            addAction(BluetoothDevice.ACTION_FOUND)
            addAction(BluetoothAdapter.ACTION_DISCOVERY_STARTED)
            addAction(BluetoothAdapter.ACTION_DISCOVERY_FINISHED)
        }

        context.registerReceiver(receiver, intentFilter)

        try {
            if (bluetoothAdapter.isDiscovering) {
                bluetoothAdapter.cancelDiscovery()
            }
            
            val started = bluetoothAdapter.startDiscovery()
            if (!started) {
                Log.e(TAG, "Failed to start discovery")
                context.unregisterReceiver(receiver)
                isScanning = false
                close(Exception("Failed to start discovery"))
                return@callbackFlow
            }
            
            Log.i(TAG, "Classic Bluetooth discovery started successfully")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start Classic Bluetooth discovery", e)
            context.unregisterReceiver(receiver)
            isScanning = false
            close(e)
            return@callbackFlow
        }

        launch {
            delay(SCAN_TIMEOUT_MS)
            Log.i(TAG, "Classic Bluetooth scan timeout reached, stopping discovery")
            try {
                bluetoothAdapter.cancelDiscovery()
            } catch (e: Exception) {
                Log.e(TAG, "Error canceling discovery", e)
            }
            isScanning = false
            try {
                context.unregisterReceiver(receiver)
            } catch (e: Exception) {
                Log.e(TAG, "Error unregistering receiver", e)
            }
            close()
        }

        awaitClose {
            Log.i(TAG, "Stopping Classic Bluetooth discovery")
            try {
                bluetoothAdapter.cancelDiscovery()
                context.unregisterReceiver(receiver)
            } catch (e: Exception) {
                Log.e(TAG, "Error stopping discovery in awaitClose", e)
            }
            isScanning = false
        }
    }

    @SuppressLint("MissingPermission")
    private fun processDiscoveredDevice(device: BluetoothDevice, rssi: Int) {
        val deviceName = device.name ?: return
        val macAddress = device.address
        
        if (!deviceName.uppercase().contains("ELDIAG") && !deviceName.uppercase().contains("EDIAG")) {
            return
        }

        Log.d(TAG, "Found Eldiag candidate: name=$deviceName, mac=$macAddress, rssi=$rssi")

        val scanResultModel = ScanResultModel(
            transport = ScanResultModel.Transport.CLASSIC,
            name = deviceName,
            macAddress = macAddress,
            rssi = rssi,
            serialNumber = null,
            source = ScanResultModel.Source.DISCOVERY
        )

        foundDevices[macAddress] = scanResultModel
    }

    @SuppressLint("MissingPermission")
    override suspend fun stopScan() {
        if (!isScanning) return
        
        Log.i(TAG, "Manually stopping Classic Bluetooth discovery")
        isScanning = false
        
        try {
            bluetoothAdapter?.cancelDiscovery()
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping discovery", e)
        }
    }

    companion object {
        private const val TAG = "ClassicBluetoothScanner"
        private const val SCAN_TIMEOUT_MS = 15000L
    }
}
