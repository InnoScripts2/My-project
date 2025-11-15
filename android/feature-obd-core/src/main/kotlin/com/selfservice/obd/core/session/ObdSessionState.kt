package com.selfservice.obd.core.session

import com.selfservice.obd.core.connection.BleDevice
import com.selfservice.obd.core.platform.BluetoothPrerequisiteResult

/**
 * Lifecycle of an OBD diagnostic session. Upcoming implementations will map legacy
 * ElmSessionStateMachine and DiagnosticsSessionController events to these states.
 */
sealed interface ObdSessionState {
    data object Idle : ObdSessionState
    data class Scanning(val attempts: Int) : ObdSessionState
    data class Connecting(val device: BleDevice) : ObdSessionState
    data class Ready(val device: BleDevice) : ObdSessionState
    data class Diagnostics(val device: BleDevice) : ObdSessionState
    data class Failed(val reason: Throwable) : ObdSessionState
    data object Completed : ObdSessionState
    data class PreconditionsMissing(val result: BluetoothPrerequisiteResult) : ObdSessionState
}
