package com.selfservice.core.permissions

import android.content.Intent
import android.bluetooth.BluetoothAdapter
import android.provider.Settings

sealed interface BluetoothPrerequisiteCommand {
    data object None : BluetoothPrerequisiteCommand
    data class RequestPermissions(
        val permissions: Array<String>,
        val requestCode: Int
    ) : BluetoothPrerequisiteCommand
    data class StartActivityForResult(
        val intent: Intent,
        val requestCode: Int,
        val intentAction: String?
    ) : BluetoothPrerequisiteCommand
    data class StartActivity(
        val intent: Intent,
        val intentAction: String?
    ) : BluetoothPrerequisiteCommand
}

object BluetoothPrerequisiteCommandMapper {

    fun map(action: BluetoothPrerequisiteAction): BluetoothPrerequisiteCommand {
        return when (action) {
            BluetoothPrerequisiteAction.Ready -> BluetoothPrerequisiteCommand.None
            is BluetoothPrerequisiteAction.RequestPermissions -> {
                BluetoothPrerequisiteCommand.RequestPermissions(
                    permissions = action.permissions.toTypedArray(),
                    requestCode = BluetoothPermissionHelper.BLUETOOTH_PERMISSION_REQUEST_CODE
                )
            }
            BluetoothPrerequisiteAction.EnableBluetooth -> {
                BluetoothPrerequisiteCommand.StartActivityForResult(
                    intent = BluetoothPermissionHelper.enableBluetoothIntent(),
                    requestCode = BluetoothPermissionHelper.BLUETOOTH_ENABLE_REQUEST_CODE,
                    intentAction = BluetoothAdapter.ACTION_REQUEST_ENABLE
                )
            }
            BluetoothPrerequisiteAction.EnableLocation -> {
                BluetoothPrerequisiteCommand.StartActivity(
                    intent = Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS),
                    intentAction = Settings.ACTION_LOCATION_SOURCE_SETTINGS
                )
            }
        }
    }
}
