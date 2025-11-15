package com.selfservice.obd.core.pid

import java.util.LinkedHashMap
import java.util.Locale

fun interface PidDefinitionProvider {
    fun find(mode: String, pid: String): ObdPidDefinition?
}

data class PidDictionaryRevision(
    val source: String,
    val versionLabel: String?,
    val refreshedAtMillis: Long,
    val entryCount: Int
) {
    companion object {
        fun bootstrap(): PidDictionaryRevision = PidDictionaryRevision(
            source = "bootstrap",
            versionLabel = null,
            refreshedAtMillis = 0,
            entryCount = 0
        )
    }
}

class PidDictionaryCache(
    private val provider: PidDefinitionProvider,
    private val maxEntries: Int = DEFAULT_CAPACITY
) {
    private val cache = object : LinkedHashMap<String, ObdPidDefinition>(maxEntries, LOAD_FACTOR, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, ObdPidDefinition>?): Boolean {
            return size > maxEntries
        }
    }
    @Volatile
    private var revision: PidDictionaryRevision = PidDictionaryRevision.bootstrap()

    @Synchronized
    fun lookup(mode: String, pid: String): ObdPidDefinition? {
        val key = key(normalize(mode), normalize(pid))
        cache[key]?.let { return it.copy() }
        val resolved = provider.find(keyMode(key), keyPid(key)) ?: return null
        cache[key] = resolved
        return resolved.copy()
    }

    @Synchronized
    fun warm(definitions: Sequence<ObdPidDefinition>) {
        for (definition in definitions) {
            val mode = normalize(definition.mode)
            val pid = normalize(definition.pid)
            cache[key(mode, pid)] = definition
        }
    }

    @Synchronized
    fun refresh(definitions: Sequence<ObdPidDefinition>, source: String, versionLabel: String? = null): PidDictionaryRevision {
        cache.clear()
        warm(definitions)
        val nextRevision = PidDictionaryRevision(
            source = source,
            versionLabel = versionLabel,
            refreshedAtMillis = System.currentTimeMillis(),
            entryCount = cache.size
        )
        revision = nextRevision
        return nextRevision
    }

    @Synchronized
    fun invalidate(mode: String, pid: String): Boolean {
        val removed = cache.remove(key(normalize(mode), normalize(pid))) != null
        if (removed) {
            revision = revision.copy(entryCount = cache.size, refreshedAtMillis = System.currentTimeMillis())
        }
        return removed
    }

    @Synchronized
    fun invalidateAll(reason: String? = null): PidDictionaryRevision {
        if (cache.isEmpty()) {
            return revision
        }
        cache.clear()
            val mergedLabel = listOfNotNull(
                revision.versionLabel?.takeIf { it.isNotBlank() },
                reason?.takeIf { it.isNotBlank() }?.let { "stale:$it" }
            ).takeIf { it.isNotEmpty() }?.joinToString(separator = " | ")
        val nextRevision = revision.copy(
                versionLabel = mergedLabel ?: revision.versionLabel,
            refreshedAtMillis = System.currentTimeMillis(),
            entryCount = 0
        )
        revision = nextRevision
        return nextRevision
    }

    fun currentRevision(): PidDictionaryRevision = revision

    @Synchronized
    fun snapshot(): Map<String, ObdPidDefinition> = cache.mapValues { it.value.copy() }

    private fun key(mode: String, pid: String): String = "$mode:$pid"

    private fun keyMode(key: String): String = key.substringBefore(':')

    private fun keyPid(key: String): String = key.substringAfter(':')

    private fun normalize(value: String): String {
        val trimmed = value.trim()
        val withoutPrefix = if (trimmed.startsWith("0x", ignoreCase = true)) trimmed.substring(2) else trimmed
        val upper = withoutPrefix.uppercase(Locale.US)
        require(upper.length <= 2) { "PID value $value is invalid" }
        return "0x${upper.padStart(2, '0')}"
    }

    companion object {
        private const val DEFAULT_CAPACITY = 256
        private const val LOAD_FACTOR = 0.75f

        fun withCatalogFallback(maxEntries: Int = DEFAULT_CAPACITY): PidDictionaryCache {
            return PidDictionaryCache(
                provider = PidDefinitionProvider { mode, pid -> PidCatalog.find(mode, pid) },
                maxEntries = maxEntries
            )
        }
    }
}
