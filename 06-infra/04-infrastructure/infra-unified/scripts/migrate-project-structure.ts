import { promises as fs } from 'fs';
import * as path from 'path';

/**
 * Скрипт для миграции проекта из фрагментированной структуры в единую
 */

const PROJECT_ROOT = process.cwd();

const MIGRATION_MAP = {
  // Приложения
  'apps-unified/kiosk-agent': '03-apps/02-application/kiosk-agent',
  'apps-unified/kiosk-frontend': 'index.html', // Основной HTML файл в корне
  'apps-unified/cloud-api': '03-apps/02-application/cloud-api',
  'apps-unified/kiosk-admin': 'apps/kiosk-admin',
  'apps-unified/android-kiosk': 'apps/android-kiosk',
  
  // Пакеты
  'packages-unified/obd-diagnostics': 'apps-unified/kiosk-agent/src/devices/obd',
  'packages-unified/shared-types': 'новая структура для общих типов',
  'packages-unified/payment-core': 'apps-unified/kiosk-agent/src/payments',
  'packages-unified/report-generator': 'apps-unified/kiosk-agent/src/reports',
  
  // Инфраструктура
  'infra-unified/scripts': '06-infra/04-infrastructure/infra-root/scripts',
  'infra-unified/docker': 'новая папка для Docker',
  'infra-unified/deployment': 'infra',

  // Документация
  'docs-unified/api': '09-docs',
  'docs-unified/architecture': 'docs',
  'docs-unified/guides': 'docs',
};

async function copyDirectory(src: string, dest: string): Promise<void> {
  try {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });
    
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      
      if (entry.isDirectory()) {
        await copyDirectory(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  } catch (error) {
    console.error(`Ошибка копирования ${src} -> ${dest}:`, error);
  }
}

async function migrateProjectStructure(): Promise<void> {
  console.log('🚀 Начинаем миграцию проекта...');
  
  // 1. Создаем новые папки
  const newDirs = [
    'apps-unified',
    'packages-unified', 
    'infra-unified',
    'docs-unified',
    'tests-unified',
    'tools-unified',
    'config-unified'
  ];
  
  for (const dir of newDirs) {
    await fs.mkdir(path.join(PROJECT_ROOT, dir), { recursive: true });
    console.log(`✅ Создана папка: ${dir}`);
  }
  
  // 2. Копируем существующие приложения в новую структуру
  const migrations = [
    // Уже скопировано: kiosk-agent
    {
      src: path.join(PROJECT_ROOT, 'apps', 'kiosk-admin'),
      dest: path.join(PROJECT_ROOT, 'apps-unified', 'kiosk-admin')
    },
    {
      src: path.join(PROJECT_ROOT, 'apps', 'android-kiosk'),
      dest: path.join(PROJECT_ROOT, 'apps-unified', 'android-kiosk')
    },
    {
      src: path.join(PROJECT_ROOT, '06-infra', '04-infrastructure', 'infra-root', 'scripts'),
      dest: path.join(PROJECT_ROOT, 'infra-unified', 'scripts')
    },
    {
      src: path.join(PROJECT_ROOT, 'docs'),
      dest: path.join(PROJECT_ROOT, 'docs-unified', 'legacy')
    }
  ];
  
  for (const migration of migrations) {
    try {
      await copyDirectory(migration.src, migration.dest);
      console.log(`✅ Скопировано: ${migration.src} -> ${migration.dest}`);
    } catch (error) {
      console.log(`⚠️  Пропущено (не найдено): ${migration.src}`);
    }
  }
  
  // 3. Извлекаем OBD систему в отдельный пакет
  const obdSrc = path.join(PROJECT_ROOT, 'apps-unified', 'kiosk-agent', 'src', 'devices', 'obd');
  const obdDest = path.join(PROJECT_ROOT, 'packages-unified', 'obd-diagnostics');
  
  try {
    await copyDirectory(obdSrc, path.join(obdDest, 'src'));
    
    // Создаем package.json для OBD пакета
    const obdPackageJson = {
      name: '@selfservice/obd-diagnostics',
      version: '1.0.0',
      description: 'OBD-II диагностическая система для киоска самообслуживания',
      type: 'module',
      main: 'dist/index.js',
      types: 'dist/index.d.ts',
      scripts: {
        build: 'tsc',
        test: 'node --test',
        'test:integration': 'node --test **/*.integration.test.ts'
      }
    };
    
    await fs.writeFile(
      path.join(obdDest, 'package.json'),
      JSON.stringify(obdPackageJson, null, 2)
    );
    
    console.log('✅ Создан пакет: @selfservice/obd-diagnostics');
  } catch (error) {
    console.log('⚠️  OBD система уже обработана');
  }
  
  // 4. Создаем index.ts файлы для экспорта
  const indexFiles = [
    {
      path: path.join(PROJECT_ROOT, 'packages-unified', 'obd-diagnostics', 'src', 'index.ts'),
      content: `// Единая точка экспорта OBD-II системы
export * from './database/ObdTypes';
export * from './database/DtcDatabase';
export * from './database/PidDatabase';
export * from './driver/Elm327Driver';
export * from './ObdConnectionManager';
export * from './Transport';
`
    },
    {
      path: path.join(PROJECT_ROOT, 'apps-unified', 'kiosk-agent', 'src', 'index.ts'),
      content: `// Главный экспорт kiosk-agent
export * from './server';
export * from './api/routes';
`
    }
  ];
  
  for (const indexFile of indexFiles) {
    await fs.mkdir(path.dirname(indexFile.path), { recursive: true });
    await fs.writeFile(indexFile.path, indexFile.content);
    console.log(`✅ Создан index.ts: ${path.relative(PROJECT_ROOT, indexFile.path)}`);
  }
  
  console.log('🎉 Миграция структуры завершена!');
}

async function updatePackageJsonReferences(): Promise<void> {
  console.log('📝 Обновляем package.json ссылки...');
  
  // Обновляем корневой package.json
  const rootPackageJsonPath = path.join(PROJECT_ROOT, 'package-unified.json');
  
  try {
    const packageJson = JSON.parse(await fs.readFile(rootPackageJsonPath, 'utf-8'));
    
    // Обновляем workspace пути
    packageJson.workspaces = [
      'apps-unified/*',
      'packages-unified/*'
    ];
    
    // Обновляем скрипты
    const newScripts = {
      ...packageJson.scripts,
      'dev:agent': 'npm run dev --workspace=apps-unified/kiosk-agent',
      'dev:frontend': 'npm run dev --workspace=apps-unified/kiosk-frontend', 
      'dev:cloud': 'npm run dev --workspace=apps-unified/cloud-api',
      'build:agent': 'npm run build --workspace=apps-unified/kiosk-agent',
      'test:obd': 'npm run test --workspace=packages-unified/obd-diagnostics',
    };
    
    packageJson.scripts = newScripts;
    
    await fs.writeFile(rootPackageJsonPath, JSON.stringify(packageJson, null, 2));
    console.log('✅ Обновлен package-unified.json');
    
  } catch (error) {
    console.error('❌ Ошибка обновления package.json:', error);
  }
}

async function generateMigrationReport(): Promise<void> {
  const report = `# Отчет о миграции проекта

## Выполненные изменения

### ✅ Новая структура создана
- \`apps-unified/\` - Все приложения в едином пространстве
- \`packages-unified/\` - Переиспользуемые пакеты
- \`infra-unified/\` - Инфраструктурные скрипты
- \`docs-unified/\` - Объединенная документация

### ✅ Приложения перенесены
- \`apps-unified/kiosk-agent/\` - Backend сервис
- \`apps-unified/kiosk-admin/\` - Админ панель
- \`apps-unified/android-kiosk/\` - Android приложение

### ✅ Пакеты выделены
- \`packages-unified/obd-diagnostics/\` - OBD-II система
- Готов к выделению: payment-core, report-generator

### ✅ Инфраструктура
- \`infra-unified/scripts/\` - Скрипты развертывания

## Следующие шаги

1. Установить зависимости: \`npm install\`
2. Проверить сборку: \`npm run build\`
3. Запустить тесты: \`npm test\`
4. Перенести старый package.json: \`mv package-unified.json package.json\`
5. Удалить старые папки после проверки

## Команды

\`\`\`bash
# Разработка
npm run dev          # Все сервисы
npm run dev:agent    # Только backend
npm run dev:frontend # Только frontend

# Сборка
npm run build        # Все приложения
npm run build:agent  # Только backend

# Тестирование
npm test            # Все тесты
npm run test:obd    # Только OBD тесты
\`\`\`

Дата миграции: ${new Date().toISOString()}
`;

  await fs.writeFile(path.join(PROJECT_ROOT, 'MIGRATION-REPORT.md'), report);
  console.log('📋 Создан отчет о миграции: MIGRATION-REPORT.md');
}

// Запуск миграции
async function main(): Promise<void> {
  try {
    await migrateProjectStructure();
    await updatePackageJsonReferences();
    await generateMigrationReport();
    
    console.log('\n🎯 Миграция завершена успешно!');
    console.log('📁 Новая структура готова для использования');
    console.log('📋 Проверьте MIGRATION-REPORT.md для деталей');
    
  } catch (error) {
    console.error('❌ Ошибка миграции:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}