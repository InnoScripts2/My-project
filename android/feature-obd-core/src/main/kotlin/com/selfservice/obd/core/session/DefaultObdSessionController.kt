package com.selfservice.obd.core.session

import com.selfservice.core.DispatchersProvider
import com.selfservice.obd.core.connection.BleAdapterSelector
import com.selfservice.obd.core.connection.BleScannerConfig
import com.selfservice.obd.core.connection.TransportFactory
import com.selfservice.core.permissions.BluetoothPrerequisiteAction
import com.selfservice.obd.core.platform.BluetoothPrerequisitesUseCase
import com.selfservice.obd.core.recovery.BleReconnectCoordinator
import com.selfservice.obd.core.session.telemetry.ObdSessionTelemetry
import com.selfservice.obd.core.session.telemetry.ObdSessionTelemetryEvent
import com.selfservice.obd.core.transport.ObdTransport
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.plus
import kotlin.jvm.Volatile
import kotlinx.coroutines.Job

/**
 * Default session controller that bridges BLE session state machine phases to public OBD session states.
 */
class DefaultObdSessionController(
    private val dispatchers: DispatchersProvider,
    private val timeouts: BleSessionStateMachine.SessionTimeouts = BleSessionStateMachine.SessionTimeouts(),
    private val reconnectCoordinator: BleReconnectCoordinator = BleReconnectCoordinator(),
    private val timeProvider: () -> Long = { System.currentTimeMillis() },
    private val adapterSelector: BleAdapterSelector = BleAdapterSelector.Empty,
    private val telemetry: ObdSessionTelemetry = ObdSessionTelemetry.NoOp,
    private val prerequisitesUseCase: BluetoothPrerequisitesUseCase? = null
) : ObdSessionController {

    private val scope: CoroutineScope = CoroutineScope(SupervisorJob()) + dispatchers.io
    private val _state = MutableStateFlow<ObdSessionState>(ObdSessionState.Idle)

    @Volatile
    private var activeTransport: ObdTransport? = null
    @Volatile
    private var currentAdapter: ConnectedAdapter? = null
    @Volatile
    private var lastFailure: Throwable? = null
    private var retryJob: Job? = null
    private var lastConfig: ObdSessionConfig? = null
    @Volatile
    private var transportFactory: TransportFactory? = null
    @Volatile
    private var lastKnownAdapter: ConnectedAdapter? = null
    @Volatile
    private var sessionStartMillis: Long = 0L
    @Volatile
    private var scannerActive: Boolean = false

    private val sessionObserver = object : BleSessionStateMachine.SessionObserver {
        override fun onStateChanged(
            previous: BleSessionStateMachine.StateSnapshot,
            current: BleSessionStateMachine.StateSnapshot,
            durationMillis: Long
        ) {
            _state.value = mapSnapshot(current)
        }
    }

    private val stateMachine = BleSessionStateMachine(
        scope = scope,
        timeouts = timeouts,
        observer = sessionObserver,
        timeProvider = timeProvider
    )

    init {
        _state.value = mapSnapshot(stateMachine.state.value)
    }

    override val state: StateFlow<ObdSessionState> = _state.asStateFlow()

    override suspend fun start(config: ObdSessionConfig, transport: ObdTransport): ObdSessionState {
        if (stateMachine.state.value.phase != BleSessionStateMachine.Phase.IDLE) {
            throw IllegalStateException("Session already running")
        }

        prerequisitesUseCase?.let { useCase ->
            val prerequisites = useCase.evaluate()
            if (prerequisites.action != BluetoothPrerequisiteAction.Ready) {
                telemetry.record(
                    ObdSessionTelemetryEvent.PrerequisitesNotMet(
                        result = prerequisites,
                        timestampMillis = timeProvider()
                    )
                )
                _state.value = ObdSessionState.PreconditionsMissing(prerequisites)
                return _state.value
            }
        }
        retryJob?.cancel()
        retryJob = null
        lastConfig = config
        transportFactory = config.transportFactory
        activeTransport = transport
        currentAdapter = config.initialAdapter
        lastKnownAdapter = config.initialAdapter
        lastFailure = null
        config.initialAdapter?.let {
            telemetry.record(
                ObdSessionTelemetryEvent.AdapterSelected(
                    adapter = it,
                    attempt = 1,
                    timestampMillis = timeProvider()
                )
            )
        }
        val startTimestamp = timeProvider()
        sessionStartMillis = startTimestamp
        telemetry.record(
            ObdSessionTelemetryEvent.SessionStarted(
                attempt = 1,
                config = config,
                timestampMillis = startTimestamp
            )
        )
        adapterSelector.startScanning(config.scanner)
        markScannerStarted(config.scanner)
        stateMachine.startSession(attempt = 1)
        return _state.value
    }

    override suspend fun onTransportReady(adapter: ConnectedAdapter) {
        ensureActiveSession()
        currentAdapter = adapter
        lastKnownAdapter = adapter
        telemetry.record(
            ObdSessionTelemetryEvent.AdapterReady(
                adapter = adapter,
                attempt = stateMachine.state.value.attempt,
                timestampMillis = timeProvider()
            )
        )
        stateMachine.onTransportReady()
    }

    override suspend fun onHandshakeCompleted() {
        ensureActiveSession()
        currentAdapter?.let {
            telemetry.record(
                ObdSessionTelemetryEvent.HandshakeCompleted(
                    adapter = it,
                    attempt = stateMachine.state.value.attempt,
                    timestampMillis = timeProvider()
                )
            )
        }
        stateMachine.onHandshakeCompleted()
    }

    override suspend fun beginDiagnostics() {
        ensureActiveSession()
        currentAdapter?.let {
            telemetry.record(
                ObdSessionTelemetryEvent.DiagnosticsStarted(
                    adapter = it,
                    attempt = stateMachine.state.value.attempt,
                    timestampMillis = timeProvider()
                )
            )
        }
        stateMachine.beginDiagnostics()
    }

    override suspend fun recordDiagnosticsHeartbeat() {
        ensureActiveSession()
        currentAdapter?.let {
            telemetry.record(
                ObdSessionTelemetryEvent.DiagnosticsHeartbeat(
                    adapter = it,
                    timestampMillis = timeProvider()
                )
            )
        }
        stateMachine.recordDiagnosticsHeartbeat()
    }

    override suspend fun completeSuccessfully() {
        ensureActiveSession()
        retryJob?.cancel()
        retryJob = null
        val adapter = lastKnownAdapter
        reconnectCoordinator.registerSuccess()
        stateMachine.completeSuccessfully()
        disconnectActiveTransport()
        currentAdapter = null
        lastKnownAdapter = null
        stopScanner()
        telemetry.record(
            ObdSessionTelemetryEvent.SessionCompleted(
                adapter = adapter,
                durationMillis = computeSessionDuration(),
                timestampMillis = timeProvider()
            )
        )
        sessionStartMillis = 0L
    }

    override suspend fun fail(cause: Throwable) {
        ensureActiveSession()
        retryJob?.cancel()
        retryJob = null
        val adapter = lastKnownAdapter
        lastFailure = cause
        stateMachine.fail(cause.message ?: cause::class.simpleName ?: "session_failed")
        disconnectActiveTransport()
        currentAdapter = null
        lastKnownAdapter = null
        stopScanner()
        telemetry.record(
            ObdSessionTelemetryEvent.SessionFailed(
                adapter = adapter,
                cause = cause,
                durationMillis = computeSessionDuration(),
                timestampMillis = timeProvider()
            )
        )
        sessionStartMillis = 0L
    }

    override suspend fun cancel() {
        retryJob?.cancel()
        retryJob = null
        reconnectCoordinator.registerSuccess()
        disconnectActiveTransport()
        lastFailure = null
        currentAdapter = null
        val adapter = lastKnownAdapter
        lastKnownAdapter = null
        stopScanner()
        telemetry.record(
            ObdSessionTelemetryEvent.SessionCancelled(
                adapter = adapter,
                durationMillis = computeSessionDuration(),
                timestampMillis = timeProvider()
            )
        )
        sessionStartMillis = 0L
        if (stateMachine.state.value.phase != BleSessionStateMachine.Phase.IDLE) {
            stateMachine.reset()
        }
    }

    override suspend fun onConnectionIssue(
        issue: BleReconnectCoordinator.ConnectionIssue,
        cause: Throwable?,
        adapter: ConnectedAdapter?
    ): BleReconnectCoordinator.RecoveryDecision {
        ensureActiveSession()
        retryJob?.cancel()
        retryJob = null
        val decision = reconnectCoordinator.nextAction(issue)
        val failure = cause ?: SessionFailureException(issue.type.name.lowercase())
        lastFailure = failure
        stateMachine.fail(issue.type.name.lowercase())
        val adapterToUse = adapter ?: currentAdapter ?: lastKnownAdapter
        telemetry.record(
            ObdSessionTelemetryEvent.ConnectionIssue(
                issue = issue,
                cause = cause,
                adapter = adapterToUse,
                timestampMillis = timeProvider()
            )
        )
        telemetry.record(
            ObdSessionTelemetryEvent.SessionFailed(
                adapter = adapterToUse,
                cause = failure,
                durationMillis = computeSessionDuration(),
                timestampMillis = timeProvider()
            )
        )
        sessionStartMillis = 0L
        if (adapterToUse != null) {
            lastKnownAdapter = adapterToUse
        }
        when (decision) {
            is BleReconnectCoordinator.RecoveryDecision.Retry -> {
                disconnectActiveTransport()
                currentAdapter = null
                scheduleRetry(decision, adapterToUse)
            }
            BleReconnectCoordinator.RecoveryDecision.Abort,
            BleReconnectCoordinator.RecoveryDecision.Escalate -> {
                disconnectActiveTransport()
                currentAdapter = null
                stopScanner()
            }
        }
        return decision
    }

    private fun ensureActiveSession() {
        if (stateMachine.state.value.phase == BleSessionStateMachine.Phase.IDLE) {
            throw IllegalStateException("Session not started")
        }
    }

    private fun mapSnapshot(snapshot: BleSessionStateMachine.StateSnapshot): ObdSessionState {
        val adapter = currentAdapter
        return when (snapshot.phase) {
            BleSessionStateMachine.Phase.IDLE -> ObdSessionState.Idle
            BleSessionStateMachine.Phase.CONNECTING -> adapter?.let { ObdSessionState.Connecting(it.device) }
                ?: ObdSessionState.Scanning(snapshot.attempt)
            BleSessionStateMachine.Phase.HANDSHAKE -> adapter?.let { ObdSessionState.Connecting(it.device) }
                ?: ObdSessionState.Scanning(snapshot.attempt)
            BleSessionStateMachine.Phase.READY -> adapter?.let { ObdSessionState.Ready(it.device) }
                ?: ObdSessionState.Scanning(snapshot.attempt)
            BleSessionStateMachine.Phase.DIAGNOSTICS -> adapter?.let { ObdSessionState.Diagnostics(it.device) }
                ?: ObdSessionState.Scanning(snapshot.attempt)
            BleSessionStateMachine.Phase.COMPLETED -> ObdSessionState.Completed
            BleSessionStateMachine.Phase.FAILED -> {
                val failure = lastFailure ?: snapshot.cause?.let { SessionFailureException(it) }
                    ?: SessionFailureException("session_failed")
                ObdSessionState.Failed(failure)
            }
        }
    }

    private suspend fun disconnectActiveTransport() {
        activeTransport?.let {
            activeTransport = null
            it.disconnect()
        }
    }

    private fun scheduleRetry(
        decision: BleReconnectCoordinator.RecoveryDecision.Retry,
        adapter: ConnectedAdapter?
    ) {
        val config = lastConfig ?: return
        retryJob = scope.launch {
            val delayMillis = decision.delayMillis.coerceAtLeast(0L)
            if (delayMillis > 0L) {
                delay(delayMillis)
            }
            stateMachine.reset()
            val nextAttempt = decision.attempt + 1
            stateMachine.startSession(nextAttempt)
            val attemptStartedAt = timeProvider()
            sessionStartMillis = attemptStartedAt
            telemetry.record(
                ObdSessionTelemetryEvent.SessionStarted(
                    attempt = nextAttempt,
                    config = config,
                    timestampMillis = attemptStartedAt
                )
            )
            val adapterForAttempt = adapter
                ?: config.initialAdapter
                ?: adapterSelector.latestDevice(config.scanner)
            if (adapterForAttempt != null) {
                currentAdapter = adapterForAttempt
                lastKnownAdapter = adapterForAttempt
                telemetry.record(
                    ObdSessionTelemetryEvent.AdapterSelected(
                        adapter = adapterForAttempt,
                        attempt = nextAttempt,
                        timestampMillis = timeProvider()
                    )
                )
                val factory = transportFactory
                if (factory != null) {
                    try {
                        activeTransport = factory.create(adapterForAttempt.device)
                    } catch (failure: Throwable) {
                        lastFailure = failure
                        stateMachine.fail(failure.message ?: "transport_factory_failure")
                        telemetry.record(
                            ObdSessionTelemetryEvent.SessionFailed(
                                adapter = adapterForAttempt,
                                cause = failure,
                                durationMillis = computeSessionDuration(),
                                timestampMillis = timeProvider()
                            )
                        )
                        sessionStartMillis = 0L
                        return@launch
                    }
                }
            } else {
                currentAdapter = null
            }
            _state.value = mapSnapshot(stateMachine.state.value)
            telemetry.record(
                ObdSessionTelemetryEvent.RetryScheduled(
                    decision = decision,
                    adapter = adapterForAttempt,
                    timestampMillis = timeProvider()
                )
            )
        }
    }

    private suspend fun stopScanner() {
        if (!scannerActive) return
        scannerActive = false
        try {
            adapterSelector.stopScanning()
        } catch (_: Throwable) {
            // Ignore scanner stop failures; session cleanup proceeds regardless.
        }
        telemetry.record(
            ObdSessionTelemetryEvent.ScannerStopped(
                timestampMillis = timeProvider()
            )
        )
    }

    private suspend fun markScannerStarted(config: BleScannerConfig) {
        if (scannerActive) return
        scannerActive = true
        telemetry.record(
            ObdSessionTelemetryEvent.ScannerStarted(
                config = config,
                timestampMillis = timeProvider()
            )
        )
    }

    private fun computeSessionDuration(): Long {
        val startedAt = sessionStartMillis
        if (startedAt <= 0L) return 0L
        val now = timeProvider()
        return (now - startedAt).coerceAtLeast(0L)
    }

}

class SessionFailureException(message: String) : IllegalStateException(message)
