package com.selfservice.obd.core.passthru

import com.selfservice.obd.core.connection.BleScannerConfig
import com.selfservice.obd.core.recovery.BleReconnectCoordinator
import com.selfservice.obd.core.session.ConnectedAdapter
import com.selfservice.obd.core.session.ObdSessionController
import com.selfservice.obd.core.session.ObdSessionState
import kotlinx.coroutines.flow.StateFlow

/**
 * Helper responsible for launching and delegating passthru sessions through [ObdSessionController].
 */
class PassThruSessionManager(
        private val controller: ObdSessionController,
        private val configFactory: PassThruSessionConfigFactory
) {

    val state: StateFlow<ObdSessionState> = controller.state

    suspend fun startWithAdapter(
            adapter: ConnectedAdapter,
            scannerConfig: BleScannerConfig = BleScannerConfig.Default
    ): ObdSessionState {
        val bootstrap =
                configFactory.prepareSession(adapter = adapter, scannerConfig = scannerConfig)
        return controller.start(bootstrap.config, bootstrap.transport)
    }

    suspend fun startWithBootstrap(
            bootstrap: PassThruSessionConfigFactory.SessionBootstrap
    ): ObdSessionState {
        return controller.start(bootstrap.config, bootstrap.transport)
    }

    suspend fun onTransportReady(adapter: ConnectedAdapter) {
        controller.onTransportReady(adapter)
    }

    suspend fun onHandshakeCompleted() {
        controller.onHandshakeCompleted()
    }

    suspend fun beginDiagnostics() {
        controller.beginDiagnostics()
    }

    suspend fun recordDiagnosticsHeartbeat() {
        controller.recordDiagnosticsHeartbeat()
    }

    suspend fun completeSuccessfully() {
        controller.completeSuccessfully()
    }

    suspend fun fail(cause: Throwable) {
        controller.fail(cause)
    }

    suspend fun handleConnectionIssue(
            issue: BleReconnectCoordinator.ConnectionIssue,
            cause: Throwable? = null,
            adapter: ConnectedAdapter? = null
    ): BleReconnectCoordinator.RecoveryDecision {
        return controller.onConnectionIssue(issue, cause, adapter)
    }

    suspend fun cancel() {
        controller.cancel()
    }

    fun createConfig(
            initialAdapter: ConnectedAdapter? = null,
            scannerConfig: BleScannerConfig = BleScannerConfig.Default
    ) = configFactory.create(initialAdapter, scannerConfig)

    fun transportFactory() = configFactory.transportFactory()

    suspend fun createTransport(adapter: ConnectedAdapter) =
            configFactory.transportFactory().create(adapter.device)
}
