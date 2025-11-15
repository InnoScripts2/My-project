/**
 * preset-example.ts - Пример использования пресетов
 */
import { imgproxyConfig } from '../ImgproxyConfig.js';
import { imageProxyClient } from '../ImageProxyClient.js';
async function main() {
    console.log('=== Preset Usage Example ===\n');
    console.log('Available presets:');
    const presets = imgproxyConfig.listPresets();
    console.log(presets.join(', '));
    const logoPreset = imgproxyConfig.getPreset('logo');
    console.log('\nLogo preset options:');
    console.log(JSON.stringify(logoPreset, null, 2));
    const sourceUrl = 'local://assets/logo.png';
    console.log('\nTransforming with logo preset:', sourceUrl);
    const result = await imageProxyClient.transformImage(sourceUrl, logoPreset);
    console.log('\nResult:');
    console.log(`- Success: ${result.success}`);
    console.log(`- Size: ${result.size} bytes`);
    console.log(`- Cached: ${result.cachedFrom === 'cache'}`);
    imgproxyConfig.addPreset('custom', {
        width: 500,
        height: 500,
        format: 'webp',
        quality: 90,
        resize: 'crop'
    });
    console.log('\nCustom preset added');
    console.log('Updated presets:', imgproxyConfig.listPresets().join(', '));
}
main().catch(console.error);
