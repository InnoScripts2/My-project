package com.selfservice.kiosk.bluetooth.scanner

import android.content.Context
import android.util.Log
import com.selfservice.kiosk.bluetooth.models.ScanResultModel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine

class UnifiedBluetoothScanner(context: Context) : BluetoothScanner {

    private val bleScanner = BleScanner(context)
    private val classicScanner = ClassicBluetoothScanner(context)

    override fun startScan(): Flow<List<ScanResultModel>> {
        Log.i(TAG, "Starting unified BLE and Classic Bluetooth scan")
        
        val bleResults = bleScanner.startScan()
        val classicResults = classicScanner.startScan()
        
        return combine(bleResults, classicResults) { ble, classic ->
            val combined = mutableMapOf<String, ScanResultModel>()
            
            ble.forEach { result ->
                combined[result.macAddress] = result
            }
            
            classic.forEach { result ->
                if (!combined.containsKey(result.macAddress)) {
                    combined[result.macAddress] = result
                } else {
                    val existing = combined[result.macAddress]!!
                    if (existing.serialNumber == null && result.serialNumber != null) {
                        combined[result.macAddress] = result
                    }
                }
            }
            
            val results = combined.values.sortedWith(
                compareByDescending<ScanResultModel> { it.isTargetDevice }
                    .thenByDescending { it.serialNumber != null }
                    .thenByDescending { it.rssi }
            )
            
            Log.d(TAG, "Found ${results.size} Eldiag devices (BLE: ${ble.size}, Classic: ${classic.size})")
            
            results
        }
    }

    override suspend fun stopScan() {
        Log.i(TAG, "Stopping unified Bluetooth scan")
        bleScanner.stopScan()
        classicScanner.stopScan()
    }

    companion object {
        private const val TAG = "UnifiedBluetoothScanner"
    }
}
