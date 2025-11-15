package com.selfservice.obd.core.pid

class OfflinePidDictionary(
        private val cache: PidDictionaryCache,
        seedDefinitions: Sequence<ObdPidDefinition>
) {
    init {
        cache.refresh(seedDefinitions, source = "embedded", versionLabel = "catalog")
    }

    constructor() :
            this(
                    cache = PidDictionaryCache.withCatalogFallback(),
                    seedDefinitions = PidCatalog.definitions().asSequence()
            )

    fun find(mode: String, pid: String): ObdPidDefinition? = cache.lookup(mode, pid)

    fun listModes(): List<String> = PidCatalog.listModes()

    fun listPidsByMode(mode: String): List<ObdPidDefinition> = PidCatalog.listPidsByMode(mode)

    fun snapshot(): List<ObdPidDefinition> = cache.snapshot().values.toList()
}
