/**
 * Configuration management API endpoints
 * GET /api/config - Get current configuration (sanitized)
 * POST /api/config/reload - Reload configuration
 */

import type { Request, Response } from 'express';
import { config } from '../config/loader.js';

/**
 * Get configuration endpoint
 */
export async function getConfig(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const sanitized = config.getAll(true);
    
    res.json({
      success: true,
      config: sanitized
    });
  } catch (error: any) {
    console.error('[ConfigAPI] Get config error:', error);
    res.status(500).json({
      error: 'internal_error',
      message: error.message || 'Внутренняя ошибка сервера'
    });
  }
}

/**
 * Reload configuration endpoint (admin only)
 */
export async function reloadConfig(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const result = await config.reload();
    
    const adminKeyId = (req as any).adminKeyId;
    
    console.log(`[ConfigAPI] Configuration reloaded by admin ${adminKeyId}`, {
      changed: result.changed,
      immutableChanged: result.immutableChanged
    });
    
    res.json({
      success: true,
      changed: result.changed,
      immutableChanged: result.immutableChanged,
      restartRequired: result.immutableChanged.length > 0,
      reloadedBy: adminKeyId,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('[ConfigAPI] Reload config error:', error);
    res.status(500).json({
      error: 'internal_error',
      message: error.message || 'Не удалось перезагрузить конфигурацию',
      details: error.message
    });
  }
}
