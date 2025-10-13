import { SessionData } from './session-manager.js';

export interface Recommendation {
  severity: 'info' | 'warning' | 'critical';
  text: string;
}

export class RecommendationsEngine {
  static generateRecommendations(sessionData: SessionData): Recommendation[] {
    const recommendations: Recommendation[] = [];
    const dtcCodes = sessionData.dtcCodes || [];
    const pidsSnapshot = sessionData.pidsSnapshot || [];

    // Analyze DTC codes by type
    const powertrainDtc = dtcCodes.filter((dtc: any) => dtc.code?.startsWith('P'));
    const chassisDtc = dtcCodes.filter((dtc: any) => dtc.code?.startsWith('C'));
    const bodyDtc = dtcCodes.filter((dtc: any) => dtc.code?.startsWith('B'));
    const networkDtc = dtcCodes.filter((dtc: any) => dtc.code?.startsWith('U'));

    // Powertrain issues
    if (powertrainDtc.length > 0) {
      const critical = powertrainDtc.filter((dtc: any) => dtc.severity === 'critical').length;
      if (critical > 0) {
        recommendations.push({
          severity: 'critical',
          text: 'Обнаружены критические ошибки двигателя. Рекомендуем срочную диагностику на СТО.',
        });
      } else {
        recommendations.push({
          severity: 'warning',
          text: 'Рекомендуем диагностику двигателя на СТО.',
        });
      }
    }

    // Chassis issues
    if (chassisDtc.length > 0) {
      recommendations.push({
        severity: 'warning',
        text: 'Обнаружены проблемы с подвеской или тормозами. Требуется диагностика.',
      });
    }

    // Body issues
    if (bodyDtc.length > 0) {
      recommendations.push({
        severity: 'info',
        text: 'Обнаружены ошибки систем кузова. Рекомендуем проверку электрооборудования.',
      });
    }

    // Network issues
    if (networkDtc.length > 0) {
      recommendations.push({
        severity: 'warning',
        text: 'Обнаружены проблемы с сетью CAN. Требуется диагностика электронных систем.',
      });
    }

    // Check PIDs for critical values
    const coolantTemp = this.findPidValue(pidsSnapshot, 'coolantTempC');
    if (coolantTemp !== null && coolantTemp > 100) {
      recommendations.push({
        severity: 'critical',
        text: 'Критическая температура охлаждающей жидкости. Не эксплуатировать автомобиль!',
      });
    }

    const batteryVoltage = this.findPidValue(pidsSnapshot, 'batteryVoltageV');
    if (batteryVoltage !== null && batteryVoltage < 11.5) {
      recommendations.push({
        severity: 'warning',
        text: 'Низкое напряжение батареи. Проверить генератор и состояние АКБ.',
      });
    }

    // Hybrid battery check (if present)
    if (sessionData.vendorData?.hvBattery) {
      const soc = sessionData.vendorData.hvBattery.soc;
      if (soc !== undefined && soc < 20) {
        recommendations.push({
          severity: 'warning',
          text: 'Низкий заряд высоковольтной батареи гибридной системы.',
        });
      }
    }

    // Multiple errors
    if (dtcCodes.length >= 3) {
      recommendations.push({
        severity: 'warning',
        text: 'Множественные ошибки системы. Требуется комплексная диагностика.',
      });
    }

    // No errors found
    if (dtcCodes.length === 0 && recommendations.length === 0) {
      recommendations.push({
        severity: 'info',
        text: 'Ошибок не обнаружено. Все системы работают в штатном режиме.',
      });
    }

    return recommendations;
  }

  private static findPidValue(pidsSnapshot: any[], pidName: string): number | null {
    const pid = pidsSnapshot.find((p: any) => p.name === pidName || p.id === pidName);
    if (!pid || pid.value === null || pid.value === undefined) {
      return null;
    }
    return typeof pid.value === 'number' ? pid.value : parseFloat(pid.value);
  }
}
