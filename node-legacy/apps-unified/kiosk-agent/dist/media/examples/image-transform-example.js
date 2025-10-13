/**
 * image-transform-example.ts - Пример трансформации изображения
 */
import { imageProxyClient } from '../ImageProxyClient.js';
async function main() {
    console.log('=== Image Transform Example ===\n');
    const sourceUrl = 'http://example.com/logo.png';
    const options = {
        width: 300,
        format: 'png',
        quality: 85
    };
    console.log('Transforming image:', sourceUrl);
    console.log('Options:', JSON.stringify(options, null, 2));
    const result = await imageProxyClient.transformImage(sourceUrl, options);
    console.log('\nResult:');
    console.log(`- Success: ${result.success}`);
    console.log(`- Size: ${result.size} bytes (${(result.size / 1024).toFixed(2)} KB)`);
    console.log(`- Content-Type: ${result.contentType}`);
    console.log(`- Cached: ${result.cachedFrom === 'cache'}`);
    console.log(`- Duration: ${result.duration}ms`);
    if (result.success) {
        console.log('\nOptimized image ready to use!');
    }
}
main().catch(console.error);
