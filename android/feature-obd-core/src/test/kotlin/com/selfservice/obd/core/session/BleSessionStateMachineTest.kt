package com.selfservice.obd.core.session

import com.selfservice.obd.core.session.BleSessionStateMachine.Phase
import com.selfservice.obd.core.session.BleSessionStateMachine.SessionTimeouts
import com.selfservice.obd.core.session.BleSessionStateMachine.WatchdogKey
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertTrue
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runTest

@OptIn(ExperimentalCoroutinesApi::class)
class BleSessionStateMachineTest {

    @Test
    fun handshakeTimeoutTriggersFailure() = runTest {
        val observer = RecordingObserver()
        val machine = BleSessionStateMachine(
            scope = this,
            timeouts = SessionTimeouts(
                handshakeTimeoutMillis = 1_000L,
                inactivityTimeoutMillis = 3_000L,
                diagnosticsTimeoutMillis = 6_000L
            ),
            observer = observer,
            timeProvider = { testScheduler.currentTime }
        )

        machine.startSession()
        machine.onTransportReady()

        advanceTimeBy(900L)
        assertEquals(Phase.HANDSHAKE, machine.state.value.phase)

        advanceTimeBy(200L)
        assertEquals(Phase.FAILED, machine.state.value.phase)
        assertEquals("handshake_timeout", machine.state.value.cause)
        assertTrue(observer.watchdogEvents.any { it.first == Phase.HANDSHAKE && it.second == WatchdogKey.HANDSHAKE })
    }

    @Test
    fun diagnosticsHeartbeatExtendsInactivityWatchdog() = runTest {
        val observer = RecordingObserver()
        val machine = BleSessionStateMachine(
            scope = this,
            timeouts = SessionTimeouts(
                handshakeTimeoutMillis = 800L,
                inactivityTimeoutMillis = 1_500L,
                diagnosticsTimeoutMillis = 5_000L
            ),
            observer = observer,
            timeProvider = { testScheduler.currentTime }
        )

        machine.startSession()
        machine.onTransportReady()
        machine.onHandshakeCompleted()
        machine.beginDiagnostics()

        advanceTimeBy(1_000L)
        machine.recordDiagnosticsHeartbeat()

        advanceTimeBy(1_400L)
        assertEquals(Phase.DIAGNOSTICS, machine.state.value.phase)

        advanceTimeBy(200L)
        assertEquals(Phase.FAILED, machine.state.value.phase)
        assertEquals("diagnostics_inactivity", machine.state.value.cause)
        assertTrue(observer.watchdogEvents.any { it.second == WatchdogKey.INACTIVITY })
    }

    private class RecordingObserver : BleSessionStateMachine.SessionObserver {
        val transitions = mutableListOf<Pair<Phase, Phase>>()
        val watchdogEvents = mutableListOf<Pair<Phase, WatchdogKey>>()

        override fun onStateChanged(
            previous: BleSessionStateMachine.StateSnapshot,
            current: BleSessionStateMachine.StateSnapshot,
            durationMillis: Long
        ) {
            transitions += previous.phase to current.phase
        }

        override fun onWatchdogTriggered(phase: Phase, key: WatchdogKey, timeoutMillis: Long) {
            watchdogEvents += phase to key
        }
    }
}
