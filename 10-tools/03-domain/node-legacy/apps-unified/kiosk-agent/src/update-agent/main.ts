/**
 * Update Agent Main Entry Point
 *
 * Оркестрирует все сервисы: heartbeat, telemetry, updater.
 * Подписывается на Realtime уведомления о новых обновлениях.
 */

import { loadConfig } from './config.js';
import { initSupabase, registerClient, updateClientVersion } from './services/supabase.js';
import { HeartbeatService } from './services/heartbeat.js';
import { TelemetryService } from './services/telemetry.js';
import { UpdaterService } from './services/updater.js';
import * as fs from 'fs';
import * as path from 'path';

let heartbeatService: HeartbeatService;
let telemetryService: TelemetryService;
let updaterService: UpdaterService;
let checkIntervalId: NodeJS.Timeout | null = null;

/**
 * Главная функция запуска агента
 */
export async function main() {
  try {
    console.log('=== Kiosk Update Agent Starting ===');

    // Загрузить конфигурацию
    const config = loadConfig();
    console.log('Configuration loaded');
    console.log(`Client ID: ${config.clientId}`);
    console.log(`Platform: ${config.platform}`);
    console.log(`App Version: ${config.appVersion}`);

    // Создать необходимые директории
    ensureDirectoriesExist(config);

    // Инициализировать Supabase
    initSupabase(config);
    console.log('Supabase initialized');

    // Зарегистрировать клиента в базе
    await registerClient(config);
    console.log('Client registered in Supabase');

    // Инициализировать сервисы
    telemetryService = new TelemetryService(config);
    heartbeatService = new HeartbeatService(config);
    updaterService = new UpdaterService(config, telemetryService);

    // Запустить сервисы
    telemetryService.start();
    heartbeatService.start();

    telemetryService.log('info', 'Update Agent started', {
      client_id: config.clientId,
      version: config.appVersion,
      platform: config.platform,
    });

    // Подписаться на Realtime уведомления о новых обновлениях
    subscribeToUpdateNotifications(config);

    // Запустить периодическую проверку обновлений
    startPeriodicUpdateCheck(config);

    // Обработка graceful shutdown
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    console.log('Update Agent is running');
  } catch (error: any) {
    console.error('Failed to start Update Agent:', error.message);
    process.exit(1);
  }
}

/**
 * Подписаться на Realtime уведомления о новых обновлениях
 */
function subscribeToUpdateNotifications(config: any) {
  const supabase = require('./services/supabase').getSupabase();

  supabase
    .channel('updates-notifications')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'updates',
        filter: `platform=eq.${config.platform}`,
      },
      async (payload: any) => {
        telemetryService.log('info', 'New update detected via Realtime', { update: payload.new });
        await handleUpdateAvailable();
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'updates',
        filter: `platform=eq.${config.platform}`,
      },
      async (payload: any) => {
        if (payload.new.status === 'published') {
          telemetryService.log('info', 'Update published via Realtime', { update: payload.new });
          await handleUpdateAvailable();
        }
      }
    )
    .subscribe();

  console.log('Subscribed to Realtime update notifications');
}

/**
 * Запустить периодическую проверку обновлений
 */
function startPeriodicUpdateCheck(config: any) {
  checkIntervalId = setInterval(async () => {
    await handleUpdateAvailable();
  }, config.updateCheckInterval);

  console.log(`Periodic update check started (interval: ${config.updateCheckInterval}ms)`);
}

/**
 * Обработать доступность нового обновления
 */
async function handleUpdateAvailable() {
  try {
    telemetryService.log('info', 'Checking for updates');

    // Проверить доступность обновлений
    const update = await updaterService.checkForUpdates();

    if (!update) {
      telemetryService.log('info', 'No updates available');
      return;
    }

    telemetryService.log('info', `Update found: ${update.version}`, { update });

    // Создать deployment запись
    await updaterService.updateDeploymentStatus(update.id, 'pending');

    // Скачать обновление
    await updaterService.updateDeploymentStatus(update.id, 'downloading');
    const downloadPath = await updaterService.downloadUpdate(update);

    if (!downloadPath) {
      await updaterService.updateDeploymentStatus(update.id, 'failed', 'Download failed');
      return;
    }

    // Проверить checksum
    await updaterService.updateDeploymentStatus(update.id, 'verifying');
    const checksumValid = await updaterService.verifyChecksum(downloadPath, update.checksum);

    if (!checksumValid) {
      await updaterService.updateDeploymentStatus(update.id, 'failed', 'Checksum verification failed');
      fs.unlinkSync(downloadPath);
      return;
    }

    // Создать backup
    await updaterService.updateDeploymentStatus(update.id, 'backing_up');
    const backupCreated = await updaterService.createBackup();

    if (!backupCreated) {
      await updaterService.updateDeploymentStatus(update.id, 'failed', 'Backup creation failed');
      fs.unlinkSync(downloadPath);
      return;
    }

    // Применить обновление
    await updaterService.updateDeploymentStatus(update.id, 'installing');
    const updateApplied = await updaterService.applyUpdate(downloadPath);

    if (!updateApplied) {
      telemetryService.log('error', 'Update installation failed, rolling back');
      await updaterService.rollback();
      await updaterService.updateDeploymentStatus(update.id, 'failed', 'Installation failed, rolled back');
      fs.unlinkSync(downloadPath);
      return;
    }

    // Обновить версию клиента в БД
    const config = loadConfig();
    await updateClientVersion(config, update.version);
    await updaterService.updateDeploymentStatus(update.id, 'completed');

    telemetryService.log('info', `Update ${update.version} installed successfully`);

    // Очистить временные файлы
    fs.unlinkSync(downloadPath);

    // TODO: Перезапустить приложение (нужна логика для graceful restart)
    telemetryService.log('warning', 'Application restart required to apply update');
  } catch (error: any) {
    telemetryService.log('error', 'Update process failed', { error: error.message });
  }
}

/**
 * Создать необходимые директории
 */
function ensureDirectoriesExist(config: any) {
  const dirs = [config.tempDir, config.backupDir];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`Created directory: ${dir}`);
    }
  }
}

/**
 * Graceful shutdown
 */
async function shutdown() {
  console.log('\n=== Shutting down Update Agent ===');

  if (checkIntervalId) {
    clearInterval(checkIntervalId);
  }

  if (heartbeatService) {
    await heartbeatService.stop();
  }

  if (telemetryService) {
    telemetryService.log('info', 'Update Agent shutting down');
    await telemetryService.stop();
  }

  console.log('Update Agent stopped');
  process.exit(0);
}

// Запустить агента, если файл запущен напрямую
if (require.main === module) {
  main();
}
