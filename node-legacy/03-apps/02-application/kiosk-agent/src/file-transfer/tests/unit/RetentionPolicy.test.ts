import { describe, it, mock } from 'node:test'
import assert from 'node:assert'
import { RetentionPolicy } from '../../RetentionPolicy.js'

describe('RetentionPolicy', () => {
  it('should create instance with default config', () => {
    const policy = new RetentionPolicy()
    assert.ok(policy)
  })

  it('should create instance with custom config', () => {
    const policy = new RetentionPolicy(undefined, undefined, {
      localRetentionDays: 7,
      remoteRetentionDays: 90,
      autoDeleteAfterSync: true,
      exemptPatterns: ['/important-.*\\.pdf$/']
    })
    assert.ok(policy)
  })

  it('should configure policy', () => {
    const policy = new RetentionPolicy()
    
    policy.configurePolicy({
      localRetentionDays: 14,
      remoteRetentionDays: 180
    })
    
    assert.ok(policy)
  })

  it('should apply policy with no deletions', async () => {
    const mockSeafileClient = {
      listFiles: mock.fn(async () => [])
    }

    const policy = new RetentionPolicy(mockSeafileClient as any)
    
    const result = await policy.applyPolicy()
    
    assert.strictEqual(result.localDeleted, 0)
    assert.strictEqual(result.remoteDeleted, 0)
  })

  it('should handle errors gracefully', async () => {
    const mockSeafileClient = {
      listFiles: mock.fn(async () => {
        throw new Error('Connection failed')
      })
    }

    const policy = new RetentionPolicy(mockSeafileClient as any)
    
    const result = await policy.applyPolicy()
    
    assert.ok(result.errors.length > 0)
  })

  it('should exempt files matching patterns', async () => {
    const mockSeafileClient = {
      listFiles: mock.fn(async () => [
        {
          path: '/reports/important-report.pdf',
          name: 'important-report.pdf',
          size: 1024,
          type: 'file' as const,
          modifiedAt: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString()
        }
      ]),
      deleteFile: mock.fn()
    }

    const policy = new RetentionPolicy(mockSeafileClient as any, undefined, {
      localRetentionDays: 7,
      remoteRetentionDays: 90,
      autoDeleteAfterSync: false,
      exemptPatterns: ['important-.*\\.pdf$']
    })
    
    const result = await policy.applyPolicy()
    
    assert.strictEqual(mockSeafileClient.deleteFile.mock.calls.length, 0)
  })

  it('should delete old remote files', async () => {
    const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000)
    
    const mockSeafileClient = {
      listFiles: mock.fn(async () => [
        {
          path: '/reports/old-report.pdf',
          name: 'old-report.pdf',
          size: 1024,
          type: 'file' as const,
          modifiedAt: oldDate.toISOString()
        }
      ]),
      deleteFile: mock.fn(async () => ({ success: true, path: '/reports/old-report.pdf' }))
    }

    const policy = new RetentionPolicy(mockSeafileClient as any, undefined, {
      localRetentionDays: 7,
      remoteRetentionDays: 90,
      autoDeleteAfterSync: false,
      exemptPatterns: []
    })
    
    const result = await policy.applyPolicy()
    
    assert.strictEqual(result.remoteDeleted, 1)
    assert.strictEqual(mockSeafileClient.deleteFile.mock.calls.length, 1)
  })

  it('should skip directories during remote retention', async () => {
    const mockSeafileClient = {
      listFiles: mock.fn(async () => [
        {
          path: '/reports/folder',
          name: 'folder',
          size: 0,
          type: 'dir' as const,
          modifiedAt: new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString()
        }
      ]),
      deleteFile: mock.fn()
    }

    const policy = new RetentionPolicy(mockSeafileClient as any, undefined, {
      localRetentionDays: 7,
      remoteRetentionDays: 90,
      autoDeleteAfterSync: false,
      exemptPatterns: []
    })
    
    const result = await policy.applyPolicy()
    
    assert.strictEqual(result.remoteDeleted, 0)
    assert.strictEqual(mockSeafileClient.deleteFile.mock.calls.length, 0)
  })

  it('should handle invalid regex patterns', async () => {
    const mockSeafileClient = {
      listFiles: mock.fn(async () => [])
    }

    const policy = new RetentionPolicy(mockSeafileClient as any, undefined, {
      localRetentionDays: 7,
      remoteRetentionDays: 90,
      autoDeleteAfterSync: false,
      exemptPatterns: ['[invalid(']
    })
    
    const result = await policy.applyPolicy()
    
    assert.strictEqual(result.errors.length, 0)
  })
})
