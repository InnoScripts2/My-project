package com.selfservice.obd.core.connection

import android.bluetooth.BluetoothDevice

/**
 * Minimal representation of a BLE adapter that can participate in OBD sessions.
 * Wraps the Android BluetoothDevice to make testing and serialization simpler.
 */
data class BleDevice(
    val address: String,
    val name: String?,
    val rssi: Int?
) {
    companion object {
        fun from(device: BluetoothDevice, rssi: Int?): BleDevice = BleDevice(
            address = device.address,
            name = device.name,
            rssi = rssi
        )
    }
}
