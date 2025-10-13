/**
 * CacheManager.test.ts - Unit tests for CacheManager
 */

import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import { CacheManager } from '../CacheManager.js'

describe('CacheManager', () => {
  let cache: CacheManager

  beforeEach(() => {
    cache = new CacheManager()
  })

  describe('set and get', () => {
    it('should save and return buffer', async () => {
      const key = 'test-key'
      const buffer = Buffer.from('test data')
      
      await cache.set(key, buffer, 3600)
      const result = await cache.get(key)
      
      assert.ok(result)
      assert.ok(buffer.equals(result))
    })

    it('should return null for non-existent key', async () => {
      const result = await cache.get('non-existent')
      assert.strictEqual(result, null)
    })

    it('should handle multiple keys', async () => {
      const buffer1 = Buffer.from('data1')
      const buffer2 = Buffer.from('data2')
      
      await cache.set('key1', buffer1, 3600)
      await cache.set('key2', buffer2, 3600)
      
      const result1 = await cache.get('key1')
      const result2 = await cache.get('key2')
      
      assert.ok(result1)
      assert.ok(result2)
      assert.ok(buffer1.equals(result1))
      assert.ok(buffer2.equals(result2))
    })
  })

  describe('delete', () => {
    it('should delete key', async () => {
      const key = 'test-key'
      const buffer = Buffer.from('test data')
      
      await cache.set(key, buffer, 3600)
      await cache.delete(key)
      
      const result = await cache.get(key)
      assert.strictEqual(result, null)
    })
  })

  describe('clear', () => {
    it('should clear all keys', async () => {
      await cache.set('key1', Buffer.from('data1'), 3600)
      await cache.set('key2', Buffer.from('data2'), 3600)
      
      await cache.clear()
      
      const result1 = await cache.get('key1')
      const result2 = await cache.get('key2')
      
      assert.strictEqual(result1, null)
      assert.strictEqual(result2, null)
    })
  })

  describe('getStats', () => {
    it('should return cache stats', async () => {
      await cache.set('key1', Buffer.from('data1'), 3600)
      await cache.set('key2', Buffer.from('data2'), 3600)
      
      await cache.get('key1')
      await cache.get('key1')
      await cache.get('non-existent')
      
      const stats = await cache.getStats()
      
      assert.ok(stats.totalKeys >= 0)
      assert.ok(stats.totalSize >= 0)
      assert.ok(stats.hitRate >= 0 && stats.hitRate <= 1)
      assert.ok(stats.missRate >= 0 && stats.missRate <= 1)
    })

    it('should calculate hit rate correctly', async () => {
      await cache.set('key1', Buffer.from('data1'), 3600)
      
      await cache.get('key1')
      await cache.get('key1')
      await cache.get('non-existent')
      
      const stats = await cache.getStats()
      
      assert.ok(stats.hitRate > 0)
      assert.ok(stats.missRate > 0)
      assert.strictEqual(Math.abs(stats.hitRate + stats.missRate - 1) < 0.001, true)
    })
  })
})
