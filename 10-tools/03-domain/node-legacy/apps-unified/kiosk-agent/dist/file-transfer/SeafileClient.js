import axios from 'axios';
import * as fs from 'fs/promises';
import * as path from 'path';
import FormData from 'form-data';
export class SeafileClient {
    constructor() {
        this.serverUrl = '';
        this.token = '';
        this.libraryId = '';
        this.client = axios.create({
            timeout: 30000,
            validateStatus: () => true,
        });
    }
    async init(serverUrl, username, password, libraryId) {
        this.serverUrl = serverUrl.replace(/\/$/, '');
        this.libraryId = libraryId;
        try {
            const authResponse = await this.client.post(`${this.serverUrl}/api2/auth-token/`, {
                username,
                password,
            });
            if (authResponse.status !== 200) {
                throw new Error(`Authentication failed: ${authResponse.status}`);
            }
            this.token = authResponse.data.token;
            const libraryResponse = await this.client.get(`${this.serverUrl}/api2/repos/${libraryId}/`, {
                headers: { Authorization: `Token ${this.token}` },
            });
            if (libraryResponse.status !== 200) {
                throw new Error(`Failed to get library info: ${libraryResponse.status}`);
            }
            return {
                connected: true,
                serverVersion: libraryResponse.data.version || '1.0',
                libraryName: libraryResponse.data.name || 'Unknown',
                availableSpace: libraryResponse.data.size || 0,
            };
        }
        catch (error) {
            throw new Error(`Seafile init failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async uploadFile(localFilePath, remoteFilePath) {
        if (!this.token) {
            throw new Error('Not initialized. Call init() first.');
        }
        try {
            const fileStats = await fs.stat(localFilePath);
            const fileContent = await fs.readFile(localFilePath);
            const uploadLinkResponse = await this.client.get(`${this.serverUrl}/api2/repos/${this.libraryId}/upload-link/`, {
                headers: { Authorization: `Token ${this.token}` },
            });
            if (uploadLinkResponse.status !== 200) {
                throw new Error(`Failed to get upload link: ${uploadLinkResponse.status}`);
            }
            const uploadUrl = uploadLinkResponse.data;
            const remotePath = path.dirname(remoteFilePath);
            const fileName = path.basename(remoteFilePath);
            const formData = new FormData();
            formData.append('file', fileContent, fileName);
            formData.append('parent_dir', remotePath === '.' ? '/' : remotePath);
            formData.append('replace', '1');
            const uploadResponse = await this.client.post(uploadUrl, formData, {
                headers: {
                    Authorization: `Token ${this.token}`,
                    ...formData.getHeaders(),
                },
                maxBodyLength: Infinity,
                maxContentLength: Infinity,
            });
            if (uploadResponse.status !== 200 && uploadResponse.status !== 201) {
                throw new Error(`Upload failed: ${uploadResponse.status}`);
            }
            return {
                success: true,
                remoteFilePath,
                size: fileStats.size,
                uploadedAt: new Date().toISOString(),
            };
        }
        catch (error) {
            throw new Error(`File upload failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async downloadFile(remoteFilePath, localFilePath) {
        if (!this.token) {
            throw new Error('Not initialized. Call init() first.');
        }
        try {
            const downloadLinkResponse = await this.client.get(`${this.serverUrl}/api2/repos/${this.libraryId}/file/`, {
                params: { p: remoteFilePath },
                headers: { Authorization: `Token ${this.token}` },
            });
            if (downloadLinkResponse.status !== 200) {
                throw new Error(`Failed to get download link: ${downloadLinkResponse.status}`);
            }
            const downloadUrl = downloadLinkResponse.data;
            const fileResponse = await this.client.get(downloadUrl, {
                headers: { Authorization: `Token ${this.token}` },
                responseType: 'arraybuffer',
            });
            if (fileResponse.status !== 200) {
                throw new Error(`Download failed: ${fileResponse.status}`);
            }
            await fs.mkdir(path.dirname(localFilePath), { recursive: true });
            await fs.writeFile(localFilePath, fileResponse.data);
            const stats = await fs.stat(localFilePath);
            return {
                success: true,
                localFilePath,
                size: stats.size,
            };
        }
        catch (error) {
            throw new Error(`File download failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async listFiles(remotePath) {
        if (!this.token) {
            throw new Error('Not initialized. Call init() first.');
        }
        try {
            const response = await this.client.get(`${this.serverUrl}/api2/repos/${this.libraryId}/dir/`, {
                params: { p: remotePath },
                headers: { Authorization: `Token ${this.token}` },
            });
            if (response.status !== 200) {
                throw new Error(`Failed to list files: ${response.status}`);
            }
            return response.data.map((item) => ({
                path: path.join(remotePath, item.name),
                name: item.name,
                size: item.size || 0,
                type: item.type === 'dir' ? 'dir' : 'file',
                modifiedAt: item.mtime ? new Date(item.mtime * 1000).toISOString() : new Date().toISOString(),
            }));
        }
        catch (error) {
            throw new Error(`List files failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async deleteFile(remoteFilePath) {
        if (!this.token) {
            throw new Error('Not initialized. Call init() first.');
        }
        try {
            const response = await this.client.delete(`${this.serverUrl}/api2/repos/${this.libraryId}/file/`, {
                params: { p: remoteFilePath },
                headers: { Authorization: `Token ${this.token}` },
            });
            if (response.status !== 200) {
                throw new Error(`Delete failed: ${response.status}`);
            }
            return {
                success: true,
                path: remoteFilePath,
            };
        }
        catch (error) {
            throw new Error(`File delete failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async getShareLink(filePath, expirationDays) {
        if (!this.token) {
            throw new Error('Not initialized. Call init() first.');
        }
        try {
            const response = await this.client.put(`${this.serverUrl}/api/v2.1/share-links/`, {
                path: filePath,
                repo_id: this.libraryId,
                expire_days: expirationDays,
            }, {
                headers: {
                    Authorization: `Token ${this.token}`,
                    'Content-Type': 'application/json',
                },
            });
            if (response.status !== 200 && response.status !== 201) {
                throw new Error(`Failed to create share link: ${response.status}`);
            }
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + expirationDays);
            return {
                url: response.data.link || response.data.url,
                token: response.data.token || '',
                expiresAt: expiresAt.toISOString(),
            };
        }
        catch (error) {
            throw new Error(`Share link creation failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async syncDirectory(localPath, remotePath) {
        if (!this.token) {
            throw new Error('Not initialized. Call init() first.');
        }
        const startTime = Date.now();
        const result = {
            uploaded: 0,
            downloaded: 0,
            deleted: 0,
            errors: [],
            duration: 0,
        };
        try {
            const localFiles = await this.scanLocalDirectory(localPath);
            const remoteFiles = await this.listFilesRecursive(remotePath);
            const localFileMap = new Map(localFiles.map(f => [f.relativePath, f]));
            const remoteFileMap = new Map(remoteFiles.map(f => [f.path.replace(remotePath, '').replace(/^\//, ''), f]));
            for (const [relativePath, localFile] of localFileMap.entries()) {
                try {
                    const remoteFile = remoteFileMap.get(relativePath);
                    const remoteFullPath = path.join(remotePath, relativePath).replace(/\\/g, '/');
                    if (!remoteFile || localFile.modifiedAt > new Date(remoteFile.modifiedAt).getTime()) {
                        await this.uploadFile(localFile.fullPath, remoteFullPath);
                        result.uploaded++;
                    }
                }
                catch (error) {
                    result.errors.push(`Upload ${relativePath}: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
            result.duration = Date.now() - startTime;
            return result;
        }
        catch (error) {
            result.errors.push(`Sync failed: ${error instanceof Error ? error.message : String(error)}`);
            result.duration = Date.now() - startTime;
            return result;
        }
    }
    async scanLocalDirectory(dirPath) {
        const files = [];
        async function scan(currentPath, basePath) {
            const entries = await fs.readdir(currentPath, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(currentPath, entry.name);
                if (entry.isDirectory()) {
                    await scan(fullPath, basePath);
                }
                else if (entry.isFile()) {
                    const stats = await fs.stat(fullPath);
                    const relativePath = path.relative(basePath, fullPath);
                    files.push({
                        relativePath,
                        fullPath,
                        modifiedAt: stats.mtimeMs,
                    });
                }
            }
        }
        try {
            await scan(dirPath, dirPath);
        }
        catch (error) {
            // Directory might not exist
        }
        return files;
    }
    async listFilesRecursive(remotePath) {
        const allFiles = [];
        async function listRecursive(currentPath, client) {
            try {
                const items = await client.listFiles(currentPath);
                for (const item of items) {
                    if (item.type === 'file') {
                        allFiles.push(item);
                    }
                    else if (item.type === 'dir') {
                        await listRecursive(item.path, client);
                    }
                }
            }
            catch (error) {
                // Directory might not exist or be empty
            }
        }
        await listRecursive(remotePath, this);
        return allFiles;
    }
}
