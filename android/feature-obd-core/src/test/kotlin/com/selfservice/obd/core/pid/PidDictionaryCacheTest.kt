package com.selfservice.obd.core.pid

import java.util.concurrent.atomic.AtomicInteger
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class PidDictionaryCacheTest {
    @Test
    fun `lookup caches definitions after first miss`() {
        val counter = AtomicInteger(0)
        val provider = PidDefinitionProvider { mode, pid ->
            counter.incrementAndGet()
            ObdPidDefinition(mode = mode, pid = pid, label = "Test PID")
        }
        val cache = PidDictionaryCache(provider, maxEntries = 4)

        val first = cache.lookup("0x01", "0x0C")
        val second = cache.lookup("01", "0c")

        assertNotNull(first)
        assertEquals(first, second)
        assertEquals(1, counter.get())
    }

    @Test
    fun `lookup respects warm definitions without calling provider`() {
        val counter = AtomicInteger(0)
        val provider = PidDefinitionProvider { _, _ ->
            counter.incrementAndGet()
            null
        }
        val definition = ObdPidDefinition(mode = "0x09", pid = "0x02", label = "VIN")
        val cache = PidDictionaryCache(provider, maxEntries = 2)
        cache.warm(sequenceOf(definition))

        val resolved = cache.lookup("09", "02")

        assertEquals(0, counter.get())
        assertEquals(definition, resolved)
    }

    @Test
    fun `cache evicts least recently used entry when capacity exceeded`() {
        val hits = mutableMapOf<String, Int>()
        val provider = PidDefinitionProvider { mode, pid ->
            val key = "${mode}:${pid}"
            hits[key] = (hits[key] ?: 0) + 1
            ObdPidDefinition(mode, pid, label = key)
        }
        val cache = PidDictionaryCache(provider, maxEntries = 2)

        cache.lookup("01", "00")
        cache.lookup("01", "05")
        cache.lookup("01", "0A")
        cache.lookup("01", "00")

        assertEquals(2, hits["0x01:0x00"])
        assertEquals(1, hits["0x01:0x05"])
        assertEquals(1, hits["0x01:0x0A"])
    }

    @Test
    fun `refresh replaces cache and tracks revision`() {
        val cache = PidDictionaryCache(PidDefinitionProvider { _, _ -> null })
        val revision = cache.refresh(sequenceOf(ObdPidDefinition("0x01", "0x0C", "RPM")), source = "test", versionLabel = "v1")

        assertEquals("test", revision.source)
        assertEquals("v1", revision.versionLabel)
        assertEquals(1, revision.entryCount)
        assertTrue(cache.lookup("01", "0C") != null)
        val invalidated = cache.invalidate("01", "0C")
        assertTrue(invalidated)
        val clearedRevision = cache.invalidateAll("ttl-expired")
        assertEquals(0, clearedRevision.entryCount)
        assertTrue(cache.lookup("01", "0C") == null)
    }
}
