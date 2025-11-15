package com.selfservice.kiosk.diagnostics.elm

private val DTC_PREFIXES = charArrayOf('P', 'C', 'B', 'U')

object ElmResponseParser {
    fun parseDtcResponse(raw: String): List<String> {
        val tokens = raw
            .uppercase()
            .replace(Regex("[^0-9A-F]"), " ")
            .split(Regex("\\s+"))
            .filter { it.length == 2 }

        if (tokens.isEmpty()) return emptyList()

        val codes = mutableListOf<String>()
        var index = 0
        while (index < tokens.size) {
            if (tokens[index] != "43") {
                index++
                continue
            }
            index++
            while (index + 1 < tokens.size) {
                val highToken = tokens[index]
                if (highToken == "43") break
                val lowToken = tokens.getOrNull(index + 1) ?: break
                if (lowToken == "43") break

                val high = highToken.toIntOrNull(16) ?: break
                val low = lowToken.toIntOrNull(16) ?: break
                if (high == 0 && low == 0) {
                    index += 2
                    continue
                }

                val prefix = DTC_PREFIXES[(high shr 6) and 0x03]
                val firstDigit = ((high shr 4) and 0x03).toString()
                val secondDigit = (high and 0x0F).toString(16).uppercase()
                val lastDigits = low.toString(16).uppercase().padStart(2, '0')

                codes += buildString {
                    append(prefix)
                    append(firstDigit)
                    append(secondDigit)
                    append(lastDigits)
                }

                index += 2
            }
        }
        return codes
    }

    fun normalizeResponse(raw: String): String {
        return raw
            .replace(">", "")
            .lines()
            .map { it.trim() }
            .filter { it.isNotEmpty() }
            .filter { !it.equals("OK", ignoreCase = true) }
            .joinToString("\n")
    }
}
