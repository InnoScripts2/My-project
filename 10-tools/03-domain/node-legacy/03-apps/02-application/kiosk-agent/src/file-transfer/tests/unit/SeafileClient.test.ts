import { describe, it, mock } from 'node:test'
import assert from 'node:assert'
import { SeafileClient } from '../../SeafileClient.js'

describe('SeafileClient', () => {
  it('should create instance', () => {
    const client = new SeafileClient()
    assert.ok(client)
  })

  it('should require init before operations', async () => {
    const client = new SeafileClient()
    
    await assert.rejects(
      async () => await client.uploadFile('/test.pdf', '/remote.pdf'),
      /Not initialized/
    )
  })

  it('should handle init with mock response', async () => {
    const client = new SeafileClient()
    
    const mockAxios = {
      post: mock.fn(async () => ({
        status: 200,
        data: { token: 'test-token' }
      })),
      get: mock.fn(async () => ({
        status: 200,
        data: { name: 'Test Library', version: '1.0', size: 1000000 }
      }))
    }

    Object.assign(client, { client: mockAxios })

    const result = await client.init(
      'https://seafile.test',
      'user',
      'pass',
      'lib-id'
    )

    assert.strictEqual(result.connected, true)
    assert.strictEqual(result.libraryName, 'Test Library')
    assert.strictEqual(mockAxios.post.mock.calls.length, 1)
    assert.strictEqual(mockAxios.get.mock.calls.length, 1)
  })

  it('should handle init failure', async () => {
    const client = new SeafileClient()
    
    const mockAxios = {
      post: mock.fn(async () => ({
        status: 401,
        data: {}
      }))
    }

    Object.assign(client, { client: mockAxios })

    await assert.rejects(
      async () => await client.init('https://seafile.test', 'user', 'pass', 'lib-id'),
      /Authentication failed/
    )
  })

  it('should handle listFiles with empty directory', async () => {
    const client = new SeafileClient()
    
    Object.assign(client, { 
      token: 'test-token',
      serverUrl: 'https://seafile.test',
      libraryId: 'lib-id'
    })

    const mockAxios = {
      get: mock.fn(async () => ({
        status: 200,
        data: []
      }))
    }

    Object.assign(client, { client: mockAxios })

    const files = await client.listFiles('/test')
    
    assert.strictEqual(files.length, 0)
    assert.strictEqual(mockAxios.get.mock.calls.length, 1)
  })

  it('should parse file list correctly', async () => {
    const client = new SeafileClient()
    
    Object.assign(client, { 
      token: 'test-token',
      serverUrl: 'https://seafile.test',
      libraryId: 'lib-id'
    })

    const mockAxios = {
      get: mock.fn(async () => ({
        status: 200,
        data: [
          { name: 'test.pdf', type: 'file', size: 1024, mtime: 1700000000 },
          { name: 'folder', type: 'dir', size: 0, mtime: 1700000000 }
        ]
      }))
    }

    Object.assign(client, { client: mockAxios })

    const files = await client.listFiles('/test')
    
    assert.strictEqual(files.length, 2)
    assert.strictEqual(files[0].name, 'test.pdf')
    assert.strictEqual(files[0].type, 'file')
    assert.strictEqual(files[0].size, 1024)
    assert.strictEqual(files[1].name, 'folder')
    assert.strictEqual(files[1].type, 'dir')
  })

  it('should handle deleteFile', async () => {
    const client = new SeafileClient()
    
    Object.assign(client, { 
      token: 'test-token',
      serverUrl: 'https://seafile.test',
      libraryId: 'lib-id'
    })

    const mockAxios = {
      delete: mock.fn(async () => ({
        status: 200,
        data: {}
      }))
    }

    Object.assign(client, { client: mockAxios })

    const result = await client.deleteFile('/test.pdf')
    
    assert.strictEqual(result.success, true)
    assert.strictEqual(result.path, '/test.pdf')
    assert.strictEqual(mockAxios.delete.mock.calls.length, 1)
  })

  it('should handle syncDirectory with no files', async () => {
    const client = new SeafileClient()
    
    Object.assign(client, { 
      token: 'test-token',
      serverUrl: 'https://seafile.test',
      libraryId: 'lib-id'
    })

    const mockScanLocal = mock.fn(async () => [])
    const mockListRecursive = mock.fn(async () => [])

    Object.assign(client, {
      scanLocalDirectory: mockScanLocal,
      listFilesRecursive: mockListRecursive
    })

    const result = await client.syncDirectory('/local', '/remote')
    
    assert.strictEqual(result.uploaded, 0)
    assert.strictEqual(result.downloaded, 0)
    assert.strictEqual(result.deleted, 0)
    assert.strictEqual(result.errors.length, 0)
  })
})
