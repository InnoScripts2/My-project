package com.selfservice.obd.core.session

import com.selfservice.core.DispatchersProvider
import com.selfservice.obd.core.connection.BleAdapterSelector
import com.selfservice.obd.core.connection.BleDevice
import com.selfservice.obd.core.connection.BleScannerConfig
import com.selfservice.obd.core.connection.TransportFactory
import com.selfservice.core.permissions.BluetoothPrerequisiteAction
import com.selfservice.obd.core.platform.BluetoothPrerequisitesUseCase
import com.selfservice.obd.core.platform.BluetoothEnvironmentRepository
import com.selfservice.core.permissions.BluetoothEnvironmentState
import com.selfservice.core.permissions.BluetoothEnvironmentStatus
import com.selfservice.core.permissions.BluetoothPermissionHelper
import com.selfservice.obd.core.recovery.BleReconnectCoordinator
import com.selfservice.obd.core.transport.ObdTransport
import com.selfservice.obd.core.transport.TransportConnectionResult
import com.selfservice.obd.core.transport.TransportFrame
import com.selfservice.obd.core.transport.TransportSendResult
import com.selfservice.obd.core.session.telemetry.ObdSessionTelemetry
import com.selfservice.obd.core.session.telemetry.ObdSessionTelemetryEvent
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertSame
import kotlin.test.assertTrue
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest

@OptIn(ExperimentalCoroutinesApi::class)
class DefaultObdSessionControllerTest {

    private val dispatcher = StandardTestDispatcher()
    private val dispatchersProvider = object : DispatchersProvider {
        override val io = dispatcher
        override val computation = dispatcher
        override val main = dispatcher
    }

    @Test
    fun startWithoutAdapterEmitsScanningState() = runTest(dispatcher) {
        val controller = DefaultObdSessionController(
            dispatchers = dispatchersProvider,
            timeProvider = { testScheduler.currentTime }
        )
        val transport = FakeTransport()
        val state = controller.start(ObdSessionConfig(), transport)

        assertEquals(ObdSessionState.Scanning(attempts = 1), state)
        assertEquals(state, controller.state.value)
        assertEquals(0, transport.disconnectCalls)
    }

    @Test
    fun handshakeFlowUpdatesStates() = runTest(dispatcher) {
        val controller = DefaultObdSessionController(
            dispatchers = dispatchersProvider,
            timeProvider = { testScheduler.currentTime }
        )
        val transport = FakeTransport()
        controller.start(ObdSessionConfig(), transport)

        val device = BleDevice(address = "AA:BB:CC:DD:EE:FF", name = "Eldiag", rssi = -52)
        val adapter = ConnectedAdapter(device = device, protocol = "BLE")

        controller.onTransportReady(adapter)
        assertEquals(ObdSessionState.Connecting(device), controller.state.value)

        controller.onHandshakeCompleted()
        assertEquals(ObdSessionState.Ready(device), controller.state.value)

        controller.beginDiagnostics()
        assertEquals(ObdSessionState.Diagnostics(device), controller.state.value)

        controller.completeSuccessfully()
        assertEquals(ObdSessionState.Completed, controller.state.value)
        assertEquals(1, transport.disconnectCalls)
    }

    @Test
    fun failPropagatesThrowable() = runTest(dispatcher) {
        val controller = DefaultObdSessionController(
            dispatchers = dispatchersProvider,
            timeProvider = { testScheduler.currentTime }
        )
        val transport = FakeTransport()
        controller.start(ObdSessionConfig(), transport)

        val error = IllegalStateException("transport_failure")
        controller.fail(error)

        val state = controller.state.value
        assertIs<ObdSessionState.Failed>(state)
        assertSame(error, state.reason)
        assertEquals(1, transport.disconnectCalls)
    }

    @Test
    fun cancelResetsToIdle() = runTest(dispatcher) {
        val selector = FakeAdapterSelector()
        val controller = DefaultObdSessionController(
            dispatchers = dispatchersProvider,
            timeProvider = { testScheduler.currentTime },
            adapterSelector = selector
        )
        val transport = FakeTransport()
        controller.start(ObdSessionConfig(), transport)
        assertEquals(1, selector.startConfigs.size)

        controller.cancel()
        assertEquals(ObdSessionState.Idle, controller.state.value)
        assertTrue(controller.state.value is ObdSessionState.Idle)
        assertEquals(1, transport.disconnectCalls)
        assertEquals(1, selector.stopCalls)
    }

    @Test
    fun connectionIssueRetrySchedulesNextAttempt() = runTest(dispatcher) {
        val coordinator = BleReconnectCoordinator(
            policies = setOf(
                BleReconnectCoordinator.RecoveryPolicy(
                    issueType = BleReconnectCoordinator.IssueType.GATT_DISCONNECTED,
                    severity = BleReconnectCoordinator.Severity.SOFT,
                    maxAttempts = 2,
                    baseDelayMillis = 500L,
                    backoffMultiplier = 1.0,
                    maxDelayMillis = 500L,
                    jitterRatio = 0.0
                )
            ),
            jitterSource = { 0L }
        )
        val factory = CountingTransportFactory()
        val controller = DefaultObdSessionController(
            dispatchers = dispatchersProvider,
            reconnectCoordinator = coordinator,
            timeProvider = { testScheduler.currentTime }
        )
        val transport = FakeTransport()
        val device = BleDevice(address = "AA:BB:CC:DD:EE:01", name = "Retry", rssi = -60)
        val adapter = ConnectedAdapter(device, protocol = "BLE")

        controller.start(
            ObdSessionConfig(transportFactory = factory, initialAdapter = adapter),
            transport
        )
        controller.onTransportReady(adapter)
        val decision = controller.onConnectionIssue(
            BleReconnectCoordinator.ConnectionIssue.GattDisconnected(status = 133),
            IllegalStateException("disconnect"),
            adapter
        )

        assertIs<BleReconnectCoordinator.RecoveryDecision.Retry>(decision)
        assertIs<ObdSessionState.Failed>(controller.state.value)
        assertEquals(1, transport.disconnectCalls)

    advanceTimeBy(decision.delayMillis)
    advanceUntilIdle()

        assertIs<ObdSessionState.Connecting>(controller.state.value)
        assertEquals(1, transport.disconnectCalls)
        assertEquals(1, factory.created.size)
        assertEquals(0, factory.created.first().disconnectCalls)
    }

    @Test
    fun startInvokesScannerAndStopOnCompletion() = runTest(dispatcher) {
        val selector = FakeAdapterSelector()
        val controller = DefaultObdSessionController(
            dispatchers = dispatchersProvider,
            timeProvider = { testScheduler.currentTime },
            adapterSelector = selector
        )
        val transport = FakeTransport()
        controller.start(ObdSessionConfig(scanner = BleScannerConfig.Default), transport)
        assertEquals(1, selector.startConfigs.size)

        controller.completeSuccessfully()
        assertEquals(1, selector.stopCalls)
    }

    @Test
    fun telemetryCapturesSuccessfulFlow() = runTest(dispatcher) {
        val selector = FakeAdapterSelector()
        val telemetry = RecordingTelemetry()
        val controller = DefaultObdSessionController(
            dispatchers = dispatchersProvider,
            timeProvider = { testScheduler.currentTime },
            adapterSelector = selector,
            telemetry = telemetry
        )
        val transport = FakeTransport()
        controller.start(ObdSessionConfig(scanner = BleScannerConfig.Default), transport)

        val device = BleDevice(address = "11:22:33:44:55:66", name = "DiagAdapter", rssi = -40)
        val adapter = ConnectedAdapter(device = device, protocol = "BLE")
        controller.onTransportReady(adapter)
        controller.onHandshakeCompleted()
        controller.beginDiagnostics()
        controller.recordDiagnosticsHeartbeat()
        controller.completeSuccessfully()

        val types = telemetry.events.map { it::class.simpleName }
        assertEquals(
            listOf(
                "SessionStarted",
                "ScannerStarted",
                "AdapterReady",
                "HandshakeCompleted",
                "DiagnosticsStarted",
                "DiagnosticsHeartbeat",
                "ScannerStopped",
                "SessionCompleted"
            ),
            types
        )
        val completed = telemetry.events.last() as ObdSessionTelemetryEvent.SessionCompleted
        assertEquals(adapter, completed.adapter)
    }

    @Test
    fun retryUsesLatestDeviceFromSelector() = runTest(dispatcher) {
        val coordinator = BleReconnectCoordinator(
            policies = setOf(
                BleReconnectCoordinator.RecoveryPolicy(
                    issueType = BleReconnectCoordinator.IssueType.GATT_DISCONNECTED,
                    severity = BleReconnectCoordinator.Severity.SOFT,
                    maxAttempts = 2,
                    baseDelayMillis = 100L,
                    backoffMultiplier = 1.0,
                    maxDelayMillis = 100L,
                    jitterRatio = 0.0
                )
            ),
            jitterSource = { 0L }
        )
        val selector = FakeAdapterSelector()
        val factory = CountingTransportFactory()
        val controller = DefaultObdSessionController(
            dispatchers = dispatchersProvider,
            reconnectCoordinator = coordinator,
            timeProvider = { testScheduler.currentTime },
            adapterSelector = selector
        )
    val transport = FakeTransport()
    val discovered = BleDevice(address = "DD:CC:BB:AA:00:11", name = "ScanDevice", rssi = -42)
    selector.latestDeviceResult = ConnectedAdapter(discovered, protocol = "BLE")

        controller.start(ObdSessionConfig(transportFactory = factory), transport)
        val decision = controller.onConnectionIssue(
            BleReconnectCoordinator.ConnectionIssue.GattDisconnected(status = 0),
            IllegalStateException("disconnect"),
            null
        )

        assertIs<BleReconnectCoordinator.RecoveryDecision.Retry>(decision)
        advanceTimeBy(decision.delayMillis)
        runCurrent()

        assertEquals(1, factory.createdDevices.size)
    assertEquals(discovered, factory.createdDevices.first())
    }

    @Test
    fun connectionIssueAbortKeepsFailedState() = runTest(dispatcher) {
        val coordinator = BleReconnectCoordinator(
            policies = setOf(
                BleReconnectCoordinator.RecoveryPolicy(
                    issueType = BleReconnectCoordinator.IssueType.GATT_DISCONNECTED,
                    severity = BleReconnectCoordinator.Severity.HARD,
                    maxAttempts = 1,
                    baseDelayMillis = 200L,
                    backoffMultiplier = 1.0,
                    maxDelayMillis = 200L,
                    jitterRatio = 0.0
                )
            ),
            jitterSource = { 0L }
        )
        val factory = CountingTransportFactory()
        val controller = DefaultObdSessionController(
            dispatchers = dispatchersProvider,
            reconnectCoordinator = coordinator,
            timeProvider = { testScheduler.currentTime }
        )
        val transport = FakeTransport()
        val device = BleDevice(address = "AA:BB:CC:DD:EE:02", name = "Retry", rssi = -55)
        val adapter = ConnectedAdapter(device, protocol = "BLE")

        controller.start(
            ObdSessionConfig(transportFactory = factory, initialAdapter = adapter),
            transport
        )
        controller.onTransportReady(adapter)
        controller.onHandshakeCompleted()
        val firstDecision = controller.onConnectionIssue(
            BleReconnectCoordinator.ConnectionIssue.GattDisconnected(status = 0),
            IllegalStateException("disconnect_1"),
            adapter
        )

        assertIs<BleReconnectCoordinator.RecoveryDecision.Retry>(firstDecision)
        advanceTimeBy(firstDecision.delayMillis)
        runCurrent()

        assertEquals(1, factory.created.size)
        val retryTransport = factory.created.first()
        val decision = controller.onConnectionIssue(
            BleReconnectCoordinator.ConnectionIssue.GattDisconnected(status = 0),
            IllegalStateException("disconnect_2"),
            adapter
        )

        assertEquals(BleReconnectCoordinator.RecoveryDecision.Abort, decision)
        val state = controller.state.value
        assertIs<ObdSessionState.Failed>(state)
        assertEquals(1, transport.disconnectCalls)
        assertEquals(1, retryTransport.disconnectCalls)
    }

    @Test
    fun startReturnsPreconditionsMissingWhenEnvironmentNotReady() = runTest(dispatcher) {
        val selector = FakeAdapterSelector()
        val telemetry = RecordingTelemetry()
        val repository = object : BluetoothEnvironmentRepository {
            override fun snapshot(): BluetoothEnvironmentState = BluetoothEnvironmentState(
                permissionStatus = BluetoothPermissionHelper.PermissionStatus.Missing(listOf("perm.bluetooth")),
                bluetoothEnabled = false,
                locationEnabled = true
            )

            override fun status(): BluetoothEnvironmentStatus =
                BluetoothEnvironmentStatus.MissingPermissions(listOf("perm.bluetooth"))
        }
        val useCase = BluetoothPrerequisitesUseCase(repository) { 123L }
        val controller = DefaultObdSessionController(
            dispatchers = dispatchersProvider,
            timeProvider = { testScheduler.currentTime },
            adapterSelector = selector,
            telemetry = telemetry,
            prerequisitesUseCase = useCase
        )
        val transport = FakeTransport()

        val state = controller.start(ObdSessionConfig(scanner = BleScannerConfig.Default), transport)

        val missing = assertIs<ObdSessionState.PreconditionsMissing>(state)
        assertEquals(BluetoothPrerequisiteAction.RequestPermissions(listOf("perm.bluetooth")), missing.result.action)
        assertTrue(selector.startConfigs.isEmpty())
        assertEquals(state, controller.state.value)
        val event = assertIs<ObdSessionTelemetryEvent.PrerequisitesNotMet>(telemetry.events.single())
        assertSame(missing.result, event.result)
    }

    @Test
    fun startWithReadyPrerequisitesProceedsNormally() = runTest(dispatcher) {
        val repository = object : BluetoothEnvironmentRepository {
            override fun snapshot(): BluetoothEnvironmentState = BluetoothEnvironmentState(
                permissionStatus = BluetoothPermissionHelper.PermissionStatus.Granted,
                bluetoothEnabled = true,
                locationEnabled = true
            )

            override fun status(): BluetoothEnvironmentStatus = BluetoothEnvironmentStatus.Ready
        }
        val useCase = BluetoothPrerequisitesUseCase(repository) { 321L }
        val telemetry = RecordingTelemetry()
        val controller = DefaultObdSessionController(
            dispatchers = dispatchersProvider,
            timeProvider = { testScheduler.currentTime },
            telemetry = telemetry,
            prerequisitesUseCase = useCase
        )
        val transport = FakeTransport()

        val state = controller.start(ObdSessionConfig(), transport)

        assertEquals(ObdSessionState.Scanning(attempts = 1), state)
        assertTrue(telemetry.events.first() is ObdSessionTelemetryEvent.SessionStarted)
        assertEquals(0, telemetry.events.count { it is ObdSessionTelemetryEvent.PrerequisitesNotMet })
    }

    private class FakeTransport : ObdTransport {
        private val shared = MutableSharedFlow<TransportFrame>(extraBufferCapacity = 16)
        var disconnectCalls: Int = 0

        override val frames: Flow<TransportFrame> = shared

        override suspend fun connect(): TransportConnectionResult = TransportConnectionResult.Success

        override suspend fun send(frame: TransportFrame): TransportSendResult = TransportSendResult.Delivered

        override suspend fun disconnect() {
            disconnectCalls += 1
        }
    }

    private class CountingTransportFactory : TransportFactory {
        val created = mutableListOf<FakeTransport>()
        val createdDevices = mutableListOf<BleDevice>()

        override suspend fun create(device: BleDevice): ObdTransport {
            val transport = FakeTransport()
            created += transport
            createdDevices += device
            return transport
        }
    }

    private class FakeAdapterSelector : BleAdapterSelector {
        val startConfigs = mutableListOf<BleScannerConfig>()
        var stopCalls: Int = 0
        var latestDeviceResult: ConnectedAdapter? = null

        override suspend fun startScanning(config: BleScannerConfig) {
            startConfigs += config
        }

        override suspend fun stopScanning() {
            stopCalls += 1
        }

        override fun latestDevice(config: BleScannerConfig): ConnectedAdapter? = latestDeviceResult
    }

    private class RecordingTelemetry : ObdSessionTelemetry {
        val events = mutableListOf<ObdSessionTelemetryEvent>()
        override suspend fun record(event: ObdSessionTelemetryEvent) {
            events += event
        }
    }
}
