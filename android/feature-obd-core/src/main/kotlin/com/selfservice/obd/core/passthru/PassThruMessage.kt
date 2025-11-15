package com.selfservice.obd.core.passthru

class PassThruMessage(
    val channelId: Int,
    val protocolId: Int,
    val timestampNanos: Long,
    val flags: Int,
    payload: ByteArray
) {
    val payload: ByteArray = payload.copyOf()

    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is PassThruMessage) return false
        return channelId == other.channelId &&
            protocolId == other.protocolId &&
            timestampNanos == other.timestampNanos &&
            flags == other.flags &&
            payload.contentEquals(other.payload)
    }

    override fun hashCode(): Int {
        var result = channelId
        result = 31 * result + protocolId
        result = 31 * result + timestampNanos.hashCode()
        result = 31 * result + flags
        result = 31 * result + payload.contentHashCode()
        return result
    }
}
