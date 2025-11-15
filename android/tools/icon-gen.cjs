#!/usr/bin/env node

// Генерация placeholder-иконок для Android launcher.
// Запуск: `node android/tools/icon-gen.cjs [--force]`
// По умолчанию существующие файлы не перезаписываются. Используйте `--force`, чтобы пересоздать.

const fs = require('fs');
const path = require('path');

const base64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO9+KXcAAAAASUVORK5CYII=';
const placeholderPng = Buffer.from(base64, 'base64');

const resDir = path.join(__dirname, '..', 'app', 'src', 'main', 'res');
const densities = [
    { bucket: 'mipmap-xhdpi', file: 'ic_launcher.png' },
    { bucket: 'mipmap-xxhdpi', file: 'ic_launcher.png' },
    { bucket: 'mipmap-xxxhdpi', file: 'ic_launcher.png' },
];

const force = process.argv.includes('--force');

if (!fs.existsSync(resDir)) {
    console.error('[icon-gen] Каталог ресурсов не найден:', resDir);
    process.exit(1);
}

let failures = 0;
let processed = 0;

for (const { bucket, file } of densities) {
    const targetDir = path.join(resDir, bucket);
    const targetPath = path.join(targetDir, file);

    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
        console.log('[icon-gen] Создан каталог', path.relative(resDir, targetDir));
    }

    if (!force && fs.existsSync(targetPath)) {
        console.log('[icon-gen] Пропуск — файл уже существует:', path.relative(resDir, targetPath));
        continue;
    }

    try {
        fs.writeFileSync(targetPath, placeholderPng);
        processed += 1;
        console.log('[icon-gen] Записан placeholder:', path.relative(resDir, targetPath), 'size=', placeholderPng.length, 'bytes');
    } catch (error) {
        failures += 1;
        console.error('[icon-gen] Ошибка при записи', path.relative(resDir, targetPath), error);
    }
}

if (failures > 0) {
    console.error('[icon-gen] Завершено с ошибками. Успешно обработано файлов:', processed);
    process.exit(1);
}

console.log('[icon-gen] Готово. Успешно обработано файлов:', processed);
