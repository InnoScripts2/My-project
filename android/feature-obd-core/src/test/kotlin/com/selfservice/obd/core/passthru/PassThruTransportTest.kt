package com.selfservice.obd.core.passthru

import com.selfservice.core.DispatchersProvider
import com.selfservice.obd.core.transport.TransportConnectionResult
import com.selfservice.obd.core.transport.TransportFrame
import com.selfservice.obd.core.transport.TransportSendResult
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.take
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest

private class TestDispatchersProvider(private val dispatcher: CoroutineDispatcher) :
        DispatchersProvider {
    override val io: CoroutineDispatcher = dispatcher
    override val computation: CoroutineDispatcher = dispatcher
    override val main: CoroutineDispatcher = dispatcher
}

@OptIn(ExperimentalCoroutinesApi::class)
class PassThruTransportTest {
    private val config = PassThruChannelConfig(protocolId = 6, baudRate = 500_000)

    @Test
    fun connectStreamsFramesAndClosesOnFailure() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val provider = TestDispatchersProvider(dispatcher)
        val bridge =
                FakePassThruBridge().apply {
                    reads +=
                            Result.success(
                                    PassThruMessage(
                                            channelId = channelId,
                                            protocolId = config.protocolId,
                                            timestampNanos = 1L,
                                            flags = 0,
                                            payload = byteArrayOf(0x07, 0xE0.toByte())
                                    )
                            )
                    reads += Result.failure(IllegalStateException("read failed"))
                }
        val transport =
                PassThruTransport(
                        bridge = bridge,
                        channelConfig = config,
                        dispatchers = provider,
                        readTimeoutMillis = 10,
                        writeTimeoutMillis = 10,
                        wakeMillivolts = 12_300,
                        clock = { 42L },
                        nanoClock = { 99L },
                        idleDelayMillis = 1
                )

        val result = transport.connect()

        assertTrue(result is TransportConnectionResult.Success)
        val frames = mutableListOf<TransportFrame>()
        val collector =
                launch(start = CoroutineStart.UNDISPATCHED) {
                    transport.asFlow().take(1).toList(frames)
                }
        advanceUntilIdle()
        collector.cancel()
        val frame = frames.singleOrNull()
        assertNotNull(frame)
        assertEquals(42L, frame.timestampMs)
        assertContentEquals(byteArrayOf(0x07, 0xE0.toByte()), frame.payload)
        advanceUntilIdle()
        assertFalse(transport.isConnected)
        assertEquals(listOf(config), bridge.openCalls)
        assertEquals(listOf(bridge.channelId), bridge.closeCalls)
        assertEquals(listOf(bridge.channelId to 12_300), bridge.voltageCalls)
        val error = transport.currentError()
        assertNotNull(error)
        assertEquals("read failed", error.message)
    }

    @Test
    fun streamsMultipleFramesUntilFailure() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val provider = TestDispatchersProvider(dispatcher)
        val first =
                PassThruMessage(
                        channelId = 900,
                        protocolId = config.protocolId,
                        timestampNanos = 1L,
                        flags = 0,
                        payload = byteArrayOf(0x07, 0xE8.toByte())
                )
        val second =
                PassThruMessage(
                        channelId = 900,
                        protocolId = config.protocolId,
                        timestampNanos = 2L,
                        flags = 0,
                        payload = byteArrayOf(0x07, 0xE0.toByte())
                )
        val bridge =
                FakePassThruBridge().apply {
                    channelId = 900
                    enqueueRead(Result.success(first))
                    enqueueRead(Result.success(second))
                    enqueueRead(Result.failure(IllegalStateException("stream failed")))
                }
        val transport =
                PassThruTransport(
                        bridge = bridge,
                        channelConfig = config,
                        dispatchers = provider,
                        readTimeoutMillis = 10,
                        idleDelayMillis = 0,
                        clock = { 777L }
                )
        val frames = mutableListOf<TransportFrame>()
        val collector =
                launch(start = CoroutineStart.UNDISPATCHED) {
                    transport.asFlow().take(2).toList(frames)
                }

        val connectResult = transport.connect()

        assertTrue(connectResult is TransportConnectionResult.Success)
        advanceUntilIdle()
        collector.join()

        assertEquals(2, frames.size)
        assertContentEquals(first.payload, frames[0].payload)
        assertContentEquals(second.payload, frames[1].payload)
        assertEquals(listOf(config), bridge.openCalls)
        advanceUntilIdle()
        assertEquals(listOf(900), bridge.closeCalls)
        val error = transport.currentError()
        assertNotNull(error)
        assertEquals("stream failed", error.message)
        assertFalse(transport.isConnected)
    }

    @Test
    fun sendFramesDelegatesToBridge() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val provider = TestDispatchersProvider(dispatcher)
        val bridge = FakePassThruBridge()
        val transport =
                PassThruTransport(
                        bridge = bridge,
                        channelConfig = config,
                        dispatchers = provider,
                        readTimeoutMillis = 10,
                        writeTimeoutMillis = 15,
                        wakeMillivolts = 11_800,
                        clock = { 100L },
                        nanoClock = { 1_000L },
                        idleDelayMillis = 1
                )
        val frame = TransportFrame(payload = byteArrayOf(0x01, 0x02))
        val connectResult = transport.connect()
        assertTrue(connectResult is TransportConnectionResult.Success)
        advanceUntilIdle()

        val sendResult = transport.sendFrames(listOf(frame))

        assertTrue(sendResult is TransportSendResult.Delivered)
        val recorded = bridge.writeCalls.single()
        assertEquals(15, recorded.second)
        assertContentEquals(frame.payload, recorded.first.payload)
        assertEquals(config.protocolId, recorded.first.protocolId)
        assertEquals(bridge.channelId, recorded.first.channelId)
    }

    @Test
    fun sendFailsWhenNotConnected() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val provider = TestDispatchersProvider(dispatcher)
        val bridge = FakePassThruBridge()
        val transport =
                PassThruTransport(
                        bridge = bridge,
                        channelConfig = config,
                        dispatchers = provider,
                        idleDelayMillis = 1
                )

        val result = transport.send(TransportFrame(byteArrayOf(0x00)))

        assertTrue(result is TransportSendResult.Failed)
    }

    @Test
    fun sendFramesPropagatesWriteFailure() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val provider = TestDispatchersProvider(dispatcher)
        val bridge =
                FakePassThruBridge().apply {
                    writeResult = Result.failure(IllegalStateException("write boom"))
                }
        val transport =
                PassThruTransport(
                        bridge = bridge,
                        channelConfig = config,
                        dispatchers = provider,
                        idleDelayMillis = 1
                )

        val connectResult = transport.connect()
        assertTrue(connectResult is TransportConnectionResult.Success)
        advanceUntilIdle()

        val sendResult = transport.sendFrames(listOf(TransportFrame(byteArrayOf(0x10))))

        val failed = sendResult as TransportSendResult.Failed
        assertEquals("write boom", failed.cause.message)
        assertEquals(1, bridge.writeCalls.size)
    }

    @Test
    fun reconnectsAfterDisconnect() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val provider = TestDispatchersProvider(dispatcher)
        val bridge = FakePassThruBridge()
        val transport =
                PassThruTransport(
                        bridge = bridge,
                        channelConfig = config,
                        dispatchers = provider,
                        idleDelayMillis = 1
                )

        val firstConnect = transport.connect()
        assertTrue(firstConnect is TransportConnectionResult.Success)
        advanceUntilIdle()

        transport.disconnect()
        advanceUntilIdle()
        assertEquals(listOf(bridge.channelId), bridge.closeCalls)

        val secondConnect = transport.connect()
        assertTrue(secondConnect is TransportConnectionResult.Success)
        advanceUntilIdle()

        assertEquals(2, bridge.openCalls.size)
        assertEquals(listOf(bridge.channelId, bridge.channelId), bridge.closeCalls)
    }
}
