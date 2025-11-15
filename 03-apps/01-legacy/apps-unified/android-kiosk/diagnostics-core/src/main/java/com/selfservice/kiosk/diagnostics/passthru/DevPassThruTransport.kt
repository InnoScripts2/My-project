package com.selfservice.kiosk.diagnostics.passthru

import kotlinx.coroutines.delay
import java.util.concurrent.atomic.AtomicInteger

class DevPassThruTransport : PassThruTransport {
    private val channelCounter = AtomicInteger(1)

    override suspend fun openAdapter(adapterId: String, options: AdapterOptions): AdapterHandle {
        delay(50)
        return AdapterHandle(adapterId)
    }

    override suspend fun closeAdapter(handle: AdapterHandle) {
        delay(10)
    }

    override suspend fun connectChannel(handle: AdapterHandle, request: ChannelRequest): ChannelHandle {
        delay(25)
        return ChannelHandle(channelCounter.getAndIncrement())
    }

    override suspend fun disconnectChannel(channel: ChannelHandle) {
        delay(10)
    }

    override suspend fun write(channel: ChannelHandle, frames: List<Frame>): Int {
        delay(10)
        return frames.size
    }

    override suspend fun read(channel: ChannelHandle, maxFrames: Int, timeoutMillis: Long): List<Frame> {
        delay(timeoutMillis.coerceAtMost(100))
        return emptyList()
    }

    override suspend fun setConfig(channel: ChannelHandle, configs: List<ConfigOption>) {
        delay(5)
    }

    override suspend fun readBatteryState(): BatteryStatus {
        delay(15)
        return BatteryStatus(voltage = 12.3f)
    }
}
