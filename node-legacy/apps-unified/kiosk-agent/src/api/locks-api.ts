/**
 * Lock management API endpoints
 * POST /api/locks/:deviceType/open
 * POST /api/locks/:deviceType/close
 * POST /api/locks/:deviceType/test
 * GET /api/locks/:deviceType/status
 * POST /api/locks/emergency-unlock
 */

import type { Request, Response } from 'express';
import type { LockController } from '../locks/LockController.js';
import type { DeviceType } from '../locks/types.js';
import { z } from 'zod';

const DeviceTypeSchema = z.enum(['thickness', 'obd']);

const OpenLockSchema = z.object({
  sessionId: z.string().optional(),
  paymentConfirmed: z.boolean().optional(),
  vehicleSelected: z.boolean().optional(),
  operationKey: z.string().optional(),
  autoCloseMs: z.number().min(1000).max(60000).optional(),
  context: z.record(z.any()).optional()
});

const CloseLockSchema = z.object({
  operationKey: z.string().optional()
});

const TestLockSchema = z.object({
  cycles: z.number().min(1).max(10).default(1)
});

/**
 * Open lock endpoint
 */
export async function openLock(
  req: Request,
  res: Response,
  lockController: LockController
): Promise<void> {
  try {
    const deviceType = DeviceTypeSchema.parse(req.params.deviceType);
    const body = OpenLockSchema.parse(req.body);

    // Validate thickness lock requires payment confirmation
    if (deviceType === 'thickness' && !body.paymentConfirmed) {
      res.status(400).json({
        error: 'payment_required',
        message: 'Толщиномер требует подтверждения оплаты'
      });
      return;
    }

    // Generate operation ID for tracking
    const opId = body.operationKey || `op_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    const result = await lockController.openSlot(deviceType, {
      operationKey: opId,
      autoCloseMs: body.autoCloseMs,
      context: {
        ...body.context,
        sessionId: body.sessionId,
        paymentConfirmed: body.paymentConfirmed,
        vehicleSelected: body.vehicleSelected
      }
    });

    if (!result.ok) {
      res.status(400).json({
        error: result.error || 'lock_operation_failed',
        message: 'Не удалось открыть замок',
        deviceType,
        status: result.status,
        opId
      });
      return;
    }

    // Calculate ETA for auto-close
    const autoCloseEta = body.autoCloseMs
      ? new Date(Date.now() + body.autoCloseMs).toISOString()
      : undefined;

    res.json({
      success: true,
      deviceType,
      status: result.status,
      opId,
      autoCloseEta,
      driverCircuit: result.actionId ? 'active' : 'pending'
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: 'validation_error',
        details: error.errors
      });
      return;
    }

    console.error('[LockAPI] Open lock error:', error);
    res.status(500).json({
      error: 'internal_error',
      message: error.message || 'Внутренняя ошибка сервера'
    });
  }
}

/**
 * Close lock endpoint
 */
export async function closeLock(
  req: Request,
  res: Response,
  lockController: LockController
): Promise<void> {
  try {
    const deviceType = DeviceTypeSchema.parse(req.params.deviceType);
    const body = CloseLockSchema.parse(req.body);

    const opId = body.operationKey || `op_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    const result = await lockController.closeSlot(deviceType, {
      operationKey: opId
    });

    if (!result.ok) {
      res.status(400).json({
        error: result.error || 'lock_operation_failed',
        message: 'Не удалось закрыть замок',
        deviceType,
        status: result.status,
        opId
      });
      return;
    }

    res.json({
      success: true,
      deviceType,
      status: result.status,
      opId
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: 'validation_error',
        details: error.errors
      });
      return;
    }

    console.error('[LockAPI] Close lock error:', error);
    res.status(500).json({
      error: 'internal_error',
      message: error.message || 'Внутренняя ошибка сервера'
    });
  }
}

/**
 * Test lock endpoint
 */
export async function testLock(
  req: Request,
  res: Response,
  lockController: LockController
): Promise<void> {
  try {
    const deviceType = DeviceTypeSchema.parse(req.params.deviceType);
    const body = TestLockSchema.parse(req.body);

    const results = [];

    for (let i = 0; i < body.cycles; i++) {
      const opId = `test_${Date.now()}_${i}`;

      // Open
      const openResult = await lockController.openSlot(deviceType, {
        operationKey: `${opId}_open`,
        autoCloseMs: 5000
      });

      if (!openResult.ok) {
        results.push({
          cycle: i + 1,
          phase: 'open',
          success: false,
          error: openResult.error
        });
        break;
      }

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 100));

      // Close
      const closeResult = await lockController.closeSlot(deviceType, {
        operationKey: `${opId}_close`
      });

      results.push({
        cycle: i + 1,
        phase: 'complete',
        success: closeResult.ok,
        error: closeResult.ok ? undefined : closeResult.error
      });

      if (!closeResult.ok) {
        break;
      }

      // Wait between cycles
      if (i < body.cycles - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    const allSuccess = results.every(r => r.success);

    res.json({
      success: allSuccess,
      deviceType,
      cycles: body.cycles,
      results
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: 'validation_error',
        details: error.errors
      });
      return;
    }

    console.error('[LockAPI] Test lock error:', error);
    res.status(500).json({
      error: 'internal_error',
      message: error.message || 'Внутренняя ошибка сервера'
    });
  }
}

/**
 * Get lock status endpoint
 */
export async function getLockStatus(
  req: Request,
  res: Response,
  lockController: LockController
): Promise<void> {
  try {
    const deviceType = DeviceTypeSchema.parse(req.params.deviceType);

    const status = await lockController.getStatus(deviceType);

    if (!status) {
      res.status(404).json({
        error: 'lock_not_found',
        message: 'Замок не найден',
        deviceType
      });
      return;
    }

    res.json({
      success: true,
      ...status,
      deviceType
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: 'validation_error',
        details: error.errors
      });
      return;
    }

    console.error('[LockAPI] Get lock status error:', error);
    res.status(500).json({
      error: 'internal_error',
      message: error.message || 'Внутренняя ошибка сервера'
    });
  }
}

/**
 * Emergency unlock endpoint (admin only)
 */
export async function emergencyUnlock(
  req: Request,
  res: Response,
  lockController: LockController
): Promise<void> {
  try {
    const deviceType = req.body.deviceType;

    if (!deviceType) {
      res.status(400).json({
        error: 'missing_device_type',
        message: 'Необходимо указать deviceType'
      });
      return;
    }

    const validDeviceType = DeviceTypeSchema.parse(deviceType);

    // Force close without policy checks
    const result = await lockController.closeSlot(validDeviceType, {
      operationKey: `emergency_${Date.now()}`
    });

    res.json({
      success: result.ok,
      deviceType: validDeviceType,
      status: result.status,
      emergency: true,
      adminKeyId: (req as any).adminKeyId
    });
  } catch (error: any) {
    console.error('[LockAPI] Emergency unlock error:', error);
    res.status(500).json({
      error: 'internal_error',
      message: error.message || 'Внутренняя ошибка сервера'
    });
  }
}

/**
 * Get metrics endpoint
 */
export async function getLockMetrics(
  req: Request,
  res: Response,
  lockController: LockController
): Promise<void> {
  try {
    const deviceTypeParam = req.params.deviceType;
    const deviceType = deviceTypeParam
      ? DeviceTypeSchema.parse(deviceTypeParam)
      : undefined;

    // This would return metrics in a structured format
    // For now, return basic status
    const statuses = await lockController.getAllStatus();

    res.json({
      success: true,
      metrics: deviceType
        ? { [deviceType]: statuses[deviceType] }
        : statuses
    });
  } catch (error: any) {
    console.error('[LockAPI] Get lock metrics error:', error);
    res.status(500).json({
      error: 'internal_error',
      message: error.message || 'Внутренняя ошибка сервера'
    });
  }
}
