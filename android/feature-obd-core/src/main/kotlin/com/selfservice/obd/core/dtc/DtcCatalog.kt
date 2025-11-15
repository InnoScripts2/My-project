package com.selfservice.obd.core.dtc

import java.util.Locale
import org.json.JSONArray
import org.json.JSONObject

/**
 * Provides access to the canonical list of diagnostic trouble codes ported
 * from the legacy TypeScript implementation.
 */
object DtcCatalog {
    private const val RESOURCE_PATH = "/com/selfservice/obd/core/dtc/dtc.json"

    private val definitions: List<ObdDtcDefinition> by lazy { loadDefinitions() }
    private val systemBuckets: Map<ObdDtcDefinition.System, List<ObdDtcDefinition>> by lazy {
        definitions.groupBy { it.system }.mapValues { (_, list) -> list.sortedBy { it.code } }
    }
    private val systemList: List<ObdDtcDefinition.System> by lazy {
        systemBuckets.keys.sortedBy { it.value }
    }

    fun definitions(): List<ObdDtcDefinition> = definitions.map { it.copy() }

    fun find(code: String): ObdDtcDefinition? {
        val normalized = normalizeCode(code)
        return definitions.firstOrNull { it.code == normalized }?.copy()
    }

    fun listSystems(): List<ObdDtcDefinition.System> = systemList.toList()

    fun listBySystem(system: ObdDtcDefinition.System): List<ObdDtcDefinition> =
        systemBuckets[system].orEmpty().map { it.copy() }

    private fun loadDefinitions(): List<ObdDtcDefinition> {
        val stream = requireNotNull(DtcCatalog::class.java.getResourceAsStream(RESOURCE_PATH)) {
            "Resource $RESOURCE_PATH is missing from classpath"
        }
        val json = stream.bufferedReader().use { it.readText() }
        return parse(JSONArray(json))
            .sortedBy { it.code }
    }

    private fun parse(array: JSONArray): List<ObdDtcDefinition> = buildList(array.length()) {
        for (index in 0 until array.length()) {
            val item = array.getJSONObject(index)
            add(item.toDefinition())
        }
    }

    private fun JSONObject.toDefinition(): ObdDtcDefinition {
        val code = normalizeCode(getString("code"))
        return ObdDtcDefinition(
            code = code,
            system = ObdDtcDefinition.System.fromValue(getString("system").lowercase(Locale.US)),
            label = getString("label"),
            notes = optStringOrNull("notes")
        )
    }

    private fun normalizeCode(code: String): String {
        val trimmed = code.trim().uppercase(Locale.US)
        val withoutPrefix = if (trimmed.startsWith("0X")) trimmed.substring(2) else trimmed
        require(withoutPrefix.length == 5) { "Invalid DTC code length for $code" }
        require(withoutPrefix[0] in "PCBHU") { "Invalid DTC prefix for $code" }
        require(withoutPrefix.substring(1).all { it.isDigit() }) { "Invalid DTC suffix for $code" }
        return withoutPrefix
    }

    private fun JSONObject.optStringOrNull(key: String): String? =
        if (has(key) && !isNull(key)) getString(key) else null
}
