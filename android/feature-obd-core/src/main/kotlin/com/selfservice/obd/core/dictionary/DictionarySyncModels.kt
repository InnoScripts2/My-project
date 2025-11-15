package com.selfservice.obd.core.dictionary

import com.selfservice.obd.core.dtc.DtcDictionaryRevision
import com.selfservice.obd.core.dtc.ObdDtcDefinition
import com.selfservice.obd.core.pid.ObdPidDefinition
import com.selfservice.obd.core.pid.PidDictionaryRevision
import java.util.concurrent.TimeUnit
import kotlin.math.max

/** Snapshot of dictionary revisions that can be provided to remote update sources. */
data class DictionaryRevisionSnapshot(
        val pid: PidDictionaryRevision,
        val dtc: DtcDictionaryRevision
) {
    /** Latest refresh timestamp across PID and DTC dictionaries. */
    val latestRefreshMillis: Long = max(pid.refreshedAtMillis, dtc.refreshedAtMillis)
}

/**
 * Container for the dictionary definitions retrieved from an update provider. Null values indicate
 * that a specific dictionary did not change.
 */
data class DictionaryUpdateBatch(
        val pidDefinitions: List<ObdPidDefinition>?,
        val dtcDefinitions: List<ObdDtcDefinition>?,
        val source: String,
        val pidVersionLabel: String? = null,
        val dtcVersionLabel: String? = null
)

/** Policy controlling when synchronisation attempts should be performed. */
data class DictionarySyncPolicy(
        val minStalenessMillis: Long = TimeUnit.HOURS.toMillis(6),
        val minAttemptIntervalMillis: Long = TimeUnit.MINUTES.toMillis(10)
) {
    init {
        require(minStalenessMillis >= 0) { "minStalenessMillis must be >= 0" }
        require(minAttemptIntervalMillis >= 0) { "minAttemptIntervalMillis must be >= 0" }
    }
}

/** Result of a dictionary synchronisation attempt. */
sealed class DictionarySyncResult {
    data class Performed(
            val pidRevision: PidDictionaryRevision,
            val dtcRevision: DtcDictionaryRevision,
            val attemptedAtMillis: Long
    ) : DictionarySyncResult()

    data class Skipped(val reason: SkipReason) : DictionarySyncResult()

    data class Failed(val error: Throwable) : DictionarySyncResult()

    enum class SkipReason {
        NOT_STALE,
        TOO_RECENT,
        NO_UPDATES
    }
}
