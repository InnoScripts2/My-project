import * as fs from 'fs';
import * as path from 'path';
import { SessionData } from './session-manager.js';
import { RecommendationsEngine, Recommendation } from './recommendations.js';

export interface ReportOptions {
  type: 'standard' | 'hybrid';
}

export class ObdReportGenerator {
  constructor(private templatesPath: string) {}

  async generateReport(sessionData: SessionData, options: ReportOptions): Promise<Buffer> {
    const html = this.generateHtmlReport(sessionData, options);
    return Buffer.from(html, 'utf8');
  }

  async saveReport(sessionId: string, pdfBuffer: Buffer): Promise<string> {
    const outboxRoot = process.env.REPORTS_OUTBOX || path.join(process.cwd(), 'outbox');
    const reportsDir = path.join(outboxRoot, 'obd');
    
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    const filePath = path.join(reportsDir, `${sessionId}.html`);
    fs.writeFileSync(filePath, pdfBuffer);
    
    return filePath;
  }

  async getReport(sessionId: string): Promise<Buffer | null> {
    const outboxRoot = process.env.REPORTS_OUTBOX || path.join(process.cwd(), 'outbox');
    const filePath = path.join(outboxRoot, 'obd', `${sessionId}.html`);
    
    if (!fs.existsSync(filePath)) {
      return null;
    }

    return fs.readFileSync(filePath);
  }

  private generateHtmlReport(sessionData: SessionData, options: ReportOptions): string {
    const recommendations = RecommendationsEngine.generateRecommendations(sessionData);
    const isHybrid = options.type === 'hybrid';
    
    const template = isHybrid
      ? this.getHybridTemplate(sessionData, recommendations)
      : this.getStandardTemplate(sessionData, recommendations);

    return template;
  }

  private getStandardTemplate(sessionData: SessionData, recommendations: Recommendation[]): string {
    const dtcRows = sessionData.dtcCodes.map((dtc: any) => {
      const typeClass = dtc.code?.[0] || 'P';
      const typeText = this.getDtcTypeText(dtc.code?.[0] || 'P');
      const statusClass = dtc.severity === 'critical' ? 'critical' : dtc.severity === 'warning' ? 'warning' : 'ok';
      
      return `
        <tr>
          <td class="dtc-code ${typeClass}">${this.escapeHtml(dtc.code)}</td>
          <td>${typeText}</td>
          <td>${this.escapeHtml(dtc.description || 'Нет описания')}</td>
          <td class="status-${statusClass}">${this.escapeHtml(dtc.status || 'Активна')}</td>
        </tr>
      `;
    }).join('');

    const pidsRows = sessionData.pidsSnapshot.map((pid: any) => {
      const statusClass = pid.statusClass || 'ok';
      const statusText = pid.statusText || 'Норма';
      
      return `
        <tr>
          <td>${this.escapeHtml(pid.name || pid.id)}</td>
          <td>${this.escapeHtml(pid.value)}</td>
          <td>${this.escapeHtml(pid.unit || '')}</td>
          <td class="status-${statusClass}">${statusText}</td>
        </tr>
      `;
    }).join('');

    const recommendationsHtml = recommendations.length > 0 ? `
      <section class="recommendations">
        <h2>Рекомендации</h2>
        <ul>
          ${recommendations.map(r => `<li class="recommendation-${r.severity}">${this.escapeHtml(r.text)}</li>`).join('')}
        </ul>
      </section>
    ` : '';

    const statusClass = this.getOverallStatusClass(sessionData);
    const statusText = this.getOverallStatusText(sessionData);

    return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>Отчёт OBD-II диагностики</title>
  <style>${this.getStyles()}</style>
</head>
<body>
  <header>
    <div class="logo">Автосервис самообслуживания</div>
    <div class="report-meta">
      <p>Дата: ${new Date().toLocaleString('ru-RU')}</p>
      <p>Номер сессии: ${this.escapeHtml(sessionData.sessionId)}</p>
    </div>
  </header>
  
  <section class="vehicle-info">
    <h2>Информация об автомобиле</h2>
    <table>
      <tr><td>Марка:</td><td>${this.escapeHtml(sessionData.vehicleMake)}</td></tr>
      <tr><td>Модель:</td><td>${this.escapeHtml(sessionData.vehicleModel)}</td></tr>
      <tr><td>VIN:</td><td>${this.escapeHtml(sessionData.vin || 'Не определён')}</td></tr>
    </table>
  </section>
  
  <section class="diagnostic-status">
    <h2>Результаты диагностики</h2>
    <div class="status-badge ${statusClass}">${statusText}</div>
  </section>
  
  <section class="dtc-codes">
    <h2>Коды ошибок (DTC)</h2>
    ${sessionData.dtcCodes.length > 0 ? `
      <table class="dtc-table">
        <thead>
          <tr><th>Код</th><th>Тип</th><th>Описание</th><th>Статус</th></tr>
        </thead>
        <tbody>
          ${dtcRows}
        </tbody>
      </table>
    ` : '<p class="no-errors">Ошибок не обнаружено</p>'}
  </section>
  
  ${sessionData.pidsSnapshot.length > 0 ? `
    <section class="engine-params">
      <h2>Параметры двигателя</h2>
      <table class="params-table">
        <thead>
          <tr><th>Параметр</th><th>Значение</th><th>Единица</th><th>Статус</th></tr>
        </thead>
        <tbody>
          ${pidsRows}
        </tbody>
      </table>
    </section>
  ` : ''}
  
  ${recommendationsHtml}
  
  <footer>
    <p>Контакты: support@example.com | +7 (XXX) XXX-XX-XX</p>
    <p class="disclaimer">Данный отчёт носит информационный характер. Для точной диагностики обратитесь на СТО.</p>
  </footer>
</body>
</html>`;
  }

  private getHybridTemplate(sessionData: SessionData, recommendations: Recommendation[]): string {
    const standardHtml = this.getStandardTemplate(sessionData, recommendations);
    
    if (!sessionData.vendorData?.hvBattery) {
      return standardHtml;
    }

    const hvBattery = sessionData.vendorData.hvBattery;
    const mg1 = sessionData.vendorData.mg1 || {};
    const mg2 = sessionData.vendorData.mg2 || {};
    const inverter = sessionData.vendorData.inverter || {};

    const hybridSection = `
      <section class="hybrid-system">
        <h2>Гибридная силовая установка</h2>
        
        <div class="hv-battery">
          <h3>Высоковольтная батарея</h3>
          <table>
            <tr><td>Напряжение:</td><td>${this.escapeHtml(hvBattery.voltage || 'N/A')} В</td></tr>
            <tr><td>Ток:</td><td>${this.escapeHtml(hvBattery.current || 'N/A')} А (${this.escapeHtml(hvBattery.currentDirection || 'N/A')})</td></tr>
            <tr><td>Уровень заряда (SOC):</td><td>${this.escapeHtml(hvBattery.soc || 'N/A')} %</td></tr>
            <tr><td>Температура:</td><td>${this.escapeHtml(hvBattery.temperature || 'N/A')} °C</td></tr>
          </table>
        </div>
        
        <div class="motors">
          <h3>Электродвигатели</h3>
          <table>
            <tr><th></th><th>MG1</th><th>MG2</th></tr>
            <tr><td>Скорость</td><td>${this.escapeHtml(mg1.speed || 'N/A')} об/мин</td><td>${this.escapeHtml(mg2.speed || 'N/A')} об/мин</td></tr>
            <tr><td>Крутящий момент</td><td>${this.escapeHtml(mg1.torque || 'N/A')} Нм</td><td>${this.escapeHtml(mg2.torque || 'N/A')} Нм</td></tr>
          </table>
        </div>
        
        <div class="inverter">
          <h3>Инвертор</h3>
          <p>Температура: ${this.escapeHtml(inverter.temperature || 'N/A')} °C</p>
        </div>
      </section>
    `;

    return standardHtml.replace('</body>', `${hybridSection}</body>`);
  }

  private getStyles(): string {
    return `
      @page { size: A4; margin: 20mm; }
      body { font-family: Arial, sans-serif; font-size: 12pt; color: #333; margin: 0; padding: 20px; }
      header { display: flex; justify-content: space-between; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
      .logo { font-size: 18pt; font-weight: bold; }
      .report-meta { text-align: right; font-size: 10pt; }
      h2 { font-size: 16pt; color: #000; border-bottom: 1px solid #ccc; padding-bottom: 5px; margin-top: 20px; }
      h3 { font-size: 14pt; color: #333; margin-top: 15px; }
      table { width: 100%; border-collapse: collapse; margin: 10px 0; }
      table th, table td { border: 1px solid #ccc; padding: 8px; text-align: left; }
      table th { background: #f0f0f0; font-weight: bold; }
      .status-badge { display: inline-block; padding: 10px 20px; border-radius: 5px; font-weight: bold; margin: 10px 0; }
      .status-badge.ok { background: #d4edda; color: #155724; }
      .status-badge.warning { background: #fff3cd; color: #856404; }
      .status-badge.critical { background: #f8d7da; color: #721c24; }
      .dtc-code { font-family: monospace; font-weight: bold; }
      .dtc-code.P { color: #dc3545; }
      .dtc-code.C { color: #fd7e14; }
      .dtc-code.B { color: #007bff; }
      .dtc-code.U { color: #6f42c1; }
      .no-errors { color: #28a745; font-weight: bold; text-align: center; padding: 20px; }
      .status-ok { color: #28a745; }
      .status-warning { color: #ffc107; }
      .status-critical { color: #dc3545; }
      .recommendations ul { list-style: disc; padding-left: 25px; }
      .recommendation-info { color: #17a2b8; }
      .recommendation-warning { color: #ffc107; }
      .recommendation-critical { color: #dc3545; font-weight: bold; }
      footer { margin-top: 30px; border-top: 1px solid #ccc; padding-top: 10px; font-size: 10pt; color: #666; }
      .disclaimer { font-style: italic; margin-top: 10px; }
      .hybrid-system { margin-top: 30px; padding-top: 20px; border-top: 2px solid #ccc; }
    `;
  }

  private getDtcTypeText(type: string): string {
    switch (type.toUpperCase()) {
      case 'P': return 'Powertrain (двигатель/трансмиссия)';
      case 'C': return 'Chassis (шасси/тормоза)';
      case 'B': return 'Body (кузов)';
      case 'U': return 'Network (сеть)';
      default: return 'Неизвестно';
    }
  }

  private getOverallStatusClass(sessionData: SessionData): string {
    const dtcCodes = sessionData.dtcCodes || [];
    const hasCritical = dtcCodes.some((dtc: any) => dtc.severity === 'critical');
    const hasWarning = dtcCodes.some((dtc: any) => dtc.severity === 'warning');
    
    if (hasCritical) return 'critical';
    if (hasWarning || dtcCodes.length > 0) return 'warning';
    return 'ok';
  }

  private getOverallStatusText(sessionData: SessionData): string {
    const dtcCodes = sessionData.dtcCodes || [];
    const hasCritical = dtcCodes.some((dtc: any) => dtc.severity === 'critical');
    const hasWarning = dtcCodes.some((dtc: any) => dtc.severity === 'warning');
    
    if (hasCritical) return 'Критические проблемы';
    if (hasWarning) return 'Требуется внимание';
    if (dtcCodes.length > 0) return 'Обнаружены ошибки';
    return 'Все системы в норме';
  }

  private escapeHtml(value: unknown): string {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}

export const obdReportGenerator = new ObdReportGenerator(
  process.env.TEMPLATES_PATH || path.join(__dirname, '../../templates/obd')
);
