package com.selfservice.obd.core.dtc

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue

class OfflineDtcDictionaryTest {
    @Test
    fun `dictionary finds seeded codes without hitting provider`() {
        val seed = sequenceOf(
            ObdDtcDefinition(
                code = "P0300",
                system = ObdDtcDefinition.System.POWERTRAIN,
                label = "Random or multiple cylinder misfire detected",
                notes = null
            )
        )
        val provider = DtcDefinitionProvider {
            throw AssertionError("Provider should not be invoked when cache is pre-warmed")
        }
        val dictionary = OfflineDtcDictionary(
            cache = DtcDictionaryCache(provider, maxEntries = 4),
            seedDefinitions = seed
        )

        val definition = dictionary.find("p0300")

        assertNotNull(definition)
        assertEquals("Random or multiple cylinder misfire detected", definition.label)
    }

    @Test
    fun `default dictionary exposes catalog systems`() {
        val dictionary = OfflineDtcDictionary()
        val systems = dictionary.listSystems()

        assertTrue(systems.isNotEmpty())
        val powertrain = dictionary.listBySystem(ObdDtcDefinition.System.POWERTRAIN)
        assertTrue(powertrain.any { it.code == "P0001" })
    }
}
