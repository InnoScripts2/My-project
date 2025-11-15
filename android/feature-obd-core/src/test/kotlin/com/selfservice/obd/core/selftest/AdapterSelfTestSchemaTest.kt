package com.selfservice.obd.core.selftest

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class AdapterSelfTestSchemaTest {
    @Test
    fun `toRowPayload maps run into supabase shape`() {
        val run = AdapterSelfTestRun(
            executions = listOf(
                AdapterSelfTestExecution(
                    step = AdapterSelfTestStep(AdapterSelfTestId.FT01, timeoutMs = 3000, requiresVehicle = false, retries = 0),
                    outcome = AdapterSelfTestExecution.Outcome.SUCCESS,
                    attempts = 1,
                    durationMs = 120
                )
            )
        )

        val payload = AdapterSelfTestSchema.toRowPayload(
            run = run,
            sessionId = "session-123",
            adapterSerial = "adapter-456",
            startedAtIso = "2025-11-07T00:00:00Z",
            completedAtIso = "2025-11-07T00:00:05Z"
        )

        assertEquals("session-123", payload[AdapterSelfTestSchema.Columns.SESSION_ID])
        assertEquals("adapter-456", payload[AdapterSelfTestSchema.Columns.ADAPTER_SERIAL])
        assertEquals(true, payload[AdapterSelfTestSchema.Columns.SUCCEEDED])
        val executions = payload[AdapterSelfTestSchema.Columns.EXECUTIONS]
        assertTrue(executions is List<*>)
        assertEquals(1, executions.size)
    }
}
