/**
 * UDS Protocol Implementation
 * ISO 14229 Unified Diagnostic Services
 */
import { UdsService, UdsError, UdsNegativeResponseError, } from './UdsTypes.js';
export class UdsProtocol {
    driver;
    constructor(driver) {
        this.driver = driver;
    }
    /**
     * Switch diagnostic session
     */
    async switchSession(session) {
        const command = `10${session.toString(16).padStart(2, '0')}`;
        const response = await this.driver.sendCommand(command);
        const bytes = this.parseHexResponse(response);
        // Check for positive response (0x50)
        if (bytes.length > 0 && bytes[0] === 0x50) {
            return;
        }
        // Check for negative response
        if (bytes.length >= 3 && bytes[0] === 0x7F) {
            const nrc = bytes[2];
            throw new UdsNegativeResponseError(UdsService.DIAGNOSTIC_SESSION_CONTROL, nrc);
        }
        throw new UdsError('Invalid response to session switch');
    }
    /**
     * Read data by identifier
     */
    async readDataByIdentifier(did) {
        const didHex = did.toString(16).padStart(4, '0').toUpperCase();
        const command = `22${didHex}`;
        const response = await this.driver.sendCommand(command);
        const bytes = this.parseHexResponse(response);
        // Check for positive response (0x62)
        if (bytes.length >= 3 && bytes[0] === 0x62) {
            const responseDid = (bytes[1] << 8) | bytes[2];
            const data = Buffer.from(bytes.slice(3));
            return {
                did: responseDid,
                data,
                parsed: this.parseDidData(responseDid, data),
            };
        }
        // Check for negative response
        if (bytes.length >= 3 && bytes[0] === 0x7F) {
            const nrc = bytes[2];
            throw new UdsNegativeResponseError(UdsService.READ_DATA_BY_IDENTIFIER, nrc);
        }
        throw new UdsError('Invalid response to read data by identifier');
    }
    /**
     * Read multiple data identifiers
     */
    async readMultipleDataByIdentifier(dids) {
        const results = [];
        for (const did of dids) {
            try {
                const result = await this.readDataByIdentifier(did);
                results.push(result);
            }
            catch (error) {
                // Partial failure: continue with other DIDs
                console.warn(`Failed to read DID 0x${did.toString(16)}: ${error}`);
            }
        }
        return results;
    }
    /**
     * ECU Reset (requires confirmation)
     */
    async ecuReset(resetType = 0x01, confirmed = false) {
        if (!confirmed) {
            throw new UdsError('ECU reset requires explicit confirmation', 'CONFIRMATION_REQUIRED');
        }
        const command = `11${resetType.toString(16).padStart(2, '0')}`;
        const response = await this.driver.sendCommand(command);
        const bytes = this.parseHexResponse(response);
        // Check for positive response (0x51)
        if (bytes.length > 0 && bytes[0] === 0x51) {
            // Wait for ECU to reset
            await this.delay(5000);
            return;
        }
        // Check for negative response
        if (bytes.length >= 3 && bytes[0] === 0x7F) {
            const nrc = bytes[2];
            throw new UdsNegativeResponseError(UdsService.ECU_RESET, nrc);
        }
        throw new UdsError('Invalid response to ECU reset');
    }
    /**
     * Parse hex response string to byte array
     */
    parseHexResponse(response) {
        const cleaned = response.replace(/\s/g, '').toUpperCase();
        const bytes = [];
        for (let i = 0; i < cleaned.length; i += 2) {
            const byte = parseInt(cleaned.substring(i, i + 2), 16);
            if (!isNaN(byte)) {
                bytes.push(byte);
            }
        }
        return bytes;
    }
    /**
     * Parse DID data based on identifier
     */
    parseDidData(did, data) {
        switch (did) {
            case 0xF190: // VIN
                return data.toString('ascii');
            case 0xF18C: // ECU Serial
                return data.toString('ascii').replace(/\0/g, '').trim();
            case 0x0100: // HV Battery Voltage (Toyota)
                if (data.length >= 2) {
                    return ((data[0] << 8) | data[1]) * 0.1;
                }
                break;
            case 0x0101: // HV Battery Current (Toyota)
                if (data.length >= 2) {
                    const raw = (data[0] << 8) | data[1];
                    // Decode: (raw / 10) - 100 to get amps
                    return (raw / 10) - 100;
                }
                break;
            case 0x0102: // SOC (Toyota)
                if (data.length >= 1) {
                    return data[0];
                }
                break;
            case 0x0103: // Battery Temp (Toyota)
                if (data.length >= 1) {
                    return data[0] - 40;
                }
                break;
            case 0x0110: // Inverter Temp (Toyota)
                if (data.length >= 1) {
                    return data[0] - 40;
                }
                break;
            case 0x0120: // MG1 Speed (Toyota)
            case 0x0121: // MG2 Speed (Toyota)
                if (data.length >= 2) {
                    return (data[0] << 8) | data[1];
                }
                break;
        }
        return data;
    }
    /**
     * Delay helper
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
