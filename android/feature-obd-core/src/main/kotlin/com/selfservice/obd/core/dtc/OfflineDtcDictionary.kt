package com.selfservice.obd.core.dtc

class OfflineDtcDictionary(
        private val cache: DtcDictionaryCache,
        seedDefinitions: Sequence<ObdDtcDefinition>
) {
    init {
        cache.refresh(seedDefinitions, source = "embedded", versionLabel = "catalog")
    }

    constructor() :
            this(
                    cache = DtcDictionaryCache.withCatalogFallback(),
                    seedDefinitions = DtcCatalog.definitions().asSequence()
            )

    fun find(code: String): ObdDtcDefinition? = cache.lookup(code)

    fun listSystems(): List<ObdDtcDefinition.System> = DtcCatalog.listSystems()

    fun listBySystem(system: ObdDtcDefinition.System): List<ObdDtcDefinition> =
            DtcCatalog.listBySystem(system)

    fun snapshot(): List<ObdDtcDefinition> = cache.snapshot().values.toList()
}
