package com.selfservice.obd.core.isotp

import com.selfservice.obd.core.transport.TransportFrame
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch

/** Collects ISO-TP frames and reconstructs complete PDUs. */
class IsoTpDecoder(
    private val scope: CoroutineScope,
    private val frameSource: Flow<TransportFrame>,
    private val clock: () -> Long = { System.currentTimeMillis() },
    private val flowControlSender: suspend (IsoTpFrame.Flow) -> Unit = {}
) {
    private val output = MutableSharedFlow<IsoTpPdu>(extraBufferCapacity = 8)
    private var collectorJob: Job? = null

    fun start() {
        if (collectorJob != null) return
        collectorJob = scope.launch {
            frameSource.collect { frame ->
                handleFrame(frame)
            }
        }
    }

    fun stop() {
        collectorJob?.cancel()
        collectorJob = null
    }

    fun pdus(): Flow<IsoTpPdu> = output

    fun reset() {
        assembler = null
    }

    private var assembler: IsoTpAssembler? = null

    private fun handleFrame(frame: TransportFrame) {
        val bytes = frame.payload
        if (bytes.isEmpty()) return

        when (bytes[0].toInt() and 0xF0 shr 4) {
            0 -> handleSingleFrame(bytes, frame.timestampMs)
            1 -> handleFirstFrame(bytes)
            2 -> handleConsecutiveFrame(bytes, frame.timestampMs)
            3 -> handleFlowControl(bytes)
        }
    }

    private fun handleSingleFrame(raw: ByteArray, timestamp: Long) {
        val length = raw[0].toInt() and 0x0F
        if (length == 0 || length > raw.size - 1) return
        val payload = raw.copyOfRange(1, 1 + length)
        output.tryEmit(IsoTpPdu(payload, timestamp))
    }

    private fun handleFirstFrame(raw: ByteArray) {
        if (raw.size < 2) return
        val length = ((raw[0].toInt() and 0x0F) shl 8) or (raw[1].toInt() and 0xFF)
        if (length <= 7) return
        val data = raw.copyOfRange(2, raw.size)
        assembler = IsoTpAssembler(length, data)
        scope.launch {
            flowControlSender(IsoTpFrame.Flow(IsoTpFrame.FlowStatus.CONTINUE, blockSize = 0, separationTimeMs = 0))
        }
    }

    private fun handleConsecutiveFrame(raw: ByteArray, timestamp: Long) {
        val buffer = assembler ?: return
        val sequenceNumber = raw[0].toInt() and 0x0F
        val payload = raw.copyOfRange(1, raw.size)
        when (val result = buffer.append(sequenceNumber, payload)) {
            IsoTpAssembler.AppendResult.Reset -> assembler = null
            is IsoTpAssembler.AppendResult.Complete -> {
                output.tryEmit(IsoTpPdu(result.payload, timestamp))
                assembler = null
            }
            IsoTpAssembler.AppendResult.Continue -> {
                // keep assembling
            }
        }
    }

    private fun handleFlowControl(raw: ByteArray) {
        val buffer = assembler ?: return
        if (raw.size < 3) return
        val blockSize = raw[1].toInt() and 0xFF
        val separation = raw[2].toInt() and 0xFF
        buffer.applyFlowControl(blockSize, separation)
    }

    private class IsoTpAssembler(
        private val totalLength: Int,
        firstChunk: ByteArray
    ) {
        private val bytes = ArrayList<Byte>(totalLength)
        private var expectedSequence = 1
        private var blocksRemaining: Int? = null

        init {
            bytes.addAll(firstChunk.toList())
        }

        fun append(sequence: Int, chunk: ByteArray): AppendResult {
            if (chunk.isEmpty()) return AppendResult.Reset
            val shouldEnforceBlock = blocksRemaining != null
            if (shouldEnforceBlock && blocksRemaining == 0) {
                return AppendResult.Reset
            }
            if (sequence != expectedSequence) return AppendResult.Reset
            bytes.addAll(chunk.toList())
            if (bytes.size > totalLength) return AppendResult.Reset
            expectedSequence = (expectedSequence + 1) and 0x0F
            if (expectedSequence == 0) {
                expectedSequence = 0
            }
            if (shouldEnforceBlock) {
                blocksRemaining = blocksRemaining?.let { if (it == 0) 0 else it - 1 }
            }
            return if (bytes.size >= totalLength) {
                AppendResult.Complete(bytes.take(totalLength).toByteArray())
            } else {
                AppendResult.Continue
            }
        }

        fun applyFlowControl(blockSize: Int, @Suppress("UNUSED_PARAMETER") separationTime: Int) {
            blocksRemaining = when (blockSize) {
                0 -> null
                else -> blockSize
            }
        }

        sealed class AppendResult {
            object Continue : AppendResult()
            data class Complete(val payload: ByteArray) : AppendResult()
            object Reset : AppendResult()
        }
    }
}
