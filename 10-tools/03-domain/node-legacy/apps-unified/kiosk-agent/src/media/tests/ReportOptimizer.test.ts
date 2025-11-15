/**
 * ReportOptimizer.test.ts - Unit tests for ReportOptimizer
 */

import { describe, it } from 'node:test'
import assert from 'node:assert'
import { ReportOptimizer } from '../ReportOptimizer.js'

describe('ReportOptimizer', () => {
  describe('extractImages', () => {
    it('should find img tags in HTML', () => {
      const optimizer = new ReportOptimizer()
      const html = '<html><body><img src="http://example.com/image.png" alt="test"/></body></html>'
      
      const images = optimizer.extractImages(html)
      
      assert.strictEqual(images.length, 1)
      assert.strictEqual(images[0].tagType, 'img')
      assert.strictEqual(images[0].originalSrc, 'http://example.com/image.png')
    })

    it('should find multiple img tags', () => {
      const optimizer = new ReportOptimizer()
      const html = `
        <html>
          <body>
            <img src="image1.png"/>
            <img src="image2.png"/>
            <img src="image3.png"/>
          </body>
        </html>
      `
      
      const images = optimizer.extractImages(html)
      
      assert.strictEqual(images.length, 3)
      assert.strictEqual(images[0].originalSrc, 'image1.png')
      assert.strictEqual(images[1].originalSrc, 'image2.png')
      assert.strictEqual(images[2].originalSrc, 'image3.png')
    })

    it('should find background-image CSS', () => {
      const optimizer = new ReportOptimizer()
      const html = '<div style="background-image: url(\'background.png\')">Content</div>'
      
      const images = optimizer.extractImages(html)
      
      assert.strictEqual(images.length, 1)
      assert.strictEqual(images[0].tagType, 'background')
      assert.strictEqual(images[0].originalSrc, 'background.png')
    })

    it('should find both img tags and background images', () => {
      const optimizer = new ReportOptimizer()
      const html = `
        <html>
          <body>
            <img src="image.png"/>
            <div style="background-image: url(bg.png)">Content</div>
          </body>
        </html>
      `
      
      const images = optimizer.extractImages(html)
      
      assert.strictEqual(images.length, 2)
    })

    it('should handle data URIs', () => {
      const optimizer = new ReportOptimizer()
      const html = '<img src="data:image/png;base64,iVBORw0KGgo="/>'
      
      const images = optimizer.extractImages(html)
      
      assert.strictEqual(images.length, 1)
      assert.ok(images[0].originalSrc.startsWith('data:image/png;base64,'))
    })
  })

  describe('replaceImages', () => {
    it('should replace src URLs', () => {
      const optimizer = new ReportOptimizer()
      const html = '<img src="old.png"/>'
      const replacements = new Map([['old.png', 'new.png']])
      
      const result = optimizer.replaceImages(html, replacements)
      
      assert.ok(result.includes('new.png'))
      assert.ok(!result.includes('old.png'))
    })

    it('should replace multiple URLs', () => {
      const optimizer = new ReportOptimizer()
      const html = '<img src="img1.png"/><img src="img2.png"/>'
      const replacements = new Map([
        ['img1.png', 'new1.png'],
        ['img2.png', 'new2.png']
      ])
      
      const result = optimizer.replaceImages(html, replacements)
      
      assert.ok(result.includes('new1.png'))
      assert.ok(result.includes('new2.png'))
      assert.ok(!result.includes('img1.png'))
      assert.ok(!result.includes('img2.png'))
    })

    it('should handle special characters in URLs', () => {
      const optimizer = new ReportOptimizer()
      const html = '<img src="image(1).png"/>'
      const replacements = new Map([['image(1).png', 'new.png']])
      
      const result = optimizer.replaceImages(html, replacements)
      
      assert.ok(result.includes('new.png'))
    })
  })

  describe('optimizeReportImages', () => {
    it('should return optimized result structure', async () => {
      const optimizer = new ReportOptimizer()
      const html = '<html><body>No images here</body></html>'
      
      const result = await optimizer.optimizeReportImages(html)
      
      assert.ok(result.htmlContent)
      assert.ok(typeof result.originalSize === 'number')
      assert.ok(typeof result.optimizedSize === 'number')
      assert.ok(typeof result.savingsPercent === 'number')
      assert.ok(typeof result.imagesProcessed === 'number')
    })

    it('should handle HTML with no images', async () => {
      const optimizer = new ReportOptimizer()
      const html = '<html><body>No images here</body></html>'
      
      const result = await optimizer.optimizeReportImages(html)
      
      assert.strictEqual(result.imagesProcessed, 0)
      assert.strictEqual(result.htmlContent, html)
    })

    it('should calculate savings percent', async () => {
      const optimizer = new ReportOptimizer()
      const html = '<html><body>Content</body></html>'
      
      const result = await optimizer.optimizeReportImages(html)
      
      assert.ok(result.savingsPercent >= 0)
      assert.ok(result.savingsPercent <= 100)
    })
  })
})
