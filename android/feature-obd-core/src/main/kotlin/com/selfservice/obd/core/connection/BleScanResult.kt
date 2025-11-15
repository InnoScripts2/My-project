package com.selfservice.obd.core.connection

/**
 * Single BLE scan observation containing metadata about an adapter.
 */
data class BleScanResult(
    val device: BleDevice,
    val serviceUuids: List<String> = emptyList(),
    val seenAtMillis: Long = System.currentTimeMillis()
)
