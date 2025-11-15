package com.selfservice.obd.core.protocol

import com.selfservice.obd.core.dictionary.ObdDictionaryManager
import com.selfservice.obd.core.dtc.ObdDtcDefinition
import com.selfservice.obd.core.pid.ObdPidDefinition
import com.selfservice.obd.core.pid.PidConversions
import com.selfservice.obd.core.transport.TransportFrame
import java.nio.charset.Charset
import java.util.Locale

/** Parses ASCII responses coming from an ELM327-compatible transport. */
object ElmResponseDecoder {
    private val dictionaries: ObdDictionaryManager = ObdDictionaryManager.shared

    fun asciiString(frame: TransportFrame, charset: Charset = Charsets.US_ASCII): String {
        return frame.payload.toString(charset)
    }

    fun parsePid(definition: ObdPidDefinition, frame: TransportFrame): ObdPidSample? {
        return parsePid(definition, asciiString(frame), frame.timestampMs)
    }

    fun parsePid(
            definition: ObdPidDefinition,
            response: String,
            timestampMillis: Long = currentTimeMillis()
    ): ObdPidSample? {
        val tokens = extractTokens(response)
        if (tokens.isEmpty()) return null
        val expectedMode = expectedResponseMode(definition.mode) ?: return null
        val expectedPid = normalize(definition.pid)
        val pairIndex = findModePidIndex(tokens, expectedMode, expectedPid) ?: return null
        val payloadTokens = tokens.drop(pairIndex + 2)
        if (payloadTokens.isEmpty()) return null
        val requiredBytes = requiredPayloadLength(definition)
        if (payloadTokens.size < requiredBytes) return null
        val rawBytes =
                payloadTokens.take(requiredBytes).mapNotNull { hex ->
                    hex.toIntOrNull(16)?.toByte()
                }
        if (rawBytes.size < requiredBytes) return null
        val byteArray = rawBytes.toByteArray()
        val rawHex = payloadTokens.take(requiredBytes).joinToString(separator = "")
        val fullDefinition = dictionaries.lookupPid(definition.mode, definition.pid) ?: definition
        val conversionDefinition = fullDefinition.conversion?.let(PidConversions::find)
        val formula = fullDefinition.formula ?: conversionDefinition?.formula
        val unit = fullDefinition.unit ?: conversionDefinition?.unit
        val value =
                formula?.let {
                    runCatching { PidFormulaEvaluator.evaluate(it, byteArray) }.getOrNull()
                }
        return ObdPidSample(
                definition = fullDefinition,
                rawPayload = byteArray,
                rawHex = rawHex,
                value = value,
                unit = unit,
                timestampMillis = timestampMillis
        )
    }

    fun parseDtc(frame: TransportFrame): ObdDtcBatch? {
        return parseDtc(asciiString(frame), frame.timestampMs)
    }

    fun parseDtc(response: String, timestampMillis: Long = currentTimeMillis()): ObdDtcBatch? {
        val tokens = extractTokens(response)
        if (tokens.isEmpty()) return null
        val idx = tokens.indexOf("43")
        if (idx == -1) return null
        val data = tokens.drop(idx + 1)
        if (data.isEmpty()) return ObdDtcBatch(emptyList(), timestampMillis)
        val entries = mutableListOf<ObdDtcEntry>()
        var pointer = 0
        while (pointer + 1 < data.size) {
            val first = data[pointer].toIntOrNull(16) ?: break
            val second = data[pointer + 1].toIntOrNull(16) ?: break
            val code = decodeDtc(first, second)
            pointer += 2
            if (code == "P0000") continue
            val definition = dictionaries.lookupDtc(code)
            entries += ObdDtcEntry(code = code, definition = definition)
        }
        return ObdDtcBatch(entries = entries, timestampMillis = timestampMillis)
    }

    fun isClearConfirmation(response: String): Boolean {
        val tokens = extractTokens(response)
        return tokens.contains("44")
    }

    private fun extractTokens(response: String): List<String> {
        val sanitized =
                response.replace('\r', ' ')
                        .replace('\n', ' ')
                        .replace('>', ' ')
                        .uppercase(Locale.US)
        if (sanitized.isBlank()) return emptyList()
        val rawTokens = sanitized.split(Regex("\\s+"))
        val result = mutableListOf<String>()
        for (token in rawTokens) {
            if (token.isBlank()) continue
            if (token.length == 2 && token.all(HEX_CHARS::contains)) {
                result += token
            } else if (token.length > 2 && token.all(HEX_CHARS::contains) && token.length % 2 == 0
            ) {
                token.chunked(2).forEach { chunk -> result += chunk }
            }
        }
        return result
    }

    private fun findModePidIndex(tokens: List<String>, mode: String, pid: String): Int? {
        for (index in 0 until tokens.size - 1) {
            if (tokens[index] == mode && tokens[index + 1] == pid) {
                return index
            }
        }
        return null
    }

    private fun expectedResponseMode(mode: String): String? {
        val normalized = normalize(mode)
        val modeValue = normalized.toIntOrNull(16) ?: return null
        val response = (modeValue + 0x40) and 0xFF
        return response.toString(16).uppercase(Locale.US).padStart(2, '0')
    }

    private fun requiredPayloadLength(definition: ObdPidDefinition): Int {
        val formulaSource =
                definition.formula
                        ?: definition.conversion?.let { conversionName ->
                            PidConversions.find(conversionName)?.formula
                        }
        if (formulaSource.isNullOrBlank()) return 1
        val letters = formulaSource.uppercase(Locale.US).filter { it in LETTER_ORDER }
        if (letters.isEmpty()) return 1
        val maxIndex = letters.maxOf { LETTER_ORDER.indexOf(it) }
        return maxIndex + 1
    }

    private fun decodeDtc(first: Int, second: Int): String {
        val prefixIndex = (first and 0xC0) shr 6
        val system =
                when (prefixIndex) {
                    0 -> 'P'
                    1 -> 'C'
                    2 -> 'B'
                    else -> 'U'
                }
        val digit2 = (first and 0x30) shr 4
        val digit3 = first and 0x0F
        val digit4 = (second and 0xF0) shr 4
        val digit5 = second and 0x0F
        return buildString(5) {
            append(system)
            append(digit2)
            append(HEX_DIGIT_MAP[digit3])
            append(HEX_DIGIT_MAP[digit4])
            append(HEX_DIGIT_MAP[digit5])
        }
    }

    private fun normalize(value: String): String {
        val trimmed = value.trim()
        val withoutPrefix =
                if (trimmed.startsWith("0x", ignoreCase = true)) {
                    trimmed.substring(2)
                } else {
                    trimmed
                }
        return withoutPrefix.uppercase(Locale.US)
    }

    private fun currentTimeMillis(): Long = System.currentTimeMillis()

    private val HEX_CHARS =
            setOf('0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F')
    private val HEX_DIGIT_MAP =
            charArrayOf(
                    '0',
                    '1',
                    '2',
                    '3',
                    '4',
                    '5',
                    '6',
                    '7',
                    '8',
                    '9',
                    'A',
                    'B',
                    'C',
                    'D',
                    'E',
                    'F'
            )
    private val LETTER_ORDER = listOf('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H')
}

/** Describes a decoded PID sample with optional interpreted value. */
data class ObdPidSample(
        val definition: ObdPidDefinition,
        val rawPayload: ByteArray,
        val rawHex: String,
        val value: Double?,
        val unit: String?,
        val timestampMillis: Long
)

/** Single DTC entry resolved against the catalog when possible. */
data class ObdDtcEntry(val code: String, val definition: ObdDtcDefinition?)

/** Collection of DTC entries produced by a mode 03 response. */
data class ObdDtcBatch(val entries: List<ObdDtcEntry>, val timestampMillis: Long)
