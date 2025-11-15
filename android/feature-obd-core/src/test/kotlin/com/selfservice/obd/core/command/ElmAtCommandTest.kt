package com.selfservice.obd.core.command

import org.junit.Assert.assertEquals
import org.junit.Test

class ElmAtCommandTest {
    @Test
    fun `reset encodes to ATZ`() {
        assertEquals("ATZ", ElmAtCommand.Reset.encode())
    }

    @Test
    fun `adaptive timing guards range`() {
        val command = ElmAt.adaptiveTiming(2)
        assertEquals("ATAT2", command.encode())
    }

    @Test(expected = IllegalArgumentException::class)
    fun `adaptive timing rejects invalid mode`() {
        ElmAt.adaptiveTiming(3)
    }

    @Test
    fun `set protocol normalizes uppercase`() {
        val command = ElmAt.setProtocol("0A")
        assertEquals("ATSP0A", command.encode())
    }

    @Test
    fun `clear CAN filter uses plain command`() {
        assertEquals("ATCRA", ElmAt.clearCanFilter.encode())
    }
}
