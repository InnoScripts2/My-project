/**
 * Пример интеграции Green API в приложение киоска
 * apps/kiosk-agent/src/reports/green-api-reporter.ts
 */

import { ReportSender, type DiagnosticReport } from '@selfservice/green-api';

export class GreenApiReporter {
  private reportSender: ReportSender;
  private recipientPhone: string;

  constructor() {
    // Загружаем конфигурацию из переменных окружения
    const config = {
      idInstance: process.env.GREEN_API_INSTANCE_ID || '',
      apiTokenInstance: process.env.GREEN_API_TOKEN || '',
      apiUrl: process.env.GREEN_API_URL || 'https://1105.api.green-api.com'
    };

    this.reportSender = new ReportSender(config);
    this.recipientPhone = process.env.GREEN_API_RECIPIENT_PHONE || '79963153818@c.us';
  }

  /**
   * Отправка отчёта о завершении диагностики
   */
  async sendDiagnosticComplete(
    vehicleData: {
      vin?: string;
      dtcCodes: string[];
      sensorData: Record<string, any>;
    }
  ): Promise<void> {
    const report: DiagnosticReport = {
      timestamp: new Date().toISOString(),
      vin: vehicleData.vin,
      diagnosticCodes: vehicleData.dtcCodes,
      sensors: vehicleData.sensorData,
      summary: this.generateSummary(vehicleData.dtcCodes)
    };

    const result = await this.reportSender.sendDiagnosticReport(report, {
      recipientPhone: this.recipientPhone,
      includeDetails: true,
      sendAsFile: vehicleData.dtcCodes.length > 5 // Файл если много кодов
    });

    if (!result.success) {
      console.error('Failed to send diagnostic report:', result.error);
      throw new Error(`Report sending failed: ${result.error}`);
    }
  }

  /**
   * Отправка уведомления об ошибке
   */
  async sendErrorNotification(error: string): Promise<void> {
    const message = `⚠️ *Ошибка в киоске*\n\n${error}\n\nВремя: ${new Date().toLocaleString('ru-RU')}`;

    const result = await this.reportSender.sendNotification(
      this.recipientPhone,
      message
    );

    if (!result.success) {
      console.error('Failed to send error notification:', result.error);
    }
  }

  /**
   * Отправка статистики за день
   */
  async sendDailyStats(stats: {
    totalDiagnostics: number;
    successfulDiagnostics: number;
    failedDiagnostics: number;
    revenue: number;
  }): Promise<void> {
    const message = `📊 *Дневная статистика*\n\n` +
      `📅 Дата: ${new Date().toLocaleDateString('ru-RU')}\n\n` +
      `✅ Всего диагностик: ${stats.totalDiagnostics}\n` +
      `✓ Успешных: ${stats.successfulDiagnostics}\n` +
      `✗ Неудачных: ${stats.failedDiagnostics}\n` +
      `💰 Выручка: ${stats.revenue.toFixed(2)} ₽\n\n` +
      `Процент успеха: ${((stats.successfulDiagnostics / stats.totalDiagnostics) * 100).toFixed(1)}%`;

    const result = await this.reportSender.sendNotification(
      this.recipientPhone,
      message
    );

    if (!result.success) {
      console.error('Failed to send daily stats:', result.error);
    }
  }

  /**
   * Генерация краткого описания по кодам ошибок
   */
  private generateSummary(dtcCodes: string[]): string {
    if (dtcCodes.length === 0) {
      return '✅ Ошибок не обнаружено. Автомобиль в нормальном состоянии.';
    } else if (dtcCodes.length === 1) {
      return `⚠️ Обнаружена 1 ошибка: ${dtcCodes[0]}`;
    } else {
      return `⚠️ Обнаружено ошибок: ${dtcCodes.length}. Требуется внимание.`;
    }
  }
}

// Экспорт singleton инстанса
export const greenApiReporter = new GreenApiReporter();
