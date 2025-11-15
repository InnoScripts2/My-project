/**
 * PDF report generator for diagnostics
 */

import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';
import type { DiagnosticsReportData, ReportGenerationOptions } from './types.js';

export async function generateDiagnosticsReport(
  data: DiagnosticsReportData,
  options: ReportGenerationOptions
): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const fileName = `diagnostics-${data.sessionId}-${Date.now()}.pdf`;
      const filePath = path.join(options.outputPath, fileName);

      // Ensure output directory exists
      if (!fs.existsSync(options.outputPath)) {
        fs.mkdirSync(options.outputPath, { recursive: true });
      }

      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const stream = fs.createWriteStream(filePath);

      doc.pipe(stream);

      // Header
      doc.fontSize(20).text('Отчет диагностики OBD-II', { align: 'center' });
      doc.moveDown();

      // Session info
      doc.fontSize(12);
      doc.text(`Сессия: ${data.sessionId}`);
      doc.text(`Автомобиль: ${data.vehicleMake} ${data.vehicleModel}`);
      doc.text(`Дата: ${new Date(data.timestamp).toLocaleString('ru-RU')}`);
      doc.moveDown();

      // DTC codes section
      doc.fontSize(14).text('Коды неисправностей (DTC):', { underline: true });
      doc.moveDown(0.5);

      if (data.dtcCodes.length === 0) {
        doc.fontSize(12)
           .fillColor('green')
           .text('Неисправности не обнаружены')
           .fillColor('black');
      } else {
        data.dtcCodes.forEach((dtc, index) => {
          const severityColor = 
            dtc.severity === 'high' ? 'red' :
            dtc.severity === 'medium' ? 'orange' : 'gray';
          
          doc.fontSize(11);
          doc.fillColor(severityColor)
             .text(`${index + 1}. ${dtc.code}`, { continued: true })
             .fillColor('black')
             .text(` - ${dtc.description}`);
          doc.moveDown(0.3);
        });
      }

      doc.moveDown();

      // Clear status
      if (data.cleared) {
        doc.fontSize(12)
           .fillColor('blue')
           .text('Ошибки были сброшены')
           .fillColor('black');
        
        if (data.clearedAt) {
          doc.fontSize(10)
             .text(`Время сброса: ${new Date(data.clearedAt).toLocaleString('ru-RU')}`);
        }
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
