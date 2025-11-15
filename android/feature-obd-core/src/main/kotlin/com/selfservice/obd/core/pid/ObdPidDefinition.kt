package com.selfservice.obd.core.pid

/**
 * Describes a single OBD-II PID definition as consumed by the diagnostic stack.
 * Values are pre-normalised to the canonical hexadecimal form (0xNN).
 */
data class ObdPidDefinition(
    val mode: String,
    val pid: String,
    val label: String,
    val min: Double? = null,
    val max: Double? = null,
    val unit: String? = null,
    val conversion: String? = null,
    val formula: String? = null,
    val pollIntervalMs: Long? = null,
    val notes: String? = null
)
