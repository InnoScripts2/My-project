package com.selfservice.obd.core.isotp

/** Splits ISO-TP PDUs into transport frames. */
object IsoTpEncoder {
    fun encode(payload: ByteArray): List<IsoTpFrame> {
        require(payload.isNotEmpty()) { "ISO-TP payload must not be empty" }
        return if (payload.size <= 7) {
            listOf(IsoTpFrame.Single(payload.copyOf()))
        } else {
            encodeMultiFrame(payload)
        }
    }

    private fun encodeMultiFrame(payload: ByteArray): List<IsoTpFrame> {
        val frames = ArrayList<IsoTpFrame>()
        val totalLength = payload.size
        val firstPayload = payload.copyOfRange(0, IsoTpFrame.maximumChunkSize(totalLength))
        frames.add(IsoTpFrame.First(totalLength, firstPayload))
        var index = firstPayload.size
        var sequence = 1
        while (index < payload.size) {
            val end = minOf(index + 7, payload.size)
            val chunk = payload.copyOfRange(index, end)
            frames.add(IsoTpFrame.Consecutive(sequence, chunk))
            sequence = (sequence + 1) and 0x0F
            index = end
        }
        return frames
    }
}
