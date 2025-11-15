package com.selfservice.obd.core.passthru

import com.selfservice.core.DispatchersProvider
import com.selfservice.obd.core.transport.ObdTransport
import com.selfservice.obd.core.transport.TransportConnectionResult
import com.selfservice.obd.core.transport.TransportFrame
import com.selfservice.obd.core.transport.TransportSendResult
import kotlin.jvm.Volatile
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeoutOrNull

/** ObdTransport implementation backed by a PassThruNativeBridge channel. */
class PassThruTransport(
        private val bridge: PassThruNativeBridge,
        private val channelConfig: PassThruChannelConfig,
        private val dispatchers: DispatchersProvider,
        private val readTimeoutMillis: Int = DEFAULT_TIMEOUT_MS,
        private val writeTimeoutMillis: Int = DEFAULT_TIMEOUT_MS,
        private val wakeMillivolts: Int = DEFAULT_WAKE_MILLIVOLTS,
        private val autoSetVoltage: Boolean = true,
        private val clock: () -> Long = { System.currentTimeMillis() },
        private val nanoClock: () -> Long = { System.nanoTime() },
        private val idleDelayMillis: Long = DEFAULT_IDLE_DELAY_MS
) : ObdTransport {

    private val connectMutex = Mutex()
    private val framesFlow: MutableSharedFlow<TransportFrame> =
            MutableSharedFlow(replay = 0, extraBufferCapacity = 128)
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + dispatchers.io)

    @Volatile private var channelId: Int = CHANNEL_UNASSIGNED
    @Volatile private var readJob: Job? = null
    @Volatile private var fatalError: Throwable? = null

    override val frames: Flow<TransportFrame> = framesFlow.asSharedFlow()

    val isConnected: Boolean
        get() = channelId != CHANNEL_UNASSIGNED

    override suspend fun connect(): TransportConnectionResult {
        return connectMutex.withLock {
            if (channelId != CHANNEL_UNASSIGNED) {
                return@withLock TransportConnectionResult.Success
            }

            val openResult = bridge.openChannel(channelConfig)
            val openedId =
                    openResult.getOrElse { error ->
                        return@withLock TransportConnectionResult.Failure(error)
                    }

            if (autoSetVoltage) {
                bridge.setReferenceVoltage(openedId, wakeMillivolts).onFailure { error ->
                    bridge.closeChannel(openedId)
                    return@withLock TransportConnectionResult.Failure(error)
                }
            }

            channelId = openedId
            fatalError = null
            startReadLoop(openedId)
            TransportConnectionResult.Success
        }
    }

    override suspend fun send(frame: TransportFrame): TransportSendResult {
        val id = channelId
        if (id == CHANNEL_UNASSIGNED) {
            return TransportSendResult.Failed(IllegalStateException("transport not connected"))
        }
        val message =
                PassThruMessage(
                        channelId = id,
                        protocolId = channelConfig.protocolId,
                        timestampNanos = nanoClock(),
                        flags = 0,
                        payload = frame.payload
                )
        val result = bridge.writeMessage(message, writeTimeoutMillis)
        return result.fold(
                onSuccess = { TransportSendResult.Delivered },
                onFailure = { TransportSendResult.Failed(it) }
        )
    }

    override suspend fun disconnect() {
        connectMutex.withLock {
            val id = channelId
            if (id == CHANNEL_UNASSIGNED) {
                return@withLock
            }
            stopReadLoop()
            bridge.closeChannel(id)
            channelId = CHANNEL_UNASSIGNED
        }
    }

    private fun startReadLoop(id: Int) {
        val job =
                scope.launch(dispatchers.io) {
                    while (isActive) {
                        val result = bridge.readMessage(id, readTimeoutMillis)
                        val message =
                                result.getOrElse { error ->
                                    handleReadFailure(error)
                                    return@launch
                                }
                        if (message == null) {
                            if (idleDelayMillis > 0) {
                                delay(idleDelayMillis)
                            }
                            continue
                        }
                        val frame = TransportFrame(payload = message.payload, timestampMs = clock())
                        framesFlow.tryEmit(frame)
                    }
                }
        readJob = job
    }

    private fun handleReadFailure(error: Throwable) {
        fatalError = error
        scope.launch { disconnect() }
    }

    private suspend fun stopReadLoop() {
        readJob?.cancel(CancellationException("transport disconnect"))
        readJob = null
        delay(0L)
    }

    fun asFlow(): SharedFlow<TransportFrame> = framesFlow.asSharedFlow()

    fun close() {
        scope.cancel()
    }

    suspend fun awaitFrame(
            predicate: (TransportFrame) -> Boolean,
            timeoutMillis: Long
    ): TransportFrame? {
        return withTimeoutOrNull(timeoutMillis) { frames.filter(predicate).firstOrNull() }
    }

    suspend fun sendFrames(frames: Collection<TransportFrame>): TransportSendResult {
        for (frame in frames) {
            val result = send(frame)
            if (result !is TransportSendResult.Delivered) {
                return result
            }
        }
        return TransportSendResult.Delivered
    }

    fun currentError(): Throwable? = fatalError

    class Builder(private val bridge: PassThruNativeBridge) {
        private var channelConfig: PassThruChannelConfig? = null
        private var dispatchers: DispatchersProvider? = null
        private var readTimeoutMillis: Int = DEFAULT_TIMEOUT_MS
        private var writeTimeoutMillis: Int = DEFAULT_TIMEOUT_MS
        private var wakeMillivolts: Int = DEFAULT_WAKE_MILLIVOLTS
        private var autoSetVoltage: Boolean = true
        private var clock: () -> Long = { System.currentTimeMillis() }
        private var nanoClock: () -> Long = { System.nanoTime() }
        private var idleDelayMillis: Long = DEFAULT_IDLE_DELAY_MS

        fun channelConfig(value: PassThruChannelConfig) = apply { channelConfig = value }

        fun dispatchers(value: DispatchersProvider) = apply { dispatchers = value }

        fun readTimeoutMillis(value: Int) = apply { readTimeoutMillis = value }

        fun writeTimeoutMillis(value: Int) = apply { writeTimeoutMillis = value }

        fun wakeMillivolts(value: Int) = apply { wakeMillivolts = value }

        fun autoSetVoltage(value: Boolean) = apply { autoSetVoltage = value }

        fun clock(value: () -> Long) = apply { clock = value }

        fun nanoClock(value: () -> Long) = apply { nanoClock = value }

        fun idleDelayMillis(value: Long) = apply { idleDelayMillis = value }

        fun build(): PassThruTransport {
            val cfg = requireNotNull(channelConfig) { "channelConfig is required" }
            val dispatcherProvider = requireNotNull(dispatchers) { "dispatchers is required" }
            return PassThruTransport(
                    bridge = bridge,
                    channelConfig = cfg,
                    dispatchers = dispatcherProvider,
                    readTimeoutMillis = readTimeoutMillis,
                    writeTimeoutMillis = writeTimeoutMillis,
                    wakeMillivolts = wakeMillivolts,
                    autoSetVoltage = autoSetVoltage,
                    clock = clock,
                    nanoClock = nanoClock,
                    idleDelayMillis = idleDelayMillis
            )
        }
    }

    companion object {
        private const val DEFAULT_TIMEOUT_MS = 250
        private const val DEFAULT_WAKE_MILLIVOLTS = 12_000
        private const val CHANNEL_UNASSIGNED = -1
        private const val DEFAULT_IDLE_DELAY_MS = 5L

        fun builder(bridge: PassThruNativeBridge): Builder = Builder(bridge)
    }
}
