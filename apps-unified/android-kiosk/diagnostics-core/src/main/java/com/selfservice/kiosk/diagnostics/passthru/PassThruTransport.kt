package com.selfservice.kiosk.diagnostics.passthru

interface PassThruTransport {
    suspend fun openAdapter(adapterId: String, options: AdapterOptions): AdapterHandle
    suspend fun closeAdapter(handle: AdapterHandle)
    suspend fun connectChannel(handle: AdapterHandle, request: ChannelRequest): ChannelHandle
    suspend fun disconnectChannel(channel: ChannelHandle)
    suspend fun write(channel: ChannelHandle, frames: List<Frame>): Int
    suspend fun read(channel: ChannelHandle, maxFrames: Int, timeoutMillis: Long): List<Frame>
    suspend fun setConfig(channel: ChannelHandle, configs: List<ConfigOption>)
    suspend fun readBatteryState(): BatteryStatus
}
