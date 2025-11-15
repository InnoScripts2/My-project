package com.selfservice.kiosk.bluetooth.models

data class ScanResultModel(
    val transport: Transport,
    val name: String,
    val macAddress: String,
    val rssi: Int,
    val serialNumber: String?,
    val source: Source
) {
    enum class Transport {
        BLE,
        CLASSIC
    }
    
    enum class Source {
        ADVERTISEMENT,
        DISCOVERY
    }
    
    val isEldiagCandidate: Boolean
        get() = name.uppercase().contains("ELDIAG") || name.uppercase().contains("EDIAG")
    
    val isTargetDevice: Boolean
        get() = serialNumber == TARGET_SERIAL_NUMBER
    
    companion object {
        const val TARGET_SERIAL_NUMBER = "979868808198"
    }
}
