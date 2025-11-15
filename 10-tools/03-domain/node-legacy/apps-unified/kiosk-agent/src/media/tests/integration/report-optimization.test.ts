/**
 * report-optimization.test.ts - Интеграционный тест оптимизации отчетов
 */

import { describe, it } from 'node:test'
import assert from 'node:assert'
import { ReportOptimizer } from '../../ReportOptimizer.js'

describe('Report Optimization Integration', () => {
  it('should optimize HTML with embedded data URI', async () => {
    const optimizer = new ReportOptimizer()
    
    const smallPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    
    const htmlContent = `
      <html>
        <head><title>Test Report</title></head>
        <body>
          <h1>Report</h1>
          <img src="data:image/png;base64,${smallPng}" alt="Logo"/>
          <p>Content</p>
        </body>
      </html>
    `
    
    const originalSize = Buffer.byteLength(htmlContent, 'utf8')
    console.log('Original HTML size:', originalSize, 'bytes')
    
    const result = await optimizer.optimizeReportImages(htmlContent)
    
    console.log('Optimized size:', result.optimizedSize, 'bytes')
    console.log('Images processed:', result.imagesProcessed)
    console.log('Savings:', result.savingsPercent.toFixed(2), '%')
    
    assert.strictEqual(result.originalSize, originalSize)
    assert.ok(result.htmlContent.length > 0)
    assert.ok(result.imagesProcessed >= 0)
  })

  it('should extract multiple images from HTML', async () => {
    const optimizer = new ReportOptimizer()
    
    const html = `
      <html>
        <body>
          <img src="logo.png"/>
          <img src="qr-code.png"/>
          <div style="background-image: url(bg.png)">Content</div>
        </body>
      </html>
    `
    
    const images = optimizer.extractImages(html)
    
    assert.strictEqual(images.length, 3)
    assert.strictEqual(images.filter(img => img.tagType === 'img').length, 2)
    assert.strictEqual(images.filter(img => img.tagType === 'background').length, 1)
  })

  it('should handle HTML without images', async () => {
    const optimizer = new ReportOptimizer()
    
    const html = '<html><body><h1>No Images</h1><p>Just text</p></body></html>'
    
    const result = await optimizer.optimizeReportImages(html)
    
    assert.strictEqual(result.imagesProcessed, 0)
    assert.strictEqual(result.htmlContent, html)
    assert.strictEqual(result.savingsPercent, 0)
  })

  it('should handle complex HTML structure', async () => {
    const optimizer = new ReportOptimizer()
    
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>Complex Report</title>
          <style>
            .header { background-image: url('header-bg.png'); }
          </style>
        </head>
        <body>
          <div class="header">
            <img src="logo.png" class="logo"/>
          </div>
          <main>
            <section>
              <img src="chart1.png" alt="Chart 1"/>
              <img src="chart2.png" alt="Chart 2"/>
            </section>
          </main>
          <footer style="background-image: url(footer-bg.png)">
            <p>Footer</p>
          </footer>
        </body>
      </html>
    `
    
    const images = optimizer.extractImages(html)
    
    assert.ok(images.length >= 5)
  })

  it('should preserve HTML structure after optimization', async () => {
    const optimizer = new ReportOptimizer()
    
    const html = `
      <html>
        <body>
          <h1>Title</h1>
          <p>Paragraph</p>
        </body>
      </html>
    `
    
    const result = await optimizer.optimizeReportImages(html)
    
    assert.ok(result.htmlContent.includes('<h1>Title</h1>'))
    assert.ok(result.htmlContent.includes('<p>Paragraph</p>'))
  })
})
