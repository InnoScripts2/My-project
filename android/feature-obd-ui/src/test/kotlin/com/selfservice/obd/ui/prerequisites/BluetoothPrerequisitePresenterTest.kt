package com.selfservice.obd.ui.prerequisites

import com.selfservice.core.DispatchersProvider
import com.selfservice.core.permissions.BluetoothEnvironmentState
import com.selfservice.core.permissions.BluetoothEnvironmentStatus
import com.selfservice.core.permissions.BluetoothPermissionHelper
import com.selfservice.core.permissions.BluetoothPrerequisiteCommand
import com.selfservice.obd.core.platform.BluetoothEnvironmentRepository
import com.selfservice.obd.core.platform.BluetoothPrerequisitesMonitor
import com.selfservice.obd.core.platform.BluetoothPrerequisitesUseCase
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertTrue
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.take
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout

@OptIn(ExperimentalCoroutinesApi::class)
class BluetoothPrerequisitePresenterTest {

    @Test
    fun evaluateMapsStatusAndCommand() = runBlocking {
        val response =
                Response(
                        state =
                                BluetoothEnvironmentState(
                                        permissionStatus =
                                                BluetoothPermissionHelper.PermissionStatus.Missing(
                                                        listOf("android.permission.BLUETOOTH_SCAN")
                                                ),
                                        bluetoothEnabled = false,
                                        locationEnabled = true
                                ),
                        status =
                                BluetoothEnvironmentStatus.MissingPermissions(
                                        listOf("android.permission.BLUETOOTH_SCAN")
                                ),
                        timestamp = 42L
                )
        val repository = QueueRepository(responses = ArrayDeque(listOf(response)))
        val useCase = BluetoothPrerequisitesUseCase(repository) { response.timestamp }
        val presenter = presenter(useCase)

        val state = presenter.evaluate()

        assertEquals(response.status, state.status)
        assertEquals(response.timestamp, state.timestampMillis)
        val command = assertIs<BluetoothPrerequisiteCommand.RequestPermissions>(state.command)
        assertTrue(command.permissions.contains("android.permission.BLUETOOTH_SCAN"))
        assertFalse(state.isReady)
    }

    @Test
    fun observeEmitsMappedUiStates() = runBlocking {
        val permissionMissing =
                Response(
                        state =
                                BluetoothEnvironmentState(
                                        permissionStatus =
                                                BluetoothPermissionHelper.PermissionStatus.Missing(
                                                        listOf("android.permission.BLUETOOTH_SCAN")
                                                ),
                                        bluetoothEnabled = true,
                                        locationEnabled = true
                                ),
                        status =
                                BluetoothEnvironmentStatus.MissingPermissions(
                                        listOf("android.permission.BLUETOOTH_SCAN")
                                ),
                        timestamp = 1L
                )
        val ready =
                Response(
                        state =
                                BluetoothEnvironmentState(
                                        permissionStatus =
                                                BluetoothPermissionHelper.PermissionStatus.Granted,
                                        bluetoothEnabled = true,
                                        locationEnabled = true
                                ),
                        status = BluetoothEnvironmentStatus.Ready,
                        timestamp = 2L
                )
        val repository = QueueRepository(ArrayDeque(listOf(permissionMissing, ready, ready)))
        val useCase = BluetoothPrerequisitesUseCase(repository) { repository.peekTimestamp() }
        val dispatchers = TestDispatchersProvider(Dispatchers.Unconfined)
        val monitor = BluetoothPrerequisitesMonitor(useCase, dispatchers, pollIntervalMillis = 1L)
        val presenter = BluetoothPrerequisitePresenter(useCase, monitor)

        val uiStates = withTimeout(5_000L) { presenter.observe().take(2).toList() }
        assertEquals(2, uiStates.size)
        assertIs<BluetoothPrerequisiteCommand.RequestPermissions>(uiStates[0].command)
        assertFalse(uiStates[0].isReady)
        assertIs<BluetoothPrerequisiteCommand.None>(uiStates[1].command)
        assertTrue(uiStates[1].isReady)
    }

    private fun presenter(useCase: BluetoothPrerequisitesUseCase): BluetoothPrerequisitePresenter {
        val dispatchers = TestDispatchersProvider(Dispatchers.Unconfined)
        val monitor =
                BluetoothPrerequisitesMonitor(useCase, dispatchers, pollIntervalMillis = 10_000L)
        return BluetoothPrerequisitePresenter(useCase, monitor)
    }

    private data class Response(
            val state: BluetoothEnvironmentState,
            val status: BluetoothEnvironmentStatus,
            val timestamp: Long
    )

    private class QueueRepository(private val responses: ArrayDeque<Response>) :
            BluetoothEnvironmentRepository {

        private var last: Response? = null

        override fun snapshot(): BluetoothEnvironmentState {
            return next().state
        }

        override fun status(): BluetoothEnvironmentStatus {
            return last?.status ?: BluetoothEnvironmentStatus.Ready
        }

        fun peekTimestamp(): Long {
            return last?.timestamp ?: 0L
        }

        private fun next(): Response {
            val response =
                    if (responses.isEmpty()) {
                        last
                                ?: Response(
                                        state =
                                                BluetoothEnvironmentState(
                                                        permissionStatus =
                                                                BluetoothPermissionHelper
                                                                        .PermissionStatus.Granted,
                                                        bluetoothEnabled = true,
                                                        locationEnabled = true
                                                ),
                                        status = BluetoothEnvironmentStatus.Ready,
                                        timestamp = 0L
                                )
                    } else {
                        responses.removeFirst()
                    }
            last = response
            return response
        }
    }

    private class TestDispatchersProvider(private val schedulerDispatcher: CoroutineDispatcher) :
            DispatchersProvider {
        override val io: CoroutineDispatcher = schedulerDispatcher
        override val computation: CoroutineDispatcher = schedulerDispatcher
        override val main: CoroutineDispatcher = schedulerDispatcher
    }
}
