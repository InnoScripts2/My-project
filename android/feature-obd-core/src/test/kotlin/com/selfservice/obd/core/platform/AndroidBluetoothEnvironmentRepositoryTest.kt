package com.selfservice.obd.core.platform

import android.content.Context
import com.selfservice.core.permissions.BluetoothEnvironmentState
import com.selfservice.core.permissions.BluetoothEnvironmentStatus
import com.selfservice.core.permissions.BluetoothPermissionHelper
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import org.mockito.Mockito.mock

class AndroidBluetoothEnvironmentRepositoryTest {

    @Test
    fun snapshotUsesEvaluatorAndApiLevelProvider() {
        val context = mock(Context::class.java)
        var capturedContext: Context? = null
        var capturedApiLevel = -1
        val expectedState = BluetoothEnvironmentState(
            permissionStatus = BluetoothPermissionHelper.PermissionStatus.Granted,
            bluetoothEnabled = true,
            locationEnabled = false
        )
        val repository = AndroidBluetoothEnvironmentRepository(
            context = context,
            apiLevelProvider = { 33 },
            evaluator = { ctx, api ->
                capturedContext = ctx
                capturedApiLevel = api
                expectedState
            }
        )

        val state = repository.snapshot()

        assertEquals(expectedState, state)
        assertTrue(capturedContext === context)
        assertEquals(33, capturedApiLevel)
    }

    @Test
    fun statusMapsEvaluationResult() {
        val context = mock(Context::class.java)
        val repository = AndroidBluetoothEnvironmentRepository(
            context = context,
            apiLevelProvider = { 31 },
            evaluator = { _, _ ->
                BluetoothEnvironmentState(
                    permissionStatus = BluetoothPermissionHelper.PermissionStatus.Granted,
                    bluetoothEnabled = true,
                    locationEnabled = false
                )
            }
        )

        val status = repository.status()

        assertEquals(BluetoothEnvironmentStatus.LocationDisabled, status)
    }
}
