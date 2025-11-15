package com.selfservice.obd.core.diagnostics

import com.selfservice.obd.core.command.ElmAt
import com.selfservice.obd.core.transport.ObdTransport
import com.selfservice.obd.core.transport.TransportConnectionResult
import com.selfservice.obd.core.transport.TransportFrame
import com.selfservice.obd.core.transport.TransportSendResult
import java.nio.charset.StandardCharsets
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.test.runTest

private class FakeObdTransport(
        private val responses: Map<String, List<String>> = emptyMap(),
        private val failureCommands: Set<String> = emptySet(),
        private val connectResult: TransportConnectionResult = TransportConnectionResult.Success
) : ObdTransport {
    private val framesFlow = MutableSharedFlow<TransportFrame>(replay = 8, extraBufferCapacity = 8)
    private val sent = mutableListOf<String>()

    override val frames: Flow<TransportFrame> = framesFlow.asSharedFlow()

    override suspend fun connect(): TransportConnectionResult = connectResult

    override suspend fun send(frame: TransportFrame): TransportSendResult {
        val ascii = frame.payload.toString(StandardCharsets.US_ASCII).trim()
        sent += ascii
        if (failureCommands.contains(ascii)) {
            return TransportSendResult.Failed(IllegalStateException("send failed for $ascii"))
        }
        responses[ascii]?.forEach { text ->
            framesFlow.emit(TransportFrame(text.toByteArray(StandardCharsets.US_ASCII)))
        }
        return TransportSendResult.Delivered
    }

    override suspend fun disconnect() {
        // no-op
    }

    fun sentCommands(): List<String> = sent.toList()
}

class ObdDiagnosticsProcessorTest {

    @Test
    fun `run executes handshake pid and dtc`() = runTest {
        val transport =
                FakeObdTransport(
                        responses =
                                mapOf(
                                        "010C" to listOf("41 0C 1A F8"),
                                        "010D" to listOf("41 0D 28"),
                                        "03" to listOf("43 01 00 00 00 00"),
                                        "04" to listOf("44 00 00 00")
                                )
                )
        val processor =
                ObdDiagnosticsProcessor(
                        handshake = listOf(ElmAt.reset, ElmAt.echoOff),
                        timeProvider = { 0L }
                )
        val result =
                processor.run(
                        transport = transport,
                        request =
                                ObdDiagnosticsRequest(
                                        pidRequests =
                                                listOf(
                                                        ObdPidRequest("0x01", "0x0C"),
                                                        ObdPidRequest("0x01", "0x0D")
                                                ),
                                        readTroubleCodes = true,
                                        clearTroubleCodes = true
                                )
                )

        assertTrue(result.succeeded, "failures: ${result.failures}")
        assertEquals(2, result.pidSamples.size)
        assertEquals("P0100", result.troubleCodes?.entries?.firstOrNull()?.code)
        assertTrue(result.clearPerformed == true)
    }

    @Test
    fun `handshake failure stops execution`() = runTest {
        val transport = FakeObdTransport(failureCommands = setOf("ATZ"))
        val processor =
                ObdDiagnosticsProcessor(handshake = listOf(ElmAt.reset), timeProvider = { 0L })

        val result = processor.run(transport, ObdDiagnosticsRequest())

        assertFalse(result.succeeded)
        assertTrue(result.failures.any { it.stage == Stage.HANDSHAKE })
        assertEquals(emptyList(), result.pidSamples)
    }

    @Test
    fun `missing pid definition recorded as failure`() = runTest {
        val transport = FakeObdTransport()
        val processor = ObdDiagnosticsProcessor(handshake = emptyList(), timeProvider = { 0L })

        val result =
                processor.run(
                        transport,
                        ObdDiagnosticsRequest(pidRequests = listOf(ObdPidRequest("0x99", "0x01")))
                )

        assertFalse(result.succeeded)
        assertTrue(result.failures.any { it.detail.startsWith("missing") })
    }
}
