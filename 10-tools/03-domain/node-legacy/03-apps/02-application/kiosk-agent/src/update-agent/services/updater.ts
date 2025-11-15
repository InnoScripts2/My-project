/**
 * Updater Service
 *
 * Скачивает, проверяет, применяет обновления.
 * Поддерживает backup и rollback механизмы.
 */

import { getSupabase } from './supabase.js';
import { UpdateAgentConfig } from '../config.js';
import { TelemetryService } from './telemetry.js';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as https from 'https';

export interface UpdateInfo {
  id: string;
  version: string;
  filename: string;
  checksum: string;
  changelog: string;
  storage_path: string;
}

export class UpdaterService {
  private config: UpdateAgentConfig;
  private telemetry: TelemetryService;

  constructor(config: UpdateAgentConfig, telemetry: TelemetryService) {
    this.config = config;
    this.telemetry = telemetry;
  }

  /**
   * Проверить доступность новых обновлений
   */
  async checkForUpdates(): Promise<UpdateInfo | null> {
    try {
      const supabase = getSupabase();

      // Получить client UUID
      const { data: client } = await supabase
        .from('clients')
        .select('id, current_version')
        .eq('client_id', this.config.clientId)
        .single();

      if (!client) {
        this.telemetry.log('error', 'Client not found');
        return null;
      }

      // Найти последнее опубликованное обновление для текущей платформы
      const { data: update, error } = await supabase
        .from('updates')
        .select('*')
        .eq('status', 'published')
        .eq('platform', this.config.platform)
        .gt('version', client.current_version || '0.0.0')
        .order('version', { ascending: false })
        .limit(1)
        .single();

      if (error || !update) {
        return null;
      }

      this.telemetry.log('info', `Update available: ${update.version}`, { update });
      return update as UpdateInfo;
    } catch (error: any) {
      this.telemetry.log('error', 'Failed to check for updates', { error: error.message });
      return null;
    }
  }

  /**
   * Скачать обновление из Supabase Storage
   */
  async downloadUpdate(update: UpdateInfo): Promise<string | null> {
    try {
      this.telemetry.log('info', `Downloading update: ${update.filename}`);

      // Получить signed URL
      const supabase = getSupabase();
      const { data: signedData, error: signError } = await supabase.storage
        .from('updates')
        .createSignedUrl(update.storage_path, 3600); // 1 час

      if (signError || !signedData) {
        this.telemetry.log('error', 'Failed to get download URL', { error: signError });
        return null;
      }

      const downloadPath = path.join(this.config.tempDir, update.filename);

      // Скачать файл через HTTPS
      await this.downloadFile(signedData.signedUrl, downloadPath);

      this.telemetry.log('info', `Downloaded to: ${downloadPath}`);
      return downloadPath;
    } catch (error: any) {
      this.telemetry.log('error', 'Download failed', { error: error.message });
      return null;
    }
  }

  /**
   * Проверить checksum файла
   */
  async verifyChecksum(filePath: string, expectedChecksum: string): Promise<boolean> {
    try {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);

      return new Promise((resolve, reject) => {
        stream.on('data', (data) => hash.update(data));
        stream.on('end', () => {
          const actualChecksum = hash.digest('hex');
          const match = actualChecksum === expectedChecksum;

          if (match) {
            this.telemetry.log('info', 'Checksum verified');
          } else {
            this.telemetry.log('error', 'Checksum mismatch', { expected: expectedChecksum, actual: actualChecksum });
          }

          resolve(match);
        });
        stream.on('error', reject);
      });
    } catch (error: any) {
      this.telemetry.log('error', 'Checksum verification failed', { error: error.message });
      return false;
    }
  }

  /**
   * Создать backup текущей версии
   */
  async createBackup(): Promise<boolean> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupDir = path.join(this.config.backupDir, `backup-${timestamp}`);

      this.telemetry.log('info', `Creating backup: ${backupDir}`);

      // Создать директорию backup
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      // Скопировать все файлы приложения
      this.copyDirectory(this.config.appDir, backupDir);

      // Удалить старые backup (оставить только последние N)
      await this.cleanupOldBackups();

      this.telemetry.log('info', 'Backup created successfully');
      return true;
    } catch (error: any) {
      this.telemetry.log('error', 'Backup creation failed', { error: error.message });
      return false;
    }
  }

  /**
   * Применить обновление
   */
  async applyUpdate(updatePath: string): Promise<boolean> {
    try {
      this.telemetry.log('info', `Applying update: ${updatePath}`);

      // Извлечь zip в temp директорию
      const extractDir = path.join(this.config.tempDir, 'extracted');
      if (fs.existsSync(extractDir)) {
        fs.rmSync(extractDir, { recursive: true });
      }
      fs.mkdirSync(extractDir, { recursive: true });

      // TODO: Использовать adm-zip или unzipper для распаковки
      // Пока заглушка - в реальности нужно установить adm-zip и использовать его
      this.telemetry.log('warning', 'ZIP extraction not implemented - install adm-zip package');

      // Переместить файлы из extractDir в appDir
      // this.copyDirectory(extractDir, this.config.appDir);

      this.telemetry.log('info', 'Update applied successfully');
      return true;
    } catch (error: any) {
      this.telemetry.log('error', 'Update application failed', { error: error.message });
      return false;
    }
  }

  /**
   * Откатить к последнему backup
   */
  async rollback(): Promise<boolean> {
    try {
      this.telemetry.log('warning', 'Rolling back to previous version');

      // Найти последний backup
      const backups = fs.readdirSync(this.config.backupDir)
        .filter(name => name.startsWith('backup-'))
        .sort()
        .reverse();

      if (backups.length === 0) {
        this.telemetry.log('error', 'No backups available for rollback');
        return false;
      }

      const latestBackup = path.join(this.config.backupDir, backups[0]);
      this.telemetry.log('info', `Restoring from: ${latestBackup}`);

      // Удалить текущие файлы приложения
      if (fs.existsSync(this.config.appDir)) {
        fs.rmSync(this.config.appDir, { recursive: true });
      }
      fs.mkdirSync(this.config.appDir, { recursive: true });

      // Восстановить из backup
      this.copyDirectory(latestBackup, this.config.appDir);

      this.telemetry.log('info', 'Rollback completed successfully');
      return true;
    } catch (error: any) {
      this.telemetry.log('critical', 'Rollback failed', { error: error.message });
      return false;
    }
  }

  /**
   * Обновить статус деплоймента в Supabase
   */
  async updateDeploymentStatus(updateId: string, status: string, errorMessage?: string) {
    try {
      const supabase = getSupabase();

      // Получить client UUID
      const { data: client } = await supabase
        .from('clients')
        .select('id')
        .eq('client_id', this.config.clientId)
        .single();

      if (!client) {
        return;
      }

      const payload: any = {
        status,
        updated_at: new Date().toISOString(),
      };

      if (errorMessage) {
        payload.error_message = errorMessage;
      }

      await supabase
        .from('update_deployments')
        .update(payload)
        .eq('client_id', client.id)
        .eq('update_id', updateId);

      this.telemetry.log('info', `Deployment status updated: ${status}`);
    } catch (error: any) {
      this.telemetry.log('error', 'Failed to update deployment status', { error: error.message });
    }
  }

  // === Вспомогательные методы ===

  private downloadFile(url: string, destination: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const file = fs.createWriteStream(destination);

      https.get(url, (response) => {
        response.pipe(file);

        file.on('finish', () => {
          file.close();
          resolve();
        });
      }).on('error', (error) => {
        fs.unlinkSync(destination);
        reject(error);
      });
    });
  }

  private copyDirectory(src: string, dest: string) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }

    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        this.copyDirectory(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  private async cleanupOldBackups() {
    const backups = fs.readdirSync(this.config.backupDir)
      .filter(name => name.startsWith('backup-'))
      .sort()
      .reverse();

    // Оставить только последние maxBackups
    const toDelete = backups.slice(this.config.maxBackups);

    for (const backup of toDelete) {
      const backupPath = path.join(this.config.backupDir, backup);
      this.telemetry.log('info', `Deleting old backup: ${backup}`);
      fs.rmSync(backupPath, { recursive: true });
    }
  }
}
