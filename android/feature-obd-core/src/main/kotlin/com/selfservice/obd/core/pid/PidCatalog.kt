package com.selfservice.obd.core.pid

import org.json.JSONArray
import org.json.JSONObject

/**
 * Provides access to the canonical list of OBD-II PID definitions backed by the JSON catalog
 * migrated from the legacy TypeScript implementation.
 */
object PidCatalog {
    private const val RESOURCE_PATH = "/com/selfservice/obd/core/pids/pids.json"

    private val definitions: List<ObdPidDefinition> by lazy { loadDefinitions() }

    fun definitions(): List<ObdPidDefinition> = definitions.map { it.copy() }

    fun find(mode: String, pid: String): ObdPidDefinition? {
        val normalizedMode = normalizeHex(mode)
        val normalizedPid = normalizeHex(pid)
        return definitions.firstOrNull { it.mode == normalizedMode && it.pid == normalizedPid }?.copy()
    }

    fun listModes(): List<String> = definitions
        .map { it.mode }
        .distinct()
        .sorted()

    fun listPidsByMode(mode: String): List<ObdPidDefinition> {
        val normalizedMode = normalizeHex(mode)
        return definitions
            .asSequence()
            .filter { it.mode == normalizedMode }
            .sortedBy { toPidNumber(it.pid) }
            .map { it.copy() }
            .toList()
    }

    private fun loadDefinitions(): List<ObdPidDefinition> {
        val stream = requireNotNull(PidCatalog::class.java.getResourceAsStream(RESOURCE_PATH)) {
            "Resource $RESOURCE_PATH is missing from classpath"
        }
        val json = stream.bufferedReader().use { it.readText() }
        return parse(JSONArray(json))
    }

    private fun parse(array: JSONArray): List<ObdPidDefinition> = buildList(array.length()) {
        for (index in 0 until array.length()) {
            val item = array.getJSONObject(index)
            add(item.toDefinition())
        }
    }

    private fun JSONObject.toDefinition(): ObdPidDefinition = ObdPidDefinition(
        mode = normalizeHex(getString("mode")),
        pid = normalizeHex(getString("pid")),
        label = getString("label"),
        min = optDoubleOrNull("min"),
        max = optDoubleOrNull("max"),
        unit = optStringOrNull("unit"),
        conversion = optStringOrNull("conversion"),
        formula = optStringOrNull("formula"),
        pollIntervalMs = optLongOrNull("pollIntervalMs"),
        notes = optStringOrNull("notes")
    )

    private fun normalizeHex(value: String): String {
        val trimmed = value.trim()
        val withoutPrefix = if (trimmed.startsWith("0x", ignoreCase = true)) {
            trimmed.substring(2)
        } else {
            trimmed
        }
        return "0x${withoutPrefix.uppercase()}"
    }

    private fun toPidNumber(pid: String): Int = pid.substring(2).toInt(radix = 16)

    private fun JSONObject.optStringOrNull(key: String): String? =
        if (has(key) && !isNull(key)) getString(key) else null

    private fun JSONObject.optDoubleOrNull(key: String): Double? =
        if (has(key) && !isNull(key)) getDouble(key) else null

    private fun JSONObject.optLongOrNull(key: String): Long? =
        if (has(key) && !isNull(key)) getLong(key) else null
}
