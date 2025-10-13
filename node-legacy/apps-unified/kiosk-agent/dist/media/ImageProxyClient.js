/**
 * ImageProxyClient - Интеграция с imgproxy HTTP API
 */
import * as crypto from 'crypto';
import axios from 'axios';
import { CacheManager } from './CacheManager.js';
import { imageProxyRequestsTotal, imageProxyTransformDuration } from './metrics.js';
export class ImageProxyClient {
    constructor(cache) {
        this.cache = cache || new CacheManager();
        this.imgproxyUrl = process.env.IMGPROXY_URL || 'http://localhost:8080';
        this.imgproxyKey = process.env.IMGPROXY_KEY;
        this.imgproxySalt = process.env.IMGPROXY_SALT;
    }
    async transformImage(sourceUrl, options) {
        const startTime = Date.now();
        const imageKey = this.generateImageKey(sourceUrl, options);
        const cached = await this.getCachedImage(imageKey);
        if (cached) {
            imageProxyRequestsTotal.inc({ status: 'success', cached: 'true' });
            return {
                success: true,
                imageBuffer: cached,
                contentType: this.getContentType(options.format || 'jpeg'),
                size: cached.length,
                cachedFrom: 'cache',
                duration: Date.now() - startTime
            };
        }
        const proxyUrl = this.buildProxyUrl(sourceUrl, options);
        const transformTimer = imageProxyTransformDuration.startTimer({ format: options.format || 'jpeg' });
        try {
            const response = await axios.get(proxyUrl, {
                responseType: 'arraybuffer',
                timeout: 30000
            });
            const imageBuffer = Buffer.from(response.data);
            const ttl = parseInt(process.env.CACHE_TTL || '86400');
            await this.setCachedImage(imageKey, imageBuffer, ttl);
            transformTimer();
            imageProxyRequestsTotal.inc({ status: 'success', cached: 'false' });
            return {
                success: true,
                imageBuffer,
                contentType: response.headers['content-type'] || this.getContentType(options.format || 'jpeg'),
                size: imageBuffer.length,
                cachedFrom: 'proxy',
                duration: Date.now() - startTime
            };
        }
        catch (error) {
            transformTimer();
            imageProxyRequestsTotal.inc({ status: 'failure', cached: 'false' });
            console.error('[ImageProxyClient] Transform failed:', error);
            return {
                success: false,
                imageBuffer: Buffer.alloc(0),
                contentType: 'image/jpeg',
                size: 0,
                cachedFrom: 'proxy',
                duration: Date.now() - startTime
            };
        }
    }
    async getCachedImage(imageKey) {
        return this.cache.get(imageKey);
    }
    async setCachedImage(imageKey, imageBuffer, ttl) {
        return this.cache.set(imageKey, imageBuffer, ttl);
    }
    generateImageKey(sourceUrl, options) {
        const optionsStr = JSON.stringify(options);
        const hash = crypto.createHash('sha256')
            .update(sourceUrl + optionsStr)
            .digest('hex');
        return hash;
    }
    buildProxyUrl(sourceUrl, options) {
        const parts = [];
        const resize = options.resize || 'fit';
        const width = options.width || 0;
        const height = options.height || 0;
        parts.push(`rs:${resize}:${width}:${height}`);
        if (options.quality) {
            parts.push(`q:${options.quality}`);
        }
        if (options.background) {
            parts.push(`bg:${options.background}`);
        }
        let encodedSource;
        if (sourceUrl.startsWith('local://')) {
            const localPath = sourceUrl.replace('local://', '');
            encodedSource = `local:///${localPath}`;
        }
        else if (sourceUrl.startsWith('http://') || sourceUrl.startsWith('https://')) {
            encodedSource = Buffer.from(sourceUrl).toString('base64url');
        }
        else {
            encodedSource = Buffer.from(sourceUrl).toString('base64url');
        }
        const format = options.format || '';
        const path = `/${parts.join('/')}${format ? '.' + format : ''}/${encodedSource}`;
        if (this.imgproxyKey && this.imgproxySalt) {
            const signature = this.generateSignature(path);
            return `${this.imgproxyUrl}/${signature}${path}`;
        }
        return `${this.imgproxyUrl}/insecure${path}`;
    }
    generateSignature(path) {
        if (!this.imgproxyKey || !this.imgproxySalt) {
            return 'insecure';
        }
        const key = Buffer.from(this.imgproxyKey, 'hex');
        const salt = Buffer.from(this.imgproxySalt, 'hex');
        const hmac = crypto.createHmac('sha256', key);
        hmac.update(salt);
        hmac.update(path);
        return hmac.digest('base64url');
    }
    getContentType(format) {
        const types = {
            'jpeg': 'image/jpeg',
            'jpg': 'image/jpeg',
            'png': 'image/png',
            'webp': 'image/webp',
            'avif': 'image/avif'
        };
        return types[format] || 'image/jpeg';
    }
}
export const imageProxyClient = new ImageProxyClient();
