package com.selfservice.core.permissions

/**
 * High-level readiness status derived from [BluetoothEnvironmentState].
 * Order of evaluation matches the typical user flow: permissions, Bluetooth radio, location toggle.
 */
sealed interface BluetoothEnvironmentStatus {
    data object Ready : BluetoothEnvironmentStatus
    data class MissingPermissions(val permissions: List<String>) : BluetoothEnvironmentStatus
    data object BluetoothDisabled : BluetoothEnvironmentStatus
    data object LocationDisabled : BluetoothEnvironmentStatus
}

object BluetoothEnvironmentStatusDecider {
    fun decide(state: BluetoothEnvironmentState): BluetoothEnvironmentStatus {
        val permissionStatus = state.permissionStatus
        if (permissionStatus is BluetoothPermissionHelper.PermissionStatus.Missing) {
            return BluetoothEnvironmentStatus.MissingPermissions(permissionStatus.permissions)
        }
        if (!state.bluetoothEnabled) {
            return BluetoothEnvironmentStatus.BluetoothDisabled
        }
        if (!state.locationEnabled) {
            return BluetoothEnvironmentStatus.LocationDisabled
        }
        return BluetoothEnvironmentStatus.Ready
    }
}

fun BluetoothEnvironmentState.toStatus(): BluetoothEnvironmentStatus {
    return BluetoothEnvironmentStatusDecider.decide(this)
}
