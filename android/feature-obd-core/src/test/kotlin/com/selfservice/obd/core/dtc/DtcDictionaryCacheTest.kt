package com.selfservice.obd.core.dtc

import java.util.concurrent.atomic.AtomicInteger
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class DtcDictionaryCacheTest {
    @Test
    fun `lookup caches normalized code`() {
        val counter = AtomicInteger(0)
        val provider = DtcDefinitionProvider { code ->
            counter.incrementAndGet()
            ObdDtcDefinition(code = code, system = ObdDtcDefinition.System.POWERTRAIN, label = "Test", notes = null)
        }
        val cache = DtcDictionaryCache(provider, maxEntries = 4)

        val first = cache.lookup("p0300")
        val second = cache.lookup("0xP0300")

        assertNotNull(first)
        assertEquals(first, second)
        assertEquals(1, counter.get())
    }

    @Test
    fun `warm definitions bypass provider`() {
        val counter = AtomicInteger(0)
        val provider = DtcDefinitionProvider { _ ->
            counter.incrementAndGet()
            null
        }
        val definition = ObdDtcDefinition(code = "P0420", system = ObdDtcDefinition.System.POWERTRAIN, label = "Catalyst", notes = null)
        val cache = DtcDictionaryCache(provider)
        cache.warm(sequenceOf(definition))

        val resolved = cache.lookup("p0420")

        assertEquals(0, counter.get())
        assertEquals(definition, resolved)
    }

    @Test
    fun `evicted entry triggers provider again`() {
        val hits = mutableMapOf<String, Int>()
        val provider = DtcDefinitionProvider { code ->
            hits[code] = (hits[code] ?: 0) + 1
            ObdDtcDefinition(code = code, system = ObdDtcDefinition.System.NETWORK, label = code, notes = null)
        }
        val cache = DtcDictionaryCache(provider, maxEntries = 2)

        cache.lookup("U0001")
        cache.lookup("C1234")
        cache.lookup("B1000")
        cache.lookup("U0001")

        assertEquals(2, hits["U0001"])
        assertTrue("B1000" in cache.snapshot().keys)
    }

    @Test
    fun `refresh and invalidation manage revision`() {
        val cache = DtcDictionaryCache(DtcDefinitionProvider { _ -> null })
        val revision = cache.refresh(
            sequenceOf(ObdDtcDefinition(code = "P0001", system = ObdDtcDefinition.System.POWERTRAIN, label = "Fuel", notes = null)),
            source = "test",
            versionLabel = "v1"
        )

        assertEquals("test", revision.source)
        assertEquals(1, revision.entryCount)
        assertTrue(cache.lookup("P0001") != null)
        val invalidated = cache.invalidate("P0001")
        assertTrue(invalidated)
        val cleared = cache.invalidateAll("stale")
        assertEquals(0, cleared.entryCount)
        assertTrue(cache.lookup("P0001") == null)
    }
}
