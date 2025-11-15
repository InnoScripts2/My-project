package com.selfservice.obd.core.passthru

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class PassThruSmokeRunnerTest {
    @Test
    fun `runner executes plan sequentially`() {
        val bridge = FakePassThruBridge()
        val runner = PassThruSmokeRunner(bridge)
        val plan = PassThruSmokePlan.default()

        val result = runner.execute(plan) { byteArrayOf(0x02, 0x3E, 0x00) }

        assertTrue(result.succeeded)
        assertEquals(plan.commands, result.executed)
        val callNames = bridge.calls.map { it.name }
        assertEquals(
                listOf(
                        "openChannel",
                        "setReferenceVoltage",
                        "writeMessage",
                        "readMessage",
                        "closeChannel"
                ),
                callNames
        )
    }

    @Test
    fun `runner reports first failure`() {
        val bridge =
                FakePassThruBridge().apply {
                    writeShouldFail = IllegalStateException("write failed")
                }
        val runner = PassThruSmokeRunner(bridge)
        val plan = PassThruSmokePlan.default()

        val result = runner.execute(plan) { byteArrayOf(0x02, 0x3E, 0x00) }

        assertFalse(result.succeeded)
        val failure = result.failure
        assertEquals(plan.commands[2], failure?.command)
        assertEquals("writeMessage", bridge.calls[2].name)
        // close is requested on failure for safety
        assertEquals("closeChannel", bridge.calls.last().name)
    }
}
