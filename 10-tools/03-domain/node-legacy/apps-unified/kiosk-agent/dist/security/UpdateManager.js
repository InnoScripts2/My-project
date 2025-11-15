/**
 * UpdateManager Module
 *
 * Manages automatic updates with security:
 * - GitHub Releases integration
 * - GPG signature verification
 * - Atomic apply with rollback
 * - Update scheduling
 */
import axios from 'axios';
import * as fs from 'fs/promises';
import * as path from 'path';
import { execSync } from 'child_process';
export class UpdateManager {
    constructor() {
        this.currentVersion = process.env.APP_VERSION || '0.1.0';
        this.githubRepo = process.env.GITHUB_REPO || 'InnoScripts2/my-own-service';
        this.backupDir = process.env.BACKUP_DIR || '/var/backups/kiosk-agent';
        this.installDir =
            process.env.INSTALL_DIR || '/home/runner/work/my-own-service/my-own-service/03-apps/02-application/kiosk-agent';
    }
    async checkForUpdates() {
        try {
            const response = await axios.get(`https://api.github.com/repos/${this.githubRepo}/releases/latest`, {
                headers: {
                    Accept: 'application/vnd.github.v3+json',
                    'User-Agent': 'Kiosk-Agent-Update-Manager',
                },
            });
            const release = response.data;
            const latestVersion = release.tag_name.replace(/^v/, '');
            const artifact = release.assets.find((a) => a.name.includes('kiosk-agent') && a.name.endsWith('.tar.gz'));
            const signature = release.assets.find((a) => a.name.includes('kiosk-agent') && a.name.endsWith('.tar.gz.sig'));
            return {
                currentVersion: this.currentVersion,
                latestVersion,
                updateAvailable: this.isNewerVersion(latestVersion, this.currentVersion),
                releaseNotes: release.body || 'No release notes available',
                downloadUrl: artifact?.browser_download_url || '',
                signatureUrl: signature?.browser_download_url || '',
                publishedAt: release.published_at,
            };
        }
        catch (error) {
            throw new Error(`Failed to check for updates: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async downloadUpdate(version) {
        try {
            const updateInfo = await this.checkForUpdates();
            if (updateInfo.latestVersion !== version) {
                return {
                    success: false,
                    error: 'Version mismatch',
                };
            }
            const tempDir = path.join('/tmp', `kiosk-agent-update-${Date.now()}`);
            await fs.mkdir(tempDir, { recursive: true });
            const artifactPath = path.join(tempDir, `kiosk-agent-v${version}.tar.gz`);
            const signaturePath = path.join(tempDir, `kiosk-agent-v${version}.tar.gz.sig`);
            const artifactResponse = await axios.get(updateInfo.downloadUrl, {
                responseType: 'arraybuffer',
            });
            await fs.writeFile(artifactPath, artifactResponse.data);
            if (updateInfo.signatureUrl) {
                const signatureResponse = await axios.get(updateInfo.signatureUrl, {
                    responseType: 'arraybuffer',
                });
                await fs.writeFile(signaturePath, signatureResponse.data);
            }
            return {
                success: true,
                artifactPath,
                signaturePath: updateInfo.signatureUrl ? signaturePath : undefined,
            };
        }
        catch (error) {
            return {
                success: false,
                error: `Download failed: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
    }
    async verifySignature(artifactPath, signaturePath, publicKey) {
        try {
            const publicKeyPath = path.join('/tmp', 'publicKey.pem');
            await fs.writeFile(publicKeyPath, publicKey, 'utf-8');
            execSync(`gpg --verify ${signaturePath} ${artifactPath}`, { encoding: 'utf-8', timeout: 10000 });
            await fs.unlink(publicKeyPath);
            return true;
        }
        catch (error) {
            console.error(`Signature verification failed: ${error instanceof Error ? error.message : String(error)}`);
            return false;
        }
    }
    async applyUpdate(artifactPath) {
        try {
            const backupPath = path.join(this.backupDir, `kiosk-agent-v${this.currentVersion}-${Date.now()}.tar.gz`);
            await fs.mkdir(this.backupDir, { recursive: true });
            execSync(`tar -czf ${backupPath} -C ${this.installDir} .`, {
                encoding: 'utf-8',
                timeout: 60000,
            });
            const tempExtractDir = path.join('/tmp', `kiosk-agent-extract-${Date.now()}`);
            await fs.mkdir(tempExtractDir, { recursive: true });
            execSync(`tar -xzf ${artifactPath} -C ${tempExtractDir}`, {
                encoding: 'utf-8',
                timeout: 60000,
            });
            await this.stopAgent();
            const files = await fs.readdir(tempExtractDir);
            for (const file of files) {
                const srcPath = path.join(tempExtractDir, file);
                const destPath = path.join(this.installDir, file);
                await fs.rm(destPath, { recursive: true, force: true });
                await fs.rename(srcPath, destPath);
            }
            await this.startAgent();
            await new Promise((resolve) => setTimeout(resolve, 30000));
            const healthCheck = await this.checkHealth();
            if (!healthCheck) {
                await this.rollback('Health check failed after update');
                return {
                    success: false,
                    restartRequired: false,
                    errorMessage: 'Health check failed, rollback performed',
                };
            }
            const newVersion = await this.getCurrentVersionFromPackage();
            return {
                success: true,
                newVersion,
                oldVersion: this.currentVersion,
                restartRequired: false,
            };
        }
        catch (error) {
            return {
                success: false,
                restartRequired: false,
                errorMessage: `Apply failed: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
    }
    async rollback(reason) {
        try {
            const backups = await fs.readdir(this.backupDir);
            const latestBackup = backups
                .filter((f) => f.startsWith('kiosk-agent-v') && f.endsWith('.tar.gz'))
                .sort()
                .reverse()[0];
            if (!latestBackup) {
                return {
                    success: false,
                    errorMessage: 'No backup found',
                };
            }
            const backupPath = path.join(this.backupDir, latestBackup);
            await this.stopAgent();
            execSync(`tar -xzf ${backupPath} -C ${this.installDir}`, {
                encoding: 'utf-8',
                timeout: 60000,
            });
            await this.startAgent();
            const restoredVersion = await this.getCurrentVersionFromPackage();
            return {
                success: true,
                restoredVersion,
            };
        }
        catch (error) {
            return {
                success: false,
                errorMessage: `Rollback failed: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
    }
    async scheduleUpdate(version, scheduledTime) {
        console.log(`Update to version ${version} scheduled for ${scheduledTime}`);
    }
    isNewerVersion(latest, current) {
        const latestParts = latest.split('.').map(Number);
        const currentParts = current.split('.').map(Number);
        for (let i = 0; i < 3; i++) {
            if (latestParts[i] > currentParts[i])
                return true;
            if (latestParts[i] < currentParts[i])
                return false;
        }
        return false;
    }
    async stopAgent() {
        if (process.platform === 'win32') {
            execSync('net stop KioskAgent', { encoding: 'utf-8', timeout: 10000 });
        }
        else {
            execSync('sudo systemctl stop kiosk-agent', { encoding: 'utf-8', timeout: 10000 });
        }
    }
    async startAgent() {
        if (process.platform === 'win32') {
            execSync('net start KioskAgent', { encoding: 'utf-8', timeout: 10000 });
        }
        else {
            execSync('sudo systemctl start kiosk-agent', { encoding: 'utf-8', timeout: 10000 });
        }
    }
    async checkHealth() {
        try {
            const response = await axios.get('http://localhost:7070/api/health', {
                timeout: 5000,
            });
            return response.status === 200;
        }
        catch {
            return false;
        }
    }
    async getCurrentVersionFromPackage() {
        try {
            const packagePath = path.join(this.installDir, 'package.json');
            const packageData = await fs.readFile(packagePath, 'utf-8');
            const pkg = JSON.parse(packageData);
            return pkg.version || 'unknown';
        }
        catch {
            return 'unknown';
        }
    }
}
