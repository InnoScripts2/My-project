/**
 * DTC (Diagnostic Trouble Code) parser
 * Parses OBD-II diagnostic trouble codes from Mode 03 responses
 */
import type { DtcCode, DtcType } from '../database/types.js';
/**
 * DTC parser for Mode 03 responses
 */
export declare class DtcParser {
    /**
     * Parse DTC codes from Mode 03 response
     * Format: 43 XX XX YY YY ... (43 prefix, then byte pairs)
     */
    static parseDtcResponse(response: string): DtcCode[];
    /**
     * Format DTC code from two bytes
     * SAE J2012 standard format
     * First byte bits 7-6: 00=P, 01=C, 10=B, 11=U
     * First byte bits 5-4: second digit
     * First byte bits 3-0: third digit
     * Second byte bits 7-4: fourth digit
     * Second byte bits 3-0: fifth digit
     */
    static formatDtcCode(highByte: number, lowByte: number): string;
    /**
     * Determine DTC type from code prefix
     */
    static getDtcType(code: string): DtcType;
}
