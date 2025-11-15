package com.selfservice.obd.core.protocol

import com.selfservice.obd.core.pid.ObdPidDefinition
import com.selfservice.obd.core.transport.TransportFrame
import java.util.Locale

/**
 * Builds transport frames for OBD-II mode and PID requests.
 */
object ObdRequestBuilder {
    fun forPid(definition: ObdPidDefinition, timestampMillis: Long = currentTimeMillis()): TransportFrame {
        return forPid(definition.mode, definition.pid, timestampMillis)
    }

    fun forPid(mode: String, pid: String, timestampMillis: Long = currentTimeMillis()): TransportFrame {
        val normalizedMode = normalize(mode)
        val normalizedPid = normalize(pid)
        val command = normalizedMode + normalizedPid
        return ElmCommandCodec.frameForRaw(command, timestampMillis)
    }

    fun readTroubleCodes(timestampMillis: Long = currentTimeMillis()): TransportFrame {
        return ElmCommandCodec.frameForRaw("03", timestampMillis)
    }

    fun clearTroubleCodes(timestampMillis: Long = currentTimeMillis()): TransportFrame {
        return ElmCommandCodec.frameForRaw("04", timestampMillis)
    }

    private fun normalize(value: String): String {
        val trimmed = value.trim()
        val withoutPrefix = if (trimmed.startsWith("0x", ignoreCase = true)) {
            trimmed.substring(2)
        } else {
            trimmed
        }
        return withoutPrefix.uppercase(Locale.US)
    }

    private fun currentTimeMillis(): Long = System.currentTimeMillis()
}
