/**
 * obd-metrics.ts - Prometheus metrics for OBD-II optimization features
 */
import { Counter, Gauge, Histogram } from 'prom-client';
export function registerObdOptimizationMetrics(registry) {
    // Connection pool metrics
    const obdPoolConnectionsActive = new Gauge({
        name: 'obd_pool_connections_active',
        help: 'Number of active connections in the pool',
        registers: [registry],
    });
    const obdPoolConnectionsIdle = new Gauge({
        name: 'obd_pool_connections_idle',
        help: 'Number of idle connections in the pool',
        registers: [registry],
    });
    const obdPoolWaitTime = new Histogram({
        name: 'obd_pool_wait_time_seconds',
        help: 'Wait time for acquiring connection from pool',
        buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
        registers: [registry],
    });
    // Cache metrics
    const obdCacheHits = new Counter({
        name: 'obd_cache_hits_total',
        help: 'Total number of cache hits',
        labelNames: ['cache'],
        registers: [registry],
    });
    const obdCacheMisses = new Counter({
        name: 'obd_cache_misses_total',
        help: 'Total number of cache misses',
        labelNames: ['cache'],
        registers: [registry],
    });
    const obdCacheEvictions = new Counter({
        name: 'obd_cache_evictions_total',
        help: 'Total number of cache evictions',
        labelNames: ['cache', 'reason'],
        registers: [registry],
    });
    return {
        obdPoolConnectionsActive,
        obdPoolConnectionsIdle,
        obdPoolWaitTime,
        obdCacheHits,
        obdCacheMisses,
        obdCacheEvictions,
    };
}
