package com.selfservice.obd.core.passthru

interface PassThruNativeBridge {
    fun openChannel(config: PassThruChannelConfig): Result<Int>
    fun closeChannel(channelId: Int): Result<Unit>
    fun setReferenceVoltage(channelId: Int, millivolts: Int): Result<Unit>
    fun writeMessage(message: PassThruMessage, timeoutMs: Int): Result<Unit>
    fun readMessage(channelId: Int, timeoutMs: Int): Result<PassThruMessage?>
}
