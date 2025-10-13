/**
 * Unit tests for ExportService
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { ExportService } from '../ExportService.js';

describe('ExportService', () => {
  let service: ExportService;
  const testExportsDir = path.join('/tmp', 'test-exports');

  before(() => {
    if (!fs.existsSync(testExportsDir)) {
      fs.mkdirSync(testExportsDir, { recursive: true });
    }
    service = new ExportService(testExportsDir);
  });

  after(() => {
    // Очистить тестовые файлы
    if (fs.existsSync(testExportsDir)) {
      const files = fs.readdirSync(testExportsDir);
      for (const file of files) {
        fs.unlinkSync(path.join(testExportsDir, file));
      }
      fs.rmdirSync(testExportsDir);
    }
  });

  it('should export to CSV with header and data rows', async () => {
    const results = {
      rows: [
        { id: 1, name: 'Test 1', value: 100 },
        { id: 2, name: 'Test 2', value: 200 },
      ],
      columns: ['id', 'name', 'value'],
      rowCount: 2,
      duration: 10,
    };

    const filePath = await service.exportToCsv(results, 'test.csv');

    assert.ok(fs.existsSync(filePath));
    const content = fs.readFileSync(filePath, 'utf8');
    assert.ok(content.includes('id,name,value'));
    assert.ok(content.includes('Test 1'));
    assert.ok(content.includes('Test 2'));
  });

  it('should export to CSV with empty data', async () => {
    const results = {
      rows: [],
      columns: ['id', 'name', 'value'],
      rowCount: 0,
      duration: 10,
    };

    const filePath = await service.exportToCsv(results, 'test-empty.csv');

    assert.ok(fs.existsSync(filePath));
    const content = fs.readFileSync(filePath, 'utf8');
    assert.ok(content.includes('id,name,value'));
  });

  it('should export to JSON with valid structure', async () => {
    const results = {
      rows: [
        { id: 1, name: 'Test 1', value: 100 },
        { id: 2, name: 'Test 2', value: 200 },
      ],
      columns: ['id', 'name', 'value'],
      rowCount: 2,
      duration: 10,
    };

    const filePath = await service.exportToJson(results, 'test.json');

    assert.ok(fs.existsSync(filePath));
    const content = fs.readFileSync(filePath, 'utf8');
    const json = JSON.parse(content);
    
    assert.ok(json.columns);
    assert.ok(json.rows);
    assert.strictEqual(json.rowCount, 2);
    assert.ok(json.exportedAt);
  });

  it('should export to Excel workbook with worksheet', async () => {
    const results = {
      rows: [
        { id: 1, name: 'Test 1', value: 100 },
        { id: 2, name: 'Test 2', value: 200 },
      ],
      columns: ['id', 'name', 'value'],
      rowCount: 2,
      duration: 10,
    };

    const filePath = await service.exportToExcel(results, 'test.xlsx');

    assert.ok(fs.existsSync(filePath));
    const stats = fs.statSync(filePath);
    assert.ok(stats.size > 0);
  });

  it('should create directories if they do not exist', async () => {
    const results = {
      rows: [{ id: 1 }],
      columns: ['id'],
      rowCount: 1,
      duration: 10,
    };

    const nestedPath = 'subdir/nested/test.csv';
    const filePath = await service.exportToCsv(results, nestedPath);

    assert.ok(fs.existsSync(filePath));
  });

  it('should cleanup old exports', async () => {
    // Создать старый файл
    const oldFile = path.join(testExportsDir, 'old-file.csv');
    fs.writeFileSync(oldFile, 'test');
    
    // Установить старую дату модификации (8 дней назад)
    const oldTime = Date.now() - 8 * 24 * 60 * 60 * 1000;
    fs.utimesSync(oldFile, new Date(oldTime), new Date(oldTime));

    // Создать новый файл
    const newFile = path.join(testExportsDir, 'new-file.csv');
    fs.writeFileSync(newFile, 'test');

    // Очистить старые файлы (старше 7 дней)
    const deletedCount = await service.cleanupOldExports(7);

    assert.strictEqual(deletedCount, 1);
    assert.ok(!fs.existsSync(oldFile));
    assert.ok(fs.existsSync(newFile));
  });
});
