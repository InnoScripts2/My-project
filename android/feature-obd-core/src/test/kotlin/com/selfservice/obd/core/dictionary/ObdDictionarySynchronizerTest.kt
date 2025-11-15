package com.selfservice.obd.core.dictionary

import com.selfservice.obd.core.dtc.ObdDtcDefinition
import com.selfservice.obd.core.pid.ObdPidDefinition
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertTrue
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ObdDictionarySynchronizerTest {

    @Test
    fun `sync skips when dictionaries are fresh`() = runTest {
        val manager = ObdDictionaryManager.default()
        val snapshot = DictionaryRevisionSnapshot(manager.pidRevision(), manager.dtcRevision())
        var invoked = false
        val synchronizer =
                ObdDictionarySynchronizer(
                        manager = manager,
                        provider =
                                DictionaryUpdateProvider {
                                    invoked = true
                                    null
                                },
                        policy =
                                DictionarySyncPolicy(
                                        minStalenessMillis = Long.MAX_VALUE,
                                        minAttemptIntervalMillis = 0L
                                )
                ) { snapshot.latestRefreshMillis }

        val result = synchronizer.sync()

        assertTrue(result is DictionarySyncResult.Skipped)
        assertEquals(
                DictionarySyncResult.SkipReason.NOT_STALE,
                (result as DictionarySyncResult.Skipped).reason
        )
        assertFalse(invoked)
    }

    @Test
    fun `sync invokes provider when stale and no updates`() = runTest {
        val manager = ObdDictionaryManager.default()
        var fetchCount = 0
        val synchronizer =
                ObdDictionarySynchronizer(
                        manager = manager,
                        provider =
                                DictionaryUpdateProvider {
                                    fetchCount += 1
                                    null
                                },
                        policy =
                                DictionarySyncPolicy(
                                        minStalenessMillis = 0L,
                                        minAttemptIntervalMillis = 0L
                                )
                ) { manager.pidRevision().refreshedAtMillis + 1L }

        val result = synchronizer.sync()

        assertTrue(result is DictionarySyncResult.Skipped)
        assertEquals(
                DictionarySyncResult.SkipReason.NO_UPDATES,
                (result as DictionarySyncResult.Skipped).reason
        )
        assertEquals(1, fetchCount)
    }

    @Test
    fun `sync applies updates from provider`() = runTest {
        val manager = ObdDictionaryManager.default()
        val pidDefinition =
                ObdPidDefinition(mode = "0x01", pid = "0x05", label = "Coolant Temp", unit = "C")
        val dtcDefinition =
                ObdDtcDefinition(
                        code = "P0001",
                        system = ObdDtcDefinition.System.POWERTRAIN,
                        label = "Fuel Volume Regulator Control Circuit/Open"
                )
        val synchronizer =
                ObdDictionarySynchronizer(
                        manager = manager,
                        provider =
                                DictionaryUpdateProvider {
                                    DictionaryUpdateBatch(
                                            pidDefinitions = listOf(pidDefinition),
                                            dtcDefinitions = listOf(dtcDefinition),
                                            source = "remote",
                                            pidVersionLabel = "2025-11-07",
                                            dtcVersionLabel = "2025-11-07"
                                    )
                                },
                        policy =
                                DictionarySyncPolicy(
                                        minStalenessMillis = 0L,
                                        minAttemptIntervalMillis = 0L
                                )
                ) { manager.pidRevision().refreshedAtMillis + 10_000L }

        val result = synchronizer.sync(force = true)

        val performed = assertIs<DictionarySyncResult.Performed>(result)
        assertEquals("remote", performed.pidRevision.source)
        assertEquals("remote", performed.dtcRevision.source)
        val resolvedPid = manager.lookupPid("0x01", "0x05")
        val resolvedDtc = manager.lookupDtc("P0001")
        assertEquals("Coolant Temp", resolvedPid?.label)
        assertEquals("Fuel Volume Regulator Control Circuit/Open", resolvedDtc?.label)
    }

    @Test
    fun `sync skips when attempted too recently`() = runTest {
        val manager = ObdDictionaryManager.default()
        var fetchCount = 0
        var clock = manager.pidRevision().refreshedAtMillis + 5_000L
        val synchronizer =
                ObdDictionarySynchronizer(
                        manager = manager,
                        provider =
                                DictionaryUpdateProvider {
                                    fetchCount += 1
                                    null
                                },
                        policy =
                                DictionarySyncPolicy(
                                        minStalenessMillis = 0L,
                                        minAttemptIntervalMillis = 60_000L
                                )
                ) { clock }

        synchronizer.sync(force = true)
        clock += 1_000L
        val result = synchronizer.sync()

        assertTrue(result is DictionarySyncResult.Skipped)
        assertEquals(
                DictionarySyncResult.SkipReason.TOO_RECENT,
                (result as DictionarySyncResult.Skipped).reason
        )
        assertEquals(1, fetchCount)
    }

    @Test
    fun `sync reports failure when provider throws`() = runTest {
        val manager = ObdDictionaryManager.default()
        val synchronizer =
                ObdDictionarySynchronizer(
                        manager = manager,
                        provider =
                                DictionaryUpdateProvider {
                                    throw IllegalStateException("network unavailable")
                                },
                        policy =
                                DictionarySyncPolicy(
                                        minStalenessMillis = 0L,
                                        minAttemptIntervalMillis = 0L
                                )
                ) { manager.pidRevision().refreshedAtMillis + 30_000L }

        val result = synchronizer.sync(force = true)

        val failed = assertIs<DictionarySyncResult.Failed>(result)
        assertEquals("network unavailable", failed.error.message)
    }
}
