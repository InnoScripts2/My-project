package com.selfservice.obd.core.connection

import com.selfservice.obd.core.transport.ObdTransport

/**
 * Factory responsible for producing transport instances for a selected adapter.
 */
fun interface TransportFactory {
    suspend fun create(device: BleDevice): ObdTransport
}
