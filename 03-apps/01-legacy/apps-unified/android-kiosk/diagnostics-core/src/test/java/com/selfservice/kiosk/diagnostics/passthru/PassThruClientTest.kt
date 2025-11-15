package com.selfservice.kiosk.diagnostics.passthru

import com.selfservice.kiosk.diagnostics.core.DiagnosticsErrorCode
import com.selfservice.kiosk.diagnostics.core.DiagnosticsException
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runTest
import kotlin.time.Duration.Companion.milliseconds
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull

@OptIn(ExperimentalCoroutinesApi::class)
class PassThruClientTest {

    private fun transport() = object : PassThruTransport {
        var openedHandle: AdapterHandle? = null
        var connectedChannel: ChannelHandle? = null

        override suspend fun openAdapter(adapterId: String, options: AdapterOptions): AdapterHandle {
            openedHandle = AdapterHandle(adapterId)
            return openedHandle!!
        }

        override suspend fun closeAdapter(handle: AdapterHandle) {
            openedHandle = null
        }

        override suspend fun connectChannel(handle: AdapterHandle, request: ChannelRequest): ChannelHandle {
            connectedChannel = ChannelHandle(1)
            return connectedChannel!!
        }

        override suspend fun disconnectChannel(channel: ChannelHandle) {
            connectedChannel = null
        }

        override suspend fun write(channel: ChannelHandle, frames: List<Frame>): Int = frames.size

        override suspend fun read(channel: ChannelHandle, maxFrames: Int, timeoutMillis: Long): List<Frame> = emptyList()

        override suspend fun setConfig(channel: ChannelHandle, configs: List<ConfigOption>) = Unit

        override suspend fun readBatteryState(): BatteryStatus = BatteryStatus(12.2f)
    }

    @Test
    fun `open establishes adapter and channel lifecycle`() = runTest {
        val transport = transport()
        val client = PassThruClient(transport)

        val adapter = client.open("adapter", AdapterOptions(protocol = "CAN", baudRate = 500_000))
        assertEquals("adapter", adapter.adapterId)

        val channel = client.establishChannel(
            ChannelRequest(
                flags = 0,
                protocolId = 6,
                txHeader = 0x7E0,
                rxHeader = 0x7E8
            )
        )
        assertEquals(1, channel.channelId)

        val sendResult = client.send(listOf(Frame(byteArrayOf(0x01), 0)), timeout = 500.milliseconds)
        assertEquals(1, sendResult.framesSent)

        client.releaseChannel()
        client.close()
    }

    @Test
    fun `open fails when adapter already present`() = runTest {
        val transport = transport()
        val client = PassThruClient(transport)
        client.open("adapter", AdapterOptions(protocol = "CAN", baudRate = 500_000))
        val failure = runCatching { client.open("adapter", AdapterOptions(protocol = "CAN", baudRate = 500_000)) }
            .exceptionOrNull()
        val exception = failure as? DiagnosticsException
        assertNotNull(exception)
        assertEquals(DiagnosticsErrorCode.CHANNEL_BUSY, exception.code)
    }
}