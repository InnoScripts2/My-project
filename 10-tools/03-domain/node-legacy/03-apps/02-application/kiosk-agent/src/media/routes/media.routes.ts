/**
 * media.routes - REST API endpoints для imgproxy оптимизации изображений
 */

import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { imageProxyClient } from '../ImageProxyClient.js'
import { cacheManager } from '../CacheManager.js'
import { imgproxyConfig } from '../ImgproxyConfig.js'
import { imageProxyCacheSize, imageProxyCacheHitRate } from '../metrics.js'

const transformSchema = z.object({
  sourceUrl: z.string().min(1),
  options: z.object({
    width: z.number().optional(),
    height: z.number().optional(),
    format: z.enum(['png', 'jpeg', 'webp', 'avif']).optional(),
    quality: z.number().min(1).max(100).optional(),
    resize: z.enum(['fit', 'fill', 'crop']).optional(),
    background: z.string().optional(),
    watermark: z.object({
      text: z.string(),
      position: z.string(),
      opacity: z.number()
    }).optional()
  })
})

export function createMediaRoutes(): Router {
  const router = Router()

  router.post('/api/media/transform', async (req: Request, res: Response) => {
    const parsed = transformSchema.safeParse(req.body)
    
    if (!parsed.success) {
      res.status(400).json({
        ok: false,
        error: 'invalid_payload',
        issues: parsed.error.flatten().fieldErrors
      })
      return
    }

    const { sourceUrl, options } = parsed.data

    try {
      const result = await imageProxyClient.transformImage(sourceUrl, options)
      
      if (!result.success) {
        res.status(500).json({
          ok: false,
          error: 'transform_failed'
        })
        return
      }

      if (req.query.returnUrl === 'true') {
        res.status(200).json({
          ok: true,
          url: imageProxyClient.buildProxyUrl(sourceUrl, options),
          size: result.size,
          contentType: result.contentType,
          cachedFrom: result.cachedFrom
        })
      } else {
        res.setHeader('Content-Type', result.contentType)
        res.setHeader('Content-Length', result.size.toString())
        res.setHeader('X-Cache-Status', result.cachedFrom)
        res.send(result.imageBuffer)
      }
    } catch (error: any) {
      console.error('[media] transform failed:', error)
      res.status(500).json({
        ok: false,
        error: 'transform_failed',
        message: error?.message || String(error)
      })
    }
  })

  router.get('/api/media/cache/stats', async (req: Request, res: Response) => {
    try {
      const stats = await cacheManager.getStats()
      
      imageProxyCacheSize.set(stats.totalSize)
      imageProxyCacheHitRate.set(stats.hitRate)

      res.status(200).json({
        ok: true,
        stats: {
          totalKeys: stats.totalKeys,
          totalSize: stats.totalSize,
          hitRate: stats.hitRate,
          missRate: stats.missRate
        }
      })
    } catch (error: any) {
      console.error('[media] cache stats failed:', error)
      res.status(500).json({
        ok: false,
        error: 'cache_stats_failed',
        message: error?.message || String(error)
      })
    }
  })

  router.delete('/api/media/cache', async (req: Request, res: Response) => {
    try {
      const statsBefore = await cacheManager.getStats()
      await cacheManager.clear()
      
      res.status(200).json({
        ok: true,
        cleared: true,
        deletedKeys: statsBefore.totalKeys
      })
    } catch (error: any) {
      console.error('[media] cache clear failed:', error)
      res.status(500).json({
        ok: false,
        error: 'cache_clear_failed',
        message: error?.message || String(error)
      })
    }
  })

  router.get('/api/media/presets', async (req: Request, res: Response) => {
    try {
      const presets = imgproxyConfig.listPresets()
      
      res.status(200).json({
        ok: true,
        presets
      })
    } catch (error: any) {
      console.error('[media] presets list failed:', error)
      res.status(500).json({
        ok: false,
        error: 'presets_list_failed',
        message: error?.message || String(error)
      })
    }
  })

  return router
}
