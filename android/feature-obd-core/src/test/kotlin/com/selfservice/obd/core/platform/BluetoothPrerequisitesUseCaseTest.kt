package com.selfservice.obd.core.platform

import com.selfservice.core.permissions.BluetoothEnvironmentState
import com.selfservice.core.permissions.BluetoothEnvironmentStatus
import com.selfservice.core.permissions.BluetoothPermissionHelper
import com.selfservice.core.permissions.BluetoothPrerequisiteAction
import kotlin.test.Test
import kotlin.test.assertEquals

class BluetoothPrerequisitesUseCaseTest {

    @Test
    fun returnsReadyWhenEnvironmentReady() {
        val repository = FakeRepository(
            state = BluetoothEnvironmentState(
                permissionStatus = BluetoothPermissionHelper.PermissionStatus.Granted,
                bluetoothEnabled = true,
                locationEnabled = true
            ),
            status = BluetoothEnvironmentStatus.Ready
        )
        val useCase = BluetoothPrerequisitesUseCase(repository) { 42L }

        val result = useCase.evaluate()

        assertEquals(BluetoothPrerequisiteAction.Ready, result.action)
        assertEquals(BluetoothEnvironmentStatus.Ready, result.status)
        assertEquals(42L, result.timestampMillis)
    }

    @Test
    fun mapsMissingPermissionsToRequestAction() {
        val missing = listOf("perm.a", "perm.b")
        val repository = FakeRepository(
            state = BluetoothEnvironmentState(
                permissionStatus = BluetoothPermissionHelper.PermissionStatus.Missing(missing),
                bluetoothEnabled = true,
                locationEnabled = true
            ),
            status = BluetoothEnvironmentStatus.MissingPermissions(missing)
        )
        val useCase = BluetoothPrerequisitesUseCase(repository) { 99L }

        val result = useCase.evaluate()

        assertEquals(BluetoothPrerequisiteAction.RequestPermissions(missing), result.action)
        assertEquals(BluetoothEnvironmentStatus.MissingPermissions(missing), result.status)
        assertEquals(99L, result.timestampMillis)
    }

    @Test
    fun mapsBluetoothDisabledToEnableAction() {
        val repository = FakeRepository(
            state = BluetoothEnvironmentState(
                permissionStatus = BluetoothPermissionHelper.PermissionStatus.Granted,
                bluetoothEnabled = false,
                locationEnabled = true
            ),
            status = BluetoothEnvironmentStatus.BluetoothDisabled
        )
        val useCase = BluetoothPrerequisitesUseCase(repository) { 1L }

        val result = useCase.evaluate()

        assertEquals(BluetoothPrerequisiteAction.EnableBluetooth, result.action)
        assertEquals(BluetoothEnvironmentStatus.BluetoothDisabled, result.status)
    }

    @Test
    fun mapsLocationDisabledToEnableAction() {
        val repository = FakeRepository(
            state = BluetoothEnvironmentState(
                permissionStatus = BluetoothPermissionHelper.PermissionStatus.Granted,
                bluetoothEnabled = true,
                locationEnabled = false
            ),
            status = BluetoothEnvironmentStatus.LocationDisabled
        )
        val useCase = BluetoothPrerequisitesUseCase(repository)

        val result = useCase.evaluate()

        assertEquals(BluetoothPrerequisiteAction.EnableLocation, result.action)
        assertEquals(BluetoothEnvironmentStatus.LocationDisabled, result.status)
    }

    private class FakeRepository(
        private val state: BluetoothEnvironmentState,
        private val status: BluetoothEnvironmentStatus
    ) : BluetoothEnvironmentRepository {
        override fun snapshot(): BluetoothEnvironmentState = state
        override fun status(): BluetoothEnvironmentStatus = status
    }
}
