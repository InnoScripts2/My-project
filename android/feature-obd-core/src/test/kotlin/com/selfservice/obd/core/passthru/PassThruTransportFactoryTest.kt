package com.selfservice.obd.core.passthru

import com.selfservice.core.DispatchersProvider
import com.selfservice.obd.core.connection.BleDevice
import com.selfservice.obd.core.transport.TransportConnectionResult
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs
import kotlin.test.assertNotNull
import kotlin.test.assertTrue
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest

private class FactoryDispatchers(private val dispatcher: CoroutineDispatcher) :
        DispatchersProvider {
    override val io: CoroutineDispatcher = dispatcher
    override val computation: CoroutineDispatcher = dispatcher
    override val main: CoroutineDispatcher = dispatcher
}

@OptIn(ExperimentalCoroutinesApi::class)
class PassThruTransportFactoryTest {

    @Test
    fun createBuildsConfiguredTransport() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val dispatchers = FactoryDispatchers(dispatcher)
        val bridge =
                FakePassThruBridge().apply {
                    enqueueRead(Result.failure(IllegalStateException("fatal")))
                }
        val channelConfig = PassThruChannelConfig(protocolId = 7, baudRate = 250_000)
        val device = BleDevice(address = "00:11:22:33:44:55", name = "PassThru", rssi = null)
        val config =
                PassThruTransportFactoryConfig(
                        channelResolver =
                                PassThruChannelConfigResolver(defaultConfig = channelConfig),
                        readTimeoutMillis = 15,
                        writeTimeoutMillis = 20,
                        wakeMillivolts = 13_200,
                        idleDelayMillis = 0,
                        autoSetVoltage = true,
                        clock = { 4242L },
                        nanoClock = { 1010L }
                )
        val factory =
                PassThruTransportFactory(
                        dispatchers = dispatchers,
                        bridgeProvider = { bridge },
                        config = config
                )

        val transport = factory.create(device)

        assertIs<PassThruTransport>(transport)
        val connectResult = transport.connect()
        assertTrue(connectResult is TransportConnectionResult.Success)
        advanceUntilIdle()
        val opened = bridge.openCalls.single()
        assertEquals(channelConfig, opened)
        val voltage = bridge.voltageCalls.single()
        assertEquals(bridge.channelId to 13_200, voltage)
        assertEquals(listOf(bridge.channelId), bridge.closeCalls)
        val error = transport.currentError()
        assertNotNull(error)
        assertEquals("fatal", error.message)
    }

    @Test
    fun usesResolverOverridePerDevice() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val dispatchers = FactoryDispatchers(dispatcher)
        val bridge = FakePassThruBridge()
        val defaultConfig = PassThruChannelConfig(protocolId = 6, baudRate = 500_000)
        val overrideConfig = PassThruChannelConfig(protocolId = 8, baudRate = 250_000)
        val resolver =
                PassThruChannelConfigResolver(
                        defaultConfig = defaultConfig,
                        overrides = mapOf("11:22:33:44:55:66" to overrideConfig)
                )
        val factory =
                PassThruTransportFactory(
                        dispatchers = dispatchers,
                        bridgeProvider = { bridge },
                        config = PassThruTransportFactoryConfig(channelResolver = resolver)
                )
        val device = BleDevice(address = "11:22:33:44:55:66", name = "override", rssi = null)

        val transport = factory.create(device)

        val connectResult = transport.connect()
        assertTrue(connectResult is TransportConnectionResult.Success)
        advanceUntilIdle()
        val opened = bridge.openCalls.single()
        assertEquals(overrideConfig, opened)
    }
}
