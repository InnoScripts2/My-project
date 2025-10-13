package com.selfservice.kiosk.bluetooth.scanner

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ScanRecordParserTest {

    @Test
    fun testParseSerialNumberFromManufacturerData_validData() {
        val data = serialBytes("979868808198")

        val serialNumber = parseSerialNumberFromManufacturerData(data)
        assertEquals("979868808198", serialNumber)
    }

    @Test
    fun testParseSerialNumberFromManufacturerData_tooShort() {
        val data = serialBytes("979")
        
        val serialNumber = parseSerialNumberFromManufacturerData(data)
        assertNull(serialNumber)
    }

    @Test
    fun testParseSerialNumberFromManufacturerData_invalidCharacters() {
        val data = ByteArray(12) { 0xFF.toByte() }
        
        val serialNumber = parseSerialNumberFromManufacturerData(data)
        assertNull(serialNumber)
    }

    @Test
    fun testParseSerialNumberFromServiceData_validData() {
        val data = "979868808198".toByteArray(Charsets.UTF_8)
        
        val serialNumber = parseSerialNumberFromServiceData(data)
        assertEquals("979868808198", serialNumber)
    }

    @Test
    fun testParseSerialNumberFromServiceData_invalidData() {
        val data = "ABC123".toByteArray(Charsets.UTF_8)
        
        val serialNumber = parseSerialNumberFromServiceData(data)
        assertNull(serialNumber)
    }

    private fun serialBytes(serial: String): ByteArray = serial.toByteArray(Charsets.UTF_8)

    private fun parseSerialNumberFromManufacturerData(data: ByteArray): String? {
        if (data.size < 12) return null
        val digits = data.take(12).map { it.toInt().toChar() }
        if (digits.any { !it.isDigit() }) return null
        return digits.joinToString("")
    }

    private fun parseSerialNumberFromServiceData(data: ByteArray): String? {
        val text = data.toString(Charsets.UTF_8)
        if (text.matches(Regex("\\d{12}"))) {
            return text
        }
        return null
    }
}
