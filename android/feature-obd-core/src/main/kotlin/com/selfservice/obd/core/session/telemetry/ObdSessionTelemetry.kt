package com.selfservice.obd.core.session.telemetry

import com.selfservice.obd.core.connection.BleScannerConfig
import com.selfservice.obd.core.platform.BluetoothPrerequisiteResult
import com.selfservice.obd.core.recovery.BleReconnectCoordinator
import com.selfservice.obd.core.session.ConnectedAdapter
import com.selfservice.obd.core.session.ObdSessionConfig

/**
 * Central telemetry sink for diagnostic sessions. Implementations may persist events to disk,
 * forward them to analytics, or expose them to UI.
 */
interface ObdSessionTelemetry {
    suspend fun record(event: ObdSessionTelemetryEvent)

    object NoOp : ObdSessionTelemetry {
        override suspend fun record(event: ObdSessionTelemetryEvent) {}
    }
}

sealed class ObdSessionTelemetryEvent(open val timestampMillis: Long) {
    data class SessionStarted(
        val attempt: Int,
        val config: ObdSessionConfig,
        override val timestampMillis: Long
    ) : ObdSessionTelemetryEvent(timestampMillis)

    data class ScannerStarted(
        val config: BleScannerConfig,
        override val timestampMillis: Long
    ) : ObdSessionTelemetryEvent(timestampMillis)

    data class ScannerStopped(
        override val timestampMillis: Long
    ) : ObdSessionTelemetryEvent(timestampMillis)

    data class AdapterSelected(
        val adapter: ConnectedAdapter,
        val attempt: Int,
        override val timestampMillis: Long
    ) : ObdSessionTelemetryEvent(timestampMillis)

    data class AdapterReady(
        val adapter: ConnectedAdapter,
        val attempt: Int,
        override val timestampMillis: Long
    ) : ObdSessionTelemetryEvent(timestampMillis)

    data class HandshakeCompleted(
        val adapter: ConnectedAdapter,
        val attempt: Int,
        override val timestampMillis: Long
    ) : ObdSessionTelemetryEvent(timestampMillis)

    data class DiagnosticsStarted(
        val adapter: ConnectedAdapter,
        val attempt: Int,
        override val timestampMillis: Long
    ) : ObdSessionTelemetryEvent(timestampMillis)

    data class DiagnosticsHeartbeat(
        val adapter: ConnectedAdapter,
        override val timestampMillis: Long
    ) : ObdSessionTelemetryEvent(timestampMillis)

    data class RetryScheduled(
        val decision: BleReconnectCoordinator.RecoveryDecision.Retry,
        val adapter: ConnectedAdapter?,
        override val timestampMillis: Long
    ) : ObdSessionTelemetryEvent(timestampMillis)

    data class ConnectionIssue(
        val issue: BleReconnectCoordinator.ConnectionIssue,
        val cause: Throwable?,
        val adapter: ConnectedAdapter?,
        override val timestampMillis: Long
    ) : ObdSessionTelemetryEvent(timestampMillis)

    data class SessionCompleted(
        val adapter: ConnectedAdapter?,
        val durationMillis: Long,
        override val timestampMillis: Long
    ) : ObdSessionTelemetryEvent(timestampMillis)

    data class SessionFailed(
        val adapter: ConnectedAdapter?,
        val cause: Throwable,
        val durationMillis: Long,
        override val timestampMillis: Long
    ) : ObdSessionTelemetryEvent(timestampMillis)

    data class SessionCancelled(
        val adapter: ConnectedAdapter?,
        val durationMillis: Long,
        override val timestampMillis: Long
    ) : ObdSessionTelemetryEvent(timestampMillis)

    data class PrerequisitesNotMet(
        val result: BluetoothPrerequisiteResult,
        override val timestampMillis: Long
    ) : ObdSessionTelemetryEvent(timestampMillis)
}
