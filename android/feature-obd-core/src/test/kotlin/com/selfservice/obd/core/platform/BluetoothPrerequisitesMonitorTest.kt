package com.selfservice.obd.core.platform

import com.selfservice.core.DispatchersProvider
import com.selfservice.core.permissions.BluetoothEnvironmentState
import com.selfservice.core.permissions.BluetoothEnvironmentStatus
import com.selfservice.core.permissions.BluetoothPermissionHelper
import com.selfservice.core.permissions.BluetoothPrerequisiteAction
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.take
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.test.advanceUntilIdle

@OptIn(ExperimentalCoroutinesApi::class)
class BluetoothPrerequisitesMonitorTest {

    @Test
    fun emitsOnlyWhenStatusChanges() = runTest {
        val responses = listOf(
            Response(
                state = readyState,
                status = BluetoothEnvironmentStatus.MissingPermissions(listOf("perm"))
            ),
            Response(
                state = readyState,
                status = BluetoothEnvironmentStatus.MissingPermissions(listOf("perm"))
            ),
            Response(
                state = readyState,
                status = BluetoothEnvironmentStatus.Ready
            )
        )
        val repository = QueueRepository(responses)
        val timestamps = ArrayDeque(listOf(1L, 2L, 3L))
        val useCase = BluetoothPrerequisitesUseCase(repository) { timestamps.removeFirst() }
        val dispatchers = RecordingDispatchersProvider(testScheduler)
        val monitor = BluetoothPrerequisitesMonitor(useCase, dispatchers, pollIntervalMillis = 10)

        val emissions = mutableListOf<BluetoothPrerequisiteResult>()
        val job = launch {
            monitor.observe()
                .take(2)
                .toList(emissions)
        }

        advanceUntilIdle()

        job.cancel()

        assertEquals(2, emissions.size)
        assertEquals(BluetoothPrerequisiteAction.RequestPermissions(listOf("perm")), emissions[0].action)
        assertEquals(BluetoothPrerequisiteAction.Ready, emissions[1].action)
    }

    private val readyState = BluetoothEnvironmentState(
        permissionStatus = BluetoothPermissionHelper.PermissionStatus.Granted,
        bluetoothEnabled = true,
        locationEnabled = true
    )

    private data class Response(
        val state: BluetoothEnvironmentState,
        val status: BluetoothEnvironmentStatus
    )

    private class QueueRepository(
        private val responses: List<Response>
    ) : BluetoothEnvironmentRepository {
        private var index = 0
        override fun snapshot(): BluetoothEnvironmentState {
            val current = responses[index]
            return current.state
        }

        override fun status(): BluetoothEnvironmentStatus {
            val current = responses[index]
            if (index < responses.lastIndex) {
                index += 1
            }
            return current.status
        }
    }

    private class RecordingDispatchersProvider(
        testScheduler: kotlinx.coroutines.test.TestCoroutineScheduler
    ) : DispatchersProvider {
        private val dispatcher = StandardTestDispatcher(testScheduler)
        override val io: CoroutineDispatcher = dispatcher
        override val computation: CoroutineDispatcher = dispatcher
        override val main: CoroutineDispatcher = dispatcher
    }
}
