package com.selfservice.obd.core.selftest

class AdapterSelfTestPlan private constructor(
    val steps: List<AdapterSelfTestStep>
) {
    fun toLogPayload(sessionId: String, adapterSerial: String): Map<String, Any> {
        return mapOf(
            "sessionId" to sessionId,
            "adapterSerial" to adapterSerial,
            "steps" to steps.map { step ->
                mapOf(
                    "id" to step.id.code,
                    "description" to step.id.description,
                    "timeoutMs" to step.timeoutMs,
                    "requiresVehicle" to step.requiresVehicle,
                    "retries" to step.retries
                )
            }
        )
    }

    companion object {
        fun default(): AdapterSelfTestPlan {
            val steps = listOf(
                AdapterSelfTestStep(AdapterSelfTestId.FT01, timeoutMs = 3_000, requiresVehicle = false, retries = 0),
                AdapterSelfTestStep(AdapterSelfTestId.FT02, timeoutMs = 5_000, requiresVehicle = false, retries = 1),
                AdapterSelfTestStep(AdapterSelfTestId.FT03, timeoutMs = 5_000, requiresVehicle = false, retries = 1),
                AdapterSelfTestStep(AdapterSelfTestId.FT04, timeoutMs = 7_000, requiresVehicle = true, retries = 1),
                AdapterSelfTestStep(AdapterSelfTestId.FT05, timeoutMs = 4_000, requiresVehicle = true, retries = 0),
                AdapterSelfTestStep(AdapterSelfTestId.FT06, timeoutMs = 4_000, requiresVehicle = true, retries = 0)
            )
            return AdapterSelfTestPlan(steps)
        }
    }
}
