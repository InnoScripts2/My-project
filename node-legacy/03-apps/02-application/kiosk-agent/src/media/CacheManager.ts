/**
 * CacheManager - Управление кешированием трансформированных изображений
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import { createClient, RedisClientType } from 'redis'

export interface CacheStats {
  totalKeys: number
  totalSize: number
  hitRate: number
  missRate: number
}

interface CacheBackend {
  get(key: string): Promise<Buffer | null>
  set(key: string, value: Buffer, ttl: number): Promise<void>
  delete(key: string): Promise<void>
  clear(): Promise<void>
  getStats(): Promise<CacheStats>
}

class MemoryCacheBackend implements CacheBackend {
  private cache: Map<string, { buffer: Buffer; expiresAt: number }> = new Map()
  private hits = 0
  private misses = 0
  private maxSize: number

  constructor(maxSize: number) {
    this.maxSize = maxSize
  }

  async get(key: string): Promise<Buffer | null> {
    const entry = this.cache.get(key)
    if (!entry) {
      this.misses++
      return null
    }
    if (entry.expiresAt < Date.now()) {
      this.cache.delete(key)
      this.misses++
      return null
    }
    this.hits++
    return entry.buffer
  }

  async set(key: string, value: Buffer, ttl: number): Promise<void> {
    const currentSize = Array.from(this.cache.values()).reduce((sum, e) => sum + e.buffer.length, 0)
    if (currentSize + value.length > this.maxSize) {
      const entries = Array.from(this.cache.entries()).sort((a, b) => a[1].expiresAt - b[1].expiresAt)
      const toRemove = Math.ceil(entries.length * 0.2)
      for (let i = 0; i < toRemove; i++) {
        this.cache.delete(entries[i][0])
      }
    }
    this.cache.set(key, {
      buffer: value,
      expiresAt: Date.now() + ttl * 1000
    })
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key)
  }

  async clear(): Promise<void> {
    this.cache.clear()
    this.hits = 0
    this.misses = 0
  }

  async getStats(): Promise<CacheStats> {
    const now = Date.now()
    const validEntries = Array.from(this.cache.values()).filter(e => e.expiresAt > now)
    const totalSize = validEntries.reduce((sum, e) => sum + e.buffer.length, 0)
    const total = this.hits + this.misses
    return {
      totalKeys: validEntries.length,
      totalSize,
      hitRate: total > 0 ? this.hits / total : 0,
      missRate: total > 0 ? this.misses / total : 0
    }
  }
}

class FilesystemCacheBackend implements CacheBackend {
  private cacheDir: string
  private hits = 0
  private misses = 0

  constructor(cacheDir: string) {
    this.cacheDir = cacheDir
    fs.mkdir(cacheDir, { recursive: true }).catch(() => {})
  }

  async get(key: string): Promise<Buffer | null> {
    const filePath = path.join(this.cacheDir, `${key}.bin`)
    try {
      const stat = await fs.stat(filePath)
      const ttl = parseInt(process.env.CACHE_TTL || '86400') * 1000
      if (Date.now() - stat.mtime.getTime() > ttl) {
        await fs.unlink(filePath).catch(() => {})
        this.misses++
        return null
      }
      const buffer = await fs.readFile(filePath)
      this.hits++
      return buffer
    } catch (error) {
      this.misses++
      return null
    }
  }

  async set(key: string, value: Buffer, ttl: number): Promise<void> {
    const filePath = path.join(this.cacheDir, `${key}.bin`)
    await fs.writeFile(filePath, value)
  }

  async delete(key: string): Promise<void> {
    const filePath = path.join(this.cacheDir, `${key}.bin`)
    await fs.unlink(filePath).catch(() => {})
  }

  async clear(): Promise<void> {
    const files = await fs.readdir(this.cacheDir)
    await Promise.all(files.map(file => fs.unlink(path.join(this.cacheDir, file)).catch(() => {})))
    this.hits = 0
    this.misses = 0
  }

  async getStats(): Promise<CacheStats> {
    const files = await fs.readdir(this.cacheDir)
    let totalSize = 0
    let validKeys = 0
    const ttl = parseInt(process.env.CACHE_TTL || '86400') * 1000
    const now = Date.now()

    for (const file of files) {
      const filePath = path.join(this.cacheDir, file)
      try {
        const stat = await fs.stat(filePath)
        if (now - stat.mtime.getTime() <= ttl) {
          totalSize += stat.size
          validKeys++
        }
      } catch (error) {
        // Ignore file stat errors
      }
    }

    const total = this.hits + this.misses
    return {
      totalKeys: validKeys,
      totalSize,
      hitRate: total > 0 ? this.hits / total : 0,
      missRate: total > 0 ? this.misses / total : 0
    }
  }
}

class RedisCacheBackend implements CacheBackend {
  private client: RedisClientType
  private hits = 0
  private misses = 0
  private connected = false

  constructor(redisUrl: string) {
    this.client = createClient({ url: redisUrl })
    this.client.on('error', (err) => console.error('[RedisCacheBackend] Error:', err))
    this.client.connect().then(() => {
      this.connected = true
    }).catch((err) => {
      console.error('[RedisCacheBackend] Connection failed:', err)
    })
  }

  async get(key: string): Promise<Buffer | null> {
    if (!this.connected) {
      this.misses++
      return null
    }
    try {
      const data = await this.client.get(Buffer.from(`img:${key}`))
      if (data === null) {
        this.misses++
        return null
      }
      this.hits++
      return Buffer.from(data as string, 'binary')
    } catch (error) {
      this.misses++
      return null
    }
  }

  async set(key: string, value: Buffer, ttl: number): Promise<void> {
    if (!this.connected) return
    try {
      await this.client.set(Buffer.from(`img:${key}`), value.toString('binary'), { EX: ttl })
    } catch (error) {
      console.error('[RedisCacheBackend] Set error:', error)
    }
  }

  async delete(key: string): Promise<void> {
    if (!this.connected) return
    try {
      await this.client.del(`img:${key}`)
    } catch (error) {
      // Ignore deletion errors
    }
  }

  async clear(): Promise<void> {
    if (!this.connected) return
    try {
      const keys = await this.client.keys('img:*')
      if (keys.length > 0) {
        await this.client.del(keys)
      }
      this.hits = 0
      this.misses = 0
    } catch (error) {
      // Ignore clear errors
    }
  }

  async getStats(): Promise<CacheStats> {
    if (!this.connected) {
      return { totalKeys: 0, totalSize: 0, hitRate: 0, missRate: 0 }
    }
    try {
      const keys = await this.client.keys('img:*')
      let totalSize = 0
      for (const key of keys) {
        const data = await this.client.get(key)
        if (data) totalSize += Buffer.byteLength(data as string, 'binary')
      }
      const total = this.hits + this.misses
      return {
        totalKeys: keys.length,
        totalSize,
        hitRate: total > 0 ? this.hits / total : 0,
        missRate: total > 0 ? this.misses / total : 0
      }
    } catch (error) {
      return { totalKeys: 0, totalSize: 0, hitRate: 0, missRate: 0 }
    }
  }
}

export class CacheManager {
  private backend: CacheBackend

  constructor() {
    this.backend = this.createBackend()
  }

  private createBackend(): CacheBackend {
    if (process.env.REDIS_URL) {
      return new RedisCacheBackend(process.env.REDIS_URL)
    } else if (process.env.CACHE_FILESYSTEM === 'true') {
      return new FilesystemCacheBackend(path.join(process.cwd(), 'cache', 'images'))
    } else {
      const maxSize = parseInt(process.env.MAX_CACHE_SIZE || '104857600')
      return new MemoryCacheBackend(maxSize)
    }
  }

  async get(key: string): Promise<Buffer | null> {
    return this.backend.get(key)
  }

  async set(key: string, value: Buffer, ttl: number): Promise<void> {
    return this.backend.set(key, value, ttl)
  }

  async delete(key: string): Promise<void> {
    return this.backend.delete(key)
  }

  async clear(): Promise<void> {
    return this.backend.clear()
  }

  async getStats(): Promise<CacheStats> {
    return this.backend.getStats()
  }
}

export const cacheManager = new CacheManager()
