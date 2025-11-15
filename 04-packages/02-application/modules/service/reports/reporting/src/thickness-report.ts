/**
 * PDF report generator for thickness measurements
 */

import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';
import type { ThicknessReportData, ReportGenerationOptions } from './types.js';

export async function generateThicknessReport(
  data: ThicknessReportData,
  options: ReportGenerationOptions
): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const fileName = `thickness-${data.sessionId}-${Date.now()}.pdf`;
      const filePath = path.join(options.outputPath, fileName);

      // Ensure output directory exists
      if (!fs.existsSync(options.outputPath)) {
        fs.mkdirSync(options.outputPath, { recursive: true });
      }

      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const stream = fs.createWriteStream(filePath);

      doc.pipe(stream);

      // Header
      doc.fontSize(20).text('Отчет толщинометрии ЛКП', { align: 'center' });
      doc.moveDown();

      // Session info
      doc.fontSize(12);
      doc.text(`Сессия: ${data.sessionId}`);
      doc.text(`Тип автомобиля: ${data.vehicleType}`);
      doc.text(`Дата: ${new Date(data.timestamp).toLocaleString('ru-RU')}`);
      doc.moveDown();

      // Measurements section
      doc.fontSize(14).text('Измерения:', { underline: true });
      doc.moveDown(0.5);

      // Group measurements by status
      const normal = data.measurements.filter(m => m.status === 'normal');
      const warning = data.measurements.filter(m => m.status === 'warning');
      const critical = data.measurements.filter(m => m.status === 'critical');

      // Summary
      doc.fontSize(12);
      doc.text(`Всего измерений: ${data.measurements.length}`);
      doc.fillColor('green').text(`Нормальные: ${normal.length}`, { continued: true });
      doc.fillColor('orange').text(` | Предупреждение: ${warning.length}`, { continued: true });
      doc.fillColor('red').text(` | Критические: ${critical.length}`);
      doc.fillColor('black');
      doc.moveDown();

      // Detailed measurements
      doc.fontSize(11);
      
      data.measurements.forEach((measurement, index) => {
        const statusColor = 
          measurement.status === 'critical' ? 'red' :
          measurement.status === 'warning' ? 'orange' : 'green';
        
        doc.fillColor(statusColor)
           .text(`${index + 1}. ${measurement.zone}:`, { continued: true })
           .fillColor('black')
           .text(` ${measurement.value} мкм`);
        doc.moveDown(0.2);
      });

      // Recommendations
      doc.moveDown();
      doc.fontSize(12).text('Рекомендации:', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(10);

      if (critical.length > 0) {
        doc.fillColor('red')
           .text('Обнаружены критические отклонения. Рекомендуется детальная проверка.')
           .fillColor('black');
      } else if (warning.length > 0) {
        doc.fillColor('orange')
           .text('Обнаружены предупреждения. Рекомендуется мониторинг.')
           .fillColor('black');
      } else {
        doc.fillColor('green')
           .text('Все измерения в пределах нормы.')
           .fillColor('black');
      }

      // Footer
      doc.moveDown(2);
      doc.fontSize(10)
         .fillColor('gray')
         .text('Автосервис самообслуживания', { align: 'center' })
         .text('Отчет сгенерирован автоматически', { align: 'center' });

      doc.end();

      stream.on('finish', () => {
        resolve(filePath);
      });

      stream.on('error', (error) => {
        reject(error);
      });

    } catch (error) {
      reject(error);
    }
  });
}
