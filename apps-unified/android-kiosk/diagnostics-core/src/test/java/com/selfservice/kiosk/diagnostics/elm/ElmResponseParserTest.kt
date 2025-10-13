package com.selfservice.kiosk.diagnostics.elm

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class ElmResponseParserTest {

    @Test
    fun parseSingleDtc() {
        val codes = ElmResponseParser.parseDtcResponse("43 01 33")

        assertEquals(1, codes.size)
        assertEquals("P0133", codes.first())
    }

    @Test
    fun parseMultipleDtcs() {
        val codes = ElmResponseParser.parseDtcResponse("43 01 33 01 54 02 17")

        assertEquals(listOf("P0133", "P0154", "P0217"), codes)
    }

    @Test
    fun parseDifferentPrefixes() {
        val codes = ElmResponseParser.parseDtcResponse("43 01 33 62 81")

        assertEquals(listOf("P0133", "C2281"), codes)
    }

    @Test
    fun parseWithLineBreaks() {
        val codes = ElmResponseParser.parseDtcResponse("43 01 33\n43 01 54")

        assertEquals(listOf("P0133", "P0154"), codes)
    }

    @Test
    fun ignoreEmptyPayload() {
        assertTrue(ElmResponseParser.parseDtcResponse("").isEmpty())
        assertTrue(ElmResponseParser.parseDtcResponse("NO DATA").isEmpty())
    }

    @Test
    fun normalizeResponseRemovesOkAndPrompts() {
        val raw = "OK\n41 0C 1A 2B\nOK\n>"
        val normalized = ElmResponseParser.normalizeResponse(raw)

        assertEquals("41 0C 1A 2B", normalized)
    }

    @Test
    fun normalizeResponseKeepsSearchingLines() {
        val raw = "SEARCHING...\n41 0C 1A 2B\n>"
        val normalized = ElmResponseParser.normalizeResponse(raw)

        assertEquals("SEARCHING...\n41 0C 1A 2B", normalized)
    }

    @Test
    fun normalizeResponseCompactsMultiline() {
        val raw = "43 01 33\n43 01 54\nOK\n>"
        val normalized = ElmResponseParser.normalizeResponse(raw)

        assertEquals("43 01 33\n43 01 54", normalized)
    }
}
