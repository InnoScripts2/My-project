package com.selfservice.obd.core.dictionary

import com.selfservice.obd.core.dtc.DtcDefinitionProvider
import com.selfservice.obd.core.dtc.DtcDictionaryCache
import com.selfservice.obd.core.dtc.ObdDtcDefinition
import com.selfservice.obd.core.pid.ObdPidDefinition
import com.selfservice.obd.core.pid.PidDefinitionProvider
import com.selfservice.obd.core.pid.PidDictionaryCache
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ObdDictionaryManagerTest {

    @Test
    fun `default manager resolves embedded dictionaries`() {
        val manager = ObdDictionaryManager.default()

        assertTrue(manager.pidRevision().entryCount > 0)
        assertTrue(manager.dtcRevision().entryCount > 0)

        assertTrue(com.selfservice.obd.core.pid.PidCatalog.definitions().isNotEmpty())
        assertTrue(com.selfservice.obd.core.dtc.DtcCatalog.definitions().isNotEmpty())
        assertNotNull(com.selfservice.obd.core.pid.PidCatalog.find("0x01", "0x0C"))
        assertNotNull(com.selfservice.obd.core.dtc.DtcCatalog.find("P0100"))

        val rpm = manager.lookupPid("0x01", "0x0C")
        val dtc = manager.lookupDtc("P0100")

        assertNotNull(rpm)
        assertEquals("0x01", rpm.mode)
        assertNotNull(dtc)
        assertEquals("P0100", dtc.code)
    }

    @Test
    fun `refresh and invalidate propagate revisions`() {
        val pidCache = PidDictionaryCache(PidDefinitionProvider { _, _ -> null }, maxEntries = 8)
        val dtcCache = DtcDictionaryCache(DtcDefinitionProvider { _ -> null }, maxEntries = 8)
        val initialPid = ObdPidDefinition(mode = "0x01", pid = "0x00", label = "Supported PIDs")
        val initialDtc =
                ObdDtcDefinition(
                        code = "P0001",
                        system = ObdDtcDefinition.System.POWERTRAIN,
                        label = "Fuel",
                        notes = null
                )

        val manager =
                ObdDictionaryManager(
                        pidCache = pidCache,
                        dtcCache = dtcCache,
                        pidSeed = sequenceOf(initialPid),
                        dtcSeed = sequenceOf(initialDtc),
                        defaultSource = "test"
                )

        assertNotNull(manager.lookupPid("0x01", "0x00"))
        assertNotNull(manager.lookupDtc("P0001"))

        val updatedPid = initialPid.copy(label = "Updated")
        val pidRevision =
                manager.refreshPid(
                        sequenceOf(updatedPid),
                        source = "remote",
                        versionLabel = "2025-11-07"
                )
        assertEquals("remote", pidRevision.source)
        assertEquals("2025-11-07", pidRevision.versionLabel)
        assertEquals("Updated", manager.lookupPid("01", "00")?.label)

        val dtcRevision = manager.invalidateAllDtc("ttl")
        assertEquals(0, dtcRevision.entryCount)
        assertNull(manager.lookupDtc("P0001"))

        val pidRemoved = manager.invalidatePid("0x01", "0x00")
        assertTrue(pidRemoved)
        assertNull(manager.lookupPid("0x01", "0x00"))
    }
}
