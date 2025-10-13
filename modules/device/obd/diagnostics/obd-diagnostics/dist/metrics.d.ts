/**
 * obd-metrics.ts - Prometheus metrics for OBD-II optimization features
 */
import { Counter, Gauge, Histogram, Registry } from 'prom-client';
export declare function registerObdOptimizationMetrics(registry: Registry): {
    obdPoolConnectionsActive: Gauge<string>;
    obdPoolConnectionsIdle: Gauge<string>;
    obdPoolWaitTime: Histogram<string>;
    obdCacheHits: Counter<"cache">;
    obdCacheMisses: Counter<"cache">;
    obdCacheEvictions: Counter<"reason" | "cache">;
};
export type ObdOptimizationMetrics = ReturnType<typeof registerObdOptimizationMetrics>;
