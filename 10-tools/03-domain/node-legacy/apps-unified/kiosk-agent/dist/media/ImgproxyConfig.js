/**
 * ImgproxyConfig - Управление пресетами трансформаций изображений
 */
export class ImgproxyConfig {
    constructor() {
        this.presets = {
            small: { width: 300, height: 300, format: 'jpeg', quality: 80, resize: 'fit' },
            medium: { width: 800, height: 600, format: 'jpeg', quality: 85, resize: 'fit' },
            large: { width: 1200, height: 900, format: 'jpeg', quality: 90, resize: 'fit' },
            qr: { width: 200, height: 200, format: 'png', resize: 'fit' },
            logo: { width: 300, format: 'png', resize: 'fit' }
        };
    }
    getPreset(presetName) {
        return this.presets[presetName];
    }
    addPreset(presetName, options) {
        this.presets[presetName] = options;
    }
    listPresets() {
        return Object.keys(this.presets);
    }
}
export const imgproxyConfig = new ImgproxyConfig();
