import { createReportService } from '@selfservice/report';
import { register, Counter, Histogram } from 'prom-client';
import { createPdfGenerator } from './pdf-generator.js';
import { reportOptimizer } from '../../media/ReportOptimizer.js';
const reportService = createReportService();
let pdfGenerator = null;
const buildHtmlDuration = new Histogram({
    name: 'reports_build_html_duration_seconds',
    help: 'Duration of HTML report building in seconds',
    labelNames: ['type'],
    registers: [register],
});
const buildPdfDuration = new Histogram({
    name: 'reports_build_pdf_duration_seconds',
    help: 'Duration of PDF report building in seconds',
    labelNames: ['type'],
    registers: [register],
});
const buildHtmlSize = new Histogram({
    name: 'reports_build_html_size_bytes',
    help: 'Size of built HTML reports in bytes',
    labelNames: ['type'],
    buckets: [1000, 5000, 10000, 50000, 100000],
    registers: [register],
});
const buildPdfSize = new Histogram({
    name: 'reports_build_pdf_size_bytes',
    help: 'Size of built PDF reports in bytes',
    labelNames: ['type'],
    buckets: [1000, 5000, 10000, 50000, 100000, 500000],
    registers: [register],
});
const buildErrors = new Counter({
    name: 'reports_build_errors_total',
    help: 'Total number of report build errors',
    labelNames: ['type', 'format'],
    registers: [register],
});
/**
 * Сборка HTML отчёта по данным сессии
 *
 * @param sessionData - Данные сессии (толщинометрия или OBD)
 * @returns HTML-строка отчёта
 */
export async function buildHtml(sessionData) {
    const type = isThicknessData(sessionData) ? 'thickness' : 'obd';
    const timer = buildHtmlDuration.startTimer({ type });
    try {
        let html = await reportService.toHTML(sessionData);
        if (process.env.OPTIMIZE_IMAGES === 'true') {
            try {
                const optimized = await reportOptimizer.optimizeReportImages(html);
                html = optimized.htmlContent;
                console.log(`[builder] Images optimized: ${optimized.savingsPercent.toFixed(2)}% reduction, ${optimized.imagesProcessed} images processed`);
            }
            catch (error) {
                console.error('[builder] Image optimization failed, using original HTML:', error);
            }
        }
        const size = Buffer.byteLength(html, 'utf8');
        buildHtmlSize.observe({ type }, size);
        timer();
        return html;
    }
    catch (error) {
        buildErrors.inc({ type, format: 'html' });
        throw error;
    }
}
/**
 * Сборка PDF отчёта по данным сессии
 *
 * @param sessionData - Данные сессии (толщинометрия или OBD)
 * @returns PDF как Uint8Array
 */
export async function buildPdf(sessionData) {
    const type = isThicknessData(sessionData) ? 'thickness' : 'obd';
    const timer = buildPdfDuration.startTimer({ type });
    try {
        // Initialize PDF generator if not already done
        if (!pdfGenerator) {
            pdfGenerator = await createPdfGenerator();
        }
        // Generate HTML first
        const html = await buildHtml(sessionData);
        // Convert to PDF using generator
        const pdf = await pdfGenerator.generatePdf(html);
        buildPdfSize.observe({ type }, pdf.length);
        timer();
        return pdf;
    }
    catch (error) {
        buildErrors.inc({ type, format: 'pdf' });
        throw error;
    }
}
function isThicknessData(data) {
    return 'points' in data;
}
