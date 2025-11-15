/**
 * ImgproxyConfig.test.ts - Unit tests for ImgproxyConfig
 */

import { describe, it } from 'node:test'
import assert from 'node:assert'
import { ImgproxyConfig } from '../ImgproxyConfig.js'

describe('ImgproxyConfig', () => {
  describe('getPreset', () => {
    it('should return preset options for valid preset name', () => {
      const config = new ImgproxyConfig()
      const preset = config.getPreset('small')
      
      assert.ok(preset)
      assert.strictEqual(preset.width, 300)
      assert.strictEqual(preset.height, 300)
      assert.strictEqual(preset.format, 'jpeg')
      assert.strictEqual(preset.quality, 80)
      assert.strictEqual(preset.resize, 'fit')
    })

    it('should return qr preset options', () => {
      const config = new ImgproxyConfig()
      const preset = config.getPreset('qr')
      
      assert.ok(preset)
      assert.strictEqual(preset.width, 200)
      assert.strictEqual(preset.height, 200)
      assert.strictEqual(preset.format, 'png')
      assert.strictEqual(preset.resize, 'fit')
    })

    it('should return logo preset options', () => {
      const config = new ImgproxyConfig()
      const preset = config.getPreset('logo')
      
      assert.ok(preset)
      assert.strictEqual(preset.width, 300)
      assert.strictEqual(preset.format, 'png')
      assert.strictEqual(preset.resize, 'fit')
    })

    it('should return undefined for invalid preset name', () => {
      const config = new ImgproxyConfig()
      const preset = config.getPreset('invalid')
      
      assert.strictEqual(preset, undefined)
    })
  })

  describe('addPreset', () => {
    it('should add custom preset', () => {
      const config = new ImgproxyConfig()
      config.addPreset('custom', { width: 500, format: 'webp', quality: 90 })
      
      const preset = config.getPreset('custom')
      assert.ok(preset)
      assert.strictEqual(preset.width, 500)
      assert.strictEqual(preset.format, 'webp')
      assert.strictEqual(preset.quality, 90)
    })

    it('should override existing preset', () => {
      const config = new ImgproxyConfig()
      config.addPreset('small', { width: 400, format: 'png' })
      
      const preset = config.getPreset('small')
      assert.ok(preset)
      assert.strictEqual(preset.width, 400)
      assert.strictEqual(preset.format, 'png')
    })
  })

  describe('listPresets', () => {
    it('should return array of preset names', () => {
      const config = new ImgproxyConfig()
      const presets = config.listPresets()
      
      assert.ok(Array.isArray(presets))
      assert.ok(presets.includes('small'))
      assert.ok(presets.includes('medium'))
      assert.ok(presets.includes('large'))
      assert.ok(presets.includes('qr'))
      assert.ok(presets.includes('logo'))
    })

    it('should include custom presets', () => {
      const config = new ImgproxyConfig()
      config.addPreset('custom', { width: 500 })
      
      const presets = config.listPresets()
      assert.ok(presets.includes('custom'))
    })
  })
})
