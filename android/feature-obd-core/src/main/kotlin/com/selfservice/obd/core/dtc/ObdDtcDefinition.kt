package com.selfservice.obd.core.dtc

/**
 * Describes a canonical diagnostic trouble code entry. Values are normalised
 * to uppercase code identifiers and immutable when exposed to callers.
 */
data class ObdDtcDefinition(
    val code: String,
    val system: System,
    val label: String,
    val notes: String? = null
) {
    enum class System(val value: String) {
        POWERTRAIN("powertrain"),
        CHASSIS("chassis"),
        BODY("body"),
        NETWORK("network");

        companion object {
            fun fromValue(raw: String): System {
                val normalized = raw.trim().lowercase()
                return entries.firstOrNull { it.value == normalized }
                    ?: error("Unknown DTC system $raw")
            }
        }
    }
}
