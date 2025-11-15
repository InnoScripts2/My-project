package com.selfservice.obd.core.pid

import java.util.Locale
import org.json.JSONArray
import org.json.JSONObject

/**
 * Provides access to the legacy conversion formulas for translating raw PID
 * values. Definitions are loaded lazily from the JSON catalog migrated from
 * the TypeScript implementation.
 */
object PidConversions {
    private const val RESOURCE_PATH = "/com/selfservice/obd/core/pids/conversions.json"

    private val definitions: List<PidConversionDefinition> by lazy { loadDefinitions() }
    private val nameIndex: Map<String, PidConversionDefinition> by lazy {
        definitions.associateBy { it.name }
    }

    fun definitions(): List<PidConversionDefinition> = definitions.map { it.copy() }

    fun listNames(): List<String> = definitions.map { it.name }.sorted()

    fun find(name: String): PidConversionDefinition? {
        val normalized = normalizeName(name)
        return nameIndex[normalized]?.copy()
    }

    private fun loadDefinitions(): List<PidConversionDefinition> {
        val stream = requireNotNull(PidConversions::class.java.getResourceAsStream(RESOURCE_PATH)) {
            "Resource $RESOURCE_PATH is missing from classpath"
        }
        val json = stream.bufferedReader().use { it.readText() }
        return parse(JSONArray(json))
            .sortedBy { it.name }
    }

    private fun parse(array: JSONArray): List<PidConversionDefinition> = buildList(array.length()) {
        for (index in 0 until array.length()) {
            val item = array.getJSONObject(index)
            add(item.toDefinition())
        }
    }

    private fun JSONObject.toDefinition(): PidConversionDefinition {
        val name = normalizeName(getString("name"))
        return PidConversionDefinition(
            name = name,
            formula = getString("formula").trim(),
            unit = optStringOrNull("unit"),
            notes = optStringOrNull("notes")
        )
    }

    private fun normalizeName(raw: String): String = raw.trim().uppercase(Locale.US)

    private fun JSONObject.optStringOrNull(key: String): String? =
        if (has(key) && !isNull(key)) getString(key) else null
}