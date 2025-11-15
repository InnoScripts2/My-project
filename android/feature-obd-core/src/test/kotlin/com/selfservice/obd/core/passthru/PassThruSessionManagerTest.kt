package com.selfservice.obd.core.passthru

import com.selfservice.core.DispatchersProvider
import com.selfservice.obd.core.connection.BleDevice
import com.selfservice.obd.core.connection.BleScannerConfig
import com.selfservice.obd.core.recovery.BleReconnectCoordinator
import com.selfservice.obd.core.session.ConnectedAdapter
import com.selfservice.obd.core.session.ObdSessionConfig
import com.selfservice.obd.core.session.ObdSessionController
import com.selfservice.obd.core.session.ObdSessionState
import com.selfservice.obd.core.transport.ObdTransport
import com.selfservice.obd.core.transport.TransportConnectionResult
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertSame
import kotlin.test.assertTrue
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest

private class ManagerDispatchers(private val dispatcher: CoroutineDispatcher) :
        DispatchersProvider {
    override val io: CoroutineDispatcher = dispatcher
    override val computation: CoroutineDispatcher = dispatcher
    override val main: CoroutineDispatcher = dispatcher
}

private class RecordingSessionController : ObdSessionController {
    private val _state = MutableStateFlow<ObdSessionState>(ObdSessionState.Idle)
    var startedWith: Pair<ObdSessionConfig, ObdTransport>? = null
    var nextStartResult: ObdSessionState = ObdSessionState.Idle

    override val state: StateFlow<ObdSessionState> = _state

    override suspend fun start(config: ObdSessionConfig, transport: ObdTransport): ObdSessionState {
        startedWith = config to transport
        _state.value = nextStartResult
        return nextStartResult
    }

    override suspend fun onTransportReady(adapter: ConnectedAdapter) {}

    override suspend fun onHandshakeCompleted() {}

    override suspend fun beginDiagnostics() {}

    override suspend fun recordDiagnosticsHeartbeat() {}

    override suspend fun completeSuccessfully() {}

    override suspend fun fail(cause: Throwable) {}

    override suspend fun onConnectionIssue(
            issue: BleReconnectCoordinator.ConnectionIssue,
            cause: Throwable?,
            adapter: ConnectedAdapter?
    ): BleReconnectCoordinator.RecoveryDecision {
        return BleReconnectCoordinator.RecoveryDecision.Retry(attempt = 1, delayMillis = 0L)
    }

    override suspend fun cancel() {}
}

@OptIn(ExperimentalCoroutinesApi::class)
class PassThruSessionManagerTest {

    @Test
    fun startWithAdapterUsesPreparedBootstrap() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val dispatchers = ManagerDispatchers(dispatcher)
        val controller =
                RecordingSessionController().apply {
                    nextStartResult =
                            ObdSessionState.Connecting(
                                    BleDevice(
                                            address = "00:11:22:33:44:55",
                                            name = "Passthru",
                                            rssi = null
                                    )
                            )
                }
        val bridge = FakePassThruBridge()
        val adapter =
                ConnectedAdapter(
                        device =
                                BleDevice(
                                        address = "00:11:22:33:44:55",
                                        name = "Passthru",
                                        rssi = null
                                ),
                        protocol = "J2534"
                )
        val configFactory =
                PassThruSessionConfigFactory(dispatchers = dispatchers, bridgeProvider = { bridge })
        val manager = PassThruSessionManager(controller = controller, configFactory = configFactory)

        val result = manager.startWithAdapter(adapter)

        assertTrue(result is ObdSessionState.Connecting)
        val started = controller.startedWith
        assertTrue(started != null)
        val (sessionConfig, transport) = started!!
        assertSame(configFactory.transportFactory(), sessionConfig.transportFactory)
        assertTrue(transport is PassThruTransport)
        advanceUntilIdle()
    }

    @Test
    fun stateReferencesControllerState() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val dispatchers = ManagerDispatchers(dispatcher)
        val controller = RecordingSessionController()
        val bridge = FakePassThruBridge()
        val manager =
                PassThruSessionManager(
                        controller = controller,
                        configFactory =
                                PassThruSessionConfigFactory(
                                        dispatchers = dispatchers,
                                        bridgeProvider = { bridge }
                                )
                )

        assertSame(controller.state, manager.state)
    }

    @Test
    fun exposedFactoryMethodsDelegateToConfigFactory() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val dispatchers = ManagerDispatchers(dispatcher)
        val controller = RecordingSessionController()
        val bridge = FakePassThruBridge()
        val configFactory =
                PassThruSessionConfigFactory(dispatchers = dispatchers, bridgeProvider = { bridge })
        val manager = PassThruSessionManager(controller = controller, configFactory = configFactory)
        val adapter =
                ConnectedAdapter(
                        device =
                                BleDevice(
                                        address = "AA:BB:CC:DD:EE:FF",
                                        name = "Passthru",
                                        rssi = null
                                ),
                        protocol = "J2534"
                )
        val customScanner = BleScannerConfig(timeoutMs = 10_000L)

        val config = manager.createConfig(initialAdapter = adapter, scannerConfig = customScanner)
        val transportFactory = manager.transportFactory()
        val transport = transportFactory.create(adapter.device)

        assertEquals(customScanner, config.scanner)
        assertSame(configFactory.transportFactory(), transportFactory)
        val connectResult = transport.connect()
        assertTrue(connectResult is TransportConnectionResult.Success)
        advanceUntilIdle()
    }
}
