package com.selfservice.kiosk.ble.recovery

import kotlin.math.pow
import kotlin.random.Random

/**
 * Calculates recovery actions for BLE connection issues based on a predefined matrix.
 */
class BleReconnectCoordinator(
    policies: Set<RecoveryPolicy> = defaultPolicies(),
    private val telemetry: RecoveryTelemetry? = null,
    private val jitterSource: (Long) -> Long = { bound ->
        if (bound <= 0L) 0L else Random.nextLong(0L, bound + 1L)
    }
) {

    private val policyMap = policies.associateBy { it.issueType }
    private val attempts = mutableMapOf<IssueType, Int>()

    @Synchronized
    fun nextAction(issue: ConnectionIssue): RecoveryDecision {
        val policy = policyMap[issue.type] ?: RecoveryPolicy(issue.type, Severity.FATAL)
        return when (policy.severity) {
            Severity.FATAL -> {
                telemetry?.onEscalated(issue)
                RecoveryDecision.Escalate
            }
            Severity.HARD, Severity.SOFT -> evaluateRetry(issue, policy)
        }
    }

    @Synchronized
    fun registerSuccess(issueType: IssueType? = null) {
        if (issueType == null) {
            attempts.clear()
        } else {
            attempts.remove(issueType)
        }
    }

    private fun evaluateRetry(issue: ConnectionIssue, policy: RecoveryPolicy): RecoveryDecision {
        val attemptNumber = (attempts[issue.type] ?: 0) + 1
        attempts[issue.type] = attemptNumber
        if (attemptNumber > policy.maxAttempts) {
            telemetry?.onAborted(issue)
            return RecoveryDecision.Abort
        }
        val delayData = computeDelay(policy, attemptNumber)
        telemetry?.onRetryScheduled(issue, attemptNumber, policy.maxAttempts, delayData.delayMillis, delayData.jitterMillis)
        return RecoveryDecision.Retry(
            attempt = attemptNumber,
            maxAttempts = policy.maxAttempts,
            delayMillis = delayData.delayMillis,
            jitterMillis = delayData.jitterMillis
        )
    }

    private fun computeDelay(policy: RecoveryPolicy, attempt: Int): DelayData {
        if (policy.severity == Severity.SOFT && attempt == 1) {
            return DelayData(policy.softStartDelayMillis, 0L)
        }
        val exponent = (attempt - 1).coerceAtLeast(0)
        val baseDelay = policy.baseDelayMillis * policy.backoffMultiplier.pow(exponent.toDouble())
        val bounded = baseDelay.toLong().coerceAtMost(policy.maxDelayMillis)
        val jitterBound = (bounded * policy.jitterRatio).toLong()
        val jitter = if (jitterBound > 0) jitterSource(jitterBound) else 0L
        val finalDelay = (bounded + jitter).coerceAtMost(policy.maxDelayMillis)
        return DelayData(finalDelay, jitter)
    }

    data class DelayData(val delayMillis: Long, val jitterMillis: Long)

    data class RecoveryPolicy(
        val issueType: IssueType,
        val severity: Severity,
        val maxAttempts: Int = when (severity) {
            Severity.SOFT -> 6
            Severity.HARD -> 3
            Severity.FATAL -> 0
        },
        val baseDelayMillis: Long = 750L,
        val backoffMultiplier: Double = 2.0,
        val maxDelayMillis: Long = 10_000L,
        val jitterRatio: Double = 0.25,
        val softStartDelayMillis: Long = 350L
    )

    enum class Severity { SOFT, HARD, FATAL }

    sealed class ConnectionIssue(val type: IssueType) {
        object HandshakeTimeout : ConnectionIssue(IssueType.HANDSHAKE_TIMEOUT)
        data class GattDisconnected(val status: Int) : ConnectionIssue(IssueType.GATT_DISCONNECTED)
        data class CharacteristicWriteFailure(val status: Int) : ConnectionIssue(IssueType.CHAR_WRITE_FAILURE)
        object PeripheralBusy : ConnectionIssue(IssueType.PERIPHERAL_BUSY)
        object SecurityError : ConnectionIssue(IssueType.SECURITY_ERROR)
        data class Unknown(val detail: String? = null) : ConnectionIssue(IssueType.UNKNOWN)
    }

    enum class IssueType {
        HANDSHAKE_TIMEOUT,
        GATT_DISCONNECTED,
        CHAR_WRITE_FAILURE,
        PERIPHERAL_BUSY,
        SECURITY_ERROR,
        UNKNOWN
    }

    sealed class RecoveryDecision {
        data class Retry(
            val attempt: Int,
            val maxAttempts: Int,
            val delayMillis: Long,
            val jitterMillis: Long
        ) : RecoveryDecision()

        object Escalate : RecoveryDecision()
        object Abort : RecoveryDecision()
    }

    interface RecoveryTelemetry {
        fun onRetryScheduled(
            issue: ConnectionIssue,
            attempt: Int,
            maxAttempts: Int,
            delayMillis: Long,
            jitterMillis: Long
        )

        fun onEscalated(issue: ConnectionIssue)
        fun onAborted(issue: ConnectionIssue)
    }

    companion object {
        fun defaultPolicies(): Set<RecoveryPolicy> = setOf(
            RecoveryPolicy(
                issueType = IssueType.HANDSHAKE_TIMEOUT,
                severity = Severity.HARD,
                maxAttempts = 3,
                baseDelayMillis = 500L,
                backoffMultiplier = 2.0,
                maxDelayMillis = 5_000L,
                jitterRatio = 0.2
            ),
            RecoveryPolicy(
                issueType = IssueType.GATT_DISCONNECTED,
                severity = Severity.SOFT,
                maxAttempts = 5,
                baseDelayMillis = 800L,
                backoffMultiplier = 1.8,
                maxDelayMillis = 8_000L,
                jitterRatio = 0.3
            ),
            RecoveryPolicy(
                issueType = IssueType.CHAR_WRITE_FAILURE,
                severity = Severity.HARD,
                maxAttempts = 4,
                baseDelayMillis = 600L,
                backoffMultiplier = 2.2,
                maxDelayMillis = 7_000L,
                jitterRatio = 0.25
            ),
            RecoveryPolicy(
                issueType = IssueType.PERIPHERAL_BUSY,
                severity = Severity.SOFT,
                maxAttempts = 6,
                baseDelayMillis = 400L,
                backoffMultiplier = 1.5,
                maxDelayMillis = 4_000L,
                jitterRatio = 0.4,
                softStartDelayMillis = 200L
            ),
            RecoveryPolicy(
                issueType = IssueType.SECURITY_ERROR,
                severity = Severity.FATAL
            ),
            RecoveryPolicy(
                issueType = IssueType.UNKNOWN,
                severity = Severity.HARD,
                maxAttempts = 2,
                baseDelayMillis = 1_000L,
                backoffMultiplier = 2.5,
                maxDelayMillis = 6_000L,
                jitterRatio = 0.2
            )
        )
    }
}
