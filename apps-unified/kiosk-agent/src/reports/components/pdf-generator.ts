import { Counter, Histogram } from 'prom-client'
import { register } from 'prom-client'

const pdfGenerationSuccess = new Counter({
  name: 'reports_pdf_generation_success_total',
  help: 'Total number of successful PDF generations',
  registers: [register],
})

const pdfGenerationError = new Counter({
  name: 'reports_pdf_generation_error_total',
  help: 'Total number of failed PDF generations',
  registers: [register],
})

const pdfGenerationDuration = new Histogram({
  name: 'reports_pdf_generation_duration_seconds',
  help: 'Duration of PDF generation in seconds',
  registers: [register],
})

export interface PdfGenerator {
  /**
   * Генерировать PDF из HTML
   * @param htmlContent - HTML контент для конвертации
   * @returns PDF как Uint8Array
   */
  generatePdf(htmlContent: string): Promise<Uint8Array>

  /**
   * Проверить доступность генератора
   */
  isAvailable(): Promise<boolean>
}

/**
 * Puppeteer-based PDF generator
 */
export class PuppeteerPdfGenerator implements PdfGenerator {
  // puppeteer загружается динамически и является опциональной зависимостью в DEV
  private puppeteer: any = null
  private available: boolean | null = null

  async isAvailable(): Promise<boolean> {
    if (this.available !== null) {
      return this.available
    }

    try {
      // @ts-ignore — puppeteer является опциональной зависимостью и может отсутствовать в окружении
      this.puppeteer = await import('puppeteer')
      this.available = true
      return true
    } catch (error) {
      console.warn('[PuppeteerPdfGenerator] Puppeteer not available:', error)
      this.available = false
      return false
    }
  }

  async generatePdf(htmlContent: string): Promise<Uint8Array> {
    const timer = pdfGenerationDuration.startTimer()

    try {
      if (!(await this.isAvailable())) {
        throw new Error('Puppeteer not available')
      }

      const browser = await this.puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      })

      try {
        const page = await browser.newPage()
        await page.setContent(htmlContent, {
          waitUntil: 'networkidle0',
        })

        const pdfBuffer = await page.pdf({
          format: 'A4',
          printBackground: true,
          margin: {
            top: '10mm',
            right: '10mm',
            bottom: '10mm',
            left: '10mm',
          },
        })

        pdfGenerationSuccess.inc()
        return new Uint8Array(pdfBuffer)
      } finally {
        await browser.close()
      }
    } catch (error) {
      pdfGenerationError.inc()
      throw error
    } finally {
      timer()
    }
  }
}

/**
 * Fallback PDF generator (returns HTML as bytes in DEV)
 */
export class FallbackPdfGenerator implements PdfGenerator {
  async isAvailable(): Promise<boolean> {
    return true
  }

  async generatePdf(htmlContent: string): Promise<Uint8Array> {
    console.warn('[FallbackPdfGenerator] Using HTML fallback for PDF (Puppeteer not available)')
    const encoder = new TextEncoder()
    return encoder.encode(htmlContent)
  }
}

/**
 * Создать PDF генератор на основе окружения
 */
export async function createPdfGenerator(): Promise<PdfGenerator> {
  const puppeteerGenerator = new PuppeteerPdfGenerator()

  if (await puppeteerGenerator.isAvailable()) {
    return puppeteerGenerator
  }

  const env = process.env.AGENT_ENV || 'DEV'
  if (env === 'DEV') {
    console.warn('[PdfGenerator] Using fallback generator in DEV mode')
    return new FallbackPdfGenerator()
  }

  throw new Error('Puppeteer not available in PROD mode. Install puppeteer or Chrome.')
}
