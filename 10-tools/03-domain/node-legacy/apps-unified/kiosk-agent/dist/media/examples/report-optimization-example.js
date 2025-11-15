/**
 * report-optimization-example.ts - Пример оптимизации отчета
 */
import { reportOptimizer } from '../ReportOptimizer.js';
async function main() {
    console.log('=== Report Optimization Example ===\n');
    const htmlContent = `
    <html>
      <head><title>Report</title></head>
      <body>
        <h1>Service Report</h1>
        <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Logo"/>
        <p>Report content here...</p>
      </body>
    </html>
  `;
    console.log('Original HTML size:', Buffer.byteLength(htmlContent, 'utf8'), 'bytes');
    const optimized = await reportOptimizer.optimizeReportImages(htmlContent);
    console.log('\nOptimization Results:');
    console.log(`- Original size: ${optimized.originalSize} bytes`);
    console.log(`- Optimized size: ${optimized.optimizedSize} bytes`);
    console.log(`- Savings: ${optimized.savingsPercent.toFixed(2)}%`);
    console.log(`- Images processed: ${optimized.imagesProcessed}`);
    console.log('\nOptimized HTML ready for PDF generation!');
}
main().catch(console.error);
