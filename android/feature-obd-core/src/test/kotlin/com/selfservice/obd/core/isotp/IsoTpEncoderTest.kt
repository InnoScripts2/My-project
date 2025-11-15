package com.selfservice.obd.core.isotp

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class IsoTpEncoderTest {
    @Test
    fun `encodes payload shorter than threshold into single frame`() {
        val payload = byteArrayOf(0x01, 0x02, 0x03)
    val frames = IsoTpEncoder.encode(payload)
    assertEquals(1, frames.size)
    val single = frames.first() as IsoTpFrame.Single
    assertTrue(payload.contentEquals(single.body))
    val canPayload = single.toCanPayload()
    assertEquals(payload.size, (canPayload[0].toInt() and 0x0F))
    }

    @Test
    fun `encodes payload longer than threshold into sequence`() {
        val payload = ByteArray(10) { it.toByte() }
        val frames = IsoTpEncoder.encode(payload)
        assertTrue(frames.first() is IsoTpFrame.First)
        assertTrue(frames.drop(1).all { it is IsoTpFrame.Consecutive })
    }
}
