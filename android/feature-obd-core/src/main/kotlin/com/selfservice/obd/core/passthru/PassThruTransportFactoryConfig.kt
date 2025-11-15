package com.selfservice.obd.core.passthru

/** Configuration options for [PassThruTransportFactory]. */
class PassThruTransportFactoryConfig(
        val channelResolver: PassThruChannelConfigResolver =
                PassThruChannelConfigResolver.default(),
        val readTimeoutMillis: Int = DEFAULT_TIMEOUT_MS,
        val writeTimeoutMillis: Int = DEFAULT_TIMEOUT_MS,
        val wakeMillivolts: Int = DEFAULT_WAKE_MILLIVOLTS,
        val autoSetVoltage: Boolean = true,
        val idleDelayMillis: Long = DEFAULT_IDLE_DELAY_MS,
        val clock: () -> Long = { System.currentTimeMillis() },
        val nanoClock: () -> Long = { System.nanoTime() }
) {

    companion object {
        private const val DEFAULT_TIMEOUT_MS = 250
        private const val DEFAULT_WAKE_MILLIVOLTS = 12_000
        private const val DEFAULT_IDLE_DELAY_MS = 5L
    }
}
