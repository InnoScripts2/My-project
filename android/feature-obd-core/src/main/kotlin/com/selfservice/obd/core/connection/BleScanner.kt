package com.selfservice.obd.core.connection

import kotlinx.coroutines.flow.Flow

/**
 * Abstraction over the platform BLE scanner to simplify testing.
 */
interface BleScanner {
    val results: Flow<BleScanResult>

    suspend fun start(config: BleScannerConfig)
    suspend fun stop()
}
