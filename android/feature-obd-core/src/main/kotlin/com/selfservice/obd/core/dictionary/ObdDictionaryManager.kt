package com.selfservice.obd.core.dictionary

import com.selfservice.obd.core.dtc.DtcCatalog
import com.selfservice.obd.core.dtc.DtcDictionaryCache
import com.selfservice.obd.core.dtc.DtcDictionaryRevision
import com.selfservice.obd.core.dtc.ObdDtcDefinition
import com.selfservice.obd.core.pid.ObdPidDefinition
import com.selfservice.obd.core.pid.PidCatalog
import com.selfservice.obd.core.pid.PidDictionaryCache
import com.selfservice.obd.core.pid.PidDictionaryRevision

/**
 * Centralizes access to PID/DTC definitions and exposes refresh/invalidation helpers for background
 * updates. Keeps minimal state (revision metadata) so UI/services can react to dictionary changes
 * without querying raw catalogs on every lookup.
 */
class ObdDictionaryManager
internal constructor(
        private val pidCache: PidDictionaryCache,
        private val dtcCache: DtcDictionaryCache,
        pidSeed: Sequence<ObdPidDefinition>,
        dtcSeed: Sequence<ObdDtcDefinition>,
        private val defaultSource: String
) {
    init {
        pidCache.refresh(pidSeed, source = defaultSource, versionLabel = PID_VERSION_EMBEDDED)
        dtcCache.refresh(dtcSeed, source = defaultSource, versionLabel = DTC_VERSION_EMBEDDED)
    }

    fun lookupPid(mode: String, pid: String): ObdPidDefinition? = pidCache.lookup(mode, pid)

    fun lookupDtc(code: String): ObdDtcDefinition? = dtcCache.lookup(code)

    fun refreshPid(
            definitions: Sequence<ObdPidDefinition>,
            source: String,
            versionLabel: String? = null
    ): PidDictionaryRevision {
        return pidCache.refresh(definitions, source, versionLabel)
    }

    fun refreshDtc(
            definitions: Sequence<ObdDtcDefinition>,
            source: String,
            versionLabel: String? = null
    ): DtcDictionaryRevision {
        return dtcCache.refresh(definitions, source, versionLabel)
    }

    fun invalidatePid(mode: String, pid: String): Boolean = pidCache.invalidate(mode, pid)

    fun invalidateDtc(code: String): Boolean = dtcCache.invalidate(code)

    fun invalidateAllPid(reason: String? = null): PidDictionaryRevision =
            pidCache.invalidateAll(reason)

    fun invalidateAllDtc(reason: String? = null): DtcDictionaryRevision =
            dtcCache.invalidateAll(reason)

    fun pidRevision(): PidDictionaryRevision = pidCache.currentRevision()

    fun dtcRevision(): DtcDictionaryRevision = dtcCache.currentRevision()

    fun pidSnapshot(): List<ObdPidDefinition> = pidCache.snapshot().values.toList()

    fun dtcSnapshot(): List<ObdDtcDefinition> = dtcCache.snapshot().values.toList()

    companion object {
        private const val SOURCE_EMBEDDED = "embedded"
        private const val PID_VERSION_EMBEDDED = "catalog"
        private const val DTC_VERSION_EMBEDDED = "catalog"

        fun default(): ObdDictionaryManager {
            val pidDefinitions = PidCatalog.definitions()
            val dtcDefinitions = DtcCatalog.definitions()
            return ObdDictionaryManager(
                    pidCache = PidDictionaryCache.withCatalogFallback(),
                    dtcCache = DtcDictionaryCache.withCatalogFallback(),
                    pidSeed = pidDefinitions.asSequence(),
                    dtcSeed = dtcDefinitions.asSequence(),
                    defaultSource = SOURCE_EMBEDDED
            )
        }

        val shared: ObdDictionaryManager by lazy { default() }
    }
}
