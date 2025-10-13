package com.selfservice.kiosk.bluetooth.scanner

import com.selfservice.kiosk.bluetooth.models.ScanResultModel
import kotlinx.coroutines.flow.Flow

interface BluetoothScanner {
    fun startScan(): Flow<List<ScanResultModel>>
    suspend fun stopScan()
}
