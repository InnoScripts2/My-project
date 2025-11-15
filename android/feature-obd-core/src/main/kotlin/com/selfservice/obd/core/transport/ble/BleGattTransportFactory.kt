package com.selfservice.obd.core.transport.ble

import com.selfservice.core.DispatchersProvider
import com.selfservice.obd.core.connection.BleDevice
import com.selfservice.obd.core.connection.TransportFactory
import com.selfservice.obd.core.transport.ObdTransport

/**
 * TransportFactory implementation that produces BLE GATT transports per adapter.
 */
class BleGattTransportFactory(
    private val dispatchers: DispatchersProvider,
    private val clientFactory: BleGattClient.Factory,
    private val config: BleGattTransportConfig = BleGattTransportConfig.Default,
    private val timeProvider: () -> Long = { System.currentTimeMillis() }
) : TransportFactory {

    override suspend fun create(device: BleDevice): ObdTransport {
        val client = clientFactory.create()
        return BleGattTransport(
            device = device,
            client = client,
            config = config,
            dispatchers = dispatchers,
            timeProvider = timeProvider
        )
    }
}
