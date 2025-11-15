package com.selfservice.obd.core.command

/**
 * Represents a subset of ELM327 AT commands used by the diagnostic stack.
 * Each command knows how to render itself to the raw string that must be sent to the adapter.
 */
sealed interface ElmAtCommand {
    fun encode(): String

    data object Reset : ElmAtCommand {
        override fun encode(): String = "ATZ"
    }

    data object WarmStart : ElmAtCommand {
        override fun encode(): String = "ATWS"
    }

    data object SetProtocolAuto : ElmAtCommand {
        override fun encode(): String = "ATSPA0"
    }

    data class SetProtocol(val code: String) : ElmAtCommand {
        init {
            require(code.isNotBlank()) { "Protocol code must not be blank" }
        }

        override fun encode(): String = "ATSP${code.uppercase()}"
    }

    data object EchoOff : ElmAtCommand {
        override fun encode(): String = "ATE0"
    }

    data object LineFeedsOff : ElmAtCommand {
        override fun encode(): String = "ATL0"
    }

    data object SpacesOff : ElmAtCommand {
        override fun encode(): String = "ATS0"
    }

    data object HeadersOff : ElmAtCommand {
        override fun encode(): String = "ATH0"
    }

    data class AdaptiveTiming(val mode: Int) : ElmAtCommand {
        init {
            require(mode in 0..2) { "Adaptive timing mode must be in range 0..2" }
        }

        override fun encode(): String = "ATAT${mode}"
    }

    data class SetTimeout(val hex: String) : ElmAtCommand {
        init {
            require(hex.matches(HEX_PATTERN)) { "Timeout value must be a hexadecimal byte" }
        }

        override fun encode(): String = "ATST${hex.uppercase()}"
    }

    data class SetTxHeader(val hex: String) : ElmAtCommand {
        init {
            require(hex.matches(HEX_PATTERN)) { "Header value must be a hexadecimal string" }
        }

        override fun encode(): String = "ATSH${hex.uppercase()}"
    }

    data class SetCanFilter(val hex: String) : ElmAtCommand {
        init {
            require(hex.matches(HEX_PATTERN)) { "CAN filter must be a hexadecimal string" }
        }

        override fun encode(): String = "ATCRA${hex.uppercase()}"
    }

    data object ClearCanFilter : ElmAtCommand {
        override fun encode(): String = "ATCRA"
    }

    companion object {
        private val HEX_PATTERN = Regex("^[0-9A-Fa-f]{1,8}$")
    }
}

/** Convenience helpers mirroring the legacy TypeScript API. */
object ElmAt {
    val reset: ElmAtCommand = ElmAtCommand.Reset
    val warmStart: ElmAtCommand = ElmAtCommand.WarmStart
    val setProtocolAuto: ElmAtCommand = ElmAtCommand.SetProtocolAuto
    val echoOff: ElmAtCommand = ElmAtCommand.EchoOff
    val lineFeedsOff: ElmAtCommand = ElmAtCommand.LineFeedsOff
    val spacesOff: ElmAtCommand = ElmAtCommand.SpacesOff
    val headersOff: ElmAtCommand = ElmAtCommand.HeadersOff
    val clearCanFilter: ElmAtCommand = ElmAtCommand.ClearCanFilter

    fun setProtocol(code: String): ElmAtCommand = ElmAtCommand.SetProtocol(code)
    fun adaptiveTiming(mode: Int): ElmAtCommand = ElmAtCommand.AdaptiveTiming(mode)
    fun setTimeout(hex: String): ElmAtCommand = ElmAtCommand.SetTimeout(hex)
    fun setTxHeader(hex: String): ElmAtCommand = ElmAtCommand.SetTxHeader(hex)
    fun setCanFilter(hex: String): ElmAtCommand = ElmAtCommand.SetCanFilter(hex)
}
