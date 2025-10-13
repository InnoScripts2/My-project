package com.selfservice.kiosk.bluetooth.scanner

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.le.BluetoothLeScanner
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.os.Build
import android.util.Log
import com.selfservice.kiosk.bluetooth.models.ScanResultModel
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

class BleScanner(private val context: Context) : BluetoothScanner {

    private val bluetoothManager = context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
    private val bluetoothAdapter: BluetoothAdapter? = bluetoothManager.adapter
    private val bleScanner: BluetoothLeScanner? = bluetoothAdapter?.bluetoothLeScanner
    
    private val foundDevices = mutableMapOf<String, ScanResultModel>()
    private var isScanning = false

    @SuppressLint("MissingPermission")
    override fun startScan(): Flow<List<ScanResultModel>> = callbackFlow {
        if (bleScanner == null) {
            Log.e(TAG, "BLE scanner not available")
            close(Exception("BLE scanner not available"))
            return@callbackFlow
        }

        if (isScanning) {
            Log.w(TAG, "Scan already in progress")
            close(Exception("Scan already in progress"))
            return@callbackFlow
        }

        foundDevices.clear()
        isScanning = true
        
        Log.i(TAG, "Starting BLE scan")

        val scanCallback = object : ScanCallback() {
            override fun onScanResult(callbackType: Int, result: ScanResult?) {
                result?.let { processScanResult(it) }
                trySend(foundDevices.values.toList())
            }

            override fun onBatchScanResults(results: MutableList<ScanResult>?) {
                results?.forEach { processScanResult(it) }
                trySend(foundDevices.values.toList())
            }

            override fun onScanFailed(errorCode: Int) {
                Log.e(TAG, "BLE scan failed with error code: $errorCode")
                close(Exception("BLE scan failed: $errorCode"))
            }
        }

        val scanFilters = buildScanFilters()
        val scanSettings = buildScanSettings()

        try {
            bleScanner.startScan(scanFilters, scanSettings, scanCallback)
            Log.i(TAG, "BLE scan started successfully")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start BLE scan", e)
            isScanning = false
            close(e)
            return@callbackFlow
        }

        launch {
            delay(SCAN_TIMEOUT_MS)
            Log.i(TAG, "BLE scan timeout reached, stopping scan")
            try {
                bleScanner.stopScan(scanCallback)
            } catch (e: Exception) {
                Log.e(TAG, "Error stopping scan", e)
            }
            isScanning = false
            close()
        }

        awaitClose {
            Log.i(TAG, "Stopping BLE scan")
            try {
                bleScanner.stopScan(scanCallback)
            } catch (e: Exception) {
                Log.e(TAG, "Error stopping scan in awaitClose", e)
            }
            isScanning = false
        }
    }

    @SuppressLint("MissingPermission")
    private fun processScanResult(result: ScanResult) {
        val device = result.device
        val deviceName = device.name ?: return
        val macAddress = device.address
        
        if (!deviceName.uppercase().contains("ELDIAG") && !deviceName.uppercase().contains("EDIAG")) {
            return
        }

        Log.d(TAG, "Found Eldiag candidate: name=$deviceName, mac=$macAddress, rssi=${result.rssi}")

        val serialNumber = extractSerialNumber(result)
        if (serialNumber != null) {
            Log.i(TAG, "Extracted serial number from advertisement: $serialNumber")
        }

        val scanResultModel = ScanResultModel(
            transport = ScanResultModel.Transport.BLE,
            name = deviceName,
            macAddress = macAddress,
            rssi = result.rssi,
            serialNumber = serialNumber,
            source = ScanResultModel.Source.ADVERTISEMENT
        )

        foundDevices[macAddress] = scanResultModel
    }

    private fun extractSerialNumber(result: ScanResult): String? {
        val scanRecord = result.scanRecord ?: return null
        
        val manufacturerData = scanRecord.manufacturerSpecificData
        for (i in 0 until manufacturerData.size()) {
            val manufacturerId = manufacturerData.keyAt(i)
            val data = manufacturerData.valueAt(i)
            
            Log.d(TAG, "Manufacturer data: id=$manufacturerId, data=${data.contentToString()}")
            
            val serialNumber = parseSerialNumberFromManufacturerData(data)
            if (serialNumber != null) {
                return serialNumber
            }
        }

        val serviceData = scanRecord.serviceData
        serviceData?.forEach { (uuid, data) ->
            Log.d(TAG, "Service data: uuid=$uuid, data=${data.contentToString()}")
            
            val serialNumber = parseSerialNumberFromServiceData(data)
            if (serialNumber != null) {
                return serialNumber
            }
        }

        return null
    }

    private fun parseSerialNumberFromManufacturerData(data: ByteArray): String? {
        if (data.size >= 12) {
            val serialNumber = data.take(12).joinToString("") { 
                String.format("%02X", it) 
            }
            if (serialNumber.matches(Regex("\\d{12}"))) {
                return serialNumber
            }
        }
        return null
    }

    private fun parseSerialNumberFromServiceData(data: ByteArray): String? {
        val text = data.toString(Charsets.UTF_8)
        if (text.matches(Regex("\\d{12}"))) {
            return text
        }
        return null
    }

    private fun buildScanFilters(): List<ScanFilter> {
        val filters = mutableListOf<ScanFilter>()
        
        filters.add(
            ScanFilter.Builder()
                .setDeviceName("ELDIAG")
                .build()
        )
        
        filters.add(
            ScanFilter.Builder()
                .setDeviceName("EDIAG")
                .build()
        )
        
        return filters
    }

    private fun buildScanSettings(): ScanSettings {
        return ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
            .setCallbackType(ScanSettings.CALLBACK_TYPE_ALL_MATCHES)
            .setMatchMode(ScanSettings.MATCH_MODE_AGGRESSIVE)
            .setNumOfMatches(ScanSettings.MATCH_NUM_MAX_ADVERTISEMENT)
            .setReportDelay(0)
            .apply {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    setLegacy(false)
                    setPhy(ScanSettings.PHY_LE_ALL_SUPPORTED)
                }
            }
            .build()
    }

    @SuppressLint("MissingPermission")
    override suspend fun stopScan() {
        if (!isScanning) return
        
        Log.i(TAG, "Manually stopping BLE scan")
        isScanning = false
        
        try {
            bleScanner?.stopScan(object : ScanCallback() {})
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping scan", e)
        }
    }

    companion object {
        private const val TAG = "BleScanner"
        private const val SCAN_TIMEOUT_MS = 15000L
    }
}
