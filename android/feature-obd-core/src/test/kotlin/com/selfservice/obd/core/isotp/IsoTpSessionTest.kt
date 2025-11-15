package com.selfservice.obd.core.isotp

import com.selfservice.obd.core.transport.ObdTransport
import com.selfservice.obd.core.transport.TransportConnectionResult
import com.selfservice.obd.core.transport.TransportFrame
import com.selfservice.obd.core.transport.TransportSendResult
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.yield
import kotlin.test.AfterTest
import kotlin.test.BeforeTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class IsoTpSessionTest {
    private val scope = CoroutineScope(Dispatchers.Unconfined + Job())
    private lateinit var transport: FakeTransport
    private lateinit var session: IsoTpSession

    @BeforeTest
    fun setUp() {
        transport = FakeTransport()
        session = IsoTpSession(scope, transport)
    }

    @AfterTest
    fun tearDown() {
        scope.cancel()
    }

    @Test
    fun `connect starts decoder and propagates transport success`() = runBlocking {
        assertTrue(session.connect())
        session.disconnect()
    }

    @Test
    fun `send aborts when transport fails`() = runBlocking {
        transport.failOnSend = true
        val result = session.send(byteArrayOf(0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08))
        assertFalse(result)
    }

    @Test
    fun `incoming first frame triggers flow control response`() = runBlocking {
        assertTrue(session.connect())
        val firstFrame = byteArrayOf(0x10.toByte(), 0x09.toByte(), 0x00, 0x01, 0x02, 0x03, 0x04, 0x05)
        transport.emitIncoming(TransportFrame(firstFrame, timestampMs = 0))
        yield()
        assertTrue(transport.sentFrames.isNotEmpty())
        val flowFrame = transport.sentFrames.last()
        assertEquals(0x30, flowFrame.payload[0].toInt() and 0xF0)
        session.disconnect()
    }

    private class FakeTransport : ObdTransport {
        private val framesFlow = MutableSharedFlow<TransportFrame>(extraBufferCapacity = 8)
        var failOnSend: Boolean = false
        val sentFrames = mutableListOf<TransportFrame>()

        override val frames: Flow<TransportFrame> = framesFlow

        override suspend fun connect(): TransportConnectionResult = TransportConnectionResult.Success

        override suspend fun send(frame: TransportFrame): TransportSendResult {
            sentFrames += frame
            return if (failOnSend) {
                TransportSendResult.Failed(IllegalStateException("send failed"))
            } else {
                TransportSendResult.Delivered
            }
        }

        override suspend fun disconnect() {}

        suspend fun emitIncoming(frame: TransportFrame) {
            framesFlow.emit(frame)
        }
    }
}
