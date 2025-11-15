/**
 * ReportOptimizer - Оптимизация изображений в HTML отчетах
 */
import { ImageProxyClient } from './ImageProxyClient.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { imageProxyOptimizedSizeReduction } from './metrics.js';
export class ReportOptimizer {
    constructor(client) {
        this.client = client || new ImageProxyClient();
    }
    async optimizeReportImages(htmlContent) {
        const originalSize = Buffer.byteLength(htmlContent, 'utf8');
        const images = this.extractImages(htmlContent);
        let optimizedHtml = htmlContent;
        let imagesProcessed = 0;
        const replacements = new Map();
        for (const img of images) {
            try {
                const options = this.determineTransformOptions(img);
                let sourceUrl = img.originalSrc;
                if (sourceUrl.startsWith('data:')) {
                    sourceUrl = await this.dataUriToFile(sourceUrl);
                }
                const result = await this.client.transformImage(sourceUrl, options);
                if (result.success) {
                    const optimizedDataUri = `data:${result.contentType};base64,${result.imageBuffer.toString('base64')}`;
                    replacements.set(img.originalSrc, optimizedDataUri);
                    imagesProcessed++;
                }
            }
            catch (error) {
                console.error('[ReportOptimizer] Failed to optimize image:', error);
            }
        }
        optimizedHtml = this.replaceImages(htmlContent, replacements);
        const optimizedSize = Buffer.byteLength(optimizedHtml, 'utf8');
        const savingsPercent = originalSize > 0 ? ((originalSize - optimizedSize) / originalSize) * 100 : 0;
        if (savingsPercent > 0) {
            imageProxyOptimizedSizeReduction.observe(savingsPercent);
        }
        return {
            htmlContent: optimizedHtml,
            originalSize,
            optimizedSize,
            savingsPercent,
            imagesProcessed
        };
    }
    extractImages(htmlContent) {
        const images = [];
        const imgRegex = /<img([^>]+)src=["']([^"']+)["']([^>]*)>/gi;
        let match;
        let index = 0;
        while ((match = imgRegex.exec(htmlContent)) !== null) {
            const src = match[2];
            const attrs = {};
            const attrRegex = /(\w+)=["']([^"']+)["']/g;
            let attrMatch;
            while ((attrMatch = attrRegex.exec(match[1] + match[3])) !== null) {
                attrs[attrMatch[1]] = attrMatch[2];
            }
            images.push({
                tagType: 'img',
                originalSrc: src,
                elementIndex: index++,
                attributes: attrs
            });
        }
        const bgRegex = /background-image:\s*url\(["']?([^"')]+)["']?\)/gi;
        while ((match = bgRegex.exec(htmlContent)) !== null) {
            images.push({
                tagType: 'background',
                originalSrc: match[1],
                elementIndex: index++,
                attributes: {}
            });
        }
        return images;
    }
    replaceImages(htmlContent, replacements) {
        let result = htmlContent;
        for (const [original, replacement] of replacements.entries()) {
            result = result.replace(new RegExp(this.escapeRegex(original), 'g'), replacement);
        }
        return result;
    }
    determineTransformOptions(img) {
        const src = img.originalSrc.toLowerCase();
        if (src.includes('qr') || src.includes('code')) {
            return { width: 200, height: 200, format: 'png', resize: 'fit' };
        }
        if (src.includes('logo')) {
            return { width: 300, format: 'png', resize: 'fit' };
        }
        if (src.includes('screenshot') || src.includes('diagram')) {
            return { width: 800, format: 'jpeg', quality: 80, resize: 'fit' };
        }
        return { width: 600, format: 'jpeg', quality: 80, resize: 'fit' };
    }
    async dataUriToFile(dataUri) {
        const matches = dataUri.match(/^data:([^;]+);base64,(.+)$/);
        if (!matches) {
            throw new Error('Invalid data URI');
        }
        const buffer = Buffer.from(matches[2], 'base64');
        const hash = crypto.createHash('md5').update(buffer).digest('hex');
        const ext = matches[1].split('/')[1] || 'png';
        const tmpDir = path.join(process.cwd(), 'cache', 'tmp');
        await fs.mkdir(tmpDir, { recursive: true });
        const filePath = path.join(tmpDir, `${hash}.${ext}`);
        await fs.writeFile(filePath, buffer);
        return `local://${filePath}`;
    }
    escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}
export const reportOptimizer = new ReportOptimizer();
