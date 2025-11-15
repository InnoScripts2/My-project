package com.selfservice.obd.core.transport.ble

import com.selfservice.core.DispatchersProvider
import com.selfservice.obd.core.connection.BleDevice
import com.selfservice.obd.core.transport.ObdTransport
import com.selfservice.obd.core.transport.TransportConnectionResult
import com.selfservice.obd.core.transport.TransportFrame
import com.selfservice.obd.core.transport.TransportSendResult
import java.util.concurrent.atomic.AtomicReference
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.plus
import kotlinx.coroutines.withTimeout

/**
 * Bluetooth GATT backed implementation of [ObdTransport].
 */
class BleGattTransport(
    private val device: BleDevice,
    private val client: BleGattClient,
    private val config: BleGattTransportConfig,
    private val dispatchers: DispatchersProvider,
    private val timeProvider: () -> Long = { System.currentTimeMillis() }
) : ObdTransport {

    private enum class LifecycleState { Idle, Connecting, Connected, Closed }

    private val lifecycle = AtomicReference(LifecycleState.Idle)
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob()) + dispatchers.io
    private val framesFlow = MutableSharedFlow<TransportFrame>(extraBufferCapacity = config.frameBufferCapacity)
    private var notificationsJob: Job? = null

    override val frames: Flow<TransportFrame> = framesFlow.asSharedFlow()

    override suspend fun connect(): TransportConnectionResult {
        return when (lifecycle.get()) {
            LifecycleState.Closed -> TransportConnectionResult.Failure(IllegalStateException("transport_closed"))
            LifecycleState.Connected -> TransportConnectionResult.Success
            LifecycleState.Connecting -> TransportConnectionResult.Failure(IllegalStateException("connection_in_progress"))
            LifecycleState.Idle -> attemptConnection()
        }
    }

    override suspend fun send(frame: TransportFrame): TransportSendResult {
        if (lifecycle.get() != LifecycleState.Connected) {
            return TransportSendResult.Failed(IllegalStateException("transport_not_connected"))
        }
        return try {
            when (val result = client.write(frame.payload)) {
                BleGattClient.WriteResult.Success -> TransportSendResult.Delivered
                is BleGattClient.WriteResult.Failure -> TransportSendResult.Failed(result.cause)
            }
        } catch (failure: Throwable) {
            TransportSendResult.Failed(failure)
        }
    }

    override suspend fun disconnect() {
        if (lifecycle.getAndSet(LifecycleState.Closed) == LifecycleState.Closed) {
            return
        }
        val job = notificationsJob
        notificationsJob = null
        job?.cancelAndJoin()
        runCatching { client.disconnect() }
        scope.cancel()
    }

    private suspend fun attemptConnection(): TransportConnectionResult {
        if (!lifecycle.compareAndSet(LifecycleState.Idle, LifecycleState.Connecting)) {
            return connect()
        }
        val connection = try {
            if (config.connectTimeoutMs > 0) {
                withTimeout(config.connectTimeoutMs) { client.connect(device, config) }
            } else {
                client.connect(device, config)
            }
        } catch (failure: Throwable) {
            lifecycle.set(LifecycleState.Idle)
            return TransportConnectionResult.Failure(failure)
        }
        return when (connection) {
            BleGattClient.ConnectionResult.Success -> {
                lifecycle.set(LifecycleState.Connected)
                startNotificationCollector()
                TransportConnectionResult.Success
            }
            is BleGattClient.ConnectionResult.Failure -> {
                lifecycle.set(LifecycleState.Idle)
                TransportConnectionResult.Failure(connection.cause)
            }
        }
    }

    private fun startNotificationCollector() {
        notificationsJob?.cancel()
        notificationsJob = scope.launch {
            client.notifications.collect { payload ->
                val frame = TransportFrame(payload.copyOf(), timeProvider())
                framesFlow.emit(frame)
            }
        }
    }
}
