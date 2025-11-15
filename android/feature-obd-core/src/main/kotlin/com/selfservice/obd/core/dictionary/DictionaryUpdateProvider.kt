package com.selfservice.obd.core.dictionary

/**
 * Provides updated dictionary data from a remote or local source. Returns null when dictionaries
 * are already up to date for the supplied revision snapshot.
 */
fun interface DictionaryUpdateProvider {
    suspend fun fetchUpdate(current: DictionaryRevisionSnapshot): DictionaryUpdateBatch?
}
