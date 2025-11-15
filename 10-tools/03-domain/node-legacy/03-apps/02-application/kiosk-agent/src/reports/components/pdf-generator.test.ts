import { describe, it } from 'node:test'
import * as assert from 'node:assert'
import { FallbackPdfGenerator, PuppeteerPdfGenerator } from './pdf-generator.js'

describe('PdfGenerator', () => {
  describe('FallbackPdfGenerator', () => {
    it('возвращает HTML как bytes', async () => {
      const generator = new FallbackPdfGenerator()
      const html = '<html><body>Test</body></html>'
      
      const pdf = await generator.generatePdf(html)
      
      assert.ok(pdf instanceof Uint8Array)
      assert.ok(pdf.length > 0)
      
      const decoder = new TextDecoder()
      const result = decoder.decode(pdf)
      assert.ok(result.includes('Test'))
    })

    it('всегда доступен', async () => {
      const generator = new FallbackPdfGenerator()
      const available = await generator.isAvailable()
      
      assert.strictEqual(available, true)
    })
  })

  describe('PuppeteerPdfGenerator', () => {
    it('проверяет доступность Puppeteer', async () => {
      const generator = new PuppeteerPdfGenerator()
      const available = await generator.isAvailable()
      
      assert.strictEqual(typeof available, 'boolean')
    })

    it('генерирует PDF если Puppeteer доступен', async () => {
      const generator = new PuppeteerPdfGenerator()
      const available = await generator.isAvailable()
      
      if (!available) {
        console.log('[Test] Puppeteer not available, skipping PDF generation test')
        return
      }

      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <title>Test Report</title>
          </head>
          <body>
            <h1>Test Report</h1>
            <p>This is a test PDF.</p>
          </body>
        </html>
      `
      
      const pdf = await generator.generatePdf(html)
      
      assert.ok(pdf instanceof Uint8Array)
      assert.ok(pdf.length > 0)
      
      const pdfMagic = '%PDF'
      const decoder = new TextDecoder()
      const header = decoder.decode(pdf.slice(0, 4))
      assert.strictEqual(header, pdfMagic)
    })
  })
})
