package com.selfservice.obd.core.protocol

import com.selfservice.obd.core.command.ElmAt
import java.nio.charset.StandardCharsets
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals

class ElmCommandCodecTest {

    @Test
    fun `frameFor AT command appends carriage return`() {
        val frame = ElmCommandCodec.frameFor(ElmAt.reset, timestampMillis = 123L)
        assertEquals(123L, frame.timestampMs)
        assertContentEquals("ATZ\r".toByteArray(StandardCharsets.US_ASCII), frame.payload)
    }

    @Test
    fun `frameForRaw uppercases payload`() {
        val frame = ElmCommandCodec.frameForRaw("01ac", timestampMillis = 42L)
        assertEquals(42L, frame.timestampMs)
        assertContentEquals("01AC\r".toByteArray(StandardCharsets.US_ASCII), frame.payload)
    }
}
