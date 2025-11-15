package com.selfservice.obd.core.selftest

/**
 * Declarative schema for persisting adapter self-test runs into Supabase. This keeps the mapping
 * close to the domain layer and can later be referenced by whatever data access layer we create.
 */
object AdapterSelfTestSchema {
    const val TABLE_NAME = "adapter_selftests"

    object Columns {
        const val SESSION_ID = "session_id"
        const val ADAPTER_SERIAL = "adapter_serial"
        const val STARTED_AT = "started_at"
        const val COMPLETED_AT = "completed_at"
        const val SUCCEEDED = "succeeded"
        const val EXECUTIONS = "executions_json"
    }

    fun toRowPayload(run: AdapterSelfTestRun, sessionId: String, adapterSerial: String, startedAtIso: String, completedAtIso: String): Map<String, Any?> {
        return mapOf(
            Columns.SESSION_ID to sessionId,
            Columns.ADAPTER_SERIAL to adapterSerial,
            Columns.STARTED_AT to startedAtIso,
            Columns.COMPLETED_AT to completedAtIso,
            Columns.SUCCEEDED to run.succeeded,
            Columns.EXECUTIONS to run.toLogPayload(sessionId, adapterSerial)["executions"]
        )
    }
}
