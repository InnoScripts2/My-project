package com.selfservice.obd.core.protocol

import com.selfservice.obd.core.command.ElmAtCommand
import com.selfservice.obd.core.pid.ObdPidDefinition
import com.selfservice.obd.core.transport.ObdTransport
import com.selfservice.obd.core.transport.TransportSendResult
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.mapNotNull
import kotlinx.coroutines.withTimeout

/**
 * High-level helper that bridges [ObdTransport] with PID/DTC catalogs.
 */
class ElmTransportSession(
    private val transport: ObdTransport,
    private val responseTimeoutMillis: Long = 1_500L,
    private val timeProvider: () -> Long = { System.currentTimeMillis() }
) {

    suspend fun sendAt(command: ElmAtCommand): TransportSendResult {
        val frame = ElmCommandCodec.frameFor(command, timeProvider())
        return transport.send(frame)
    }

    suspend fun requestPid(
        definition: ObdPidDefinition,
        timeoutMillis: Long = responseTimeoutMillis
    ): ObdPidSample? {
        val frame = ObdRequestBuilder.forPid(definition, timeProvider())
        val sendResult = transport.send(frame)
        if (sendResult !is TransportSendResult.Delivered) {
            return null
        }
        return try {
            withTimeout(timeoutMillis) {
                transport.frames
                    .mapNotNull { frameCandidate -> ElmResponseDecoder.parsePid(definition, frameCandidate) }
                    .firstOrNull()
            }
        } catch (_: TimeoutCancellationException) {
            null
        }
    }

    suspend fun readTroubleCodes(timeoutMillis: Long = responseTimeoutMillis): ObdDtcBatch? {
        val frame = ObdRequestBuilder.readTroubleCodes(timeProvider())
        val sendResult = transport.send(frame)
        if (sendResult !is TransportSendResult.Delivered) {
            return null
        }
        return try {
            withTimeout(timeoutMillis) {
                transport.frames
                    .mapNotNull(ElmResponseDecoder::parseDtc)
                    .firstOrNull()
            }
        } catch (_: TimeoutCancellationException) {
            null
        }
    }

    suspend fun clearTroubleCodes(timeoutMillis: Long = responseTimeoutMillis): Boolean {
        val frame = ObdRequestBuilder.clearTroubleCodes(timeProvider())
        val sendResult = transport.send(frame)
        if (sendResult !is TransportSendResult.Delivered) {
            return false
        }
        return try {
            withTimeout(timeoutMillis) {
                transport.frames
                    .map { candidate -> ElmResponseDecoder.asciiString(candidate) }
                    .firstOrNull(ElmResponseDecoder::isClearConfirmation)
            } != null
        } catch (_: TimeoutCancellationException) {
            false
        }
    }
}
