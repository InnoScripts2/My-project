import { describe, it, mock, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import { ArchiveService } from '../../ArchiveService.js'
import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'

describe('ArchiveService', () => {
  let testDbPath: string

  beforeEach(() => {
    testDbPath = path.join(os.tmpdir(), `test-archive-${Date.now()}.db`)
  })

  afterEach(async () => {
    try {
      await fs.unlink(testDbPath)
    } catch (e) {
      // Ignore if file doesn't exist
    }
  })

  it('should create instance', () => {
    const service = new ArchiveService(undefined, undefined, testDbPath)
    assert.ok(service)
    service.close()
  })

  it('should initialize database with schema', () => {
    const service = new ArchiveService(undefined, undefined, testDbPath)
    service.close()
  })

  it('should return null for non-existent report', async () => {
    const service = new ArchiveService(undefined, undefined, testDbPath)
    
    const result = await service.getArchivedReport('non-existent')
    
    assert.strictEqual(result, null)
    service.close()
  })

  it('should list archived reports with empty result', async () => {
    const service = new ArchiveService(undefined, undefined, testDbPath)
    
    const result = await service.listArchivedReports({})
    
    assert.strictEqual(result.reports.length, 0)
    assert.strictEqual(result.total, 0)
    service.close()
  })

  it('should filter archived reports by type', async () => {
    const service = new ArchiveService(undefined, undefined, testDbPath)
    
    const result = await service.listArchivedReports({ type: 'DIAGNOSTICS' })
    
    assert.strictEqual(result.reports.length, 0)
    service.close()
  })

  it('should filter archived reports by date range', async () => {
    const service = new ArchiveService(undefined, undefined, testDbPath)
    
    const result = await service.listArchivedReports({
      startDate: '2025-01-01T00:00:00Z',
      endDate: '2025-12-31T23:59:59Z'
    })
    
    assert.strictEqual(result.reports.length, 0)
    service.close()
  })

  it('should respect limit and offset parameters', async () => {
    const service = new ArchiveService(undefined, undefined, testDbPath)
    
    const result = await service.listArchivedReports({ limit: 10, offset: 5 })
    
    assert.strictEqual(result.reports.length, 0)
    service.close()
  })

  it('should handle manual sync', async () => {
    const mockSeafileClient = {
      syncDirectory: mock.fn(async () => ({
        uploaded: 0,
        downloaded: 0,
        deleted: 0,
        errors: [],
        duration: 100
      }))
    }

    const service = new ArchiveService(mockSeafileClient as any, undefined, testDbPath)
    
    const result = await service.manualSync()
    
    assert.strictEqual(result.uploaded, 0)
    assert.strictEqual(mockSeafileClient.syncDirectory.mock.calls.length, 1)
    service.close()
  })

  it('should start manual sync asynchronously', async () => {
    const mockSeafileClient = {
      syncDirectory: mock.fn(async () => ({
        uploaded: 0,
        downloaded: 0,
        deleted: 0,
        errors: [],
        duration: 100
      }))
    }

    const service = new ArchiveService(mockSeafileClient as any, undefined, testDbPath)
    
    const { syncId, status } = await service.startManualSync()
    
    assert.ok(syncId)
    assert.strictEqual(status, 'running')
    service.close()
  })

  it('should track sync job status', async () => {
    const mockSeafileClient = {
      syncDirectory: mock.fn(async () => ({
        uploaded: 0,
        downloaded: 0,
        deleted: 0,
        errors: [],
        duration: 100
      }))
    }

    const service = new ArchiveService(mockSeafileClient as any, undefined, testDbPath)
    
    const { syncId } = await service.startManualSync()
    
    await new Promise(resolve => setTimeout(resolve, 50))
    
    const syncStatus = await service.getSyncStatus(syncId)
    
    assert.ok(syncStatus)
    service.close()
  })

  it('should return null for unknown sync job', async () => {
    const service = new ArchiveService(undefined, undefined, testDbPath)
    
    const syncStatus = await service.getSyncStatus('unknown-sync-id')
    
    assert.strictEqual(syncStatus, null)
    service.close()
  })

  it('should schedule sync with cron expression', () => {
    const service = new ArchiveService(undefined, undefined, testDbPath)
    
    service.scheduleSync('0 4 * * *')
    
    service.close()
  })
})
