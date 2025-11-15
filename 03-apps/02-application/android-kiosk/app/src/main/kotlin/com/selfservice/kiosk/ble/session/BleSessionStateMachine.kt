package com.selfservice.kiosk.ble.session

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * Controls BLE session lifecycle phases and enforces watchdog timeouts.
 */
class BleSessionStateMachine(
    private val scope: CoroutineScope,
    private val timeouts: SessionTimeouts = SessionTimeouts(),
    private val observer: SessionObserver? = null,
    private val timeProvider: () -> Long = { System.currentTimeMillis() }
) {

    private val mutex = Mutex()
    private val _state = MutableStateFlow(
        StateSnapshot(
            phase = Phase.IDLE,
            attempt = 0,
            cause = null,
            sessionStartedAtMillis = 0L,
            enteredAtMillis = timeProvider()
        )
    )
    private val watchdogJobs = mutableMapOf<WatchdogKey, Job>()

    val state: StateFlow<StateSnapshot> = _state

    suspend fun startSession(attempt: Int = 0) {
        val payload = mutex.withLock {
            ensureIdleLocked()
            val now = timeProvider()
            val snapshot = StateSnapshot(
                phase = Phase.CONNECTING,
                attempt = attempt,
                cause = null,
                sessionStartedAtMillis = now,
                enteredAtMillis = now
            )
            updateStateLocked(snapshot)
        }
        payload?.let { observer?.onStateChanged(it.previous, it.current, it.durationMillis) }
    }

    suspend fun onTransportReady() {
        transitionTo(Phase.HANDSHAKE)
    }

    suspend fun onHandshakeCompleted() {
        mutex.withLock { cancelWatchdogLocked(WatchdogKey.HANDSHAKE) }
        transitionTo(Phase.READY)
    }

    suspend fun beginDiagnostics() {
        transitionTo(Phase.DIAGNOSTICS)
    }

    suspend fun recordDiagnosticsHeartbeat() {
        mutex.withLock {
            if (_state.value.phase != Phase.DIAGNOSTICS) return
            scheduleWatchdogLocked(
                key = WatchdogKey.INACTIVITY,
                timeoutMillis = timeouts.inactivityTimeoutMillis,
                failReason = "diagnostics_inactivity"
            )
        }
    }

    suspend fun completeSuccessfully() {
        transitionTo(Phase.COMPLETED)
    }

    suspend fun fail(reason: String) {
        transitionTo(Phase.FAILED, cause = reason)
    }

    suspend fun reset() {
        val payload = mutex.withLock {
            cancelAllWatchdogsLocked()
            val snapshot = StateSnapshot(
                phase = Phase.IDLE,
                attempt = 0,
                cause = null,
                sessionStartedAtMillis = 0L,
                enteredAtMillis = timeProvider()
            )
            updateStateLocked(snapshot)
        }
        payload?.let { observer?.onStateChanged(it.previous, it.current, it.durationMillis) }
    }

    private suspend fun transitionTo(
        phase: Phase,
        cause: String? = null
    ) {
        val result = mutex.withLock {
            val current = _state.value
            when (phase) {
                Phase.CONNECTING -> throw IllegalArgumentException("Use startSession() to enter CONNECTING")
                Phase.IDLE -> throw IllegalArgumentException("Use reset() to go IDLE")
                else -> {}
            }
            if (current.phase == Phase.FAILED || current.phase == Phase.COMPLETED) {
                throw IllegalStateException("Session already terminated")
            }
            val now = timeProvider()
            val sessionStartedAt = if (current.sessionStartedAtMillis == 0L) now else current.sessionStartedAtMillis
            val next = StateSnapshot(
                phase = phase,
                attempt = current.attempt,
                cause = cause,
                sessionStartedAtMillis = sessionStartedAt,
                enteredAtMillis = now
            )
            val payload = updateStateLocked(next)
            handleWatchdogsLocked(phase)
            payload
        }
        result?.let { observer?.onStateChanged(it.previous, it.current, it.durationMillis) }
    }

    private suspend fun handleWatchdogsLocked(phase: Phase) {
        when (phase) {
            Phase.HANDSHAKE -> {
                scheduleWatchdogLocked(
                    key = WatchdogKey.HANDSHAKE,
                    timeoutMillis = timeouts.handshakeTimeoutMillis,
                    failReason = "handshake_timeout"
                )
            }
            Phase.DIAGNOSTICS -> {
                scheduleWatchdogLocked(
                    key = WatchdogKey.DIAGNOSTICS,
                    timeoutMillis = timeouts.diagnosticsTimeoutMillis,
                    failReason = "diagnostics_timeout"
                )
                scheduleWatchdogLocked(
                    key = WatchdogKey.INACTIVITY,
                    timeoutMillis = timeouts.inactivityTimeoutMillis,
                    failReason = "diagnostics_inactivity"
                )
            }
            Phase.READY -> cancelWatchdogLocked(WatchdogKey.HANDSHAKE)
            Phase.COMPLETED, Phase.FAILED -> cancelAllWatchdogsLocked()
            else -> {}
        }
    }

    private fun scheduleWatchdogLocked(
        key: WatchdogKey,
        timeoutMillis: Long,
        failReason: String
    ) {
        cancelWatchdogLocked(key)
        val job = scope.launch {
            delay(timeoutMillis)
            val trigger = mutex.withLock {
                val snapshot = _state.value
                val phaseMatches = when (key) {
                    WatchdogKey.HANDSHAKE -> snapshot.phase == Phase.HANDSHAKE
                    WatchdogKey.DIAGNOSTICS, WatchdogKey.INACTIVITY -> snapshot.phase == Phase.DIAGNOSTICS
                }
                if (phaseMatches) {
                    watchdogJobs.remove(key)
                    snapshot.phase
                } else null
            }
            if (trigger != null) {
                observer?.onWatchdogTriggered(trigger, key, timeoutMillis)
                fail(failReason)
            }
        }
        watchdogJobs[key] = job
    }

    private fun cancelWatchdogLocked(key: WatchdogKey) {
        watchdogJobs.remove(key)?.cancel()
    }

    private fun cancelAllWatchdogsLocked() {
        watchdogJobs.values.forEach { it.cancel() }
        watchdogJobs.clear()
    }

    private suspend fun ensureIdleLocked() {
        val current = _state.value
        if (current.phase != Phase.IDLE) {
            throw IllegalStateException("Session already running")
        }
        cancelAllWatchdogsLocked()
    }

    private fun updateStateLocked(snapshot: StateSnapshot): ObserverPayload? {
        val previous = _state.value
        if (previous.phase == snapshot.phase && previous.cause == snapshot.cause) {
            return null
        }
        _state.value = snapshot
        val elapsed = snapshot.enteredAtMillis - previous.enteredAtMillis
        return ObserverPayload(previous, snapshot, elapsed)
    }

    data class StateSnapshot(
        val phase: Phase,
        val attempt: Int,
        val cause: String?,
        val sessionStartedAtMillis: Long,
        val enteredAtMillis: Long
    )

    enum class Phase {
        IDLE,
        CONNECTING,
        HANDSHAKE,
        READY,
        DIAGNOSTICS,
        COMPLETED,
        FAILED
    }

    enum class WatchdogKey {
        HANDSHAKE,
        DIAGNOSTICS,
        INACTIVITY
    }

    data class SessionTimeouts(
        val handshakeTimeoutMillis: Long = 5_000L,
        val inactivityTimeoutMillis: Long = 15_000L,
        val diagnosticsTimeoutMillis: Long = 45_000L
    )

    data class ObserverPayload(
        val previous: StateSnapshot,
        val current: StateSnapshot,
        val durationMillis: Long
    )

    interface SessionObserver {
        fun onStateChanged(previous: StateSnapshot, current: StateSnapshot, durationMillis: Long)
        fun onWatchdogTriggered(phase: Phase, key: WatchdogKey, timeoutMillis: Long) {}
    }
}
