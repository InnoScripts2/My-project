package com.selfservice.obd.core.transport.ble

import com.selfservice.core.DispatchersProvider
import com.selfservice.obd.core.connection.BleDevice
import com.selfservice.obd.core.transport.TransportConnectionResult
import com.selfservice.obd.core.transport.TransportSendResult
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertContentEquals
import kotlin.test.assertTrue
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import com.selfservice.obd.core.transport.TransportFrame

@OptIn(ExperimentalCoroutinesApi::class)
class BleGattTransportTest {

    private val device = BleDevice(address = "00:11:22:33:44:55", name = "OBD", rssi = -48)
    private val config = BleGattTransportConfig.Default
    @Test
    fun connectEmitsNotifications() = runTest {
        val client = FakeBleGattClient()
        val transport = createTransport(this, client)
        val frames = mutableListOf<ByteArray>()
        var lastTimestamp = -1L
        val collectJob = launch {
            transport.frames.collect { frame ->
                frames += frame.payload
                lastTimestamp = frame.timestampMs
            }
        }
        runCurrent()
        val result = transport.connect()
        runCurrent()
        assertIs<TransportConnectionResult.Success>(result)
        client.emitNotification(byteArrayOf(0x01, 0x02))
        runCurrent()
        assertEquals(1, frames.size)
        assertTrue(lastTimestamp >= 0)
        assertContentEquals(byteArrayOf(0x01, 0x02), frames.first())
        collectJob.cancel()
        transport.disconnect()
    }

    @Test
    fun connectFailurePropagates() = runTest {
        val failure = IllegalStateException("connect")
        val client = FakeBleGattClient(connectionResult = BleGattClient.ConnectionResult.Failure(failure))
        val transport = createTransport(this, client)
        val result = transport.connect()
        val failureResult = assertIs<TransportConnectionResult.Failure>(result)
        assertEquals(failure, failureResult.cause)
        transport.disconnect()
    }

    @Test
    fun sendFailsWhenNotConnected() = runTest {
        val transport = createTransport(this, FakeBleGattClient())
        val result = transport.send(TransportFrame(payload = byteArrayOf(0x00)))
        assertIs<TransportSendResult.Failed>(result)
        transport.disconnect()
    }

    @Test
    fun sendDelegatesToClient() = runTest {
        val client = FakeBleGattClient()
        val transport = createTransport(this, client)
        transport.connect()
        val payload = byteArrayOf(0x10, 0x20)
        val result = transport.send(TransportFrame(payload = payload))
        assertIs<TransportSendResult.Delivered>(result)
        assertEquals(1, client.writeCalls)
        assertContentEquals(payload, client.lastWrite!!)
        transport.disconnect()
    }

    @Test
    fun disconnectClosesTransport() = runTest {
        val client = FakeBleGattClient()
        val transport = createTransport(this, client)
        transport.connect()
        transport.disconnect()
        assertEquals(1, client.disconnectCalls)
        val sendResult = transport.send(TransportFrame(payload = byteArrayOf(0x01)))
        assertIs<TransportSendResult.Failed>(sendResult)
    }

    private fun createTransport(scope: TestScope, client: FakeBleGattClient): BleGattTransport {
        val dispatchers = testDispatchers(scope)
        val transport = BleGattTransport(
            device = device,
            client = client,
            config = config,
            dispatchers = dispatchers,
            timeProvider = { scope.testScheduler.currentTime }
        )
        return transport
    }

    private fun testDispatchers(scope: TestScope): DispatchersProvider {
        val dispatcher = StandardTestDispatcher(scope.testScheduler)
        return object : DispatchersProvider {
            override val io: CoroutineDispatcher = dispatcher
            override val computation: CoroutineDispatcher = dispatcher
            override val main: CoroutineDispatcher = dispatcher
        }
    }

    private class FakeBleGattClient(
        private val connectionResult: BleGattClient.ConnectionResult = BleGattClient.ConnectionResult.Success,
        private val writeResult: BleGattClient.WriteResult = BleGattClient.WriteResult.Success
    ) : BleGattClient {

        private val _notifications = MutableSharedFlow<ByteArray>(extraBufferCapacity = 4)
        var writeCalls: Int = 0
            private set
        var lastWrite: ByteArray? = null
            private set
        var disconnectCalls: Int = 0
            private set

        override val notifications = _notifications

        override suspend fun connect(device: BleDevice, config: BleGattTransportConfig): BleGattClient.ConnectionResult {
            return connectionResult
        }

        override suspend fun write(payload: ByteArray): BleGattClient.WriteResult {
            writeCalls += 1
            lastWrite = payload
            return writeResult
        }

        override suspend fun disconnect() {
            disconnectCalls += 1
        }

        fun emitNotification(payload: ByteArray) {
            _notifications.tryEmit(payload)
        }
    }
}
