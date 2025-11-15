package com.selfservice.obd.core.dictionary

import com.selfservice.core.DispatchersProvider
import com.selfservice.obd.core.dtc.DtcDictionaryRevision
import com.selfservice.obd.core.pid.PidDictionaryRevision
import kotlin.math.max
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.async
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.take
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest

private class TestDispatchersProvider(private val dispatcher: CoroutineDispatcher) :
        DispatchersProvider {
    override val io: CoroutineDispatcher = dispatcher
    override val computation: CoroutineDispatcher = dispatcher
    override val main: CoroutineDispatcher = dispatcher
}

@OptIn(ExperimentalCoroutinesApi::class)
class DictionarySyncCoordinatorTest {

    private var ownedScopes = mutableListOf<CoroutineScope>()

    @AfterTest
    fun tearDown() {
        ownedScopes.forEach { it.cancel() }
        ownedScopes.clear()
    }

    @Test
    fun triggerSyncEmitsStateAndCachesResult() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val dispatchers = TestDispatchersProvider(dispatcher)
        val performed =
                DictionarySyncResult.Performed(
                        pidRevision =
                                PidDictionaryRevision(
                                        "src",
                                        "v1",
                                        refreshedAtMillis = 1_000L,
                                        entryCount = 10
                                ),
                        dtcRevision =
                                DtcDictionaryRevision(
                                        "src",
                                        "v1",
                                        refreshedAtMillis = 1_000L,
                                        entryCount = 5
                                ),
                        attemptedAtMillis = 2_000L
                )
        var callCount = 0
        val coordinator =
                DictionarySyncCoordinator(
                        dispatchers = dispatchers,
                        executor =
                                DictionarySyncExecutor {
                                    callCount += 1
                                    performed
                                },
                        parentScope = this,
                        clock = { 123L }
                )

        val states = mutableListOf<DictionarySyncState>()
        val collectJob = launch { coordinator.state().take(3).toList(states) }

        val result = coordinator.triggerSync()

        advanceUntilIdle()
        collectJob.cancel()

        assertEquals(performed, result)
        assertEquals(1, callCount)
        assertEquals(
                listOf(
                        DictionarySyncState.Idle,
                        DictionarySyncState.Running(123L, false),
                        DictionarySyncState.Completed(performed)
                ),
                states
        )
        val last = coordinator.lastResult()
        assertEquals(performed, last)
    }

    @Test
    fun triggerSyncSerialisesConcurrentRequests() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val dispatchers = TestDispatchersProvider(dispatcher)
        var concurrent = 0
        var maxConcurrent = 0
        var totalCalls = 0
        val coordinator =
                DictionarySyncCoordinator(
                        dispatchers = dispatchers,
                        executor =
                                DictionarySyncExecutor {
                                    totalCalls += 1
                                    concurrent += 1
                                    maxConcurrent = max(maxConcurrent, concurrent)
                                    delay(50)
                                    concurrent -= 1
                                    DictionarySyncResult.Skipped(
                                            DictionarySyncResult.SkipReason.NO_UPDATES
                                    )
                                },
                        parentScope = this
                )

        val jobs = List(3) { async { coordinator.triggerSync() } }
        jobs.forEach { it.await() }

        assertEquals(3, totalCalls)
        assertEquals(1, maxConcurrent)
        assertTrue(coordinator.lastResult() is DictionarySyncResult.Skipped)
    }

    @Test
    fun schedulePeriodicSyncRepeatsAtInterval() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val dispatchers = TestDispatchersProvider(dispatcher)
        val scope = CoroutineScope(SupervisorJob() + dispatcher).also { ownedScopes += it }
        var callCount = 0
        val coordinator =
                DictionarySyncCoordinator(
                        dispatchers = dispatchers,
                        executor =
                                DictionarySyncExecutor {
                                    callCount += 1
                                    DictionarySyncResult.Skipped(
                                            DictionarySyncResult.SkipReason.NO_UPDATES
                                    )
                                },
                        parentScope = scope
                )

        val job: Job =
                coordinator.schedulePeriodicSync(intervalMillis = 1_000L, initialDelayMillis = 0L)

        advanceUntilIdle()
        assertEquals(1, callCount)

        advanceTimeBy(1_000L)
        advanceUntilIdle()
        assertEquals(2, callCount)

        job.cancel()
        coordinator.shutdown()
    }
}
