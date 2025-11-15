package com.selfservice.obd.core.transport.ble

import com.selfservice.obd.core.connection.BleDevice
import kotlinx.coroutines.flow.Flow

/**
 * Thin abstraction over platform BluetoothGatt implementation.
 */
interface BleGattClient {
    val notifications: Flow<ByteArray>

    suspend fun connect(device: BleDevice, config: BleGattTransportConfig): ConnectionResult
    suspend fun write(payload: ByteArray): WriteResult
    suspend fun disconnect()

    interface Factory {
        fun create(): BleGattClient
    }

    sealed interface ConnectionResult {
        data object Success : ConnectionResult
        data class Failure(val cause: Throwable) : ConnectionResult
    }

    sealed interface WriteResult {
        data object Success : WriteResult
        data class Failure(val cause: Throwable) : WriteResult
    }
}
