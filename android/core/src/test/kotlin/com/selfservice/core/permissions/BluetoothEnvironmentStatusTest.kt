package com.selfservice.core.permissions

import kotlin.test.Test
import kotlin.test.assertEquals

class BluetoothEnvironmentStatusTest {

    @Test
    fun missingPermissionsHasPriority() {
        val state = BluetoothEnvironmentState(
            permissionStatus = BluetoothPermissionHelper.PermissionStatus.Missing(listOf("a", "b")),
            bluetoothEnabled = false,
            locationEnabled = false
        )

        val status = state.toStatus()

        assertEquals(BluetoothEnvironmentStatus.MissingPermissions(listOf("a", "b")), status)
    }

    @Test
    fun bluetoothDisabledWhenPermissionsGranted() {
        val state = BluetoothEnvironmentState(
            permissionStatus = BluetoothPermissionHelper.PermissionStatus.Granted,
            bluetoothEnabled = false,
            locationEnabled = true
        )

        val status = state.toStatus()

        assertEquals(BluetoothEnvironmentStatus.BluetoothDisabled, status)
    }

    @Test
    fun locationDisabledWhenOthersSatisfied() {
        val state = BluetoothEnvironmentState(
            permissionStatus = BluetoothPermissionHelper.PermissionStatus.Granted,
            bluetoothEnabled = true,
            locationEnabled = false
        )

        val status = state.toStatus()

        assertEquals(BluetoothEnvironmentStatus.LocationDisabled, status)
    }

    @Test
    fun readyWhenAllSatisfied() {
        val state = BluetoothEnvironmentState(
            permissionStatus = BluetoothPermissionHelper.PermissionStatus.Granted,
            bluetoothEnabled = true,
            locationEnabled = true
        )

        val status = state.toStatus()

        assertEquals(BluetoothEnvironmentStatus.Ready, status)
    }
}
