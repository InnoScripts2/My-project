/**
 * ImgproxyConfig - Управление пресетами трансформаций изображений
 */

export interface TransformOptions {
  width?: number
  height?: number
  format?: 'png' | 'jpeg' | 'webp' | 'avif'
  quality?: number
  resize?: 'fit' | 'fill' | 'crop'
  background?: string
  watermark?: {
    text: string
    position: string
    opacity: number
  }
}

export class ImgproxyConfig {
  private presets: Record<string, TransformOptions> = {
    small: { width: 300, height: 300, format: 'jpeg', quality: 80, resize: 'fit' },
    medium: { width: 800, height: 600, format: 'jpeg', quality: 85, resize: 'fit' },
    large: { width: 1200, height: 900, format: 'jpeg', quality: 90, resize: 'fit' },
    qr: { width: 200, height: 200, format: 'png', resize: 'fit' },
    logo: { width: 300, format: 'png', resize: 'fit' }
  }

  getPreset(presetName: string): TransformOptions | undefined {
    return this.presets[presetName]
  }

  addPreset(presetName: string, options: TransformOptions): void {
    this.presets[presetName] = options
  }

  listPresets(): string[] {
    return Object.keys(this.presets)
  }
}

export const imgproxyConfig = new ImgproxyConfig()
