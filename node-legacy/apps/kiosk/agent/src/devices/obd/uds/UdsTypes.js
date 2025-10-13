/**
 * UDS (ISO 14229) Type Definitions
 * Unified Diagnostic Services types and enums
 */
import { z } from 'zod';
/**
 * UDS Service IDs
 */
export var UdsService;
(function (UdsService) {
    UdsService[UdsService["DIAGNOSTIC_SESSION_CONTROL"] = 16] = "DIAGNOSTIC_SESSION_CONTROL";
    UdsService[UdsService["ECU_RESET"] = 17] = "ECU_RESET";
    UdsService[UdsService["READ_DATA_BY_IDENTIFIER"] = 34] = "READ_DATA_BY_IDENTIFIER";
    UdsService[UdsService["SECURITY_ACCESS"] = 39] = "SECURITY_ACCESS";
    UdsService[UdsService["WRITE_DATA_BY_IDENTIFIER"] = 46] = "WRITE_DATA_BY_IDENTIFIER";
    UdsService[UdsService["ROUTINE_CONTROL"] = 49] = "ROUTINE_CONTROL";
})(UdsService || (UdsService = {}));
/**
 * UDS Session Types
 */
export var UdsSessionType;
(function (UdsSessionType) {
    UdsSessionType[UdsSessionType["DEFAULT"] = 1] = "DEFAULT";
    UdsSessionType[UdsSessionType["PROGRAMMING"] = 2] = "PROGRAMMING";
    UdsSessionType[UdsSessionType["EXTENDED"] = 3] = "EXTENDED";
})(UdsSessionType || (UdsSessionType = {}));
/**
 * UDS Negative Response Codes
 */
export var UdsNegativeResponse;
(function (UdsNegativeResponse) {
    UdsNegativeResponse[UdsNegativeResponse["GENERAL_REJECT"] = 16] = "GENERAL_REJECT";
    UdsNegativeResponse[UdsNegativeResponse["SERVICE_NOT_SUPPORTED"] = 17] = "SERVICE_NOT_SUPPORTED";
    UdsNegativeResponse[UdsNegativeResponse["SUB_FUNCTION_NOT_SUPPORTED"] = 18] = "SUB_FUNCTION_NOT_SUPPORTED";
    UdsNegativeResponse[UdsNegativeResponse["INCORRECT_MESSAGE_LENGTH"] = 19] = "INCORRECT_MESSAGE_LENGTH";
    UdsNegativeResponse[UdsNegativeResponse["CONDITIONS_NOT_CORRECT"] = 34] = "CONDITIONS_NOT_CORRECT";
    UdsNegativeResponse[UdsNegativeResponse["REQUEST_OUT_OF_RANGE"] = 49] = "REQUEST_OUT_OF_RANGE";
    UdsNegativeResponse[UdsNegativeResponse["SECURITY_ACCESS_DENIED"] = 51] = "SECURITY_ACCESS_DENIED";
})(UdsNegativeResponse || (UdsNegativeResponse = {}));
/**
 * UDS Error
 */
export class UdsError extends Error {
    code;
    nrc;
    constructor(message, code, nrc) {
        super(message);
        this.code = code;
        this.nrc = nrc;
        this.name = 'UdsError';
    }
}
/**
 * UDS Negative Response Error
 */
export class UdsNegativeResponseError extends UdsError {
    service;
    nrc;
    constructor(service, nrc, message) {
        super(message || `Negative response for service 0x${service.toString(16)}: NRC 0x${nrc.toString(16)}`, 'NEGATIVE_RESPONSE', nrc);
        this.service = service;
        this.nrc = nrc;
        this.name = 'UdsNegativeResponseError';
    }
}
/**
 * UDS Timeout Error
 */
export class UdsTimeoutError extends UdsError {
    constructor(message = 'UDS operation timeout') {
        super(message, 'TIMEOUT');
        this.name = 'UdsTimeoutError';
    }
}
/**
 * Zod schemas for validation
 */
export const UdsRequestSchema = z.object({
    service: z.number().int().min(0).max(0xFF),
    data: z.instanceof(Buffer).optional(),
});
export const UdsResponseSchema = z.object({
    service: z.number().int().min(0).max(0xFF),
    data: z.instanceof(Buffer),
    isPositive: z.boolean(),
    nrc: z.number().int().min(0).max(0xFF).optional(),
});
export const UdsReadDataRequestSchema = z.object({
    did: z.number().int().min(0).max(0xFFFF),
});
export const UdsReadDataResponseSchema = z.object({
    did: z.number().int().min(0).max(0xFFFF),
    data: z.instanceof(Buffer),
    parsed: z.any().optional(),
});
