package com.selfservice.obd.core.protocol

import com.selfservice.obd.core.pid.PidCatalog
import com.selfservice.obd.core.transport.ObdTransport
import com.selfservice.obd.core.transport.TransportConnectionResult
import com.selfservice.obd.core.transport.TransportFrame
import com.selfservice.obd.core.transport.TransportSendResult
import java.nio.charset.StandardCharsets
import java.util.ArrayDeque
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertTrue
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.runTest

class ElmTransportSessionTest {

    @Test
    fun `requestPid emits decoded sample`() = runTest {
        val transport = FakeTransport()
        val session = ElmTransportSession(transport, responseTimeoutMillis = 200L, timeProvider = { 10L })
        val definition = requireNotNull(PidCatalog.find("0x01", "0x0C"))
        transport.enqueueResponse(frame("41 0C 1A F8\r>", timestamp = 20L))

        val sample = session.requestPid(definition)
        assertNotNull(sample)
        assertEquals(1_726.0, sample.value ?: error("value expected"), 0.01)
    }

    @Test
    fun `readTroubleCodes resolves entries`() = runTest {
        val transport = FakeTransport()
        val session = ElmTransportSession(transport, responseTimeoutMillis = 200L, timeProvider = { 30L })
        transport.enqueueResponse(frame("43 01 33 00 00 00\r>", timestamp = 40L))

        val batch = session.readTroubleCodes()
        assertNotNull(batch)
        assertTrue(batch.entries.any { it.code == "P0133" })
    }

    @Test
    fun `clearTroubleCodes waits for confirmation`() = runTest {
        val transport = FakeTransport()
        val session = ElmTransportSession(transport, responseTimeoutMillis = 200L, timeProvider = { 50L })
        transport.enqueueResponse(frame("44 00 00\r>", timestamp = 60L))

        assertTrue(session.clearTroubleCodes())
    }

    private fun frame(response: String, timestamp: Long): TransportFrame {
        return TransportFrame(response.toByteArray(StandardCharsets.US_ASCII), timestamp)
    }

    private class FakeTransport : ObdTransport {
    private val responses = ArrayDeque<TransportFrame>()
    private val shared = MutableSharedFlow<TransportFrame>(replay = 1, extraBufferCapacity = 8)

        override val frames: Flow<TransportFrame> = shared

        override suspend fun connect(): TransportConnectionResult = TransportConnectionResult.Success

        override suspend fun send(frame: TransportFrame): TransportSendResult {
            val response = if (responses.isEmpty()) null else responses.removeFirst()
            if (response != null) {
                shared.emit(response)
            }
            return TransportSendResult.Delivered
        }

        override suspend fun disconnect() {
            // no-op for tests
        }

        fun enqueueResponse(frame: TransportFrame) {
            responses.addLast(frame)
        }
    }
}
