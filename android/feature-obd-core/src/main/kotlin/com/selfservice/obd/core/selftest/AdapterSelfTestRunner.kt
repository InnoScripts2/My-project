package com.selfservice.obd.core.selftest

fun interface AdapterSelfTestExecutor {
    fun execute(step: AdapterSelfTestStep): AdapterSelfTestExecution
}

data class AdapterSelfTestExecution(
    val step: AdapterSelfTestStep,
    val outcome: Outcome,
    val attempts: Int,
    val durationMs: Long,
    val message: String? = null
) {
    enum class Outcome { SUCCESS, FAILED }
}

data class AdapterSelfTestRun(
    val executions: List<AdapterSelfTestExecution>
) {
    val succeeded: Boolean get() = executions.all { it.outcome == AdapterSelfTestExecution.Outcome.SUCCESS }

    fun toLogPayload(sessionId: String, adapterSerial: String): Map<String, Any> {
        return mapOf(
            "sessionId" to sessionId,
            "adapterSerial" to adapterSerial,
            "executions" to executions.map { execution ->
                mapOf(
                    "step" to execution.step.id.code,
                    "outcome" to execution.outcome.name,
                    "attempts" to execution.attempts,
                    "durationMs" to execution.durationMs,
                    "message" to execution.message
                )
            }
        )
    }
}

class AdapterSelfTestRunner(
    private val executor: AdapterSelfTestExecutor
) {
    fun run(plan: AdapterSelfTestPlan): AdapterSelfTestRun {
        val results = mutableListOf<AdapterSelfTestExecution>()
        for (step in plan.steps) {
            val execution = executor.execute(step)
            results += execution
            if (execution.outcome == AdapterSelfTestExecution.Outcome.FAILED) {
                break
            }
        }
        return AdapterSelfTestRun(results)
    }
}
