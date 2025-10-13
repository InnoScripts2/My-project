/**
 * cache-performance.test.ts - Интеграционные тесты производительности кеша
 */

import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import { ImageProxyClient } from '../../ImageProxyClient.js'
import { CacheManager } from '../../CacheManager.js'

describe('Cache Performance Integration', () => {
  let client: ImageProxyClient
  let cache: CacheManager

  beforeEach(() => {
    cache = new CacheManager()
    client = new ImageProxyClient(cache)
  })

  it('should have cache miss on first request', async () => {
    const key = 'test-key-1'
    const result = await cache.get(key)
    
    assert.strictEqual(result, null)
  })

  it('should have cache hit on second request', async () => {
    const key = 'test-key-2'
    const buffer = Buffer.from('test data')
    
    await cache.set(key, buffer, 3600)
    
    const result1 = await cache.get(key)
    const result2 = await cache.get(key)
    
    assert.ok(result1)
    assert.ok(result2)
    assert.ok(buffer.equals(result1))
    assert.ok(buffer.equals(result2))
  })

  it('should increase hit rate with multiple cache hits', async () => {
    const key = 'test-key-3'
    const buffer = Buffer.from('test data')
    
    await cache.set(key, buffer, 3600)
    
    await cache.get(key)
    await cache.get(key)
    await cache.get(key)
    await cache.get('non-existent')
    
    const stats = await cache.getStats()
    
    assert.ok(stats.hitRate > 0)
    assert.ok(stats.hitRate > stats.missRate)
  })

  it('should handle concurrent cache operations', async () => {
    const promises = []
    
    for (let i = 0; i < 10; i++) {
      promises.push(cache.set(`key-${i}`, Buffer.from(`data-${i}`), 3600))
    }
    
    await Promise.all(promises)
    
    const stats = await cache.getStats()
    assert.ok(stats.totalKeys >= 10)
  })

  it('should track cache size', async () => {
    const buffer1 = Buffer.from('a'.repeat(1000))
    const buffer2 = Buffer.from('b'.repeat(2000))
    
    await cache.set('key1', buffer1, 3600)
    await cache.set('key2', buffer2, 3600)
    
    const stats = await cache.getStats()
    
    assert.ok(stats.totalSize >= 3000)
  })
})
