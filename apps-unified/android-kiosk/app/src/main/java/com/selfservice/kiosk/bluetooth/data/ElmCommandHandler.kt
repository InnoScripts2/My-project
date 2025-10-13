package com.selfservice.kiosk.bluetooth.data

import android.util.Log
import com.selfservice.kiosk.diagnostics.elm.ElmResponseParser
import kotlinx.coroutines.delay

class ElmCommandHandler(private val transport: ElmTransport) {

    suspend fun initializeElm(): Result<Unit> {
        Log.i(TAG, "Initializing ELM327")
        
        val commands = listOf(
            "ATZ" to "Reset",
            "ATE0" to "Echo off",
            "ATL0" to "Linefeeds off",
            "ATS0" to "Spaces off",
            "ATH0" to "Headers off",
            "ATSP0" to "Auto protocol"
        )

        for ((command, description) in commands) {
            Log.d(TAG, "Sending: $description ($command)")
            
            val result = transport.sendCommand(command)
            if (result.isFailure) {
                Log.e(TAG, "Failed to execute $description: ${result.exceptionOrNull()?.message}")
                return Result.failure(result.exceptionOrNull() ?: Exception("Failed to execute $description"))
            }
            
            val response = result.getOrNull()
            Log.d(TAG, "$description response: $response")
            
            delay(100)
        }

        Log.i(TAG, "ELM327 initialized successfully")
        return Result.success(Unit)
    }

    suspend fun readPid(pid: String): Result<String> {
        val command = "01$pid"
        Log.d(TAG, "Reading PID: $pid")
        
        return transport.sendCommand(command)
    }

    suspend fun readDtc(): Result<List<String>> {
        Log.i(TAG, "Reading DTCs")
        
        val result = transport.sendCommand("03")
        if (result.isFailure) {
            return Result.failure(result.exceptionOrNull() ?: Exception("Failed to read DTCs"))
        }

        val response = result.getOrNull() ?: ""
        val dtcCodes = ElmResponseParser.parseDtcResponse(response)
        
        Log.i(TAG, "Found ${dtcCodes.size} DTCs: $dtcCodes")
        return Result.success(dtcCodes)
    }

    suspend fun clearDtc(): Result<Unit> {
        Log.i(TAG, "Clearing DTCs")
        
        val result = transport.sendCommand("04")
        if (result.isFailure) {
            return Result.failure(result.exceptionOrNull() ?: Exception("Failed to clear DTCs"))
        }

        Log.i(TAG, "DTCs cleared successfully")
        return Result.success(Unit)
    }

    suspend fun getVoltage(): Result<String> {
        Log.d(TAG, "Reading voltage")
        return transport.sendCommand("ATRV")
    }

    suspend fun getProtocol(): Result<String> {
        Log.d(TAG, "Reading protocol")
        return transport.sendCommand("ATDP")
    }

    companion object {
        private const val TAG = "ElmCommandHandler"
    }
}
