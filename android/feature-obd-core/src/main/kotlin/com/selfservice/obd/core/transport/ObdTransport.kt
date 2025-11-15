package com.selfservice.obd.core.transport

import kotlinx.coroutines.flow.Flow

/**
 * Abstraction over a transport channel (BLE, classic BT, PassThru) used by the diagnostic stack.
 */
interface ObdTransport {
    val frames: Flow<TransportFrame>

    suspend fun connect(): TransportConnectionResult
    suspend fun send(frame: TransportFrame): TransportSendResult
    suspend fun disconnect()
}

/**
 * Outgoing or incoming transport frame.
 */
data class TransportFrame(
    val payload: ByteArray,
    val timestampMs: Long = System.currentTimeMillis()
)

sealed interface TransportConnectionResult {
    data object Success : TransportConnectionResult
    data class Failure(val cause: Throwable) : TransportConnectionResult
}

sealed interface TransportSendResult {
    data object Delivered : TransportSendResult
    data class Failed(val cause: Throwable) : TransportSendResult
}
