package com.selfservice.obd.core.connection

/**
 * Configuration for BLE scanning tailored to diagnostic adapters.
 */
data class BleScannerConfig(
    val targetSerialPattern: Regex?,
    val serviceUuids: List<String>,
    val timeoutMs: Long
) {
    companion object {
        val Default = BleScannerConfig(
            targetSerialPattern = null,
            serviceUuids = emptyList(),
            timeoutMs = 15_000L
        )
    }
}
