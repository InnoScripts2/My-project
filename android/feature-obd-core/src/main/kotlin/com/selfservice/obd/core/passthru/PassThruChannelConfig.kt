package com.selfservice.obd.core.passthru

data class PassThruChannelConfig(
    val protocolId: Int,
    val baudRate: Int,
    val flags: Int = 0
)
