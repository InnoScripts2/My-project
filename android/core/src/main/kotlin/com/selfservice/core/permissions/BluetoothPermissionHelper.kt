package com.selfservice.core.permissions

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.LocationManager
import android.os.Build
import androidx.core.content.ContextCompat

object BluetoothPermissionHelper {

    private val legacyRuntimePermissions = setOf(
        Manifest.permission.BLUETOOTH,
        Manifest.permission.BLUETOOTH_ADMIN,
        Manifest.permission.ACCESS_FINE_LOCATION
    )

    private val modernRuntimePermissions = setOf(
        Manifest.permission.BLUETOOTH_CONNECT,
        Manifest.permission.BLUETOOTH_SCAN,
        Manifest.permission.ACCESS_FINE_LOCATION
    )

    fun requiredRuntimePermissions(apiLevel: Int = Build.VERSION.SDK_INT): Set<String> {
        return if (apiLevel >= Build.VERSION_CODES.S) {
            modernRuntimePermissions
        } else {
            legacyRuntimePermissions
        }
    }

    fun missingRuntimePermissions(
        context: Context,
        apiLevel: Int = Build.VERSION.SDK_INT
    ): List<String> {
        val requiredPermissions = requiredRuntimePermissions(apiLevel)
        return requiredPermissions.filter { permission ->
            ContextCompat.checkSelfPermission(context, permission) != PackageManager.PERMISSION_GRANTED
        }
    }

    fun runtimePermissionStatus(
        context: Context,
        apiLevel: Int = Build.VERSION.SDK_INT
    ): PermissionStatus {
        val missingPermissions = missingRuntimePermissions(context, apiLevel)
        return if (missingPermissions.isEmpty()) {
            PermissionStatus.Granted
        } else {
            PermissionStatus.Missing(missingPermissions)
        }
    }

    fun isBluetoothEnabled(context: Context): Boolean {
        val bluetoothManager = ContextCompat.getSystemService(context, BluetoothManager::class.java)
        return bluetoothManager?.adapter?.isEnabled == true
    }

    fun enableBluetoothIntent(): Intent {
        return Intent(BluetoothAdapter.ACTION_REQUEST_ENABLE)
    }

    fun requiresLocationToggle(apiLevel: Int = Build.VERSION.SDK_INT): Boolean {
        return apiLevel < Build.VERSION_CODES.S
    }

    fun isLocationEnabled(
        context: Context,
        apiLevel: Int = Build.VERSION.SDK_INT
    ): Boolean {
        if (!requiresLocationToggle(apiLevel)) {
            return true
        }
        val locationManager = ContextCompat.getSystemService(context, LocationManager::class.java)
        return locationManager?.isProviderEnabled(LocationManager.GPS_PROVIDER) == true ||
            locationManager?.isProviderEnabled(LocationManager.NETWORK_PROVIDER) == true
    }

    sealed interface PermissionStatus {
        data object Granted : PermissionStatus
        data class Missing(val permissions: List<String>) : PermissionStatus
    }

    const val BLUETOOTH_PERMISSION_REQUEST_CODE = 1001
    const val BLUETOOTH_ENABLE_REQUEST_CODE = 1002
}
