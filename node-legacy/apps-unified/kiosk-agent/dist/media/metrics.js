/**
 * metrics - Prometheus метрики для imgproxy
 */
import { Counter, Histogram, Gauge, register } from 'prom-client';
export const imageProxyRequestsTotal = new Counter({
    name: 'image_proxy_requests_total',
    help: 'Total number of image transformation requests',
    labelNames: ['status', 'cached'],
    registers: [register]
});
export const imageProxyTransformDuration = new Histogram({
    name: 'image_proxy_transform_duration_seconds',
    help: 'Duration of image transformation excluding cache hits',
    labelNames: ['format'],
    registers: [register]
});
export const imageProxyCacheHitRate = new Gauge({
    name: 'image_proxy_cache_hit_rate',
    help: 'Percentage of cache hits from total requests',
    registers: [register]
});
export const imageProxyCacheSize = new Gauge({
    name: 'image_proxy_cache_size_bytes',
    help: 'Current size of image cache in bytes',
    registers: [register]
});
export const imageProxyOptimizedSizeReduction = new Histogram({
    name: 'image_proxy_optimized_size_reduction_percent',
    help: 'Percentage of size reduction after optimization',
    buckets: [0, 10, 25, 50, 75, 90, 100],
    registers: [register]
});
