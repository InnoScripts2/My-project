package com.selfservice.obd.core.diagnostics

import com.selfservice.obd.core.command.ElmAt
import com.selfservice.obd.core.command.ElmAtCommand
import com.selfservice.obd.core.dictionary.ObdDictionaryManager
import com.selfservice.obd.core.protocol.ElmTransportSession
import com.selfservice.obd.core.protocol.ObdDtcBatch
import com.selfservice.obd.core.protocol.ObdPidSample
import com.selfservice.obd.core.transport.ObdTransport
import com.selfservice.obd.core.transport.TransportConnectionResult
import com.selfservice.obd.core.transport.TransportSendResult

/**
 * Runs a complete diagnostics cycle over an [ObdTransport]: handshake, PID sampling and DTC read.
 * Keeps orchestration logic here so session/UI layers can trigger a single use-case and receive a
 * structured result with failures per stage.
 */
class ObdDiagnosticsProcessor(
        private val dictionaryManager: ObdDictionaryManager = ObdDictionaryManager.shared,
        private val handshake: List<ElmAtCommand> = DEFAULT_HANDSHAKE,
        private val timeProvider: () -> Long = { System.currentTimeMillis() }
) {

    suspend fun run(transport: ObdTransport, request: ObdDiagnosticsRequest): ObdDiagnosticsResult {
        val startMillis = timeProvider()
        val failures = mutableListOf<DiagnosticsFailure>()
        val samples = mutableListOf<ObdPidSample>()
        var dtcBatch: ObdDtcBatch? = null
        var clearStatus: Boolean? = null

        val connection = transport.connect()
        if (connection is TransportConnectionResult.Failure) {
            failures +=
                    DiagnosticsFailure(Stage.CONNECT, detail = "connect", cause = connection.cause)
            return ObdDiagnosticsResult(
                    pidSamples = emptyList(),
                    troubleCodes = null,
                    clearPerformed = null,
                    failures = failures,
                    durationMillis = timeProvider() - startMillis
            )
        }

        try {
            val session =
                    ElmTransportSession(
                            transport = transport,
                            responseTimeoutMillis = request.responseTimeoutMillis,
                            timeProvider = timeProvider
                    )

            for (command in handshake) {
                val sendResult = session.sendAt(command)
                if (sendResult !is TransportSendResult.Delivered) {
                    failures +=
                            DiagnosticsFailure(
                                    Stage.HANDSHAKE,
                                    detail = command.encode(),
                                    cause = (sendResult as? TransportSendResult.Failed)?.cause
                            )
                    return ObdDiagnosticsResult(
                            pidSamples = emptyList(),
                            troubleCodes = null,
                            clearPerformed = null,
                            failures = failures,
                            durationMillis = timeProvider() - startMillis
                    )
                }
            }

            for (pidRequest in request.pidRequests) {
                val definition = dictionaryManager.lookupPid(pidRequest.mode, pidRequest.pid)
                if (definition == null) {
                    failures +=
                            DiagnosticsFailure(
                                    Stage.PID_SCAN,
                                    detail = "missing:${pidRequest.mode}:${pidRequest.pid}"
                            )
                    continue
                }
                var recordedError = false
                val sample =
                        try {
                            session.requestPid(
                                    definition,
                                    pidRequest.timeoutMillis ?: request.responseTimeoutMillis
                            )
                        } catch (throwable: Throwable) {
                            recordedError = true
                            failures +=
                                    DiagnosticsFailure(
                                            Stage.PID_SCAN,
                                            detail = "error:${definition.mode}:${definition.pid}",
                                            cause = throwable
                                    )
                            null
                        }
                if (sample != null) {
                    samples += sample
                } else {
                    if (!recordedError) {
                        failures +=
                                DiagnosticsFailure(
                                        Stage.PID_SCAN,
                                        detail = "timeout:${definition.mode}:${definition.pid}"
                                )
                    }
                }
            }

            if (request.readTroubleCodes) {
                dtcBatch =
                        runCatching { session.readTroubleCodes(request.responseTimeoutMillis) }
                                .getOrElse { throwable ->
                                    failures +=
                                            DiagnosticsFailure(
                                                    Stage.DTC_READ,
                                                    detail = "mode03",
                                                    cause = throwable
                                            )
                                    null
                                }
                if (dtcBatch == null) {
                    failures += DiagnosticsFailure(Stage.DTC_READ, detail = "incomplete")
                }
            }

            if (request.clearTroubleCodes) {
                clearStatus =
                        runCatching { session.clearTroubleCodes(request.responseTimeoutMillis) }
                                .getOrElse { throwable ->
                                    failures +=
                                            DiagnosticsFailure(
                                                    Stage.CLEAR,
                                                    detail = "mode04",
                                                    cause = throwable
                                            )
                                    false
                                }
                if (clearStatus != true) {
                    failures += DiagnosticsFailure(Stage.CLEAR, detail = "confirmation")
                }
            }
        } catch (unexpected: Throwable) {
            failures +=
                    DiagnosticsFailure(Stage.UNEXPECTED, detail = "unhandled", cause = unexpected)
        } finally {
            transport.disconnect()
        }

        val duration = timeProvider() - startMillis
        return ObdDiagnosticsResult(
                pidSamples = samples,
                troubleCodes = dtcBatch,
                clearPerformed = clearStatus,
                failures = failures,
                durationMillis = duration
        )
    }

    companion object {
        private val DEFAULT_HANDSHAKE =
                listOf(
                        ElmAt.reset,
                        ElmAt.echoOff,
                        ElmAt.lineFeedsOff,
                        ElmAt.spacesOff,
                        ElmAt.headersOff,
                        ElmAt.setProtocolAuto
                )
    }
}

data class ObdDiagnosticsRequest(
        val pidRequests: List<ObdPidRequest> = emptyList(),
        val readTroubleCodes: Boolean = true,
        val clearTroubleCodes: Boolean = false,
        val responseTimeoutMillis: Long = 1_500L
)

data class ObdPidRequest(val mode: String, val pid: String, val timeoutMillis: Long? = null)

data class ObdDiagnosticsResult(
        val pidSamples: List<ObdPidSample>,
        val troubleCodes: ObdDtcBatch?,
        val clearPerformed: Boolean?,
        val failures: List<DiagnosticsFailure>,
        val durationMillis: Long
) {
    val succeeded: Boolean
        get() = failures.isEmpty()
}

data class DiagnosticsFailure(val stage: Stage, val detail: String, val cause: Throwable? = null)

enum class Stage {
    CONNECT,
    HANDSHAKE,
    PID_SCAN,
    DTC_READ,
    CLEAR,
    UNEXPECTED
}
