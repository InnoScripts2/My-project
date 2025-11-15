package com.selfservice.kiosk.bluetooth.data

import com.selfservice.kiosk.bluetooth.connection.BleGattConnection
import com.selfservice.kiosk.bluetooth.connection.ClassicSppConnection
import com.selfservice.kiosk.bluetooth.models.AdapterConnection
import kotlinx.coroutines.flow.Flow

interface ElmTransport {
    suspend fun sendCommand(command: String): Result<String>
    fun getResponses(): Flow<String>
}

fun AdapterConnection.toElmTransport(): ElmTransport? {
    return when (this) {
        is BleGattConnection -> BleElmTransport(this)
        is ClassicSppConnection -> SppElmTransport(this)
        else -> null
    }
}
