package com.selfservice.kiosk.bluetooth.data

import android.util.Log
import com.selfservice.kiosk.bluetooth.connection.ClassicSppConnection
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import java.io.IOException

class SppElmTransport(private val connection: ClassicSppConnection) : ElmTransport {

    private val responseChannel = Channel<String>(Channel.UNLIMITED)

    override suspend fun sendCommand(command: String): Result<String> {
        return withContext(Dispatchers.IO) {
            try {
                val formattedCommand = command.trim() + "\r"
                Log.d(TAG, "Sending command: $command")

                val outputStream = connection.outputStream 
                    ?: return@withContext Result.failure(Exception("Output stream not available"))
                
                outputStream.write(formattedCommand.toByteArray(Charsets.US_ASCII))
                outputStream.flush()

                val response = withTimeout(COMMAND_TIMEOUT_MS) {
                    readResponse()
                }

                Log.d(TAG, "Received response: $response")
                Result.success(response)
            } catch (e: TimeoutCancellationException) {
                Log.e(TAG, "Command timeout for: $command")
                Result.failure(Exception("Command timeout"))
            } catch (e: IOException) {
                Log.e(TAG, "I/O error for command: $command", e)
                Result.failure(e)
            } catch (e: Exception) {
                Log.e(TAG, "Command error for: $command", e)
                Result.failure(e)
            }
        }
    }

    private suspend fun readResponse(): String = withContext(Dispatchers.IO) {
        val inputStream = connection.inputStream 
            ?: throw IOException("Input stream not available")
        
        val buffer = ByteArray(1024)
        val responseBuilder = StringBuilder()

        while (true) {
            val available = inputStream.available()
            if (available > 0) {
                val bytesRead = inputStream.read(buffer, 0, minOf(available, buffer.size))
                if (bytesRead > 0) {
                    val chunk = String(buffer, 0, bytesRead, Charsets.US_ASCII)
                    responseBuilder.append(chunk)

                    if (chunk.contains(">")) {
                        break
                    }
                }
            } else {
                kotlinx.coroutines.delay(10)
            }
        }

        normalizeResponse(responseBuilder.toString())
    }

    override fun getResponses(): Flow<String> {
        return responseChannel.receiveAsFlow()
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
        private const val TAG = "SppElmTransport"
        private const val COMMAND_TIMEOUT_MS = 3000L
    }
}
