package com.selfservice.obd.core.dictionary

import com.selfservice.core.DispatchersProvider
import kotlin.jvm.Volatile
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext

/**
 * Coordinates access to [ObdDictionarySynchronizer] ensuring that only one synchronisation runs at
 * a time while publishing state transitions for observers.
 */
class DictionarySyncCoordinator(
        private val dispatchers: DispatchersProvider,
        private val executor: DictionarySyncExecutor,
        parentScope: CoroutineScope? = null,
        private val clock: () -> Long = { System.currentTimeMillis() }
) {

    constructor(
            synchronizer: ObdDictionarySynchronizer,
            dispatchers: DispatchersProvider,
            parentScope: CoroutineScope? = null,
            clock: () -> Long = { System.currentTimeMillis() }
    ) : this(
            dispatchers = dispatchers,
            executor = DictionarySyncExecutor { force -> synchronizer.sync(force) },
            parentScope = parentScope,
            clock = clock
    )

    private val ownsScope = parentScope == null
    private val scope: CoroutineScope =
            parentScope ?: CoroutineScope(SupervisorJob() + dispatchers.io)
    private val syncMutex = Mutex()
    private val stateFlow = MutableStateFlow<DictionarySyncState>(DictionarySyncState.Idle)
    @Volatile private var lastResult: DictionarySyncResult? = null

    fun state(): StateFlow<DictionarySyncState> = stateFlow.asStateFlow()

    fun lastResult(): DictionarySyncResult? = lastResult

    suspend fun triggerSync(force: Boolean = false): DictionarySyncResult {
        return withContext(dispatchers.io) {
            syncMutex.withLock {
                val startedAt = clock()
                stateFlow.value =
                        DictionarySyncState.Running(startedAtMillis = startedAt, force = force)
                val result =
                        try {
                            executor.run(force)
                        } catch (error: Throwable) {
                            val failure = DictionarySyncResult.Failed(error)
                            lastResult = failure
                            stateFlow.value = DictionarySyncState.Failed(error)
                            return@withLock failure
                        }
                lastResult = result
                stateFlow.value =
                        when (result) {
                            is DictionarySyncResult.Performed ->
                                    DictionarySyncState.Completed(result)
                            is DictionarySyncResult.Skipped -> DictionarySyncState.Skipped(result)
                            is DictionarySyncResult.Failed ->
                                    DictionarySyncState.Failed(result.error)
                        }
                result
            }
        }
    }

    fun schedulePeriodicSync(
            intervalMillis: Long,
            initialDelayMillis: Long = intervalMillis,
            force: Boolean = false
    ): Job {
        require(intervalMillis > 0) { "intervalMillis must be > 0" }
        require(initialDelayMillis >= 0) { "initialDelayMillis must be >= 0" }
        return scope.launch(dispatchers.io) {
            if (initialDelayMillis > 0) {
                delay(initialDelayMillis)
            }
            while (isActive) {
                triggerSync(force)
                delay(intervalMillis)
            }
        }
    }

    fun shutdown() {
        if (ownsScope) {
            scope.cancel()
        }
    }
}

fun interface DictionarySyncExecutor {
    suspend fun run(force: Boolean): DictionarySyncResult
}

sealed class DictionarySyncState {
    data object Idle : DictionarySyncState()
    data class Running(val startedAtMillis: Long, val force: Boolean) : DictionarySyncState()
    data class Completed(val result: DictionarySyncResult.Performed) : DictionarySyncState()
    data class Skipped(val result: DictionarySyncResult.Skipped) : DictionarySyncState()
    data class Failed(val error: Throwable) : DictionarySyncState()
}
