package com.selfservice.obd.core.pid

import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNotSame
import kotlin.test.assertTrue
import org.junit.Test

class PidCatalogTest {
    @Test
    fun `list modes returns canonical hex strings`() {
        val modes = PidCatalog.listModes()
        assertTrue(modes.isNotEmpty())
        assertTrue(modes.all { it.startsWith("0x") })
    }

    @Test
    fun `find returns definition by mode and pid`() {
        val definition = PidCatalog.find("0x01", "0x05")
        assertNotNull(definition)
        assertEquals("Engine coolant temperature", definition.label)
        assertEquals("degC", definition.unit)
    }

    @Test
    fun `listPidsByMode sorts by pid number`() {
        val list = PidCatalog.listPidsByMode("0x01")
        assertTrue(list.size >= 3)
        val pids = list.take(3).map { it.pid }
        assertEquals(listOf("0x01", "0x04", "0x05"), pids)
    }

    @Test
    fun `definitions returns copies`() {
        val first = PidCatalog.definitions().first()
        val second = PidCatalog.definitions().first()
        assertNotSame(first, second)
    }
}
