package com.selfservice.obd.core.connection

import com.selfservice.core.DispatchersProvider
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest

@OptIn(ExperimentalCoroutinesApi::class)
class BleAdapterManagerTest {

    private val dispatcher = StandardTestDispatcher()
    private val dispatchers = object : DispatchersProvider {
        override val io: CoroutineDispatcher = dispatcher
        override val computation: CoroutineDispatcher = dispatcher
        override val main: CoroutineDispatcher = dispatcher
    }

    @Test
    fun latestDeviceRespectsPatternAndServices() = runTest(dispatcher) {
        val scanner = FakeBleScanner()
        val manager = BleAdapterManager(scanner, dispatchers) { testScheduler.currentTime }
        manager.startScanning(BleScannerConfig(
            targetSerialPattern = Regex("ELM"),
            serviceUuids = listOf("0000fff0-0000-1000-8000-00805f9b34fb"),
            timeoutMs = 5_000L
        ))
        runCurrent()

        val deviceOne = BleDevice(address = "00:11:22:33:44:55", name = "Other", rssi = -60)
        val deviceTwo = BleDevice(address = "AA:BB:CC:DD:EE:FF", name = "ELM327", rssi = -48)
        scanner.emit(BleScanResult(deviceOne, serviceUuids = listOf("0000180f"), seenAtMillis = testScheduler.currentTime))
        scanner.emit(BleScanResult(deviceTwo, serviceUuids = listOf("0000FFF0-0000-1000-8000-00805F9B34FB"), seenAtMillis = testScheduler.currentTime + 5))
        runCurrent()

        val latest = manager.latestDevice(
            BleScannerConfig(
                targetSerialPattern = Regex("ELM"),
                serviceUuids = listOf("0000fff0-0000-1000-8000-00805f9b34fb"),
                timeoutMs = 5_000L
            )
        )
        assertEquals(deviceTwo, latest?.device)

        val missing = manager.latestDevice(
            BleScannerConfig(
                targetSerialPattern = Regex("ELM"),
                serviceUuids = listOf("1234"),
                timeoutMs = 5_000L
            )
        )
        assertNull(missing)
        manager.stopScanning()
    }

    @Test
    fun stopScanningPropagatesToScanner() = runTest(dispatcher) {
        val scanner = FakeBleScanner()
        val manager = BleAdapterManager(scanner, dispatchers) { testScheduler.currentTime }
        manager.startScanning(BleScannerConfig.Default)
        runCurrent()
        manager.stopScanning()

        assertEquals(1, scanner.stopCalls)
    }

    @Test
    fun startWithSameConfigDoesNotRestart() = runTest(dispatcher) {
        val scanner = FakeBleScanner()
        val manager = BleAdapterManager(scanner, dispatchers) { testScheduler.currentTime }
        val config = BleScannerConfig.Default
        manager.startScanning(config)
        runCurrent()
        manager.startScanning(config)
        runCurrent()

        assertEquals(1, scanner.startCalls)
        assertEquals(0, scanner.stopCalls)

        val otherConfig = BleScannerConfig(
            targetSerialPattern = null,
            serviceUuids = emptyList(),
            timeoutMs = 10_000L
        )
        manager.startScanning(otherConfig)
        runCurrent()
        assertEquals(2, scanner.startCalls)
        assertEquals(1, scanner.stopCalls)
        manager.stopScanning()
        assertEquals(2, scanner.stopCalls)
    }

    private class FakeBleScanner : BleScanner {
        private val flow = MutableSharedFlow<BleScanResult>(extraBufferCapacity = 8)
        var startCalls: Int = 0
            private set
        var stopCalls: Int = 0
            private set

        override val results = flow

        override suspend fun start(config: BleScannerConfig) {
            startCalls += 1
        }

        override suspend fun stop() {
            stopCalls += 1
        }

        fun emit(result: BleScanResult) {
            flow.tryEmit(result)
        }
    }
}
