/**
 * MeshCentralAgent Module
 *
 * Manages MeshCentral remote management agent:
 * - Agent installation and status
 * - Remote command execution
 * - File upload/download operations
 */
import { execSync, exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
const execAsync = promisify(exec);
export class MeshCentralAgent {
    constructor() {
        this.meshServerUrl = process.env.MESHCENTRAL_URL || 'https://meshcentral.internal';
        this.meshId = process.env.MESHCENTRAL_MESH_ID || '';
        this.installPath =
            process.platform === 'win32'
                ? 'C:\\Program Files\\Mesh Agent'
                : '/usr/local/mesh_services/meshagent';
    }
    async installAgent(serverUrl, meshId) {
        this.meshServerUrl = serverUrl;
        this.meshId = meshId;
        try {
            const status = await this.getAgentStatus();
            if (status.installed) {
                return {
                    success: true,
                    version: status.version,
                };
            }
            return {
                success: false,
                error: 'MeshCentral agent installation requires manual download and execution of installer from MeshCentral server',
            };
        }
        catch (error) {
            return {
                success: false,
                error: `Installation check failed: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
    }
    async getAgentStatus() {
        try {
            if (process.platform === 'win32') {
                const output = execSync('sc query "Mesh Agent"', {
                    encoding: 'utf-8',
                    timeout: 5000,
                });
                const isRunning = output.includes('RUNNING');
                return {
                    installed: true,
                    version: 'unknown',
                    connected: isRunning,
                    lastSeen: new Date().toISOString(),
                    meshId: this.meshId,
                };
            }
            else {
                const output = execSync('systemctl status meshagent', {
                    encoding: 'utf-8',
                    timeout: 5000,
                });
                const isRunning = output.includes('active (running)');
                return {
                    installed: true,
                    version: 'unknown',
                    connected: isRunning,
                    lastSeen: new Date().toISOString(),
                    meshId: this.meshId,
                };
            }
        }
        catch (error) {
            return {
                installed: false,
                version: 'unknown',
                connected: false,
                lastSeen: new Date().toISOString(),
            };
        }
    }
    async executeCommand(command, args) {
        try {
            const fullCommand = `${command} ${args.join(' ')}`;
            const { stdout, stderr } = await execAsync(fullCommand, {
                timeout: 30000,
            });
            return {
                success: true,
                stdout: stdout.trim(),
                stderr: stderr.trim(),
                exitCode: 0,
            };
        }
        catch (error) {
            if (error && typeof error === 'object' && 'code' in error) {
                const execError = error;
                return {
                    success: false,
                    stdout: execError.stdout || '',
                    stderr: execError.stderr || '',
                    exitCode: execError.code || 1,
                };
            }
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
                exitCode: 1,
            };
        }
    }
    async uploadFile(localPath, remotePath) {
        try {
            await fs.access(localPath);
            await fs.copyFile(localPath, remotePath);
            return {
                success: true,
                path: remotePath,
            };
        }
        catch (error) {
            return {
                success: false,
                error: `Upload failed: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
    }
    async downloadFile(remotePath, localPath) {
        try {
            await fs.access(remotePath);
            await fs.copyFile(remotePath, localPath);
            return {
                success: true,
                path: localPath,
            };
        }
        catch (error) {
            return {
                success: false,
                error: `Download failed: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
    }
}
