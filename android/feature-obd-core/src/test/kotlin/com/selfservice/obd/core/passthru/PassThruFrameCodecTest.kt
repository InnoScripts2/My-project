package com.selfservice.obd.core.passthru

import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class PassThruFrameCodecTest {
    @Test
    fun `encode and decode round trip preserves message`() {
        val message = PassThruMessage(
            channelId = 3,
            protocolId = 0x01,
            timestampNanos = 1_500_000L,
            flags = 0x10,
            payload = byteArrayOf(0x01, 0x02, 0x03)
        )

        val encoded = PassThruFrameCodec.encode(message)
        val decoded = PassThruFrameCodec.decode(encoded)

        assertEquals(message.channelId, decoded.channelId)
        assertEquals(message.protocolId, decoded.protocolId)
        assertEquals(message.timestampNanos, decoded.timestampNanos)
        assertEquals(message.flags, decoded.flags)
        assertContentEquals(message.payload, decoded.payload)
    }

    @Test
    fun `decode fails on truncated payload`() {
        val message = PassThruMessage(
            channelId = 1,
            protocolId = 1,
            timestampNanos = 0L,
            flags = 0,
            payload = byteArrayOf(0x01)
        )
        val encoded = PassThruFrameCodec.encode(message)
        val truncated = encoded.copyOf(encoded.size - 1)

        assertFailsWith<IllegalArgumentException> { PassThruFrameCodec.decode(truncated) }
    }
}
