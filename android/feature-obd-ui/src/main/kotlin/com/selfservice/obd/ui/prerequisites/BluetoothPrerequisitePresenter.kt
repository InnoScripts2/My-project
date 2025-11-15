package com.selfservice.obd.ui.prerequisites

import com.selfservice.core.permissions.BluetoothEnvironmentStatus
import com.selfservice.core.permissions.BluetoothPrerequisiteAction
import com.selfservice.core.permissions.BluetoothPrerequisiteCommand
import com.selfservice.core.permissions.BluetoothPrerequisiteCommandMapper
import com.selfservice.obd.core.platform.BluetoothPrerequisiteResult
import com.selfservice.obd.core.platform.BluetoothPrerequisitesMonitor
import com.selfservice.obd.core.platform.BluetoothPrerequisitesUseCase
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

/**
 * Presents Bluetooth prerequisite state for the UI and maps required actions to executable commands.
 */
class BluetoothPrerequisitePresenter(
    private val useCase: BluetoothPrerequisitesUseCase,
    private val monitor: BluetoothPrerequisitesMonitor,
    private val commandMapper: BluetoothPrerequisiteCommandMapper = BluetoothPrerequisiteCommandMapper
) {

    fun evaluate(): BluetoothPrerequisiteUiState {
        return useCase.evaluate().toUiState()
    }

    fun observe(): Flow<BluetoothPrerequisiteUiState> {
        return monitor.observe().map { result -> result.toUiState() }
    }

    private fun BluetoothPrerequisiteResult.toUiState(): BluetoothPrerequisiteUiState {
        val command = commandMapper.map(action)
        return BluetoothPrerequisiteUiState(
            status = status,
            action = action,
            command = command,
            timestampMillis = timestampMillis
        )
    }
}

data class BluetoothPrerequisiteUiState(
    val status: BluetoothEnvironmentStatus,
    val action: BluetoothPrerequisiteAction,
    val command: BluetoothPrerequisiteCommand,
    val timestampMillis: Long
) {
    val isReady: Boolean get() = action == BluetoothPrerequisiteAction.Ready
}
