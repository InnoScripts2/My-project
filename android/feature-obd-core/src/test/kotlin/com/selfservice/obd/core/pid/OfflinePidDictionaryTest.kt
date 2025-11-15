package com.selfservice.obd.core.pid

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class OfflinePidDictionaryTest {
    @Test
    fun `dictionary resolves definitions without provider access`() {
        val seed = sequenceOf(
            ObdPidDefinition(mode = "0x01", pid = "0x05", label = "Engine coolant temperature")
        )
        val provider = PidDefinitionProvider { _, _ ->
            throw AssertionError("Provider should not be called when cache is pre-warmed")
        }
        val dictionary = OfflinePidDictionary(
            cache = PidDictionaryCache(provider, maxEntries = 8),
            seedDefinitions = seed
        )

        val definition = dictionary.find("01", "05")

        assertNotNull(definition)
        assertEquals("Engine coolant temperature", definition.label)
    }

    @Test
    fun `default dictionary exposes catalog data`() {
        val dictionary = OfflinePidDictionary()
        val modes = dictionary.listModes()

        assertTrue(modes.contains("0x01"))
        val coolant = dictionary.find("0x01", "0x05")
        assertNotNull(coolant)
        assertEquals("Engine coolant temperature", coolant.label)
    }
}
