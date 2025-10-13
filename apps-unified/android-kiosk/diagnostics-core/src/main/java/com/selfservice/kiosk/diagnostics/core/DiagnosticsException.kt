package com.selfservice.kiosk.diagnostics.core

class DiagnosticsException(
    val code: DiagnosticsErrorCode,
    message: String,
    cause: Throwable? = null
) : RuntimeException(message, cause)
