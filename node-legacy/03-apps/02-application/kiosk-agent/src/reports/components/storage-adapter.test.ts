import { describe, it, beforeEach, afterEach } from 'node:test'
import * as assert from 'node:assert'
import * as fs from 'fs/promises'
import * as path from 'path'
import { LocalFileStorageAdapter } from './storage-adapter.js'

describe('Storage Adapter', () => {
  const testDir = '/tmp/test-reports'
  let storage: LocalFileStorageAdapter

  beforeEach(async () => {
    storage = new LocalFileStorageAdapter(testDir)
    await fs.mkdir(testDir, { recursive: true })
  })

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true })
    } catch (error) {
      // ignore cleanup errors
    }
  })

  describe('put', () => {
    it('сохраняет HTML отчёт', async () => {
      const key = 'test-session-1'
      const content = '<html><body>Test Report</body></html>'
      
      const filePath = await storage.put(key, content, 'html')
      
      assert.ok(filePath.includes(testDir))
      assert.ok(filePath.endsWith('.html'))
      
      const savedContent = await fs.readFile(filePath, 'utf8')
      assert.strictEqual(savedContent, content)
    })

    it('сохраняет PDF отчёт', async () => {
      const key = 'test-session-2'
      const content = new Uint8Array([0x25, 0x50, 0x44, 0x46]) // %PDF
      
      const filePath = await storage.put(key, content, 'pdf')
      
      assert.ok(filePath.includes(testDir))
      assert.ok(filePath.endsWith('.pdf'))
      
      const savedContent = await fs.readFile(filePath)
      assert.deepStrictEqual(new Uint8Array(savedContent), content)
    })

    it('санитизирует небезопасные символы в ключе', async () => {
      const key = '../../../etc/passwd'
      const content = 'test'
      
      const filePath = await storage.put(key, content, 'html')
      
      assert.ok(!filePath.includes('..'))
      assert.ok(!filePath.includes('/etc/passwd'))
      assert.ok(filePath.includes(testDir))
    })

    it('создаёт директорию если её нет', async () => {
      await fs.rm(testDir, { recursive: true, force: true })
      
      const key = 'test-session-3'
      const content = 'test'
      
      const filePath = await storage.put(key, content, 'html')
      
      const exists = await fs.access(filePath).then(() => true).catch(() => false)
      assert.ok(exists)
    })
  })

  describe('getUrl', () => {
    it('возвращает путь к HTML отчёту', async () => {
      const key = 'test-session-4'
      
      const url = await storage.getUrl(key, 'html')
      
      assert.ok(url.includes(testDir))
      assert.ok(url.includes('test-session-4'))
      assert.ok(url.endsWith('.html'))
    })

    it('возвращает путь к PDF отчёту', async () => {
      const key = 'test-session-5'
      
      const url = await storage.getUrl(key, 'pdf')
      
      assert.ok(url.includes(testDir))
      assert.ok(url.includes('test-session-5'))
      assert.ok(url.endsWith('.pdf'))
    })
  })

  describe('delete', () => {
    it('удаляет существующий отчёт', async () => {
      const key = 'test-session-6'
      const content = 'test'
      
      const filePath = await storage.put(key, content, 'html')
      const existsBefore = await fs.access(filePath).then(() => true).catch(() => false)
      assert.ok(existsBefore)
      
      await storage.delete(key, 'html')
      
      const existsAfter = await fs.access(filePath).then(() => true).catch(() => false)
      assert.ok(!existsAfter)
    })

    it('не бросает ошибку при удалении несуществующего отчёта', async () => {
      const key = 'non-existent'
      
      await assert.doesNotReject(async () => {
        await storage.delete(key, 'html')
      })
    })
  })
})
