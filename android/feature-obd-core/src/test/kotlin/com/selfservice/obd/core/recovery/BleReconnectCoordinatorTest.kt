package com.selfservice.obd.core.recovery

import com.selfservice.obd.core.recovery.BleReconnectCoordinator.ConnectionIssue
import com.selfservice.obd.core.recovery.BleReconnectCoordinator.IssueType
import com.selfservice.obd.core.recovery.BleReconnectCoordinator.RecoveryDecision
import com.selfservice.obd.core.recovery.BleReconnectCoordinator.RecoveryPolicy
import com.selfservice.obd.core.recovery.BleReconnectCoordinator.Severity
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class BleReconnectCoordinatorTest {

    @Test
    fun retryRespectsMaxAttemptsAndResets() {
        val telemetry = RecordingTelemetry()
        val coordinator = BleReconnectCoordinator(
            policies = setOf(
                RecoveryPolicy(
                    issueType = IssueType.HANDSHAKE_TIMEOUT,
                    severity = Severity.HARD,
                    maxAttempts = 2,
                    baseDelayMillis = 1_000L,
                    backoffMultiplier = 2.0,
                    maxDelayMillis = 10_000L,
                    jitterRatio = 0.0
                )
            ),
            telemetry = telemetry,
            jitterSource = { 0L }
        )

        val issue = ConnectionIssue.HandshakeTimeout
        val first = coordinator.nextAction(issue)
        assertTrue(first is RecoveryDecision.Retry)
        require(first is RecoveryDecision.Retry)
        assertEquals(1, first.attempt)
        assertEquals(1_000L, first.delayMillis)

        val second = coordinator.nextAction(issue)
        assertTrue(second is RecoveryDecision.Retry)
        require(second is RecoveryDecision.Retry)
        assertEquals(2, second.attempt)
        assertEquals(2_000L, second.delayMillis)

        val third = coordinator.nextAction(issue)
        assertEquals(RecoveryDecision.Abort, third)
        assertEquals(2, telemetry.retryEvents.size)
        assertEquals(1, telemetry.abortedEvents.size)

        coordinator.registerSuccess()
        val reset = coordinator.nextAction(issue)
        assertTrue(reset is RecoveryDecision.Retry)
        require(reset is RecoveryDecision.Retry)
        assertEquals(1, reset.attempt)
    }

    @Test
    fun softPoliciesUseWarmupDelay() {
        val telemetry = RecordingTelemetry()
        val coordinator = BleReconnectCoordinator(
            policies = setOf(
                RecoveryPolicy(
                    issueType = IssueType.PERIPHERAL_BUSY,
                    severity = Severity.SOFT,
                    maxAttempts = 3,
                    baseDelayMillis = 500L,
                    backoffMultiplier = 2.0,
                    maxDelayMillis = 5_000L,
                    jitterRatio = 0.0,
                    softStartDelayMillis = 250L
                )
            ),
            telemetry = telemetry,
            jitterSource = { 0L }
        )

        val issue = ConnectionIssue.PeripheralBusy
        val first = coordinator.nextAction(issue)
        assertTrue(first is RecoveryDecision.Retry)
        require(first is RecoveryDecision.Retry)
        assertEquals(1, first.attempt)
        assertEquals(250L, first.delayMillis)
        assertEquals(0L, first.jitterMillis)

        val second = coordinator.nextAction(issue)
        assertTrue(second is RecoveryDecision.Retry)
        require(second is RecoveryDecision.Retry)
        assertEquals(2, second.attempt)
        assertEquals(1_000L, second.delayMillis)
    }

    @Test
    fun fatalPoliciesEscalateImmediately() {
        val telemetry = RecordingTelemetry()
        val coordinator = BleReconnectCoordinator(
            policies = setOf(
                RecoveryPolicy(
                    issueType = IssueType.SECURITY_ERROR,
                    severity = Severity.FATAL
                )
            ),
            telemetry = telemetry
        )

        val decision = coordinator.nextAction(ConnectionIssue.SecurityError)
        assertEquals(RecoveryDecision.Escalate, decision)
        assertEquals(1, telemetry.escalatedEvents.size)
        assertTrue(telemetry.retryEvents.isEmpty())
    }

    private class RecordingTelemetry : BleReconnectCoordinator.RecoveryTelemetry {
        val retryEvents = mutableListOf<BleReconnectCoordinator.DelayData>()
        val escalatedEvents = mutableListOf<ConnectionIssue>()
        val abortedEvents = mutableListOf<ConnectionIssue>()

        override fun onRetryScheduled(
            issue: ConnectionIssue,
            attempt: Int,
            maxAttempts: Int,
            delayMillis: Long,
            jitterMillis: Long
        ) {
            retryEvents += BleReconnectCoordinator.DelayData(delayMillis, jitterMillis)
        }

        override fun onEscalated(issue: ConnectionIssue) {
            escalatedEvents += issue
        }

        override fun onAborted(issue: ConnectionIssue) {
            abortedEvents += issue
        }
    }
}
