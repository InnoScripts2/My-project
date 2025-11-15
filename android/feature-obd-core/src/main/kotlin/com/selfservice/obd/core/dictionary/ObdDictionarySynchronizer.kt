package com.selfservice.obd.core.dictionary

import kotlin.jvm.Volatile

/** Coordinates dictionary refresh operations based on revision metadata and provider policy. */
class ObdDictionarySynchronizer(
        private val manager: ObdDictionaryManager,
        private val provider: DictionaryUpdateProvider,
        private val policy: DictionarySyncPolicy = DictionarySyncPolicy(),
        private val timeProvider: () -> Long = { System.currentTimeMillis() }
) {

    @Volatile private var lastAttemptAtMillis: Long = 0L

    suspend fun sync(force: Boolean = false): DictionarySyncResult {
        val now = timeProvider()
        if (!force && shouldSkipByAttemptInterval(now)) {
            return DictionarySyncResult.Skipped(DictionarySyncResult.SkipReason.TOO_RECENT)
        }
        val snapshot = currentSnapshot()
        if (!force && !isStale(snapshot, now)) {
            return DictionarySyncResult.Skipped(DictionarySyncResult.SkipReason.NOT_STALE)
        }
        lastAttemptAtMillis = now
        val update =
                try {
                    provider.fetchUpdate(snapshot)
                } catch (error: Throwable) {
                    return DictionarySyncResult.Failed(error)
                }
        if (update == null) {
            return DictionarySyncResult.Skipped(DictionarySyncResult.SkipReason.NO_UPDATES)
        }

        var pidRevision = snapshot.pid
        if (update.pidDefinitions != null) {
            pidRevision =
                    manager.refreshPid(
                            definitions = update.pidDefinitions.asSequence(),
                            source = update.source,
                            versionLabel = update.pidVersionLabel
                    )
        }

        var dtcRevision = snapshot.dtc
        if (update.dtcDefinitions != null) {
            dtcRevision =
                    manager.refreshDtc(
                            definitions = update.dtcDefinitions.asSequence(),
                            source = update.source,
                            versionLabel = update.dtcVersionLabel
                    )
        }

        return DictionarySyncResult.Performed(
                pidRevision = pidRevision,
                dtcRevision = dtcRevision,
                attemptedAtMillis = now
        )
    }

    fun lastAttemptAtMillis(): Long = lastAttemptAtMillis

    private fun currentSnapshot(): DictionaryRevisionSnapshot =
            DictionaryRevisionSnapshot(pid = manager.pidRevision(), dtc = manager.dtcRevision())

    private fun shouldSkipByAttemptInterval(now: Long): Boolean {
        if (policy.minAttemptIntervalMillis == 0L) return false
        val lastAttempt = lastAttemptAtMillis
        if (lastAttempt <= 0L) return false
        val elapsed = now - lastAttempt
        return elapsed < policy.minAttemptIntervalMillis
    }

    private fun isStale(snapshot: DictionaryRevisionSnapshot, now: Long): Boolean {
        if (policy.minStalenessMillis == 0L) return true
        val latest = snapshot.latestRefreshMillis
        if (latest <= 0L) return true
        val elapsed = now - latest
        return elapsed >= policy.minStalenessMillis
    }
}
