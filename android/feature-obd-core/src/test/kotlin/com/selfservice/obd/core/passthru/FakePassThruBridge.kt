package com.selfservice.obd.core.passthru

import kotlin.collections.ArrayDeque

/**
 * Test double for [PassThruNativeBridge]. It captures all invocations and allows tests to enqueue
 * deterministic read/write results or force failures.
 */
class FakePassThruBridge : PassThruNativeBridge {
    data class Call(val name: String, val args: List<Any?>)

    val calls: MutableList<Call> = mutableListOf()
    var channelId: Int = 101
    var openShouldFail: Throwable? = null
    var closeShouldFail: Throwable? = null
    var voltageShouldFail: Throwable? = null
    var writeShouldFail: Throwable? = null
    var readShouldFail: Throwable? = null
    var writeResult: Result<Unit> = Result.success(Unit)
    val writeResults: ArrayDeque<Result<Unit>> = ArrayDeque()
    val reads: ArrayDeque<Result<PassThruMessage?>> = ArrayDeque()
    var defaultRead: Result<PassThruMessage?> = Result.success(null)
    var readCallCount: Int = 0

    val openCalls: List<PassThruChannelConfig>
        get() =
                calls.filter { it.name == "openChannel" }.map {
                    it.args[0] as PassThruChannelConfig
                }

    val closeCalls: List<Int>
        get() = calls.filter { it.name == "closeChannel" }.map { it.args[0] as Int }

    val voltageCalls: List<Pair<Int, Int>>
        get() =
                calls.filter { it.name == "setReferenceVoltage" }.map {
                    (it.args[0] as Int) to (it.args[1] as Int)
                }

    val writeCalls: List<Pair<PassThruMessage, Int>>
        get() =
                calls.filter { it.name == "writeMessage" }.map {
                    (it.args[0] as PassThruMessage) to (it.args[1] as Int)
                }

    fun enqueueRead(result: Result<PassThruMessage?>) {
        reads += result
    }

    fun enqueueWrite(result: Result<Unit>) {
        writeResults += result
    }

    override fun openChannel(config: PassThruChannelConfig): Result<Int> {
        calls += Call("openChannel", listOf(config))
        openShouldFail?.let {
            return Result.failure(it)
        }
        return Result.success(channelId)
    }

    override fun closeChannel(channelId: Int): Result<Unit> {
        calls += Call("closeChannel", listOf(channelId))
        closeShouldFail?.let {
            return Result.failure(it)
        }
        return Result.success(Unit)
    }

    override fun setReferenceVoltage(channelId: Int, millivolts: Int): Result<Unit> {
        calls += Call("setReferenceVoltage", listOf(channelId, millivolts))
        voltageShouldFail?.let {
            return Result.failure(it)
        }
        return Result.success(Unit)
    }

    override fun writeMessage(message: PassThruMessage, timeoutMs: Int): Result<Unit> {
        calls += Call("writeMessage", listOf(message, timeoutMs))
        writeShouldFail?.let {
            return Result.failure(it)
        }
        val next = writeResults.removeFirstOrNull()
        return next ?: writeResult
    }

    override fun readMessage(channelId: Int, timeoutMs: Int): Result<PassThruMessage?> {
        calls += Call("readMessage", listOf(channelId, timeoutMs))
        readCallCount += 1
        readShouldFail?.let {
            return Result.failure(it)
        }
        val next = reads.removeFirstOrNull()
        return next ?: defaultRead
    }
}
