package com.selfservice.obd.core.selftest

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class AdapterSelfTestRunnerTest {
    @Test
    fun `runner executes steps sequentially and stops on failure`() {
        val plan = AdapterSelfTestPlan.default()
        val executed = mutableListOf<AdapterSelfTestStep>()
        val executor = AdapterSelfTestExecutor { step ->
            executed += step
            if (step.id == AdapterSelfTestId.FT03) {
                AdapterSelfTestExecution(
                    step = step,
                    outcome = AdapterSelfTestExecution.Outcome.FAILED,
                    attempts = step.retries + 1,
                    durationMs = step.timeoutMs,
                    message = "Loopback receive failed"
                )
            } else {
                AdapterSelfTestExecution(
                    step = step,
                    outcome = AdapterSelfTestExecution.Outcome.SUCCESS,
                    attempts = 1,
                    durationMs = step.timeoutMs / 2,
                    message = null
                )
            }
        }
        val runner = AdapterSelfTestRunner(executor)

        val run = runner.run(plan)

        assertEquals(listOf(AdapterSelfTestId.FT01, AdapterSelfTestId.FT02, AdapterSelfTestId.FT03), executed.map { it.id })
        assertFalse(run.succeeded)
        val payload = run.toLogPayload("session-abc", "adapter-xyz")
        @Suppress("UNCHECKED_CAST")
        val executions = payload["executions"] as List<Map<String, Any?>>
        assertEquals(3, executions.size)
        assertEquals("FAILED", executions.last()["outcome"])
    }

    @Test
    fun `runner reports success when all steps pass`() {
        val plan = AdapterSelfTestPlan.default()
        val executor = AdapterSelfTestExecutor { step ->
            AdapterSelfTestExecution(
                step = step,
                outcome = AdapterSelfTestExecution.Outcome.SUCCESS,
                attempts = 1,
                durationMs = step.timeoutMs / 3,
                message = "OK"
            )
        }
        val runner = AdapterSelfTestRunner(executor)

        val run = runner.run(plan)

        assertTrue(run.succeeded)
        assertEquals(plan.steps.size, run.executions.size)
    }
}
