/**
 * DeviceObd Interface
 * Core interface for OBD-II device drivers according to specification
 * Provides standardized methods for OBD-II adapter communication
 */
/**
 * OBD adapter status enumeration
 * Tracks the current operational state of the adapter
 */
export var ObdStatus;
(function (ObdStatus) {
    ObdStatus["DISCONNECTED"] = "disconnected";
    ObdStatus["CONNECTING"] = "connecting";
    ObdStatus["INITIALIZING"] = "initializing";
    ObdStatus["READY"] = "ready";
    ObdStatus["SCANNING"] = "scanning";
    ObdStatus["IDLE"] = "idle";
    ObdStatus["ERROR"] = "error";
    ObdStatus["UNAVAILABLE"] = "unavailable";
})(ObdStatus || (ObdStatus = {}));
