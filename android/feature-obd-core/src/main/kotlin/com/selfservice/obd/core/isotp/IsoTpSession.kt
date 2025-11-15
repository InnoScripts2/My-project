package com.selfservice.obd.core.isotp

import com.selfservice.obd.core.transport.ObdTransport
import com.selfservice.obd.core.transport.TransportConnectionResult
import com.selfservice.obd.core.transport.TransportFrame
import com.selfservice.obd.core.transport.TransportSendResult
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.Flow

/** High-level ISO-TP session built on top of an `ObdTransport`. */
class IsoTpSession(
    private val scope: CoroutineScope,
    private val transport: ObdTransport
) {
    private val decoder = IsoTpDecoder(scope, transport.frames) { flowFrame ->
        transport.send(TransportFrame(flowFrame.toCanPayload()))
    }

    fun pdus(): Flow<IsoTpPdu> = decoder.pdus()

    suspend fun connect(): Boolean {
        decoder.start()
        return transport.connect() is TransportConnectionResult.Success
    }

    suspend fun disconnect() {
        decoder.stop()
        transport.disconnect()
    }

    suspend fun send(payload: ByteArray): Boolean {
        val frames = IsoTpEncoder.encode(payload)
        for (frame in frames) {
            val result = transport.send(TransportFrame(frame.toCanPayload()))
            if (result is TransportSendResult.Failed) {
                return false
            }
        }
        return true
    }
}