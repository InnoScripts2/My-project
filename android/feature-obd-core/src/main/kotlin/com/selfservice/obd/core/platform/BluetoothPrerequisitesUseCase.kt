package com.selfservice.obd.core.platform

import com.selfservice.core.permissions.BluetoothEnvironmentState
import com.selfservice.core.permissions.BluetoothEnvironmentStatus
import com.selfservice.core.permissions.BluetoothEnvironmentStatus.MissingPermissions
import com.selfservice.core.permissions.BluetoothPrerequisiteAction

class BluetoothPrerequisitesUseCase(
    private val repository: BluetoothEnvironmentRepository,
    private val timestampProvider: () -> Long = { System.currentTimeMillis() }
) {

    fun evaluate(): BluetoothPrerequisiteResult {
        val state = repository.snapshot()
        val status = repository.status()
        val action = mapAction(status)
        return BluetoothPrerequisiteResult(
            state = state,
            status = status,
            action = action,
            timestampMillis = timestampProvider()
        )
    }

    private fun mapAction(status: BluetoothEnvironmentStatus): BluetoothPrerequisiteAction {
        return when (status) {
            BluetoothEnvironmentStatus.Ready -> BluetoothPrerequisiteAction.Ready
            is MissingPermissions -> BluetoothPrerequisiteAction.RequestPermissions(status.permissions)
            BluetoothEnvironmentStatus.BluetoothDisabled -> BluetoothPrerequisiteAction.EnableBluetooth
            BluetoothEnvironmentStatus.LocationDisabled -> BluetoothPrerequisiteAction.EnableLocation
        }
    }
}

data class BluetoothPrerequisiteResult(
    val state: BluetoothEnvironmentState,
    val status: BluetoothEnvironmentStatus,
    val action: BluetoothPrerequisiteAction,
    val timestampMillis: Long
)
