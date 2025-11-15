package com.selfservice.obd.core.dtc

import java.util.LinkedHashMap
import java.util.Locale

fun interface DtcDefinitionProvider {
    fun find(code: String): ObdDtcDefinition?
}

data class DtcDictionaryRevision(
    val source: String,
    val versionLabel: String?,
    val refreshedAtMillis: Long,
    val entryCount: Int
) {
    companion object {
        fun bootstrap(): DtcDictionaryRevision = DtcDictionaryRevision(
            source = "bootstrap",
            versionLabel = null,
            refreshedAtMillis = 0,
            entryCount = 0
        )
    }
}

class DtcDictionaryCache(
    private val provider: DtcDefinitionProvider,
    private val maxEntries: Int = DEFAULT_CAPACITY
) {
    private val cache = object : LinkedHashMap<String, ObdDtcDefinition>(maxEntries, LOAD_FACTOR, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, ObdDtcDefinition>?): Boolean {
            return size > maxEntries
        }
    }
    @Volatile
    private var revision: DtcDictionaryRevision = DtcDictionaryRevision.bootstrap()

    @Synchronized
    fun lookup(code: String): ObdDtcDefinition? {
        val normalized = normalize(code)
        cache[normalized]?.let { return it.copy() }
        val resolved = provider.find(normalized) ?: return null
        cache[normalized] = resolved
        return resolved.copy()
    }

    @Synchronized
    fun warm(definitions: Sequence<ObdDtcDefinition>) {
        for (definition in definitions) {
            cache[normalize(definition.code)] = definition
        }
    }

    @Synchronized
    fun refresh(definitions: Sequence<ObdDtcDefinition>, source: String, versionLabel: String? = null): DtcDictionaryRevision {
        cache.clear()
        warm(definitions)
        val nextRevision = DtcDictionaryRevision(
            source = source,
            versionLabel = versionLabel,
            refreshedAtMillis = System.currentTimeMillis(),
            entryCount = cache.size
        )
        revision = nextRevision
        return nextRevision
    }

    @Synchronized
    fun invalidate(code: String): Boolean {
        val removed = cache.remove(normalize(code)) != null
        if (removed) {
            revision = revision.copy(entryCount = cache.size, refreshedAtMillis = System.currentTimeMillis())
        }
        return removed
    }

    @Synchronized
    fun invalidateAll(reason: String? = null): DtcDictionaryRevision {
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

    fun currentRevision(): DtcDictionaryRevision = revision

    @Synchronized
    fun snapshot(): Map<String, ObdDtcDefinition> = cache.mapValues { it.value.copy() }

    private fun normalize(code: String): String {
        val trimmed = code.trim().uppercase(Locale.US)
        val withoutPrefix = if (trimmed.startsWith("0X")) trimmed.substring(2) else trimmed
        require(withoutPrefix.length == 5) { "Invalid DTC $code" }
        return withoutPrefix
    }

    companion object {
        private const val DEFAULT_CAPACITY = 512
        private const val LOAD_FACTOR = 0.75f

        fun withCatalogFallback(maxEntries: Int = DEFAULT_CAPACITY): DtcDictionaryCache {
            return DtcDictionaryCache(
                provider = DtcDefinitionProvider { code -> DtcCatalog.find(code) },
                maxEntries = maxEntries
            )
        }
    }
}
