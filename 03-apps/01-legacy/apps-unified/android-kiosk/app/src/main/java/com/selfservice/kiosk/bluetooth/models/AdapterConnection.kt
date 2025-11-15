package com.selfservice.kiosk.bluetooth.models

import kotlinx.coroutines.flow.StateFlow

sealed class ConnectionState {
    object Disconnected : ConnectionState()
    object Connecting : ConnectionState()
    object Connected : ConnectionState()
    data class Error(val message: String, val code: String? = null) : ConnectionState()
}

interface AdapterConnection {
    val transport: ScanResultModel.Transport
    val state: StateFlow<ConnectionState>
    suspend fun close()
}
