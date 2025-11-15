package com.selfservice.kiosk.bluetooth.data

import android.annotation.SuppressLint
import android.bluetooth.BluetoothGattCharacteristic
import android.util.Log
import com.selfservice.kiosk.bluetooth.connection.BleGattConnection
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.withTimeout

class BleElmTransport(private val connection: BleGattConnection) : ElmTransport {

    private val responseChannel = Channel<String>(Channel.UNLIMITED)
    private val responseBuffer = StringBuilder()

    @SuppressLint("MissingPermission")
    override suspend fun sendCommand(command: String): Result<String> {
        return try {
            val formattedCommand = command.trim() + "\r"
            Log.d(TAG, "Sending command: $command")
            
            val data = formattedCommand.toByteArray(Charsets.US_ASCII)
            
            responseBuffer.clear()
            
            withTimeout(COMMAND_TIMEOUT_MS) {
                val response = responseChannel.receive()
                Log.d(TAG, "Received response: $response")
                Result.success(response)
            }
        } catch (e: TimeoutCancellationException) {
            Log.e(TAG, "Command timeout for: $command")
            Result.failure(Exception("Command timeout"))
        } catch (e: Exception) {
            Log.e(TAG, "Command error for: $command", e)
            Result.failure(e)
        }
    }

    override fun getResponses(): Flow<String> {
        return responseChannel.receiveAsFlow()
    }

    private fun processReceivedData(data: ByteArray) {
        val text = data.toString(Charsets.US_ASCII)
        responseBuffer.append(text)
        
        if (text.contains(">")) {
            val fullResponse = responseBuffer.toString()
            responseBuffer.clear()
            
            val normalized = normalizeResponse(fullResponse)
            responseChannel.trySend(normalized)
        }
    }

    private fun normalizeResponse(response: String): String {
        return response
            .replace(">", "")
            .trim()
            .lines()
            .filter { it.isNotBlank() }
            .filter { !it.equals("OK", ignoreCase = true) }
            .joinToString("\n")
    }

    companion object {
        private const val TAG = "BleElmTransport"
        private const val COMMAND_TIMEOUT_MS = 3000L
    }
}
