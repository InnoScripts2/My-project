package com.selfservice.obd.core.passthru

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class PassThruSmokePlanTest {
    @Test
    fun `default plan covers open to close sequence`() {
        val plan = PassThruSmokePlan.default()
        assertEquals(0x01, plan.channelConfig.protocolId)
        assertEquals(500_000, plan.channelConfig.baudRate)
        val types = plan.commands.map { it.type }
        assertEquals(
            listOf(
                PassThruSmokeCommandType.OPEN_CHANNEL,
                PassThruSmokeCommandType.SET_VOLTAGE,
                PassThruSmokeCommandType.WRITE_MESSAGE,
                PassThruSmokeCommandType.READ_MESSAGE,
                PassThruSmokeCommandType.CLOSE_CHANNEL
            ),
            types
        )
        assertTrue(plan.commands.all { it.description.isNotBlank() })
    }
}
