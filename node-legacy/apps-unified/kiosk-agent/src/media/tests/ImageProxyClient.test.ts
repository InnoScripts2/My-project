/**
 * ImageProxyClient.test.ts - Unit tests for ImageProxyClient
 */

import { describe, it } from 'node:test'
import assert from 'node:assert'
import { ImageProxyClient } from '../ImageProxyClient.js'
import type { TransformOptions } from '../ImgproxyConfig.js'

describe('ImageProxyClient', () => {
  describe('generateImageKey', () => {
    it('should generate consistent hash for same input', () => {
      const client = new ImageProxyClient()
      const sourceUrl = 'http://example.com/image.png'
      const options: TransformOptions = { width: 300, format: 'jpeg' }
      
      const key1 = client.generateImageKey(sourceUrl, options)
      const key2 = client.generateImageKey(sourceUrl, options)
      
      assert.strictEqual(key1, key2)
    })

    it('should generate different hash for different inputs', () => {
      const client = new ImageProxyClient()
      const sourceUrl = 'http://example.com/image.png'
      
      const key1 = client.generateImageKey(sourceUrl, { width: 300 })
      const key2 = client.generateImageKey(sourceUrl, { width: 400 })
      
      assert.notStrictEqual(key1, key2)
    })

    it('should generate different hash for different URLs', () => {
      const client = new ImageProxyClient()
      const options: TransformOptions = { width: 300 }
      
      const key1 = client.generateImageKey('http://example.com/image1.png', options)
      const key2 = client.generateImageKey('http://example.com/image2.png', options)
      
      assert.notStrictEqual(key1, key2)
    })
  })

  describe('buildProxyUrl', () => {
    it('should generate correct URL with basic options', () => {
      const client = new ImageProxyClient()
      const sourceUrl = 'http://example.com/image.png'
      const options: TransformOptions = { width: 800, height: 600, format: 'jpeg', quality: 80 }
      
      const url = client.buildProxyUrl(sourceUrl, options)
      
      assert.ok(url.includes('/rs:fit:800:600'))
      assert.ok(url.includes('/q:80'))
      assert.ok(url.includes('.jpeg'))
    })

    it('should handle resize mode', () => {
      const client = new ImageProxyClient()
      const sourceUrl = 'http://example.com/image.png'
      
      const urlFit = client.buildProxyUrl(sourceUrl, { width: 300, resize: 'fit' })
      const urlCrop = client.buildProxyUrl(sourceUrl, { width: 300, resize: 'crop' })
      
      assert.ok(urlFit.includes('/rs:fit:300:0'))
      assert.ok(urlCrop.includes('/rs:crop:300:0'))
    })

    it('should handle background color', () => {
      const client = new ImageProxyClient()
      const sourceUrl = 'http://example.com/image.png'
      const options: TransformOptions = { width: 300, background: 'FFFFFF' }
      
      const url = client.buildProxyUrl(sourceUrl, options)
      
      assert.ok(url.includes('/bg:FFFFFF'))
    })

    it('should use insecure mode when no key configured', () => {
      delete process.env.IMGPROXY_KEY
      delete process.env.IMGPROXY_SALT
      
      const client = new ImageProxyClient()
      const sourceUrl = 'http://example.com/image.png'
      const url = client.buildProxyUrl(sourceUrl, { width: 300 })
      
      assert.ok(url.includes('/insecure/'))
    })

    it('should encode HTTP URLs properly', () => {
      const client = new ImageProxyClient()
      const sourceUrl = 'http://example.com/path/to/image.png'
      const url = client.buildProxyUrl(sourceUrl, { width: 300 })
      
      assert.ok(url.length > 0)
      assert.ok(!url.includes('http://example.com'))
    })

    it('should handle local file paths', () => {
      const client = new ImageProxyClient()
      const sourceUrl = 'local://path/to/image.png'
      const url = client.buildProxyUrl(sourceUrl, { width: 300 })
      
      assert.ok(url.includes('local:///path/to/image.png'))
    })
  })

  describe('getCachedImage and setCachedImage', () => {
    it('should return null for non-existent cache', async () => {
      const client = new ImageProxyClient()
      const result = await client.getCachedImage('non-existent-key')
      
      assert.strictEqual(result, null)
    })

    it('should cache and retrieve image', async () => {
      const client = new ImageProxyClient()
      const key = 'test-key'
      const buffer = Buffer.from('test image data')
      
      await client.setCachedImage(key, buffer, 3600)
      const result = await client.getCachedImage(key)
      
      assert.ok(result)
      assert.ok(buffer.equals(result))
    })
  })
})
