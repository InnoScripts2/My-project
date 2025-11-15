package com.selfservice.obd.core.selftest

enum class AdapterSelfTestId(val code: String, val description: String) {
    FT01("FT-01", "Power rail sanity check"),
    FT02("FT-02", "CAN loopback transmit"),
    FT03("FT-03", "CAN loopback receive"),
    FT04("FT-04", "ISO-TP multi-frame exchange"),
    FT05("FT-05", "DTC read snapshot"),
    FT06("FT-06", "DTC clear confirmation");
}

data class AdapterSelfTestStep(
    val id: AdapterSelfTestId,
    val timeoutMs: Long,
    val requiresVehicle: Boolean,
    val retries: Int
)
