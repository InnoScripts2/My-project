/**
 * Media optimization module - Index exports
 */

export { ImageProxyClient, imageProxyClient } from './ImageProxyClient.js'
export { CacheManager, cacheManager } from './CacheManager.js'
export { ImgproxyConfig, imgproxyConfig } from './ImgproxyConfig.js'
export { ReportOptimizer, reportOptimizer } from './ReportOptimizer.js'
export { createMediaRoutes } from './routes/media.routes.js'

export type { TransformOptions } from './ImgproxyConfig.js'
export type { TransformResult } from './ImageProxyClient.js'
export type { OptimizedResult, ImageReference } from './ReportOptimizer.js'
export type { CacheStats } from './CacheManager.js'

export * from './metrics.js'
