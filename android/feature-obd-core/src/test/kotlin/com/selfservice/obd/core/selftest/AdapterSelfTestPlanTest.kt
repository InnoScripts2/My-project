package com.selfservice.obd.core.selftest

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class AdapterSelfTestPlanTest {
    @Test
    fun `default plan lists FT01 through FT06 in order`() {
        val plan = AdapterSelfTestPlan.default()
        val ids = plan.steps.map { it.id }

        assertEquals(
            listOf(
                AdapterSelfTestId.FT01,
                AdapterSelfTestId.FT02,
                AdapterSelfTestId.FT03,
                AdapterSelfTestId.FT04,
                AdapterSelfTestId.FT05,
                AdapterSelfTestId.FT06
            ),
            ids
        )
    }

    @Test
    fun `log payload flattens steps for Supabase logging`() {
        val plan = AdapterSelfTestPlan.default()
        val payload = plan.toLogPayload("session-123", "adapter-456")

        assertEquals("session-123", payload["sessionId"])
        assertEquals("adapter-456", payload["adapterSerial"])
        @Suppress("UNCHECKED_CAST")
        val steps = payload["steps"] as List<Map<String, Any>>
        assertEquals(plan.steps.size, steps.size)
        assertTrue(steps.all { it.containsKey("id") && it.containsKey("timeoutMs") })
        assertFalse(steps.any { (it["description"] as String).isBlank() })
    }
}
