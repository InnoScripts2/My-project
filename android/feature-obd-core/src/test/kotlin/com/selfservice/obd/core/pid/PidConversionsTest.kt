package com.selfservice.obd.core.pid

import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNotSame
import kotlin.test.assertTrue
import org.junit.Test

class PidConversionsTest {

    @Test
    fun `definitions returns sorted immutable list`() {
        val conversions = PidConversions.definitions()
        assertTrue(conversions.isNotEmpty(), "conversions catalog must not be empty")

        val names = conversions.map { it.name }
        assertEquals(names.sorted(), names, "conversions must be sorted by name")

        val first = conversions.first()
        val second = PidConversions.definitions().first()
        assertNotSame(first, second, "definitions must be defensive copy")
    }

    @Test
    fun `find normalizes input and returns copy`() {
        val upper = PidConversions.find("PERCENT_FROM_A")
        assertNotNull(upper)

        val mixed = PidConversions.find("percent_from_a")
        assertNotNull(mixed)
        assertEquals(upper, mixed)

        val fresh = PidConversions.find("percent_from_a")
        assertNotNull(fresh)
        assertNotSame(upper, fresh, "lookup must provide defensive copies")

        val unknown = PidConversions.find("unknown")
        assertTrue(unknown == null)
    }

    @Test
    fun `listNames returns sorted copy`() {
        val names = PidConversions.listNames()
        assertTrue(names.isNotEmpty(), "expected non-empty conversion names")
        assertEquals(names.sorted(), names, "names should be sorted")

        val mutated = PidConversions.listNames().toMutableList()
        mutated.removeAt(mutated.lastIndex)
        assertEquals(names, PidConversions.listNames(), "names must be defensive copy")
    }
}