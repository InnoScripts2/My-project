package com.selfservice.kiosk.bluetooth.data

import com.selfservice.kiosk.diagnostics.elm.ElmResponseParser
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ElmResponseParserAvailabilityTest {

    @Test
    fun `parseDtcResponse exposed through diagnostics-core`() {
        val codes = ElmResponseParser.parseDtcResponse("43 01 33 01 54")

        assertEquals(listOf("P0133", "P0154"), codes)
    }

    @Test
    fun `normalizeResponse strips terminal markers`() {
        val normalized = ElmResponseParser.normalizeResponse("OK\n41 0C 1A 2B\n>\n")

        assertEquals("41 0C 1A 2B", normalized)
    }

    @Test
    fun `parseDtcResponse returns empty list for NO DATA`() {
        assertTrue(ElmResponseParser.parseDtcResponse("NO DATA").isEmpty())
    }
}
