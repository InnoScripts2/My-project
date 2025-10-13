/**
 * ObdCache.ts - LRU cache for OBD-II data (DTC descriptions, PID values)
 * 
 * Reduces redundant lookups and improves performance for repeated queries.
 */

interface CacheEntry<T> {
  value: T;
  expiry: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
}

export class ObdCache<T = any> {
  private cache = new Map<string, CacheEntry<T>>();
  private accessOrder: string[] = [];
  private stats: CacheStats = { hits: 0, misses: 0, evictions: 0, size: 0 };

  constructor(
    private readonly maxSize: number,
    private readonly defaultTtlMs: number
  ) {}

  get(key: string): T | null {
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

  set(key: string, value: T, ttlMs?: number): void {
    const ttl = ttlMs ?? this.defaultTtlMs;
    const expiry = Date.now() + ttl;

    if (this.cache.has(key)) {
      // Update existing
      this.cache.set(key, { value, expiry });
      this.accessOrder = this.accessOrder.filter(k => k !== key);
      this.accessOrder.push(key);
    } else {
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

  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
    this.stats = { hits: 0, misses: 0, evictions: 0, size: 0 };
  }

  getStats(): CacheStats {
    return { ...this.stats };
  }

  size(): number {
    return this.cache.size;
  }
}

export class ObdDtcCache {
  private cache: ObdCache<string>;

  constructor() {
    // 5000 entries, 24h TTL
    this.cache = new ObdCache<string>(5000, 24 * 60 * 60 * 1000);
  }

  getDtcDescription(code: string): string | null {
    return this.cache.get(code);
  }

  cacheDtcDescription(code: string, description: string, ttl?: number): void {
    this.cache.set(code, description, ttl);
  }

  getStats() {
    return this.cache.getStats();
  }

  clear(): void {
    this.cache.clear();
  }
}

export class ObdPidCache {
  private cache: ObdCache<number>;

  constructor() {
    // 1000 entries, 60s TTL for live data
    this.cache = new ObdCache<number>(1000, 60 * 1000);
  }

  getPidValue(pid: string, vehicleId: string): number | null {
    const key = `${vehicleId}:${pid}`;
    return this.cache.get(key);
  }

  cachePidValue(pid: string, vehicleId: string, value: number, ttl?: number): void {
    const key = `${vehicleId}:${pid}`;
    this.cache.set(key, value, ttl);
  }

  getStats() {
    return this.cache.getStats();
  }

  clear(): void {
    this.cache.clear();
  }
}
