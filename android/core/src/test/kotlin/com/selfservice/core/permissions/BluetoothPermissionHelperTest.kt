package com.selfservice.core.permissions

import android.Manifest
import android.os.Build
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class BluetoothPermissionHelperTest {

    @Test
    fun requiredRuntimePermissions_preS() {
        val permissions = BluetoothPermissionHelper.requiredRuntimePermissions(apiLevel = Build.VERSION_CODES.R)

        assertEquals(
            setOf(
                Manifest.permission.BLUETOOTH,
                Manifest.permission.BLUETOOTH_ADMIN,
                Manifest.permission.ACCESS_FINE_LOCATION
            ),
            permissions
        )
    }

    @Test
    fun requiredRuntimePermissions_sAndAbove() {
        val permissions = BluetoothPermissionHelper.requiredRuntimePermissions(apiLevel = Build.VERSION_CODES.S)

        assertEquals(
            setOf(
                Manifest.permission.BLUETOOTH_CONNECT,
                Manifest.permission.BLUETOOTH_SCAN,
                Manifest.permission.ACCESS_FINE_LOCATION
            ),
            permissions
        )
    }

    @Test
    fun requiresLocationToggle_preSReturnsTrue() {
        assertTrue(BluetoothPermissionHelper.requiresLocationToggle(apiLevel = Build.VERSION_CODES.R))
    }

    @Test
    fun requiresLocationToggle_sAndAboveReturnsFalse() {
        assertFalse(BluetoothPermissionHelper.requiresLocationToggle(apiLevel = Build.VERSION_CODES.S))
    }
}
