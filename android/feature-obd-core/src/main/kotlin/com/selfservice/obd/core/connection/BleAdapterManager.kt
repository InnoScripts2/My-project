package com.selfservice.obd.core.connection

import com.selfservice.core.DispatchersProvider
import com.selfservice.obd.core.session.ConnectedAdapter
import kotlin.jvm.Volatile
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.plus

/**
 * Coordinates BLE scanning, keeps track of discovered adapters and exposes selection helpers.
 */
class BleAdapterManager(
    private val scanner: BleScanner,
    private val dispatchers: DispatchersProvider,
    private val timeProvider: () -> Long = { System.currentTimeMillis() }
) : BleAdapterSelector {

    private val scope: CoroutineScope = CoroutineScope(SupervisorJob()) + dispatchers.computation
    private val knownAdapters = MutableStateFlow<Map<String, TrackedAdapter>>(emptyMap())
    private val adapterSnapshots = MutableStateFlow<List<AdapterSnapshot>>(emptyList())
    private var collectJob: Job? = null
    @Volatile
    private var activeConfig: BleScannerConfig? = null

    val adapters: StateFlow<List<AdapterSnapshot>> = adapterSnapshots.asStateFlow()

    init {
        scope.launch {
            knownAdapters.collect { entries ->
                adapterSnapshots.value = entries.values
                    .sortedByDescending { it.lastSeenAtMillis }
                    .map { it.snapshot() }
            }
        }
    }

    override suspend fun startScanning(config: BleScannerConfig) {
        if (activeConfig == config && collectJob?.isActive == true) {
            return
        }
        stopInternal()
        scanner.start(config)
        activeConfig = config
        collectJob = scope.launch {
            scanner.results.collect { result ->
                val seenAt = if (result.seenAtMillis <= 0L) timeProvider() else result.seenAtMillis
                knownAdapters.update { current ->
                    val key = result.device.address.ifBlank { result.device.name ?: result.device.address }
                    val normalizedServices = result.serviceUuids.map { it.lowercase() }
                    val existing = current[key]
                    val merged = if (existing == null) {
                        TrackedAdapter(
                            device = result.device,
                            advertisedServices = normalizedServices.toMutableSet(),
                            firstSeenAtMillis = seenAt,
                            lastSeenAtMillis = seenAt
                        )
                    } else {
                        existing.copy(
                            device = result.device,
                            advertisedServices = (existing.advertisedServices + normalizedServices).toMutableSet(),
                            lastSeenAtMillis = maxOf(existing.lastSeenAtMillis, seenAt)
                        )
                    }
                    current + (key to merged)
                }
            }
        }
    }

    override suspend fun stopScanning() {
        stopInternal()
    }

    override fun latestDevice(config: BleScannerConfig): ConnectedAdapter? {
        val entries = knownAdapters.value.values
        return entries
            .asSequence()
            .filter { matchesPattern(it.device, config.targetSerialPattern) }
            .filter { matchesServices(it, config.serviceUuids) }
            .maxByOrNull { it.lastSeenAtMillis }
            ?.let { ConnectedAdapter(device = it.device, protocol = "BLE") }
    }

    fun clear() {
        knownAdapters.value = emptyMap()
    }

    private suspend fun stopInternal() {
        val previousConfig = activeConfig
        collectJob?.cancelAndJoin()
        collectJob = null
        activeConfig = null
        if (previousConfig != null) {
            runCatching { scanner.stop() }
        }
    }

    private fun matchesPattern(device: BleDevice, pattern: Regex?): Boolean {
        pattern ?: return true
        val candidates = buildList {
            device.name?.let { add(it) }
            add(device.address)
        }
        return candidates.any { pattern.containsMatchIn(it) }
    }

    private fun matchesServices(adapter: TrackedAdapter, required: List<String>): Boolean {
        if (required.isEmpty()) return true
        val normalizedRequired = required.map { it.lowercase() }
        return normalizedRequired.all { service ->
            adapter.advertisedServices.any { it == service }
        }
    }

    private data class TrackedAdapter(
        val device: BleDevice,
        val advertisedServices: MutableSet<String>,
        val firstSeenAtMillis: Long,
        val lastSeenAtMillis: Long
    ) {
        fun snapshot(): AdapterSnapshot = AdapterSnapshot(
            device = device,
            services = advertisedServices.toSet(),
            firstSeenAtMillis = firstSeenAtMillis,
            lastSeenAtMillis = lastSeenAtMillis
        )
    }

    data class AdapterSnapshot(
        val device: BleDevice,
        val services: Set<String>,
        val firstSeenAtMillis: Long,
        val lastSeenAtMillis: Long
    )
}

interface BleAdapterSelector {
    suspend fun startScanning(config: BleScannerConfig)
    suspend fun stopScanning()
    fun latestDevice(config: BleScannerConfig): ConnectedAdapter?

    object Empty : BleAdapterSelector {
        override suspend fun startScanning(config: BleScannerConfig) {}
        override suspend fun stopScanning() {}
        override fun latestDevice(config: BleScannerConfig): ConnectedAdapter? = null
    }
}
