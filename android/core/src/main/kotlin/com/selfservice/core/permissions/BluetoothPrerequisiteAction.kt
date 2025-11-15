package com.selfservice.core.permissions

sealed interface BluetoothPrerequisiteAction {
    data object Ready : BluetoothPrerequisiteAction
    data class RequestPermissions(val permissions: List<String>) : BluetoothPrerequisiteAction
    data object EnableBluetooth : BluetoothPrerequisiteAction
    data object EnableLocation : BluetoothPrerequisiteAction
}
