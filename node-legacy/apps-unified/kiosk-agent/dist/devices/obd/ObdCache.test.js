/**
 * ObdCache.test.ts - Unit tests for OBD cache
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ObdCache, ObdDtcCache, ObdPidCache } from './ObdCache.js';
describe('ObdCache', () => {
    it('should cache and retrieve values', () => {
        const cache = new ObdCache(100, 1000);
        cache.set('key1', 'value1');
        const result = cache.get('key1');
        assert.strictEqual(result, 'value1');
        assert.strictEqual(cache.size(), 1);
    });
    it('should return null for missing keys', () => {
        const cache = new ObdCache(100, 1000);
        const result = cache.get('nonexistent');
        assert.strictEqual(result, null);
    });
    it('should track cache hits and misses', () => {
        const cache = new ObdCache(100, 1000);
        cache.set('key1', 'value1');
        cache.get('key1'); // hit
        cache.get('key2'); // miss
        const stats = cache.getStats();
        assert.strictEqual(stats.hits, 1);
        assert.strictEqual(stats.misses, 1);
    });
    it('should evict LRU entries when max size reached', () => {
        const cache = new ObdCache(3, 1000);
        cache.set('key1', 'value1');
        cache.set('key2', 'value2');
        cache.set('key3', 'value3');
        cache.set('key4', 'value4'); // Should evict key1
        assert.strictEqual(cache.get('key1'), null);
        assert.strictEqual(cache.get('key4'), 'value4');
        assert.strictEqual(cache.size(), 3);
        const stats = cache.getStats();
        assert.strictEqual(stats.evictions, 1);
    });
    it('should expire entries based on TTL', async () => {
        const cache = new ObdCache(100, 100); // 100ms TTL
        cache.set('key1', 'value1');
        assert.strictEqual(cache.get('key1'), 'value1');
        await new Promise(resolve => setTimeout(resolve, 150));
        assert.strictEqual(cache.get('key1'), null);
        const stats = cache.getStats();
        assert.strictEqual(stats.evictions, 1);
    });
    it('should update access order on get', () => {
        const cache = new ObdCache(2, 1000);
        cache.set('key1', 'value1');
        cache.set('key2', 'value2');
        cache.get('key1'); // Access key1, making it more recent
        cache.set('key3', 'value3'); // Should evict key2, not key1
        assert.strictEqual(cache.get('key1'), 'value1');
        assert.strictEqual(cache.get('key2'), null);
        assert.strictEqual(cache.get('key3'), 'value3');
    });
    it('should allow custom TTL per entry', async () => {
        const cache = new ObdCache(100, 1000);
        cache.set('key1', 'value1', 50); // 50ms TTL
        cache.set('key2', 'value2', 200); // 200ms TTL
        await new Promise(resolve => setTimeout(resolve, 100));
        assert.strictEqual(cache.get('key1'), null); // Expired
        assert.strictEqual(cache.get('key2'), 'value2'); // Still valid
    });
    it('should clear all entries', () => {
        const cache = new ObdCache(100, 1000);
        cache.set('key1', 'value1');
        cache.set('key2', 'value2');
        cache.clear();
        assert.strictEqual(cache.size(), 0);
        assert.strictEqual(cache.get('key1'), null);
    });
});
describe('ObdDtcCache', () => {
    it('should cache DTC descriptions', () => {
        const cache = new ObdDtcCache();
        cache.cacheDtcDescription('P0420', 'Catalyst System Efficiency Below Threshold');
        const description = cache.getDtcDescription('P0420');
        assert.strictEqual(description, 'Catalyst System Efficiency Below Threshold');
    });
    it('should return null for uncached DTC', () => {
        const cache = new ObdDtcCache();
        const description = cache.getDtcDescription('P0300');
        assert.strictEqual(description, null);
    });
    it('should track cache statistics', () => {
        const cache = new ObdDtcCache();
        cache.cacheDtcDescription('P0420', 'Catalyst Issue');
        cache.getDtcDescription('P0420'); // hit
        cache.getDtcDescription('P0300'); // miss
        const stats = cache.getStats();
        assert.strictEqual(stats.hits, 1);
        assert.strictEqual(stats.misses, 1);
    });
});
describe('ObdPidCache', () => {
    it('should cache PID values per vehicle', () => {
        const cache = new ObdPidCache();
        cache.cachePidValue('0C', 'vehicle1', 2500);
        const value = cache.getPidValue('0C', 'vehicle1');
        assert.strictEqual(value, 2500);
    });
    it('should separate cache by vehicle ID', () => {
        const cache = new ObdPidCache();
        cache.cachePidValue('0C', 'vehicle1', 2500);
        cache.cachePidValue('0C', 'vehicle2', 3000);
        assert.strictEqual(cache.getPidValue('0C', 'vehicle1'), 2500);
        assert.strictEqual(cache.getPidValue('0C', 'vehicle2'), 3000);
    });
    it('should return null for uncached PID', () => {
        const cache = new ObdPidCache();
        const value = cache.getPidValue('0D', 'vehicle1');
        assert.strictEqual(value, null);
    });
    it('should expire entries after TTL', async () => {
        const cache = new ObdPidCache();
        cache.cachePidValue('0C', 'vehicle1', 2500, 50); // 50ms TTL
        assert.strictEqual(cache.getPidValue('0C', 'vehicle1'), 2500);
        await new Promise(resolve => setTimeout(resolve, 100));
        assert.strictEqual(cache.getPidValue('0C', 'vehicle1'), null);
    });
});
