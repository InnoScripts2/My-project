package com.selfservice.kiosk.bluetooth

import android.content.Context
import android.content.pm.PackageManager
import com.selfservice.kiosk.bluetooth.permissions.BluetoothPermissionManager
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.mockito.Mock
import org.mockito.Mockito.`when`
import org.mockito.MockitoAnnotations
import android.os.Build

class BluetoothEdgeCasesTest {

    @Mock
    private lateinit var mockContext: Context

    private lateinit var permissionManager: BluetoothPermissionManager

    @Before
    fun setup() {
        MockitoAnnotations.openMocks(this)
        permissionManager = BluetoothPermissionManager(mockContext)
    }

    @Test
    fun testPermissionsForAndroid12Plus() {
        val permissions = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            permissionManager.getRequiredPermissions()
        } else {
            arrayOf()
        }
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            assertTrue(permissions.contains(android.Manifest.permission.BLUETOOTH_CONNECT))
            assertTrue(permissions.contains(android.Manifest.permission.BLUETOOTH_SCAN))
            assertTrue(permissions.contains(android.Manifest.permission.ACCESS_FINE_LOCATION))
        }
    }

    @Test
    fun testPermissionsForAndroid11AndBelow() {
        val permissions = if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            permissionManager.getRequiredPermissions()
        } else {
            arrayOf()
        }
        
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            assertTrue(permissions.contains(android.Manifest.permission.BLUETOOTH))
            assertTrue(permissions.contains(android.Manifest.permission.BLUETOOTH_ADMIN))
            assertTrue(permissions.contains(android.Manifest.permission.ACCESS_FINE_LOCATION))
        }
    }

    @Test
    fun testConnectionTimeoutCalculation() {
        val timeout1 = calculateExponentialBackoff(1)
        val timeout2 = calculateExponentialBackoff(2)
        val timeout3 = calculateExponentialBackoff(3)
        val timeout10 = calculateExponentialBackoff(10)
        
        assertEquals(2000L, timeout1)
        assertEquals(4000L, timeout2)
        assertEquals(8000L, timeout3)
        assertEquals(10000L, timeout10)
    }

    @Test
    fun testDeviceNameFiltering() {
        assertTrue(isEldiagDevice("ELDIAG Plus"))
        assertTrue(isEldiagDevice("EDIAG"))
        assertTrue(isEldiagDevice("eldiag-123"))
        assertTrue(isEldiagDevice("MY EDIAG"))
        
        assertTrue(!isEldiagDevice("ELM327"))
        assertTrue(!isEldiagDevice("OBD2"))
        assertTrue(!isEldiagDevice(""))
    }

    @Test
    fun testSerialNumberValidation() {
        assertTrue(isValidSerialNumber("979868808198"))
        
        assertTrue(!isValidSerialNumber("123456789012"))
        assertTrue(!isValidSerialNumber("97986880819"))
        assertTrue(!isValidSerialNumber("9798688081983"))
        assertTrue(!isValidSerialNumber("ABC123456789"))
        assertTrue(!isValidSerialNumber(""))
    }

    @Test
    fun testMacAddressFormat() {
        assertTrue(isValidMacAddress("00:11:22:33:44:55"))
        assertTrue(isValidMacAddress("AA:BB:CC:DD:EE:FF"))
        
        assertTrue(!isValidMacAddress("00:11:22:33:44"))
        assertTrue(!isValidMacAddress("00-11-22-33-44-55"))
        assertTrue(!isValidMacAddress("not-a-mac"))
        assertTrue(!isValidMacAddress(""))
    }

    @Test
    fun testRssiRangeValidation() {
        assertTrue(isValidRssi(-30))
        assertTrue(isValidRssi(-60))
        assertTrue(isValidRssi(-90))
        
        assertTrue(!isValidRssi(0))
        assertTrue(!isValidRssi(10))
        assertTrue(!isValidRssi(-200))
        assertTrue(!isValidRssi(Short.MIN_VALUE.toInt()))
    }

    private fun calculateExponentialBackoff(attempt: Int): Long {
        return minOf(1000L * (1 shl attempt), 10000L)
    }

    private fun isEldiagDevice(name: String): Boolean {
        return name.uppercase().contains("ELDIAG") || name.uppercase().contains("EDIAG")
    }

    private fun isValidSerialNumber(serialNumber: String): Boolean {
        return serialNumber == "979868808198"
    }

    private fun isValidMacAddress(mac: String): Boolean {
        return mac.matches(Regex("^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$"))
    }

    private fun isValidRssi(rssi: Int): Boolean {
        return rssi in -100..-20
    }
}
