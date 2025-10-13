/**
 * Update Agent Configuration
 *
 * Централизованная конфигурация для клиентского агента обновлений.
 * Читает настройки из переменных окружения.
 */
import { v4 as uuidv4 } from 'uuid';
import * as os from 'os';
import * as path from 'path';
/**
 * Загружает конфигурацию из переменных окружения
 */
export function loadConfig() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseApiKey = process.env.SUPABASE_API_KEY;
    if (!supabaseUrl || !supabaseApiKey) {
        throw new Error('Missing required environment variables: SUPABASE_URL, SUPABASE_API_KEY');
    }
    // Загрузить или создать уникальный client_id
    const clientId = loadOrCreateClientId();
    const appRootDir = process.env.APP_ROOT_DIR || process.cwd();
    const appDir = appRootDir; // Alias for appRootDir
    const backupDir = path.join(appRootDir, '.backups');
    const tempDir = path.join(appRootDir, '.temp');
    // Read version from package.json
    const packageJson = require(path.join(appRootDir, 'package.json'));
    const appVersion = packageJson.version || '0.1.0';
    const maxBackups = parseInt(process.env.MAX_BACKUPS || '3', 10);
    return {
        supabaseUrl,
        supabaseApiKey,
        clientId,
        platform: os.platform(),
        hostname: os.hostname(),
        checkIntervalMs: parseInt(process.env.CHECK_INTERVAL_MS || '300000', 10), // 5 минут
        heartbeatIntervalMs: parseInt(process.env.HEARTBEAT_INTERVAL_MS || '30000', 10), // 30 секунд
        appRootDir,
        appDir,
        appVersion,
        backupDir,
        tempDir,
        maxBackupsToKeep: maxBackups,
        maxBackups,
        downloadTimeoutMs: parseInt(process.env.DOWNLOAD_TIMEOUT_MS || '600000', 10), // 10 минут
    };
}
/**
 * Загрузить client_id из файла или создать новый
 */
function loadOrCreateClientId() {
    const fs = require('fs');
    const clientIdFile = path.join(os.homedir(), '.update-agent-client-id');
    try {
        if (fs.existsSync(clientIdFile)) {
            return fs.readFileSync(clientIdFile, 'utf8').trim();
        }
    }
    catch (error) {
        console.warn('Failed to read client_id file:', error);
    }
    // Создать новый client_id
    const newClientId = uuidv4();
    try {
        fs.writeFileSync(clientIdFile, newClientId, 'utf8');
    }
    catch (error) {
        console.error('Failed to save client_id file:', error);
    }
    return newClientId;
}
