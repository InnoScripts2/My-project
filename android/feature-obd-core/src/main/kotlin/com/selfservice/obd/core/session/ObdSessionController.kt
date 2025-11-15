package com.selfservice.obd.core.session

import com.selfservice.obd.core.connection.BleDevice
import com.selfservice.obd.core.connection.BleScannerConfig
import com.selfservice.obd.core.connection.TransportFactory
import com.selfservice.obd.core.recovery.BleReconnectCoordinator
import com.selfservice.obd.core.transport.ObdTransport
import kotlinx.coroutines.flow.StateFlow

/**
 * High-level controller for orchestrating diagnostic sessions.
 */
interface ObdSessionController {
    val state: StateFlow<ObdSessionState>

    suspend fun start(config: ObdSessionConfig, transport: ObdTransport): ObdSessionState
    suspend fun onTransportReady(adapter: ConnectedAdapter)
    suspend fun onHandshakeCompleted()
    suspend fun beginDiagnostics()
    suspend fun recordDiagnosticsHeartbeat()
    suspend fun completeSuccessfully()
    suspend fun fail(cause: Throwable)
    suspend fun onConnectionIssue(
        issue: BleReconnectCoordinator.ConnectionIssue,
        cause: Throwable? = null,
        adapter: ConnectedAdapter? = null
    ): BleReconnectCoordinator.RecoveryDecision
    suspend fun cancel()
}

data class ObdSessionConfig(
    val scanner: BleScannerConfig = BleScannerConfig.Default,
    val retryCount: Int = 3,
    val reconnectDelayMs: Long = 2_000L,
    val initialAdapter: ConnectedAdapter? = null,
    val transportFactory: TransportFactory? = null
)

/**
 * Snapshot of the currently selected device.
 */
data class ConnectedAdapter(
    val device: BleDevice,
    val protocol: String?
)
