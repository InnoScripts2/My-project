package com.selfservice.obd.core.isotp

import com.selfservice.obd.core.transport.TransportFrame
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.yield
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

@OptIn(ExperimentalCoroutinesApi::class)
class IsoTpDecoderTest {
    @Test
    fun `single frame emits PDU`() = runTest {
        val frames = MutableSharedFlow<TransportFrame>()
        val decoder = IsoTpDecoder(this, frames)
        decoder.start()
        val emitted = mutableListOf<IsoTpPdu>()
        val job = launch { decoder.pdus().collect { emitted.add(it) } }
        yield()
        val payload = byteArrayOf(0x03, 0x02, 0x01)
        frames.emit(TransportFrame(byteArrayOf((0x00 or payload.size).toByte(), *payload)))
        advanceUntilIdle()
        assertEquals(1, emitted.size)
        job.cancel()
        decoder.stop()
    }

    @Test
    fun `first and consecutive frames emit PDU and trigger flow control`() = runTest {
        val frames = MutableSharedFlow<TransportFrame>()
        val flowRequests = mutableListOf<IsoTpFrame.Flow>()
        val decoder = IsoTpDecoder(this, frames, flowControlSender = { flowRequests += it })
        decoder.start()
        val emitted = mutableListOf<IsoTpPdu>()
        val collectJob = launch { decoder.pdus().collect { emitted.add(it) } }
        yield()

        val fullPayload = ByteArray(10) { it.toByte() }
    val firstBytes = byteArrayOf(0x10.toByte(), 0x0A.toByte()) + fullPayload.copyOfRange(0, 6)
    val consecutive = byteArrayOf(0x21.toByte()) + fullPayload.copyOfRange(6, 10)

        frames.emit(TransportFrame(firstBytes, timestampMs = 100))
        frames.emit(TransportFrame(consecutive, timestampMs = 120))
        advanceUntilIdle()

        assertEquals(1, emitted.size)
        assertTrue(fullPayload.contentEquals(emitted.first().payload))
        assertEquals(1, flowRequests.size)
        assertEquals(IsoTpFrame.FlowStatus.CONTINUE, flowRequests.first().status)

        collectJob.cancel()
        decoder.stop()
    }

    @Test
    fun `sequence mismatch resets assembler`() = runTest {
        val frames = MutableSharedFlow<TransportFrame>()
        val decoder = IsoTpDecoder(this, frames)
        decoder.start()
        val emitted = mutableListOf<IsoTpPdu>()
        val collectJob = launch { decoder.pdus().collect { emitted.add(it) } }
        yield()

        val payload = ByteArray(9) { (it + 1).toByte() }
    val first = byteArrayOf(0x10.toByte(), 0x09.toByte()) + payload.copyOfRange(0, 6)
    val wrongConsecutive = byteArrayOf(0x22.toByte()) + payload.copyOfRange(6, 9)
    val newFirst = byteArrayOf(0x10.toByte(), 0x09.toByte()) + payload.copyOfRange(0, 6)
    val correctConsecutive = byteArrayOf(0x21.toByte()) + payload.copyOfRange(6, 9)

        frames.emit(TransportFrame(first, timestampMs = 0))
        frames.emit(TransportFrame(wrongConsecutive, timestampMs = 10))
        frames.emit(TransportFrame(newFirst, timestampMs = 20))
        frames.emit(TransportFrame(correctConsecutive, timestampMs = 30))
        advanceUntilIdle()

        assertEquals(1, emitted.size)
        assertTrue(payload.contentEquals(emitted.first().payload))

        collectJob.cancel()
        decoder.stop()
    }
}
