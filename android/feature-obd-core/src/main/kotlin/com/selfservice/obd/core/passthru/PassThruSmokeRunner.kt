package com.selfservice.obd.core.passthru

/**
 * Orchestrates smoke plan execution against the native passthru bridge. Each command is
 * executed sequentially with minimal control flow to isolate failures. Minimal state is kept so
 * it can be reused in instrumentation/jvm tests and later extended with watchdog metrics.
 */
class PassThruSmokeRunner(
    private val bridge: PassThruNativeBridge
) {
    data class Result(
        val executed: List<PassThruSmokeCommand>,
        val failure: Failure?
    ) {
        data class Failure(
            val command: PassThruSmokeCommand,
            val error: Throwable
        )

        val succeeded: Boolean get() = failure == null
    }

    fun execute(plan: PassThruSmokePlan, payloadSupplier: () -> ByteArray = { ByteArray(0) }): Result {
        val executed = mutableListOf<PassThruSmokeCommand>()
        var channelId: Int? = null
        for (command in plan.commands) {
            try {
                when (command.type) {
                    PassThruSmokeCommandType.OPEN_CHANNEL -> {
                        val opened = bridge.openChannel(plan.channelConfig).getOrThrow()
                        channelId = opened
                    }
                    PassThruSmokeCommandType.SET_VOLTAGE -> {
                        val id = channelId ?: error("Channel must be opened before setting voltage")
                        bridge.setReferenceVoltage(id, DEFAULT_WAKE_MILLIVOLTS).getOrThrow()
                    }
                    PassThruSmokeCommandType.WRITE_MESSAGE -> {
                        val id = channelId ?: error("Channel must be opened before writing message")
                        val payload = payloadSupplier()
                        val message = PassThruMessage(
                            channelId = id,
                            protocolId = plan.channelConfig.protocolId,
                            timestampNanos = System.nanoTime(),
                            flags = 0,
                            payload = payload
                        )
                        bridge.writeMessage(message, DEFAULT_TIMEOUT_MS).getOrThrow()
                    }
                    PassThruSmokeCommandType.READ_MESSAGE -> {
                        val id = channelId ?: error("Channel must be opened before reading message")
                        bridge.readMessage(id, DEFAULT_TIMEOUT_MS).getOrThrow()
                    }
                    PassThruSmokeCommandType.CLOSE_CHANNEL -> {
                        val id = channelId
                        if (id != null) {
                            bridge.closeChannel(id).getOrThrow()
                            channelId = null
                        }
                    }
                }
                executed += command
            } catch (t: Throwable) {
                channelId?.let {
                    if (command.type != PassThruSmokeCommandType.CLOSE_CHANNEL) {
                        bridge.closeChannel(it)
                    }
                }
                return Result(executed = executed.toList(), failure = Result.Failure(command, t))
            }
        }
        return Result(executed = executed.toList(), failure = null)
    }

    companion object {
        private const val DEFAULT_WAKE_MILLIVOLTS = 12_000
        private const val DEFAULT_TIMEOUT_MS = 250
    }
}
