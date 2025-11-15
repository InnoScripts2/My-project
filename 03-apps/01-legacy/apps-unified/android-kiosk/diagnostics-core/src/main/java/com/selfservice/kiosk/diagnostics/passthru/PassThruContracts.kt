package com.selfservice.kiosk.diagnostics.passthru

import kotlin.time.Duration

data class AdapterOptions(
    val protocol: String,
    val baudRate: Int,
    val additionalConfig: Map<String, Any?> = emptyMap()
)

data class ChannelRequest(
    val flags: Int,
    val protocolId: Int,
    val txHeader: Int,
    val rxHeader: Int
)

data class Frame(
    val payload: ByteArray,
    val timestampMillis: Long
)

data class AdapterHandle(val adapterId: String)

data class ChannelHandle(val channelId: Int)

data class SendResult(val framesSent: Int)

sealed class ReceiveResult {
    data class Frames(val frames: List<Frame>) : ReceiveResult()
    data object Empty : ReceiveResult()
}

data class ClearResult(val success: Boolean)

data class BatteryStatus(val voltage: Float)

data class ConfigOption(
    val key: Int,
    val value: Int
)

data class ClearStrategy(
    val payload: ByteArray,
    val timeout: Duration
)
