package com.selfservice.obd.core.connection

import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.le.BluetoothLeScanner
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.os.ParcelUuid
import com.selfservice.core.DispatchersProvider
import java.util.UUID
import kotlin.jvm.Volatile
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.plus
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * Android implementation of [BleScanner] backed by [BluetoothLeScanner].
 * It converts Android scan results into [BleScanResult] events and exposes them as a cold flow.
 */
class AndroidBleScanner(
    private val context: Context,
    private val dispatchers: DispatchersProvider,
    private val adapterProvider: () -> BluetoothAdapter? = {
        val manager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
        manager?.adapter
    },
    private val scannerProvider: (BluetoothAdapter) -> BluetoothLeScanner? = { it.bluetoothLeScanner },
    private val timeProvider: () -> Long = { System.currentTimeMillis() },
    private val logger: (message: String, error: Throwable?) -> Unit = { _, _ -> }
) : BleScanner {

    private val scope: CoroutineScope = CoroutineScope(SupervisorJob()) + dispatchers.computation
    private val mutex = Mutex()

    private val _results = MutableSharedFlow<BleScanResult>(
        replay = 0,
        extraBufferCapacity = 48,
        onBufferOverflow = BufferOverflow.DROP_OLDEST
    )
    override val results: Flow<BleScanResult> = _results.asSharedFlow()

    @Volatile
    private var activeScanner: BluetoothLeScanner? = null
    @Volatile
    private var activeCallback: ScanCallback? = null
    @Volatile
    private var activeConfig: BleScannerConfig? = null
    private var timeoutJob: Job? = null

    @SuppressLint("MissingPermission")
    override suspend fun start(config: BleScannerConfig) {
        mutex.withLock {
            if (activeConfig == config && activeCallback != null) {
                return
            }
            stopInternalLocked()
            val adapter = adapterProvider() ?: throw IllegalStateException("Bluetooth adapter unavailable")
            if (!adapter.isEnabled) {
                throw IllegalStateException("Bluetooth adapter disabled")
            }
            val scanner = scannerProvider(adapter)
                ?: throw IllegalStateException("BluetoothLeScanner unavailable")
            val filters = buildFilters(config.serviceUuids)
            val settings = buildScanSettings()
            val callback = createCallback()
            runCatching {
                scanner.startScan(filters, settings, callback)
            }.onFailure { failure ->
                logger("startScan failed", failure)
                throw failure
            }
            activeScanner = scanner
            activeCallback = callback
            activeConfig = config
            if (config.timeoutMs > 0L) {
                timeoutJob = scope.launch {
                    delay(config.timeoutMs)
                    stop()
                }
            }
        }
    }

    @SuppressLint("MissingPermission")
    override suspend fun stop() {
        mutex.withLock {
            stopInternalLocked()
        }
    }

    private fun stopInternalLocked() {
        timeoutJob?.cancel()
        timeoutJob = null
        val scanner = activeScanner
        val callback = activeCallback
        if (scanner != null && callback != null) {
            runCatching { scanner.stopScan(callback) }
                .onFailure { failure -> logger("stopScan failed", failure) }
        }
        activeScanner = null
        activeCallback = null
        activeConfig = null
    }

    private fun createCallback(): ScanCallback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult) {
            emitResult(result)
        }

        override fun onBatchScanResults(results: MutableList<ScanResult>) {
            results.forEach(::emitResult)
        }

        override fun onScanFailed(errorCode: Int) {
            logger("onScanFailed: $errorCode", null)
        }
    }

    private fun emitResult(result: ScanResult) {
        val device = result.device
        val services = result.scanRecord?.serviceUuids
            ?.map { it.uuid.toString().lowercase() }
            ?: emptyList()
        val entry = BleScanResult(
            device = BleDevice.from(device, result.rssi),
            serviceUuids = services,
            seenAtMillis = timeProvider()
        )
        if (!_results.tryEmit(entry)) {
            scope.launch { _results.emit(entry) }
        }
    }

    private fun buildFilters(serviceUuids: List<String>): List<ScanFilter> {
        if (serviceUuids.isEmpty()) return emptyList()
        return serviceUuids.mapNotNull { uuidString ->
            parseUuid(uuidString)?.let { uuid ->
                ScanFilter.Builder()
                    .setServiceUuid(ParcelUuid(uuid))
                    .build()
            }
        }
    }

    private fun buildScanSettings(): ScanSettings = ScanSettings.Builder()
        .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
        .setReportDelay(0L)
        .build()

    private fun parseUuid(value: String): UUID? {
        return runCatching { UUID.fromString(value) }.getOrElse {
            if (value.length == 4) {
                val normalized = "0000${value.lowercase()}-0000-1000-8000-00805f9b34fb"
                runCatching { UUID.fromString(normalized) }.getOrNull()
            } else {
                null
            }
        }
    }
}
