/**
 * cache-stats-example.ts - Пример работы с кешем
 */

import { cacheManager } from '../CacheManager.js'

async function main() {
  console.log('=== Cache Stats Example ===\n')

  const stats = await cacheManager.getStats()

  console.log('Cache Statistics:')
  console.log(`- Total keys: ${stats.totalKeys}`)
  console.log(`- Total size: ${(stats.totalSize / 1024 / 1024).toFixed(2)} MB`)
  console.log(`- Hit rate: ${(stats.hitRate * 100).toFixed(2)}%`)
  console.log(`- Miss rate: ${(stats.missRate * 100).toFixed(2)}%`)

  const testKey = 'test-image-key'
  const testBuffer = Buffer.from('test image data')

  console.log('\nAdding test entry to cache...')
  await cacheManager.set(testKey, testBuffer, 3600)

  const retrieved = await cacheManager.get(testKey)
  console.log(`Retrieved from cache: ${retrieved ? 'Success' : 'Failed'}`)

  const statsAfter = await cacheManager.getStats()
  console.log('\nCache Statistics after adding entry:')
  console.log(`- Total keys: ${statsAfter.totalKeys}`)
  console.log(`- Total size: ${(statsAfter.totalSize / 1024 / 1024).toFixed(2)} MB`)
}

main().catch(console.error)
