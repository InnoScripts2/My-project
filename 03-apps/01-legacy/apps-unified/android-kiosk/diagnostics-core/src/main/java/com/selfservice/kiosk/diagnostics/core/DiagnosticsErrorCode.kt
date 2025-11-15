package com.selfservice.kiosk.diagnostics.core

enum class DiagnosticsErrorCode {
    ADAPTER_UNAVAILABLE,
    CHANNEL_BUSY,
    TIMEOUT,
    NEGATIVE_RESPONSE,
    TRANSPORT_ERROR,
    SECURITY_ERROR,
    UNSUPPORTED_PROTOCOL,
    INVALID_CONFIG,
    SHUTTING_DOWN;
}
