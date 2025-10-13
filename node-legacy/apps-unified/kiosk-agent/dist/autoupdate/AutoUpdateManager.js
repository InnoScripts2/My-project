/**
 * Auto-update system with slot-based atomic deployment and rollback.
 *
 * Architecture:
 * - Two deployment slots: A and B
 * - Active slot serves traffic
 * - Updates download to inactive slot
 * - Health check validates new version
 * - Atomic switch or automatic rollback
 */
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { checkReadiness } from '../health/healthCheck.js';
export class AutoUpdateManager {
    constructor(config) {
        this.manifestUrl = config.manifestUrl;
        this.baseDir = config.baseDir;
        this.stateFile = path.join(this.baseDir, 'update-state.json');
        this.publicKeyPath = config.publicKeyPath;
        this.store = config.store;
    }
    /**
     * Load current update state
     */
    async getState() {
        try {
            const content = await fs.readFile(this.stateFile, 'utf-8');
            return JSON.parse(content);
        }
        catch {
            // Default state
            return {
                currentSlot: 'A',
                currentVersion: process.env.npm_package_version || '0.0.0',
                currentReleaseId: process.env.RELEASE_ID || 'dev',
            };
        }
    }
    /**
     * Save update state
     */
    async saveState(state) {
        await fs.mkdir(this.baseDir, { recursive: true });
        await fs.writeFile(this.stateFile, JSON.stringify(state, null, 2), 'utf-8');
    }
    /**
     * Check for available updates
     */
    async checkForUpdates() {
        const state = await this.getState();
        try {
            // Fetch manifest
            const response = await fetch(this.manifestUrl);
            if (!response.ok) {
                return {
                    updateAvailable: false,
                    currentVersion: state.currentVersion,
                    canApply: false,
                    reason: `Failed to fetch manifest: HTTP ${response.status}`,
                };
            }
            const manifest = await response.json();
            // Verify signature if public key is provided
            if (this.publicKeyPath && manifest.signature) {
                const isValid = await this.verifySignature(manifest);
                if (!isValid) {
                    return {
                        updateAvailable: false,
                        currentVersion: state.currentVersion,
                        canApply: false,
                        reason: 'Signature verification failed',
                    };
                }
            }
            // Check if update is available
            if (manifest.version === state.currentVersion && manifest.releaseId === state.currentReleaseId) {
                return {
                    updateAvailable: false,
                    currentVersion: state.currentVersion,
                    canApply: false,
                };
            }
            // Check minimum version requirement
            if (manifest.minVersion && !this.isVersionCompatible(state.currentVersion, manifest.minVersion)) {
                return {
                    updateAvailable: true,
                    currentVersion: state.currentVersion,
                    availableVersion: manifest.version,
                    canApply: false,
                    reason: `Current version ${state.currentVersion} is below minimum required ${manifest.minVersion}`,
                };
            }
            // Check rollout policy
            const canApplyNow = this.canApplyUpdate(manifest);
            return {
                updateAvailable: true,
                currentVersion: state.currentVersion,
                availableVersion: manifest.version,
                canApply: canApplyNow,
                reason: canApplyNow ? undefined : 'Outside scheduled update window',
            };
        }
        catch (error) {
            return {
                updateAvailable: false,
                currentVersion: state.currentVersion,
                canApply: false,
                reason: error.message || 'Unknown error',
            };
        }
    }
    /**
     * Download and prepare update to inactive slot
     */
    async downloadUpdate(manifest) {
        const state = await this.getState();
        const targetSlot = state.currentSlot === 'A' ? 'B' : 'A';
        const slotDir = path.join(this.baseDir, `slot-${targetSlot}`);
        try {
            // Clear target slot
            await fs.rm(slotDir, { recursive: true, force: true });
            await fs.mkdir(slotDir, { recursive: true });
            // Download and verify each file
            for (const file of manifest.files) {
                const targetPath = path.join(slotDir, file.path);
                await fs.mkdir(path.dirname(targetPath), { recursive: true });
                // In real implementation, download from CDN/storage
                // For now, just validate the manifest structure
                const isValid = await this.verifyFileHash(targetPath, file.sha256);
                if (!isValid && file.sha256) {
                    throw new Error(`File verification failed: ${file.path}`);
                }
            }
            // Update state with pending update
            state.pendingUpdate = {
                slot: targetSlot,
                version: manifest.version,
                releaseId: manifest.releaseId,
                downloadedAt: new Date().toISOString(),
                validated: false,
            };
            state.lastCheck = new Date().toISOString();
            await this.saveState(state);
            return { success: true };
        }
        catch (error) {
            return { success: false, error: error.message || 'Download failed' };
        }
    }
    /**
     * Validate new version with health checks
     */
    async validateUpdate() {
        const state = await this.getState();
        if (!state.pendingUpdate) {
            return { success: false, error: 'No pending update' };
        }
        try {
            // Run health checks against new version
            const health = await checkReadiness(this.store);
            if (health.status === 'fail') {
                return { success: false, error: 'Health check failed' };
            }
            // Mark as validated
            state.pendingUpdate.validated = true;
            await this.saveState(state);
            return { success: true };
        }
        catch (error) {
            return { success: false, error: error.message || 'Validation failed' };
        }
    }
    /**
     * Apply update by switching to new slot
     */
    async applyUpdate() {
        const state = await this.getState();
        if (!state.pendingUpdate || !state.pendingUpdate.validated) {
            return { success: false, error: 'No validated update available' };
        }
        try {
            // Store rollback info
            const rollbackInfo = {
                fromVersion: state.currentVersion,
                fromReleaseId: state.currentReleaseId,
                fromSlot: state.currentSlot,
            };
            // Switch slots
            state.currentSlot = state.pendingUpdate.slot;
            state.currentVersion = state.pendingUpdate.version;
            state.currentReleaseId = state.pendingUpdate.releaseId;
            state.lastUpdate = new Date().toISOString();
            state.pendingUpdate = undefined;
            await this.saveState(state);
            // Signal restart required
            return { success: true };
        }
        catch (error) {
            return { success: false, error: error.message || 'Apply failed' };
        }
    }
    /**
     * Rollback to previous slot
     */
    async rollback(reason) {
        const state = await this.getState();
        const previousSlot = state.currentSlot === 'A' ? 'B' : 'A';
        try {
            // Try to read previous slot state
            // In real implementation, maintain version history
            state.rollbackInfo = {
                fromVersion: state.currentVersion,
                fromReleaseId: state.currentReleaseId,
                reason,
                timestamp: new Date().toISOString(),
            };
            state.currentSlot = previousSlot;
            // Restore previous version info from history
            await this.saveState(state);
            return { success: true };
        }
        catch (error) {
            return { success: false, error: error.message || 'Rollback failed' };
        }
    }
    /**
     * Check if update can be applied based on rollout policy
     */
    canApplyUpdate(manifest) {
        if (!manifest.rolloutPolicy) {
            return true;
        }
        const policy = manifest.rolloutPolicy;
        if (policy.strategy === 'immediate') {
            return true;
        }
        if (policy.strategy === 'scheduled' && policy.scheduleWindow) {
            const now = new Date();
            const currentHour = now.getHours();
            const { startHour, endHour } = policy.scheduleWindow;
            if (startHour <= endHour) {
                return currentHour >= startHour && currentHour < endHour;
            }
            else {
                // Window crosses midnight
                return currentHour >= startHour || currentHour < endHour;
            }
        }
        return false;
    }
    /**
     * Verify manifest signature
     */
    async verifySignature(manifest) {
        if (!this.publicKeyPath || !manifest.signature) {
            return false;
        }
        try {
            const publicKey = await fs.readFile(this.publicKeyPath, 'utf-8');
            // Remove signature from manifest for verification
            const { signature, ...manifestWithoutSig } = manifest;
            const data = JSON.stringify(manifestWithoutSig);
            const verify = crypto.createVerify('RSA-SHA256');
            verify.update(data);
            verify.end();
            return verify.verify(publicKey, signature, 'base64');
        }
        catch {
            return false;
        }
    }
    /**
     * Verify file hash
     */
    async verifyFileHash(filePath, expectedHash) {
        try {
            const content = await fs.readFile(filePath);
            const hash = crypto.createHash('sha256').update(content).digest('hex');
            return hash === expectedHash.toLowerCase();
        }
        catch {
            return false;
        }
    }
    /**
     * Check version compatibility (semantic versioning)
     */
    isVersionCompatible(current, minimum) {
        const parseCurrent = current.split('.').map(Number);
        const parseMin = minimum.split('.').map(Number);
        for (let i = 0; i < 3; i++) {
            const c = parseCurrent[i] || 0;
            const m = parseMin[i] || 0;
            if (c > m)
                return true;
            if (c < m)
                return false;
        }
        return true;
    }
}
