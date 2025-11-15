/**
 * DeviceObd Interface
 * Core interface for OBD-II device drivers according to specification
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
