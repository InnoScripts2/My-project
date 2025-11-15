package com.selfservice.obd.core.pid

/**
 * Describes a reusable conversion formula for translating raw PID bytes into
 * engineering values. A conversion is identified by its symbolic name and
 * optionally carries unit metadata.
 */
data class PidConversionDefinition(
    val name: String,
    val formula: String,
    val unit: String? = null,
    val notes: String? = null
)