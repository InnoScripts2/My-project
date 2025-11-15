package com.selfservice.obd.core.session

import com.selfservice.obd.core.connection.BleDevice
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ObdSessionStateTest {

    @Test
    fun `connecting state retains device info`() {
        val device = BleDevice(address = "AA:BB:CC:DD:EE:FF", name = "Eldiag", rssi = -45)
        val state = ObdSessionState.Connecting(device)

        assertEquals(device, state.device)
    }

    @Test
    fun `failed state exposes throwable`() {
        val failure = IllegalStateException("transport down")
        val state = ObdSessionState.Failed(failure)

        assertTrue(state.reason === failure)
    }

    @Test
    fun `diagnostics state keeps device reference`() {
        val device = BleDevice(address = "11:22:33:44:55:66", name = "ScanTool", rssi = -40)
        val state = ObdSessionState.Diagnostics(device)

        assertEquals(device, state.device)
    }
}
