/**
 * DTC Description Database
 * Provides lookup for DTC code descriptions from SAE J2012 standard
 */
import type { DtcCategory } from './types.js';
interface DtcDatabaseEntry {
    code: string;
    category: DtcCategory;
    description: string;
}
/**
 * Get description for a DTC code
 * Returns undefined if code not found in database
 */
export declare function getDtcDescription(code: string): string | undefined;
/**
 * Get full DTC entry
 */
export declare function getDtcEntry(code: string): DtcDatabaseEntry | undefined;
/**
 * Check if DTC code exists in database
 */
export declare function isDtcKnown(code: string): boolean;
/**
 * Get all DTC codes (returns copy)
 */
export declare function getAllDtcCodes(): DtcDatabaseEntry[];
/**
 * Get DTC codes by category
 */
export declare function getDtcByCategory(category: DtcCategory): DtcDatabaseEntry[];
export {};
