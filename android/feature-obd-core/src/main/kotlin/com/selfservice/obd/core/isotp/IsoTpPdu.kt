package com.selfservice.obd.core.isotp

/** Logical ISO-TP Protocol Data Unit reconstructed from transport frames. */
data class IsoTpPdu(
    val payload: ByteArray,
    val timestampMillis: Long
)
