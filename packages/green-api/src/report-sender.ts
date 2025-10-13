/**
 * Report Sender
 * Модуль для отправки отчётов через Green API
 */

import { GreenApiClient } from './client.js';
import type { GreenApiConfig, ApiResponse } from './types.js';

export interface DiagnosticReport {
  timestamp: string;
  vehicleId?: string;
  vin?: string;
  diagnosticCodes?: string[];
  sensors?: Record<string, any>;
  summary: string;
}

export interface ReportConfig {
  recipientPhone: string; // Номер телефона получателя в формате 79XXXXXXXXX@c.us
  includeDetails?: boolean;
  sendAsFile?: boolean;
}

export class ReportSender {
  private client: GreenApiClient;

  constructor(config: GreenApiConfig) {
    this.client = new GreenApiClient(config);
  }

  /**
   * Отправка диагностического отчёта
   */
  async sendDiagnosticReport(
    report: DiagnosticReport,
    config: ReportConfig
  ): Promise<ApiResponse> {
    try {
      // Формируем текст отчёта
      const message = this.formatDiagnosticReport(report, config.includeDetails);

      // Отправляем сообщение
      const result = await this.client.sendMessage({
        chatId: config.recipientPhone,
        message
      });

      // Если требуется отправить детальный отчёт файлом
      if (config.sendAsFile && config.includeDetails) {
        const fileContent = this.generateReportFile(report);
        await this.client.sendFileByUpload({
          chatId: config.recipientPhone,
          file: Buffer.from(fileContent),
          fileName: `diagnostic_report_${Date.now()}.txt`,
          caption: 'Детальный отчёт диагностики'
        });
      }

      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send report'
      };
    }
  }

  /**
   * Форматирование отчёта для отправки
   */
  private formatDiagnosticReport(
    report: DiagnosticReport,
    includeDetails = false
  ): string {
    let message = `📊 *Отчёт диагностики*\n\n`;
    message += `🕐 Время: ${report.timestamp}\n`;

    if (report.vehicleId) {
      message += `🚗 ID автомобиля: ${report.vehicleId}\n`;
    }

    if (report.vin) {
      message += `🔢 VIN: ${report.vin}\n`;
    }

    message += `\n${report.summary}\n`;

    if (includeDetails && report.diagnosticCodes && report.diagnosticCodes.length > 0) {
      message += `\n⚠️ *Коды ошибок:*\n`;
      report.diagnosticCodes.forEach(code => {
        message += `  • ${code}\n`;
      });
    }

    if (includeDetails && report.sensors) {
      message += `\n📡 *Показания датчиков:*\n`;
      Object.entries(report.sensors).forEach(([key, value]) => {
        message += `  • ${key}: ${value}\n`;
      });
    }

    message += `\n✅ Отчёт сформирован автоматически`;

    return message;
  }

  /**
   * Генерация файла отчёта
   */
  private generateReportFile(report: DiagnosticReport): string {
    let content = `ОТЧЁТ ДИАГНОСТИКИ\n`;
    content += `=================\n\n`;
    content += `Время: ${report.timestamp}\n`;

    if (report.vehicleId) {
      content += `ID автомобиля: ${report.vehicleId}\n`;
    }

    if (report.vin) {
      content += `VIN: ${report.vin}\n`;
    }

    content += `\nОПИСАНИЕ:\n${report.summary}\n`;

    if (report.diagnosticCodes && report.diagnosticCodes.length > 0) {
      content += `\nКОДЫ ОШИБОК:\n`;
      report.diagnosticCodes.forEach((code, index) => {
        content += `${index + 1}. ${code}\n`;
      });
    }

    if (report.sensors) {
      content += `\nПОКАЗАНИЯ ДАТЧИКОВ:\n`;
      Object.entries(report.sensors).forEach(([key, value]) => {
        content += `${key}: ${value}\n`;
      });
    }

    content += `\n---\nОтчёт сформирован: ${new Date().toISOString()}\n`;

    return content;
  }

  /**
   * Отправка простого уведомления
   */
  async sendNotification(
    recipientPhone: string,
    message: string
  ): Promise<ApiResponse> {
    return this.client.sendMessage({
      chatId: recipientPhone,
      message
    });
  }

  /**
   * Отправка отчёта с локацией киоска
   */
  async sendReportWithLocation(
    report: DiagnosticReport,
    config: ReportConfig,
    latitude: number,
    longitude: number,
    locationName?: string
  ): Promise<ApiResponse> {
    // Сначала отправляем текстовый отчёт
    const messageResult = await this.sendDiagnosticReport(report, config);

    if (!messageResult.success) {
      return messageResult;
    }

    // Затем отправляем локацию
    return this.client.sendLocation({
      chatId: config.recipientPhone,
      latitude,
      longitude,
      nameLocation: locationName || 'Киоск самообслуживания',
      address: 'Место проведения диагностики'
    });
  }

  /**
   * Получение клиента для прямого доступа к API
   */
  getClient(): GreenApiClient {
    return this.client;
  }
}
