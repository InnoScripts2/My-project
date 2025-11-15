package com.selfservice.core.permissions

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class BluetoothEnvironmentEvaluatorTest {

    @Test
    fun environmentIsReadyWhenAllConditionsMet() {
        val state = BluetoothEnvironmentState(
            permissionStatus = BluetoothPermissionHelper.PermissionStatus.Granted,
            bluetoothEnabled = true,
            locationEnabled = true
        )

        assertTrue(state.isReady)
    }

    @Test
    fun environmentIsNotReadyWhenPermissionsMissing() {
        val state = BluetoothEnvironmentState(
            permissionStatus = BluetoothPermissionHelper.PermissionStatus.Missing(listOf("perm")),
            bluetoothEnabled = true,
            locationEnabled = true
        )

        assertFalse(state.isReady)
    }

    @Test
    fun evaluatorBuildsStateFromSuppliedProviders() {
        val state = BluetoothEnvironmentEvaluator.evaluate(
            permissions = { BluetoothPermissionHelper.PermissionStatus.Granted },
            bluetoothEnabled = { true },
            locationEnabled = { false }
        )

        assertFalse(state.isReady)
    }
}
