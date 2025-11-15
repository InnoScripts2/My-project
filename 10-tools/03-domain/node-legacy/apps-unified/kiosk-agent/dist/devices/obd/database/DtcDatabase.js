/**
 * DTC Description Database
 * Provides lookup for DTC code descriptions from SAE J2012 standard
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
let dtcCodesCache = null;
function loadDtcCodes() {
    if (dtcCodesCache === null) {
        const jsonPath = join(__dirname, 'dtc-codes.json');
        const jsonData = readFileSync(jsonPath, 'utf-8');
        dtcCodesCache = JSON.parse(jsonData);
    }
    return dtcCodesCache ?? [];
}
/**
 * Get description for a DTC code
 * Returns undefined if code not found in database
 */
export function getDtcDescription(code) {
    const codes = loadDtcCodes();
    const entry = codes.find((dtc) => dtc.code.toUpperCase() === code.toUpperCase());
    return entry?.description;
}
/**
 * Get full DTC entry
 */
export function getDtcEntry(code) {
    const codes = loadDtcCodes();
    const entry = codes.find((dtc) => dtc.code.toUpperCase() === code.toUpperCase());
    if (!entry) {
        return undefined;
    }
    return {
        code: entry.code,
        category: entry.category,
        description: entry.description,
    };
}
/**
 * Check if DTC code exists in database
 */
export function isDtcKnown(code) {
    const codes = loadDtcCodes();
    return codes.some((dtc) => dtc.code.toUpperCase() === code.toUpperCase());
}
/**
 * Get all DTC codes (returns copy)
 */
export function getAllDtcCodes() {
    const codes = loadDtcCodes();
    return codes.map((dtc) => ({
        code: dtc.code,
        category: dtc.category,
        description: dtc.description,
    }));
}
/**
 * Get DTC codes by category
 */
export function getDtcByCategory(category) {
    const codes = loadDtcCodes();
    return codes
        .filter((dtc) => dtc.category === category)
        .map((dtc) => ({
        code: dtc.code,
        category: dtc.category,
        description: dtc.description,
    }));
}
