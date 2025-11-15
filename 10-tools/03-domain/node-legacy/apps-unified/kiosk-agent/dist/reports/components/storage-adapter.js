import * as fs from 'fs/promises';
import * as path from 'path';
import { Counter } from 'prom-client';
import { register } from 'prom-client';
const storagePutSuccess = new Counter({
    name: 'reports_storage_put_success_total',
    help: 'Total number of successful report storage puts',
    labelNames: ['format'],
    registers: [register],
});
const storagePutError = new Counter({
    name: 'reports_storage_put_error_total',
    help: 'Total number of failed report storage puts',
    labelNames: ['format'],
    registers: [register],
});
const storageDeleteSuccess = new Counter({
    name: 'reports_storage_delete_success_total',
    help: 'Total number of successful report deletions',
    registers: [register],
});
const storageDeleteError = new Counter({
    name: 'reports_storage_delete_error_total',
    help: 'Total number of failed report deletions',
    registers: [register],
});
/**
 * Локальная файловая система в качестве хранилища отчётов
 */
export class LocalFileStorageAdapter {
    constructor(baseDir) {
        this.baseDir = baseDir;
    }
    async put(key, content, format) {
        const safeName = this.sanitizeKey(key);
        const fileName = `${safeName}.${format}`;
        const filePath = path.join(this.baseDir, fileName);
        try {
            await fs.mkdir(this.baseDir, { recursive: true });
            if (typeof content === 'string') {
                await fs.writeFile(filePath, content, 'utf8');
            }
            else {
                await fs.writeFile(filePath, content);
            }
            storagePutSuccess.inc({ format });
            return filePath;
        }
        catch (error) {
            storagePutError.inc({ format });
            throw error;
        }
    }
    async getUrl(key, format) {
        const safeName = this.sanitizeKey(key);
        const fileName = `${safeName}.${format}`;
        return path.join(this.baseDir, fileName);
    }
    async delete(key, format) {
        const safeName = this.sanitizeKey(key);
        const fileName = `${safeName}.${format}`;
        const filePath = path.join(this.baseDir, fileName);
        try {
            await fs.unlink(filePath);
            storageDeleteSuccess.inc();
        }
        catch (error) {
            if (error.code !== 'ENOENT') {
                storageDeleteError.inc();
                throw error;
            }
        }
    }
    sanitizeKey(key) {
        return key.replace(/[^a-zA-Z0-9_-]/g, '_');
    }
}
/**
 * Создать адаптер хранилища на основе окружения
 */
export function createStorageAdapter() {
    const reportsDir = process.env.REPORTS_DIR || './reports';
    return new LocalFileStorageAdapter(reportsDir);
}
