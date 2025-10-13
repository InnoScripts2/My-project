/**
 * Export Service для экспорта аналитических данных
 */
import fs from 'fs';
import path from 'path';
import { createObjectCsvWriter } from 'csv-writer';
import ExcelJS from 'exceljs';
import { Counter, Histogram } from 'prom-client';
export class ExportService {
    constructor(exportsDir, registry) {
        this.exportsDir = exportsDir || path.join(process.cwd(), 'exports');
        // Создать директорию если не существует
        if (!fs.existsSync(this.exportsDir)) {
            fs.mkdirSync(this.exportsDir, { recursive: true });
        }
        // Инициализация метрик
        this.metrics = {
            exportFilesTotal: new Counter({
                name: 'analytics_export_files_total',
                help: 'Total number of exported files',
                labelNames: ['format'],
                registers: registry ? [registry] : undefined,
            }),
            exportDuration: new Histogram({
                name: 'analytics_export_duration_seconds',
                help: 'Duration of export operations',
                labelNames: ['format'],
                buckets: [0.1, 0.5, 1, 2, 5, 10],
                registers: registry ? [registry] : undefined,
            }),
        };
    }
    /**
     * Экспорт в CSV
     */
    async exportToCsv(results, filePath) {
        const timer = this.metrics.exportDuration.startTimer({ format: 'csv' });
        try {
            // Полный путь к файлу
            const fullPath = path.isAbsolute(filePath)
                ? filePath
                : path.join(this.exportsDir, filePath);
            // Создать директорию если не существует
            const dir = path.dirname(fullPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            // Если нет данных, создать пустой файл с заголовками
            if (results.rows.length === 0) {
                const header = results.columns.join(',') + '\n';
                fs.writeFileSync(fullPath, header);
                this.metrics.exportFilesTotal.labels('csv').inc();
                timer();
                return fullPath;
            }
            // Создать CSV writer
            const csvWriter = createObjectCsvWriter({
                path: fullPath,
                header: results.columns.map((col) => ({ id: col, title: col })),
            });
            // Записать данные
            await csvWriter.writeRecords(results.rows);
            this.metrics.exportFilesTotal.labels('csv').inc();
            timer();
            return fullPath;
        }
        catch (error) {
            timer();
            throw new Error(`CSV export failed: ${error}`);
        }
    }
    /**
     * Экспорт в JSON
     */
    async exportToJson(results, filePath) {
        const timer = this.metrics.exportDuration.startTimer({ format: 'json' });
        try {
            // Полный путь к файлу
            const fullPath = path.isAbsolute(filePath)
                ? filePath
                : path.join(this.exportsDir, filePath);
            // Создать директорию если не существует
            const dir = path.dirname(fullPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            // Записать JSON
            const jsonData = {
                columns: results.columns,
                rows: results.rows,
                rowCount: results.rowCount,
                exportedAt: new Date().toISOString(),
            };
            fs.writeFileSync(fullPath, JSON.stringify(jsonData, null, 2));
            this.metrics.exportFilesTotal.labels('json').inc();
            timer();
            return fullPath;
        }
        catch (error) {
            timer();
            throw new Error(`JSON export failed: ${error}`);
        }
    }
    /**
     * Экспорт в Excel
     */
    async exportToExcel(results, filePath) {
        const timer = this.metrics.exportDuration.startTimer({ format: 'xlsx' });
        try {
            // Полный путь к файлу
            const fullPath = path.isAbsolute(filePath)
                ? filePath
                : path.join(this.exportsDir, filePath);
            // Создать директорию если не существует
            const dir = path.dirname(fullPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            // Создать workbook
            const workbook = new ExcelJS.Workbook();
            const worksheet = workbook.addWorksheet('Analytics');
            // Добавить заголовки
            const headerRow = worksheet.addRow(results.columns);
            headerRow.font = { bold: true };
            headerRow.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFE0E0E0' },
            };
            // Добавить данные
            for (const row of results.rows) {
                const values = results.columns.map((col) => row[col]);
                worksheet.addRow(values);
            }
            // Auto-fit column widths
            worksheet.columns.forEach((column) => {
                let maxLength = 0;
                if (column && column.eachCell) {
                    column.eachCell({ includeEmpty: false }, (cell) => {
                        const cellValue = cell.value ? cell.value.toString() : '';
                        maxLength = Math.max(maxLength, cellValue.length);
                    });
                    column.width = Math.min(maxLength + 2, 50);
                }
            });
            // Применить auto-filter
            worksheet.autoFilter = {
                from: { row: 1, column: 1 },
                to: { row: 1, column: results.columns.length },
            };
            // Сохранить файл
            await workbook.xlsx.writeFile(fullPath);
            this.metrics.exportFilesTotal.labels('xlsx').inc();
            timer();
            return fullPath;
        }
        catch (error) {
            timer();
            throw new Error(`Excel export failed: ${error}`);
        }
    }
    /**
     * Загрузить файл в хранилище (заглушка для будущей реализации)
     */
    async uploadToStorage(filePath, destination) {
        // TODO: Реализовать загрузку в S3/MinIO/другое хранилище
        return {
            success: false,
            error: 'Upload to storage not implemented yet',
        };
    }
    /**
     * Очистить старые экспорты (старше 7 дней)
     */
    async cleanupOldExports(daysToKeep = 7) {
        const now = Date.now();
        const maxAge = daysToKeep * 24 * 60 * 60 * 1000;
        let deletedCount = 0;
        const files = fs.readdirSync(this.exportsDir);
        for (const file of files) {
            const filePath = path.join(this.exportsDir, file);
            const stats = fs.statSync(filePath);
            if (now - stats.mtimeMs > maxAge) {
                fs.unlinkSync(filePath);
                deletedCount++;
            }
        }
        return deletedCount;
    }
}
