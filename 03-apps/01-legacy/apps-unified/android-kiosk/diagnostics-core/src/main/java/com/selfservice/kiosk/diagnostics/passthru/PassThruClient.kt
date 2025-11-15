package com.selfservice.kiosk.diagnostics.passthru

import com.selfservice.kiosk.diagnostics.core.DiagnosticsErrorCode
import com.selfservice.kiosk.diagnostics.core.DiagnosticsException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import kotlin.time.Duration
import kotlin.time.Duration.Companion.milliseconds

class PassThruClient(
    private val transport: PassThruTransport,
    private val dispatcher: CoroutineDispatcher = Dispatchers.IO
) {
    private val mutex = Mutex()

    private var adapterHandle: AdapterHandle? = null
    private var channelHandle: ChannelHandle? = null

    suspend fun open(adapterId: String, opts: AdapterOptions): AdapterHandle = withContext(dispatcher) {
        mutex.withLock {
            if (adapterHandle != null) {
                throw DiagnosticsException(
                    DiagnosticsErrorCode.CHANNEL_BUSY,
                    "Adapter already open"
                )
            }
            val handle = runCatching { transport.openAdapter(adapterId, opts) }
                .getOrElse { throw mapTransportError("openAdapter", it) }
            adapterHandle = handle
            handle
        }
    }

    suspend fun close() = withContext(dispatcher) {
        mutex.withLock {
            val channel = channelHandle
            val adapter = adapterHandle

            if (channel != null) {
                runCatching { transport.disconnectChannel(channel) }
            }
            if (adapter != null) {
                runCatching { transport.closeAdapter(adapter) }
            }

            channelHandle = null
            adapterHandle = null
        }
    }

    suspend fun establishChannel(request: ChannelRequest): ChannelHandle = withContext(dispatcher) {
        mutex.withLock {
            if (channelHandle != null) {
                throw DiagnosticsException(
                    DiagnosticsErrorCode.CHANNEL_BUSY,
                    "Channel already active"
                )
            }
            val adapter = adapterHandle ?: throw DiagnosticsException(
                DiagnosticsErrorCode.ADAPTER_UNAVAILABLE,
                "Adapter must be opened first"
            )
            val handle = runCatching { transport.connectChannel(adapter, request) }
                .getOrElse { throw mapTransportError("connectChannel", it) }
            channelHandle = handle
            handle
        }
    }

    suspend fun releaseChannel() = withContext(dispatcher) {
        mutex.withLock {
            val handle = channelHandle ?: return@withLock
            runCatching { transport.disconnectChannel(handle) }
            channelHandle = null
        }
    }

    suspend fun send(frames: List<Frame>, timeout: Duration): SendResult = withContext(dispatcher) {
        val channel = mutex.withLock { channelHandle }
            ?: throw DiagnosticsException(
                DiagnosticsErrorCode.ADAPTER_UNAVAILABLE,
                "No active channel"
            )
        val count = withTimeout(timeout) {
            runCatching { transport.write(channel, frames) }
                .getOrElse { throw mapTransportError("write", it) }
        }
        SendResult(count)
    }

    suspend fun receive(maxFrames: Int, timeout: Duration): ReceiveResult = withContext(dispatcher) {
        val channel = mutex.withLock { channelHandle }
            ?: throw DiagnosticsException(
                DiagnosticsErrorCode.ADAPTER_UNAVAILABLE,
                "No active channel"
            )
        val frames = withTimeout(timeout) {
            runCatching { transport.read(channel, maxFrames, timeout.inWholeMilliseconds) }
                .getOrElse { throw mapTransportError("read", it) }
        }
        if (frames.isEmpty()) ReceiveResult.Empty else ReceiveResult.Frames(frames)
    }

    suspend fun setConfig(configs: List<ConfigOption>) = withContext(dispatcher) {
        val channel = mutex.withLock { channelHandle }
            ?: throw DiagnosticsException(
                DiagnosticsErrorCode.ADAPTER_UNAVAILABLE,
                "No active channel"
            )
        runCatching { transport.setConfig(channel, configs) }
            .getOrElse { throw mapTransportError("setConfig", it) }
    }

    suspend fun readBatteryState(): BatteryStatus = withContext(dispatcher) {
        runCatching { transport.readBatteryState() }
            .getOrElse { throw mapTransportError("readBatteryState", it) }
    }

    suspend fun clearDtc(strategy: ClearStrategy): ClearResult {
        val payloadFrame = Frame(strategy.payload, System.currentTimeMillis())
        send(listOf(payloadFrame), strategy.timeout)
        val response = receive(maxFrames = 1, timeout = strategy.timeout)
        return when (response) {
            ReceiveResult.Empty -> ClearResult(success = false)
            is ReceiveResult.Frames -> ClearResult(success = response.frames.firstOrNull()?.payload?.isNotEmpty() == true)
        }
    }

    private fun mapTransportError(operation: String, cause: Throwable): DiagnosticsException {
        val code = when (cause) {
            is DiagnosticsException -> return cause
            is java.net.SocketTimeoutException -> DiagnosticsErrorCode.TIMEOUT
            else -> DiagnosticsErrorCode.TRANSPORT_ERROR
        }
        return DiagnosticsException(
            code,
            "PassThru $operation failed: ${cause.message ?: cause::class.simpleName}",
            cause
        )
    }
}

suspend fun PassThruClient.receiveOrTimeout(maxFrames: Int, timeoutMillis: Long): ReceiveResult =
    receive(maxFrames, timeoutMillis.milliseconds)
