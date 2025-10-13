package com.selfservice.kiosk.bluetooth.connection

import android.content.Context
import com.selfservice.kiosk.bluetooth.models.AdapterConnection
import com.selfservice.kiosk.bluetooth.models.ScanResultModel

object ConnectionFactory {
    
    suspend fun connect(context: Context, candidate: ScanResultModel): AdapterConnection? {
        return when (candidate.transport) {
            ScanResultModel.Transport.BLE -> {
                val connection = BleGattConnection(context, candidate)
                if (connection.connect()) {
                    connection
                } else {
                    null
                }
            }
            ScanResultModel.Transport.CLASSIC -> {
                val connection = ClassicSppConnection(context, candidate)
                if (connection.connect()) {
                    connection
                } else {
                    null
                }
            }
        }
    }
}
