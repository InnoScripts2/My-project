/**
 * TypeScript types for PID system
 * Defines core interfaces and schemas for OBD-II PID database
 */
import { z } from 'zod';
/**
 * OBD-II modes (service modes)
 */
export type ObdMode = '01' | '03' | '04' | '09';
/**
 * PID identifier (hex string)
 */
export type PidIdentifier = string;
/**
 * Conversion function type: converts hex string to numeric value
 */
export type ConversionFunction = (hexString: string) => number;
/**
 * PID definition with metadata and conversion function
 */
export interface PidDefinition {
    readonly mode: ObdMode;
    readonly pid: PidIdentifier;
    readonly bytes: number;
    readonly name: string;
    readonly description: string;
    readonly min: number;
    readonly max: number;
    readonly unit: string;
    readonly convertToUseful: ConversionFunction;
}
/**
 * PID value with timestamp
 */
export interface PidValue {
    name: string;
    value: number;
    unit: string;
    timestamp: Date;
}
/**
 * DTC code type (Powertrain, Chassis, Body, Network)
 */
export type DtcType = 'Powertrain' | 'Chassis' | 'Body' | 'Network';
/**
 * DTC category prefix (P, C, B, U)
 */
export type DtcCategory = 'P' | 'C' | 'B' | 'U';
/**
 * DTC code with metadata
 */
export interface DtcCode {
    code: string;
    type: DtcType;
    description?: string;
}
/**
 * Zod schema for PID identifier validation
 */
export declare const PidIdentifierSchema: z.ZodString;
/**
 * Zod schema for OBD mode validation
 */
export declare const ObdModeSchema: z.ZodEnum<["01", "03", "04", "09"]>;
/**
 * Zod schema for PID definition validation
 */
export declare const PidDefinitionSchema: z.ZodObject<{
    mode: z.ZodEnum<["01", "03", "04", "09"]>;
    pid: z.ZodString;
    bytes: z.ZodNumber;
    name: z.ZodString;
    description: z.ZodString;
    min: z.ZodNumber;
    max: z.ZodNumber;
    unit: z.ZodString;
    convertToUseful: z.ZodFunction<z.ZodTuple<[z.ZodString], z.ZodUnknown>, z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    mode: "01" | "03" | "04" | "09";
    pid: string;
    bytes: number;
    name: string;
    description: string;
    min: number;
    max: number;
    unit: string;
    convertToUseful: (args_0: string, ...args_1: unknown[]) => number;
}, {
    mode: "01" | "03" | "04" | "09";
    pid: string;
    bytes: number;
    name: string;
    description: string;
    min: number;
    max: number;
    unit: string;
    convertToUseful: (args_0: string, ...args_1: unknown[]) => number;
}>;
/**
 * Zod schema for PID value validation
 */
export declare const PidValueSchema: z.ZodObject<{
    name: z.ZodString;
    value: z.ZodNumber;
    unit: z.ZodString;
    timestamp: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    name: string;
    unit: string;
    value: number;
    timestamp: Date;
}, {
    name: string;
    unit: string;
    value: number;
    timestamp: Date;
}>;
/**
 * Zod schema for DTC code validation
 */
export declare const DtcCodeSchema: z.ZodObject<{
    code: z.ZodString;
    type: z.ZodEnum<["Powertrain", "Chassis", "Body", "Network"]>;
    description: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    code: string;
    type: "Powertrain" | "Chassis" | "Body" | "Network";
    description?: string | undefined;
}, {
    code: string;
    type: "Powertrain" | "Chassis" | "Body" | "Network";
    description?: string | undefined;
}>;
