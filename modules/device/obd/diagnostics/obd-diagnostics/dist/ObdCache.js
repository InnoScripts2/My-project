/**
 * ObdCache.ts - LRU cache for OBD-II data (DTC descriptions, PID values)
 *
 * Reduces redundant lookups and improves performance for repeated queries.
 */
export class ObdCache {
    constructor(maxSize, defaultTtlMs) {
        this.maxSize = maxSize;
        this.defaultTtlMs = defaultTtlMs;
        this.cache = new Map();
        this.accessOrder = [];
        this.stats = { hits: 0, misses: 0, evictions: 0, size: 0 };
    }
    get(key) {
        const entry = this.cache.get(key);
        if (!entry) {
            this.stats.misses++;
            return null;
        }
        if (Date.now() > entry.expiry) {
            this.cache.delete(key);
            this.accessOrder = this.accessOrder.filter(k => k !== key);
            this.stats.evictions++;
            this.stats.misses++;
            this.stats.size = this.cache.size;
            return null;
        }
        // Move to end (most recently used)
        this.accessOrder = this.accessOrder.filter(k => k !== key);
        this.accessOrder.push(key);
        this.stats.hits++;
        return entry.value;
    }
    set(key, value, ttlMs) {
        const ttl = ttlMs ?? this.defaultTtlMs;
        const expiry = Date.now() + ttl;
        if (this.cache.has(key)) {
            // Update existing
            this.cache.set(key, { value, expiry });
            this.accessOrder = this.accessOrder.filter(k => k !== key);
            this.accessOrder.push(key);
        }
        else {
            // Add new entry
            if (this.cache.size >= this.maxSize) {
                // Evict LRU
                const lruKey = this.accessOrder.shift();
                if (lruKey) {
                    this.cache.delete(lruKey);
                    this.stats.evictions++;
                }
            }
            this.cache.set(key, { value, expiry });
            this.accessOrder.push(key);
        }
        this.stats.size = this.cache.size;
    }
    clear() {
        this.cache.clear();
        this.accessOrder = [];
        this.stats = { hits: 0, misses: 0, evictions: 0, size: 0 };
    }
    getStats() {
        return { ...this.stats };
    }
    size() {
        return this.cache.size;
    }
}
export class ObdDtcCache {
    constructor() {
        // 5000 entries, 24h TTL
        this.cache = new ObdCache(5000, 24 * 60 * 60 * 1000);
    }
    getDtcDescription(code) {
        return this.cache.get(code);
    }
    cacheDtcDescription(code, description, ttl) {
        this.cache.set(code, description, ttl);
    }
    getStats() {
        return this.cache.getStats();
    }
    clear() {
        this.cache.clear();
    }
}
export class ObdPidCache {
    constructor() {
        // 1000 entries, 60s TTL for live data
        this.cache = new ObdCache(1000, 60 * 1000);
    }
    getPidValue(pid, vehicleId) {
        const key = `${vehicleId}:${pid}`;
        return this.cache.get(key);
    }
    cachePidValue(pid, vehicleId, value, ttl) {
        const key = `${vehicleId}:${pid}`;
        this.cache.set(key, value, ttl);
    }
    getStats() {
        return this.cache.getStats();
    }
    clear() {
        this.cache.clear();
    }
}
