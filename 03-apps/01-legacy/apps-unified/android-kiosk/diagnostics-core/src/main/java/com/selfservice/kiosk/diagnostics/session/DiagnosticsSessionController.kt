package com.selfservice.kiosk.diagnostics.session

import com.selfservice.kiosk.diagnostics.core.DiagnosticsErrorCode
import com.selfservice.kiosk.diagnostics.core.DiagnosticsException
import com.selfservice.kiosk.diagnostics.passthru.AdapterOptions
import com.selfservice.kiosk.diagnostics.passthru.ChannelRequest
import com.selfservice.kiosk.diagnostics.passthru.PassThruClient
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlin.time.Duration
import kotlin.time.Duration.Companion.seconds

data class SessionParameters(
    val adapterId: String,
    val protocol: String,
    val baudRate: Int
)

sealed class DiagnosticsSessionState {
    data object Idle : DiagnosticsSessionState()
    data object Connecting : DiagnosticsSessionState()
    data class Ready(val adapterId: String) : DiagnosticsSessionState()
    data class Failed(val code: DiagnosticsErrorCode, val reason: String) : DiagnosticsSessionState()
}

class DiagnosticsSessionController(
    private val client: PassThruClient,
    private val scope: CoroutineScope = CoroutineScope(Dispatchers.IO)
) {
    private val stateInternal = MutableStateFlow<DiagnosticsSessionState>(DiagnosticsSessionState.Idle)
    val state: StateFlow<DiagnosticsSessionState> = stateInternal

    private var sessionJob: Job? = null
    private var lastAdapterId: String? = null

    fun startSession(parameters: SessionParameters) {
        sessionJob?.cancel()
        sessionJob = scope.launch {
            stateInternal.value = DiagnosticsSessionState.Connecting
            try {
                val adapterHandle = client.open(
                    parameters.adapterId,
                    AdapterOptions(
                        protocol = parameters.protocol,
                        baudRate = parameters.baudRate
                    )
                )
                client.establishChannel(
                    ChannelRequest(
                        flags = 0,
                        protocolId = 0,
                        txHeader = 0x7E0,
                        rxHeader = 0x7E8
                    )
                )
                lastAdapterId = adapterHandle.adapterId
                stateInternal.value = DiagnosticsSessionState.Ready(adapterHandle.adapterId)
            } catch (ex: DiagnosticsException) {
                stateInternal.value = DiagnosticsSessionState.Failed(ex.code, ex.message ?: "Unknown diagnostics error")
                client.close()
            } catch (ex: Throwable) {
                stateInternal.value = DiagnosticsSessionState.Failed(
                    DiagnosticsErrorCode.TRANSPORT_ERROR,
                    ex.message ?: "Unexpected error"
                )
                client.close()
            }
        }
    }

    fun stopSession() {
        sessionJob?.cancel()
        sessionJob = null
        scope.launch { client.close() }
        stateInternal.value = DiagnosticsSessionState.Idle
    }

    suspend fun clearDtc(timeout: Duration = 2.seconds) {
        stateInternal.value = DiagnosticsSessionState.Connecting
        runCatching {
            client.clearDtc(
                strategy = com.selfservice.kiosk.diagnostics.passthru.ClearStrategy(
                    payload = byteArrayOf(0x14, 0xFF.toByte(), 0xFF.toByte()),
                    timeout = timeout
                )
            )
        }.onFailure { throwable ->
            val code = if (throwable is DiagnosticsException) throwable.code else DiagnosticsErrorCode.TRANSPORT_ERROR
            stateInternal.value = DiagnosticsSessionState.Failed(code, throwable.message ?: "Clear DTC failed")
            return
        }
        stateInternal.value = DiagnosticsSessionState.Ready(lastAdapterId ?: "pass-thru")
    }
}
