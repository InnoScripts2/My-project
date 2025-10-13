/**
 * Green API WhatsApp Integration Module
 * Модуль для интеграции с Green API для отправки отчётов через WhatsApp
 */

export { GreenApiClient } from './client.js';
export { ReportSender } from './report-sender.js';
export type { DiagnosticReport, ReportConfig } from './report-sender.js';
export type {
  GreenApiConfig,
  SendMessageOptions,
  SendFileOptions,
  SendLocationOptions,
  SendContactOptions,
  SendPollOptions,
  ApiResponse,
  MessageStatus
} from './types.js';
