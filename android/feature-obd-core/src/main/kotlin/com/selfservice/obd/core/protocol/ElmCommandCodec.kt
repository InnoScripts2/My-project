package com.selfservice.obd.core.protocol

import com.selfservice.obd.core.command.ElmAtCommand
import com.selfservice.obd.core.transport.TransportFrame
import java.nio.charset.StandardCharsets
import java.util.Locale

/**
 * Utilities that turn high level ELM327 commands into transport frames.
 */
object ElmCommandCodec {
    fun frameFor(command: ElmAtCommand, timestampMillis: Long = currentTimeMillis()): TransportFrame {
        return frameForRaw(command.encode(), timestampMillis)
    }

    fun frameForRaw(command: String, timestampMillis: Long = currentTimeMillis()): TransportFrame {
        val payload = (command.trim().uppercase(Locale.US) + "\r").toByteArray(StandardCharsets.US_ASCII)
        return TransportFrame(payload = payload, timestampMs = timestampMillis)
    }

    private fun currentTimeMillis(): Long = System.currentTimeMillis()
}
