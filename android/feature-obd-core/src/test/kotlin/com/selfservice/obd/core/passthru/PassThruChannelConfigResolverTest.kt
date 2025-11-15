package com.selfservice.obd.core.passthru

import com.selfservice.obd.core.connection.BleDevice
import kotlin.test.Test
import kotlin.test.assertEquals

class PassThruChannelConfigResolverTest {

    @Test
    fun returnsOverrideWhenAddressMatches() {
        val defaultConfig = PassThruChannelConfig(protocolId = 6, baudRate = 500_000)
        val overrideConfig = PassThruChannelConfig(protocolId = 8, baudRate = 250_000)
        val resolver =
                PassThruChannelConfigResolver(
                        defaultConfig = defaultConfig,
                        overrides = mapOf("AA:BB:CC:DD:EE:FF" to overrideConfig)
                )
        val device = BleDevice(address = "aa:bb:cc:dd:ee:ff", name = "adapter", rssi = -42)

        val resolved = resolver.resolve(device)

        assertEquals(overrideConfig, resolved)
    }

    @Test
    fun returnsDefaultWhenNoOverrideFound() {
        val defaultConfig = PassThruChannelConfig(protocolId = 6, baudRate = 500_000)
        val resolver = PassThruChannelConfigResolver(defaultConfig = defaultConfig)
        val device = BleDevice(address = "11:22:33:44:55:66", name = null, rssi = null)

        val resolved = resolver.resolve(device)

        assertEquals(defaultConfig, resolved)
    }
}
