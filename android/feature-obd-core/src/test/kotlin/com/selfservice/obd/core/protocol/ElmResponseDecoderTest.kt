package com.selfservice.obd.core.protocol

import com.selfservice.obd.core.pid.PidCatalog
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class ElmResponseDecoderTest {

    @Test
    fun `parsePid decodes RPM payload`() {
        val definition = requireNotNull(PidCatalog.find("0x01", "0x0C"))
        val sample = ElmResponseDecoder.parsePid(definition, "41 0C 1A F8", timestampMillis = 1_000L)
        assertNotNull(sample)
        assertEquals(1_000L, sample.timestampMillis)
        assertEquals("1AF8", sample.rawHex)
        assertEquals(listOf(0x1A.toByte(), 0xF8.toByte()), sample.rawPayload.asList())
        assertEquals("rpm", sample.unit)
    assertEquals(1_726.0, sample.value ?: error("value expected"), 0.01)
    }

    @Test
    fun `parsePid tolerates compact frames`() {
        val definition = requireNotNull(PidCatalog.find("0x01", "0x0D"))
        val sample = ElmResponseDecoder.parsePid(definition, "410D2A", timestampMillis = 2_000L)
        assertNotNull(sample)
        assertEquals(0x2A.toByte(), sample.rawPayload.single())
    assertEquals(42.0, sample.value ?: error("value expected"))
    }

    @Test
    fun `parseDtc resolves catalog entries`() {
    val batch = ElmResponseDecoder.parseDtc("43 01 33 00 00 00", timestampMillis = 3_000L)
    assertNotNull(batch)
    assertEquals(3_000L, batch.timestampMillis)
    assertEquals(1, batch.entries.size)
    val entry = batch.entries.first()
    assertEquals("P0133", entry.code)
    }

    @Test
    fun `isClearConfirmation detects mode 04 ack`() {
        assertTrue(ElmResponseDecoder.isClearConfirmation("44 00 00 00"))
    }
}
