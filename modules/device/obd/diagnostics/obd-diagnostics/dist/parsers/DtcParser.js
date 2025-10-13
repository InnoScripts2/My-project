/**
 * DTC (Diagnostic Trouble Code) parser
 * Parses OBD-II diagnostic trouble codes from Mode 03 responses
 */
/**
 * DTC parser for Mode 03 responses
 */
export class DtcParser {
    /**
     * Parse DTC codes from Mode 03 response
     * Format: 43 XX XX YY YY ... (43 prefix, then byte pairs)
     */
    static parseDtcResponse(response) {
        const cleaned = response.replace(/\s+/g, '').toUpperCase();
        // Remove '43' prefix if present (Mode 03 response)
        let dataHex = cleaned;
        if (dataHex.startsWith('43')) {
            dataHex = dataHex.substring(2);
        }
        // Parse byte pairs
        const dtcCodes = [];
        for (let i = 0; i < dataHex.length; i += 4) {
            if (i + 4 > dataHex.length)
                break;
            const highByteHex = dataHex.substring(i, i + 2);
            const lowByteHex = dataHex.substring(i + 2, i + 4);
            const highByte = parseInt(highByteHex, 16);
            const lowByte = parseInt(lowByteHex, 16);
            // Skip empty slots (00 00)
            if (highByte === 0 && lowByte === 0) {
                continue;
            }
            const code = this.formatDtcCode(highByte, lowByte);
            const type = this.getDtcType(code);
            dtcCodes.push({ code, type });
        }
        return dtcCodes;
    }
    /**
     * Format DTC code from two bytes
     * SAE J2012 standard format
     * First byte bits 7-6: 00=P, 01=C, 10=B, 11=U
     * First byte bits 5-4: second digit
     * First byte bits 3-0: third digit
     * Second byte bits 7-4: fourth digit
     * Second byte bits 3-0: fifth digit
     */
    static formatDtcCode(highByte, lowByte) {
        // Extract first two bits for prefix type
        const typeBits = (highByte >> 6) & 0x03;
        // Determine prefix letter
        let prefixLetter;
        if (typeBits === 0x00) {
            prefixLetter = 'P';
        }
        else if (typeBits === 0x01) {
            prefixLetter = 'C';
        }
        else if (typeBits === 0x02) {
            prefixLetter = 'B';
        }
        else {
            prefixLetter = 'U';
        }
        // Extract all five digits
        const digit1 = (highByte >> 4) & 0x03; // Bits 5-4
        const digit2 = (highByte) & 0x0F; // Bits 3-0
        const digit3 = (lowByte >> 4) & 0x0F; // Bits 7-4
        const digit4 = (lowByte) & 0x0F; // Bits 3-0
        return `${prefixLetter}${digit1}${digit2.toString(16).toUpperCase()}${digit3.toString(16).toUpperCase()}${digit4.toString(16).toUpperCase()}`;
    }
    /**
     * Determine DTC type from code prefix
     */
    static getDtcType(code) {
        const prefix = code.charAt(0).toUpperCase();
        switch (prefix) {
            case 'P':
                return 'Powertrain';
            case 'C':
                return 'Chassis';
            case 'B':
                return 'Body';
            case 'U':
                return 'Network';
            default:
                return 'Powertrain'; // Default to Powertrain
        }
    }
}
