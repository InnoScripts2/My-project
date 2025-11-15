package com.selfservice.obd.core.isotp

import kotlin.math.min

/** Represents a single ISO-TP frame transported over an 8-byte CAN payload. */
sealed class IsoTpFrame {
    abstract val dataLength: Int

    /** Converts this frame into a raw CAN payload (max 8 bytes). */
    abstract fun toCanPayload(): ByteArray

    data class Single(val body: ByteArray) : IsoTpFrame() {
        override val dataLength: Int = body.size

        init {
            require(body.isNotEmpty() && body.size <= 7) { "Single frame must contain 1..7 bytes" }
        }

        override fun toCanPayload(): ByteArray {
            val header = (dataLength and 0x0F).toByte()
            val out = ByteArray(1 + dataLength)
            out[0] = header
            body.copyInto(out, destinationOffset = 1)
            return out
        }
    }

    data class First(val totalLength: Int, val chunk: ByteArray) : IsoTpFrame() {
        override val dataLength: Int = chunk.size

        init {
            require(totalLength in 8..4095) { "Total length must be within ISO-TP 12-bit boundary" }
            require(chunk.size <= 6) { "First frame may carry up to 6 data bytes" }
        }

        override fun toCanPayload(): ByteArray {
            val headerHigh = ((0x1 shl 4) or ((totalLength shr 8) and 0x0F)).toByte()
            val headerLow = (totalLength and 0xFF).toByte()
            val out = ByteArray(2 + chunk.size)
            out[0] = headerHigh
            out[1] = headerLow
            chunk.copyInto(out, destinationOffset = 2)
            return out
        }
    }

    data class Consecutive(val sequenceNumber: Int, val chunk: ByteArray) : IsoTpFrame() {
        override val dataLength: Int = chunk.size

        init {
            require(sequenceNumber in 0..15) { "Sequence number must be 0..15" }
            require(chunk.size <= 7) { "Consecutive frame may carry up to 7 data bytes" }
        }

        override fun toCanPayload(): ByteArray {
            val header = ((0x2 shl 4) or (sequenceNumber and 0x0F)).toByte()
            val out = ByteArray(1 + chunk.size)
            out[0] = header
            chunk.copyInto(out, destinationOffset = 1)
            return out
        }
    }

    data class Flow(val status: FlowStatus, val blockSize: Int, val separationTimeMs: Int) : IsoTpFrame() {
        override val dataLength: Int = 0

        init {
            require(blockSize in 0..255) { "Block size must be 0..255" }
            require(separationTimeMs in 0..0xFF) { "Separation time must fit STmin byte (0..255)" }
        }

        override fun toCanPayload(): ByteArray {
            val header = ((0x3 shl 4) or status.code).toByte()
            return byteArrayOf(header, blockSize.toByte(), separationTimeMs.toByte())
        }
    }

    enum class FlowStatus(val code: Int) {
        CONTINUE(0),
        WAIT(1),
        OVERFLOW(2)
    }

    companion object {
        fun maximumChunkSize(totalLength: Int): Int {
            return when {
                totalLength <= 7 -> totalLength
                else -> 6
            }
        }
    }
}
