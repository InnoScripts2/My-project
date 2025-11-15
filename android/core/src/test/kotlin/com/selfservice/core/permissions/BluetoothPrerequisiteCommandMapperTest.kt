package com.selfservice.core.permissions

import android.bluetooth.BluetoothAdapter
import android.provider.Settings
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertIs

class BluetoothPrerequisiteCommandMapperTest {

    @Test
    fun mapsReadyToNone() {
        val command = BluetoothPrerequisiteCommandMapper.map(BluetoothPrerequisiteAction.Ready)

        assertIs<BluetoothPrerequisiteCommand.None>(command)
    }

    @Test
    fun mapsRequestPermissions() {
        val command = BluetoothPrerequisiteCommandMapper.map(
            BluetoothPrerequisiteAction.RequestPermissions(listOf("perm.a", "perm.b"))
        )

        val request = assertIs<BluetoothPrerequisiteCommand.RequestPermissions>(command)
    assertContentEquals(arrayOf("perm.a", "perm.b"), request.permissions)
        assertEquals(BluetoothPermissionHelper.BLUETOOTH_PERMISSION_REQUEST_CODE, request.requestCode)
    }

    @Test
    fun mapsEnableBluetooth() {
        val command = BluetoothPrerequisiteCommandMapper.map(BluetoothPrerequisiteAction.EnableBluetooth)

        val startActivity = assertIs<BluetoothPrerequisiteCommand.StartActivityForResult>(command)
    assertEquals(BluetoothPermissionHelper.BLUETOOTH_ENABLE_REQUEST_CODE, startActivity.requestCode)
    assertEquals(BluetoothAdapter.ACTION_REQUEST_ENABLE, startActivity.intentAction)
    }

    @Test
    fun mapsEnableLocation() {
        val command = BluetoothPrerequisiteCommandMapper.map(BluetoothPrerequisiteAction.EnableLocation)

        val start = assertIs<BluetoothPrerequisiteCommand.StartActivity>(command)
    assertEquals(Settings.ACTION_LOCATION_SOURCE_SETTINGS, start.intentAction)
    }
}
