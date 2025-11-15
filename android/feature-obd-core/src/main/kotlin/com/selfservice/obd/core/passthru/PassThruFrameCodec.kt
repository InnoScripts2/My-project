package com.selfservice.obd.core.passthru

import java.nio.ByteBuffer
import java.nio.ByteOrder

object PassThruFrameCodec {
    private const val HEADER_SIZE = Int.SIZE_BYTES * 3 + Long.SIZE_BYTES + Int.SIZE_BYTES

    fun encode(message: PassThruMessage): ByteArray {
        val payload = message.payload
        val buffer = ByteBuffer.allocate(HEADER_SIZE + payload.size).order(ByteOrder.BIG_ENDIAN)
        buffer.putInt(message.channelId)
        buffer.putInt(message.protocolId)
        buffer.putLong(message.timestampNanos)
        buffer.putInt(message.flags)
        buffer.putInt(payload.size)
        buffer.put(payload)
        return buffer.array()
    }

    fun decode(bytes: ByteArray): PassThruMessage {
        require(bytes.size >= HEADER_SIZE) { "Frame too short" }
        val buffer = ByteBuffer.wrap(bytes).order(ByteOrder.BIG_ENDIAN)
        val channelId = buffer.getInt()
        val protocolId = buffer.getInt()
        val timestamp = buffer.getLong()
        val flags = buffer.getInt()
        val length = buffer.getInt()
        require(length >= 0) { "Negative payload length" }
        require(buffer.remaining() >= length) { "Incomplete payload" }
        val payload = ByteArray(length)
        buffer.get(payload)
        return PassThruMessage(
            channelId = channelId,
            protocolId = protocolId,
            timestampNanos = timestamp,
            flags = flags,
            payload = payload
        )
    }
}
