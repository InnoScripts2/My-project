package com.selfservice.obd.core.passthru

import com.selfservice.core.DispatchersProvider
import com.selfservice.obd.core.connection.BleScannerConfig
import com.selfservice.obd.core.session.ConnectedAdapter
import com.selfservice.obd.core.transport.TransportConnectionResult
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertSame
import kotlin.test.assertTrue
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest

private class ConfigDispatchers(private val dispatcher: CoroutineDispatcher) : DispatchersProvider {
    override val io: CoroutineDispatcher = dispatcher
    override val computation: CoroutineDispatcher = dispatcher
    override val main: CoroutineDispatcher = dispatcher
}

@OptIn(ExperimentalCoroutinesApi::class)
class PassThruSessionConfigFactoryTest {

    @Test
    fun createUsesDefaultsWhenNotOverridden() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val dispatchers = ConfigDispatchers(dispatcher)
        val bridge = FakePassThruBridge()
        val factory =
                PassThruSessionConfigFactory(dispatchers = dispatchers, bridgeProvider = { bridge })

        val config = factory.create()

        assertEquals(BleScannerConfig.Default, config.scanner)
        assertEquals(3, config.retryCount)
        assertEquals(2_000L, config.reconnectDelayMs)
        assertSame(factory.transportFactory(), config.transportFactory)
    }

    @Test
    fun createUsesProvidedOverrides() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val dispatchers = ConfigDispatchers(dispatcher)
        val bridge = FakePassThruBridge()
        val customScanner =
                BleScannerConfig(
                        targetSerialPattern = Regex("Adapter.*"),
                        serviceUuids = listOf("pass:thru"),
                        timeoutMs = 20_000L
                )
        val adapter =
                ConnectedAdapter(
                        device =
                                com.selfservice.obd.core.connection.BleDevice(
                                        address = "AA:BB:CC:DD:EE:01",
                                        name = "Passthru",
                                        rssi = null
                                ),
                        protocol = "J2534"
                )
        val transportConfig =
                PassThruTransportFactoryConfig(
                        channelResolver =
                                PassThruChannelConfigResolver(
                                        defaultConfig =
                                                PassThruChannelConfig(
                                                        protocolId = 8,
                                                        baudRate = 250_000
                                                )
                                ),
                        readTimeoutMillis = 400,
                        writeTimeoutMillis = 350,
                        wakeMillivolts = 13_000,
                        idleDelayMillis = 10
                )
        val factory =
                PassThruSessionConfigFactory(
                        dispatchers = dispatchers,
                        bridgeProvider = { bridge },
                        transportConfig = transportConfig,
                        defaultScanner = customScanner,
                        retryCount = 5,
                        reconnectDelayMs = 3_500L
                )

        val config = factory.create(initialAdapter = adapter)

        assertEquals(customScanner, config.scanner)
        assertEquals(5, config.retryCount)
        assertEquals(3_500L, config.reconnectDelayMs)
        assertEquals(adapter, config.initialAdapter)
        val transportFactory = config.transportFactory
        assertNotNull(transportFactory)
        val transport = transportFactory!!.create(adapter.device)
        assertTrue(transport is PassThruTransport)
        val connectResult = transport.connect()
        assertTrue(connectResult is TransportConnectionResult.Success)
        advanceUntilIdle()
    }

    @Test
    fun prepareSessionReturnsBootstrap() = runTest {
        val dispatcher = StandardTestDispatcher(testScheduler)
        val dispatchers = ConfigDispatchers(dispatcher)
        val bridge = FakePassThruBridge()
        val adapter =
                ConnectedAdapter(
                        device =
                                com.selfservice.obd.core.connection.BleDevice(
                                        address = "00:11:22:33:44:55",
                                        name = "Passthru",
                                        rssi = null
                                ),
                        protocol = "J2534"
                )
        val scanner = BleScannerConfig.Default
        val factory =
                PassThruSessionConfigFactory(dispatchers = dispatchers, bridgeProvider = { bridge })

        val bootstrap = factory.prepareSession(adapter = adapter, scannerConfig = scanner)

        assertEquals(adapter, bootstrap.config.initialAdapter)
        assertEquals(scanner, bootstrap.config.scanner)
        assertSame(factory.transportFactory(), bootstrap.config.transportFactory)
        assertTrue(bootstrap.transport is PassThruTransport)
        val connectResult = bootstrap.transport.connect()
        assertTrue(connectResult is TransportConnectionResult.Success)
        advanceUntilIdle()
    }
}
