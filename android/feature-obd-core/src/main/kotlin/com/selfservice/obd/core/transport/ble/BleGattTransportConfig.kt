package com.selfservice.obd.core.transport.ble

import java.util.UUID

/**
 * Configuration describing how the GATT transport should establish a link with the adapter.
 */
data class BleGattTransportConfig(
    val serviceUuid: UUID,
    val notifyCharacteristicUuid: UUID,
    val writeCharacteristicUuid: UUID,
    val mtu: Int = 190,
    val frameBufferCapacity: Int = 32,
    val connectTimeoutMs: Long = 15_000L,
    val autoReconnect: Boolean = true
) {
    companion object {
        val Default = BleGattTransportConfig(
            serviceUuid = UUID.fromString("0000fff0-0000-1000-8000-00805f9b34fb"),
            notifyCharacteristicUuid = UUID.fromString("0000fff4-0000-1000-8000-00805f9b34fb"),
            writeCharacteristicUuid = UUID.fromString("0000fff3-0000-1000-8000-00805f9b34fb"),
            mtu = 190,
            frameBufferCapacity = 32,
            connectTimeoutMs = 15_000L,
            autoReconnect = true
        )
    }
}
