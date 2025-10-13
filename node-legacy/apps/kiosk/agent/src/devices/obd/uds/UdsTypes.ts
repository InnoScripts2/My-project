/**
 * UDS (ISO 14229) Type Definitions
 * Unified Diagnostic Services types and enums
 */

import { z } from 'zod';

/**
 * UDS Service IDs
 */
export enum UdsService {
  DIAGNOSTIC_SESSION_CONTROL = 0x10,
  ECU_RESET = 0x11,
  READ_DATA_BY_IDENTIFIER = 0x22,
  SECURITY_ACCESS = 0x27,
  WRITE_DATA_BY_IDENTIFIER = 0x2E,
  ROUTINE_CONTROL = 0x31,
}

/**
 * UDS Session Types
 */
export enum UdsSessionType {
  DEFAULT = 0x01,
  PROGRAMMING = 0x02,
  EXTENDED = 0x03,
}

/**
 * UDS Negative Response Codes
 */
export enum UdsNegativeResponse {
  GENERAL_REJECT = 0x10,
  SERVICE_NOT_SUPPORTED = 0x11,
  SUB_FUNCTION_NOT_SUPPORTED = 0x12,
  INCORRECT_MESSAGE_LENGTH = 0x13,
  CONDITIONS_NOT_CORRECT = 0x22,
  REQUEST_OUT_OF_RANGE = 0x31,
  SECURITY_ACCESS_DENIED = 0x33,
}

/**
 * UDS Data Identifier (DID)
 */
export type UdsDataIdentifier = number;

/**
 * UDS Request
 */
export interface UdsRequest {
  service: number;
  data?: Buffer;
}

/**
 * UDS Response
 */
export interface UdsResponse {
  service: number;
  data: Buffer;
  isPositive: boolean;
  nrc?: number;
}

/**
 * UDS Read Data Request
 */
export interface UdsReadDataRequest {
  did: UdsDataIdentifier;
}

/**
 * UDS Read Data Response
 */
export interface UdsReadDataResponse {
  did: UdsDataIdentifier;
  data: Buffer;
  parsed?: any;
}

/**
 * UDS Error
 */
export class UdsError extends Error {
  constructor(
    message: string,
    public code?: string,
    public nrc?: number
  ) {
    super(message);
    this.name = 'UdsError';
  }
}

/**
 * UDS Negative Response Error
 */
export class UdsNegativeResponseError extends UdsError {
  constructor(
    public service: number,
    public nrc: number,
    message?: string
  ) {
    super(message || `Negative response for service 0x${service.toString(16)}: NRC 0x${nrc.toString(16)}`, 'NEGATIVE_RESPONSE', nrc);
    this.name = 'UdsNegativeResponseError';
  }
}

/**
 * UDS Timeout Error
 */
export class UdsTimeoutError extends UdsError {
  constructor(message: string = 'UDS operation timeout') {
    super(message, 'TIMEOUT');
    this.name = 'UdsTimeoutError';
  }
}

/**
 * Zod schemas for validation
 */
export const UdsRequestSchema = z.object({
  service: z.number().int().min(0).max(0xFF),
  data: z.instanceof(Buffer).optional(),
});

export const UdsResponseSchema = z.object({
  service: z.number().int().min(0).max(0xFF),
  data: z.instanceof(Buffer),
  isPositive: z.boolean(),
  nrc: z.number().int().min(0).max(0xFF).optional(),
});

export const UdsReadDataRequestSchema = z.object({
  did: z.number().int().min(0).max(0xFFFF),
});

export const UdsReadDataResponseSchema = z.object({
  did: z.number().int().min(0).max(0xFFFF),
  data: z.instanceof(Buffer),
  parsed: z.any().optional(),
});
