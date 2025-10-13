/**
 * TypeScript types for PID system
 * Defines core interfaces and schemas for OBD-II PID database
 */
import { z } from 'zod';
/**
 * Zod schema for PID identifier validation
 */
export const PidIdentifierSchema = z.string().regex(/^[0-9A-F]{2}$/i, 'PID must be 2-digit hex');
/**
 * Zod schema for OBD mode validation
 */
export const ObdModeSchema = z.enum(['01', '03', '04', '09']);
/**
 * Zod schema for PID definition validation
 */
export const PidDefinitionSchema = z.object({
    mode: ObdModeSchema,
    pid: PidIdentifierSchema,
    bytes: z.number().int().positive(),
    name: z.string().min(1),
    description: z.string(),
    min: z.number(),
    max: z.number(),
    unit: z.string(),
    convertToUseful: z.function().args(z.string()).returns(z.number()),
});
/**
 * Zod schema for PID value validation
 */
export const PidValueSchema = z.object({
    name: z.string().min(1),
    value: z.number(),
    unit: z.string(),
    timestamp: z.date(),
});
/**
 * Zod schema for DTC code validation
 */
export const DtcCodeSchema = z.object({
    code: z.string().regex(/^[PCBU][0-9A-F]{4}$/i, 'DTC code must match format P0123, C0123, B0123, or U0123'),
    type: z.enum(['Powertrain', 'Chassis', 'Body', 'Network']),
    description: z.string().optional(),
});
