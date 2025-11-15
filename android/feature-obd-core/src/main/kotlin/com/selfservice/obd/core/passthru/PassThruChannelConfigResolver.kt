package com.selfservice.obd.core.passthru

import com.selfservice.obd.core.connection.BleDevice

/** Resolves passthru channel configuration for BLE devices. */
class PassThruChannelConfigResolver(
        private val defaultConfig: PassThruChannelConfig,
        private val overrides: Map<String, PassThruChannelConfig> = emptyMap()
) {

    fun resolve(device: BleDevice): PassThruChannelConfig {
        val address = device.address.uppercase()
        return overrides[address] ?: defaultConfig
    }

    companion object {
        fun default(): PassThruChannelConfigResolver =
                PassThruChannelConfigResolver(
                        defaultConfig = PassThruChannelConfig(protocolId = 6, baudRate = 500_000)
                )
    }
}
