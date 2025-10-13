/**
 * ObdCache.ts - LRU cache for OBD-II data (DTC descriptions, PID values)
 *
 * Reduces redundant lookups and improves performance for repeated queries.
 */
interface CacheStats {
    hits: number;
    misses: number;
    evictions: number;
    size: number;
}
export declare class ObdCache<T = any> {
    private readonly maxSize;
    private readonly defaultTtlMs;
    private cache;
    private accessOrder;
    private stats;
    constructor(maxSize: number, defaultTtlMs: number);
    get(key: string): T | null;
    set(key: string, value: T, ttlMs?: number): void;
    clear(): void;
    getStats(): CacheStats;
    size(): number;
}
export declare class ObdDtcCache {
    private cache;
    constructor();
    getDtcDescription(code: string): string | null;
    cacheDtcDescription(code: string, description: string, ttl?: number): void;
    getStats(): CacheStats;
    clear(): void;
}
export declare class ObdPidCache {
    private cache;
    constructor();
    getPidValue(pid: string, vehicleId: string): number | null;
    cachePidValue(pid: string, vehicleId: string, value: number, ttl?: number): void;
    getStats(): CacheStats;
    clear(): void;
}
export {};
