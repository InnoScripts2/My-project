package com.selfservice.obd.core.passthru

import com.selfservice.core.DispatchersProvider
import com.selfservice.obd.core.connection.BleDevice
import com.selfservice.obd.core.connection.TransportFactory
import com.selfservice.obd.core.transport.ObdTransport

/** TransportFactory that produces PassThruTransport instances per requested adapter. */
class PassThruTransportFactory(
        private val dispatchers: DispatchersProvider,
        private val bridgeProvider: () -> PassThruNativeBridge,
        private val config: PassThruTransportFactoryConfig = PassThruTransportFactoryConfig()
) : TransportFactory {

    override suspend fun create(device: BleDevice): ObdTransport {
        val bridge = bridgeProvider()
        val channelConfig = config.channelResolver.resolve(device)
        return PassThruTransport(
                bridge = bridge,
                channelConfig = channelConfig,
                dispatchers = dispatchers,
                readTimeoutMillis = config.readTimeoutMillis,
                writeTimeoutMillis = config.writeTimeoutMillis,
                wakeMillivolts = config.wakeMillivolts,
                autoSetVoltage = config.autoSetVoltage,
                clock = config.clock,
                nanoClock = config.nanoClock,
                idleDelayMillis = config.idleDelayMillis
        )
    }
}
