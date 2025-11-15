package com.selfservice.core.permissions

import android.content.Context
import android.os.Build

data class BluetoothEnvironmentState(
    val permissionStatus: BluetoothPermissionHelper.PermissionStatus,
    val bluetoothEnabled: Boolean,
    val locationEnabled: Boolean
) {
    val isReady: Boolean
        get() = permissionStatus is BluetoothPermissionHelper.PermissionStatus.Granted &&
            bluetoothEnabled &&
            locationEnabled
}

object BluetoothEnvironmentEvaluator {

    fun evaluate(
        context: Context,
        apiLevel: Int = Build.VERSION.SDK_INT
    ): BluetoothEnvironmentState {
        return evaluate(
            permissions = { BluetoothPermissionHelper.runtimePermissionStatus(context, apiLevel) },
            bluetoothEnabled = { BluetoothPermissionHelper.isBluetoothEnabled(context) },
            locationEnabled = { BluetoothPermissionHelper.isLocationEnabled(context, apiLevel) }
        )
    }

    fun evaluate(
        permissions: () -> BluetoothPermissionHelper.PermissionStatus,
        bluetoothEnabled: () -> Boolean,
        locationEnabled: () -> Boolean
    ): BluetoothEnvironmentState {
        return BluetoothEnvironmentState(
            permissionStatus = permissions(),
            bluetoothEnabled = bluetoothEnabled(),
            locationEnabled = locationEnabled()
        )
    }
}
