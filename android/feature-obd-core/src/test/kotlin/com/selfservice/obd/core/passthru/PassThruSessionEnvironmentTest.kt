package com.selfservice.obd.core.passthru

import com.selfservice.core.DispatchersProvider
import com.selfservice.obd.core.connection.BleDevice
import com.selfservice.obd.core.connection.BleScannerConfig
import com.selfservice.obd.core.session.ConnectedAdapter
import com.selfservice.obd.core.session.DefaultObdSessionController
import com.selfservice.obd.core.session.ObdSessionConfig
import com.selfservice.obd.core.session.ObdSessionController
import com.selfservice.obd.core.session.ObdSessionState
import com.selfservice.obd.core.transport.ObdTransport
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertSame
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.runTest

private class EnvironmentDispatchers(private val dispatcher: CoroutineDispatcher) :
        DispatchersProvider {
    override val io: CoroutineDispatcher = dispatcher
    override val computation: CoroutineDispatcher = dispatcher
    override val main: CoroutineDispatcher = dispatcher
}

class PassThruSessionEnvironmentTest {

    private val dispatcher = StandardTestDispatcher()
    private val dispatchers: DispatchersProvider = EnvironmentDispatchers(dispatcher)
    private val bridge = FakePassThruBridge()

    @Test
    fun managerUsesControllerFromBuilder() = runTest {
        val controller = RecordingController()
        val environment =
                PassThruSessionEnvironment(
                        dispatchers = dispatchers,
                        bridgeProvider = { bridge },
                        controllerBuilder = { controller }
                )
        val adapter = ConnectedAdapter(device = device(), protocol = "J2534")

        val bootstrap = environment.configFactory.prepareSession(adapter)
        environment.manager.startWithBootstrap(bootstrap)

        assertSame(controller.state, environment.manager.state)
        assertEquals(bootstrap.config, controller.startedWith?.first)
        assertSame(bootstrap.transport, controller.startedWith?.second)
    }

    @Test
    fun configFactoryRespectsOverrides() = runTest {
        val scanner = BleScannerConfig(targetSerialPattern = Regex("PT-.*"), timeoutMs = 3_000L)
        val environment =
                PassThruSessionEnvironment(
                        dispatchers = dispatchers,
                        bridgeProvider = { bridge },
                        defaultScanner = scanner,
                        retryCount = 5,
                        reconnectDelayMs = 1_250L
                )
        val adapter = ConnectedAdapter(device = device(address = "11:22:33"), protocol = "J2534")

        val config = environment.manager.createConfig(initialAdapter = adapter)

        assertEquals(scanner, config.scanner)
        assertEquals(5, config.retryCount)
        assertEquals(1_250L, config.reconnectDelayMs)
        assertEquals(adapter, config.initialAdapter)
    }

    @Test
    fun defaultControllerIsUsedWhenBuilderNotProvided() {
        val environment =
                PassThruSessionEnvironment(dispatchers = dispatchers, bridgeProvider = { bridge })

        assertIs<DefaultObdSessionController>(environment.controller)
    }

    private fun device(address: String = "AA:BB:CC"): BleDevice =
            BleDevice(address = address, name = "Passthru", rssi = -42)

    private class RecordingController : ObdSessionController {
        private val backingState = MutableStateFlow<ObdSessionState>(ObdSessionState.Idle)
        var startedWith: Pair<ObdSessionConfig, ObdTransport>? = null

        override val state: StateFlow<ObdSessionState> = backingState

        override suspend fun start(
                config: ObdSessionConfig,
                transport: ObdTransport
        ): ObdSessionState {
            startedWith = config to transport
            return backingState.value
        }

        override suspend fun onTransportReady(adapter: ConnectedAdapter) {}

        override suspend fun onHandshakeCompleted() {}

        override suspend fun beginDiagnostics() {}

        override suspend fun recordDiagnosticsHeartbeat() {}

        override suspend fun completeSuccessfully() {}

        override suspend fun fail(cause: Throwable) {}

        override suspend fun onConnectionIssue(
                issue: com.selfservice.obd.core.recovery.BleReconnectCoordinator.ConnectionIssue,
                cause: Throwable?,
                adapter: ConnectedAdapter?
        ): com.selfservice.obd.core.recovery.BleReconnectCoordinator.RecoveryDecision {
            return com.selfservice.obd.core.recovery.BleReconnectCoordinator.RecoveryDecision.Abort
        }

        override suspend fun cancel() {}
    }
}
