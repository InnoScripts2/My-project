package com.selfservice.obd.core.passthru

enum class PassThruSmokeCommandType {
    OPEN_CHANNEL,
    SET_VOLTAGE,
    WRITE_MESSAGE,
    READ_MESSAGE,
    CLOSE_CHANNEL
}

data class PassThruSmokeCommand(
    val type: PassThruSmokeCommandType,
    val description: String
)

class PassThruSmokePlan(
    val channelConfig: PassThruChannelConfig,
    val commands: List<PassThruSmokeCommand>
) {
    companion object {
        fun default(): PassThruSmokePlan {
            val config = PassThruChannelConfig(
                protocolId = 0x01,
                baudRate = 500_000,
                flags = 0
            )
            val commands = listOf(
                PassThruSmokeCommand(
                    type = PassThruSmokeCommandType.OPEN_CHANNEL,
                    description = "Open protocol channel"
                ),
                PassThruSmokeCommand(
                    type = PassThruSmokeCommandType.SET_VOLTAGE,
                    description = "Set reference voltage to awake adapter"
                ),
                PassThruSmokeCommand(
                    type = PassThruSmokeCommandType.WRITE_MESSAGE,
                    description = "Send tester present via ISO-TP"
                ),
                PassThruSmokeCommand(
                    type = PassThruSmokeCommandType.READ_MESSAGE,
                    description = "Verify response from control unit"
                ),
                PassThruSmokeCommand(
                    type = PassThruSmokeCommandType.CLOSE_CHANNEL,
                    description = "Close protocol channel"
                )
            )
            return PassThruSmokePlan(config, commands)
        }
    }
}
