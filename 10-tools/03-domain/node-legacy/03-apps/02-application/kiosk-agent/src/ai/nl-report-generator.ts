/**
 * nl-report-generator.ts - Natural language report generation
 * 
 * Converts technical DTC codes into client-friendly language.
 */

export interface DiagnosticResult {
  dtcCodes: string[];
  descriptions?: Record<string, string>;
  severity?: Record<string, 'low' | 'medium' | 'high' | 'critical'>;
  vehicleInfo?: {
    make?: string;
    model?: string;
    year?: number;
  };
}

export interface ClientReport {
  summary: string;
  issues: ClientIssue[];
  overallHealth: 'excellent' | 'good' | 'fair' | 'poor';
  nextSteps: string;
}

export interface ClientIssue {
  title: string;
  explanation: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  urgency: 'immediate' | 'soon' | 'routine' | 'monitor';
  estimatedCost: CostEstimate;
}

export interface CostEstimate {
  min: number;
  max: number;
  currency: 'RUB';
  factors: string[];
}

export interface Recommendation {
  action: string;
  priority: 'high' | 'medium' | 'low';
  timeframe: string;
}

export class NaturalLanguageReportGenerator {
  private supabaseUrl: string | null;
  private supabaseKey: string | null;

  constructor() {
    this.supabaseUrl = process.env.SUPABASE_URL || null;
    this.supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || null;
  }

  async generateClientFriendlyReport(diagnostics: DiagnosticResult): Promise<ClientReport> {
    if (!this.supabaseUrl || !this.supabaseKey) {
      return this.fallbackReport(diagnostics);
    }

    try {
      const url = new URL('/functions/v1/ai-nl-report', this.supabaseUrl);
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.supabaseKey}`
        },
        body: JSON.stringify({
          operation: 'generate_report',
          diagnostics
        })
      });

      if (!response.ok) {
        throw new Error(`NL report generation failed: ${response.status}`);
      }

      const report = await response.json();
      return report as ClientReport;
    } catch (error) {
      console.warn('[NLReportGenerator] AI generation failed, using fallback', error);
      return this.fallbackReport(diagnostics);
    }
  }

  async explainSeverity(dtcCode: string, severity: 'low' | 'medium' | 'high' | 'critical'): Promise<string> {
    const explanations: Record<string, string> = {
      'low': 'Незначительная проблема. Автомобиль безопасен для эксплуатации. Рекомендуется устранить при плановом ТО.',
      'medium': 'Проблема средней важности. Может повлиять на производительность или экономичность. Рекомендуется устранить в ближайшее время.',
      'high': 'Серьёзная проблема. Может привести к повреждению других компонентов. Необходимо устранить в кратчайшие сроки.',
      'critical': 'Критическая проблема. Небезопасна для эксплуатации или может привести к серьёзным повреждениям. Требуется немедленное обслуживание.'
    };

    return explanations[severity] || explanations['medium'];
  }

  async generateActionRecommendations(dtcCodes: string[]): Promise<Recommendation[]> {
    const recommendations: Recommendation[] = [];

    for (const code of dtcCodes) {
      const rec = this.getRecommendationForCode(code);
      if (rec) recommendations.push(rec);
    }

    return recommendations;
  }

  async estimateRepairCost(dtcCodes: string[]): Promise<CostEstimate> {
    const costs = dtcCodes.map(code => this.getCostForCode(code));
    
    const minTotal = costs.reduce((sum, c) => sum + c.min, 0);
    const maxTotal = costs.reduce((sum, c) => sum + c.max, 0);
    
    const allFactors = costs.flatMap(c => c.factors);
    const uniqueFactors = [...new Set(allFactors)];

    return {
      min: minTotal,
      max: maxTotal,
      currency: 'RUB',
      factors: uniqueFactors
    };
  }

  private fallbackReport(diagnostics: DiagnosticResult): ClientReport {
    const issues: ClientIssue[] = diagnostics.dtcCodes.map(code => {
      const severity = diagnostics.severity?.[code] || this.inferSeverity(code);
      const urgency = this.mapSeverityToUrgency(severity);
      const cost = this.getCostForCode(code);
      const title = this.getClientFriendlyTitle(code);
      const explanation = this.getClientFriendlyExplanation(code);

      return {
        title,
        explanation,
        severity,
        urgency,
        estimatedCost: cost
      };
    });

    const criticalCount = issues.filter(i => i.severity === 'critical').length;
    const highCount = issues.filter(i => i.severity === 'high').length;
    const mediumCount = issues.filter(i => i.severity === 'medium').length;

    const overallHealth = this.calculateOverallHealth(criticalCount, highCount, mediumCount);
    const summary = this.generateSummary(criticalCount, highCount, mediumCount, issues.length);
    const nextSteps = this.generateNextSteps(criticalCount, highCount);

    return {
      summary,
      issues,
      overallHealth,
      nextSteps
    };
  }

  private inferSeverity(code: string): 'low' | 'medium' | 'high' | 'critical' {
    // P0xxx - powertrain
    if (code.startsWith('P0')) {
      // Misfire codes are high
      if (code.startsWith('P030')) return 'high';
      // Catalyst codes are medium
      if (code === 'P0420' || code === 'P0430') return 'medium';
      // Fuel system codes are medium
      if (code.startsWith('P01')) return 'medium';
      // Ignition codes are high
      if (code.startsWith('P032')) return 'high';
      return 'medium';
    }
    
    // C0xxx - chassis
    if (code.startsWith('C0')) return 'high';
    
    // B0xxx - body
    if (code.startsWith('B0')) return 'low';
    
    // U0xxx - network
    if (code.startsWith('U0')) return 'medium';

    return 'medium';
  }

  private mapSeverityToUrgency(severity: 'low' | 'medium' | 'high' | 'critical'): 'immediate' | 'soon' | 'routine' | 'monitor' {
    const mapping: Record<string, 'immediate' | 'soon' | 'routine' | 'monitor'> = {
      'critical': 'immediate',
      'high': 'soon',
      'medium': 'routine',
      'low': 'monitor'
    };
    return mapping[severity];
  }

  private getClientFriendlyTitle(code: string): string {
    const titles: Record<string, string> = {
      'P0300': 'Пропуски зажигания двигателя',
      'P0301': 'Пропуски зажигания - цилиндр 1',
      'P0302': 'Пропуски зажигания - цилиндр 2',
      'P0303': 'Пропуски зажигания - цилиндр 3',
      'P0304': 'Пропуски зажигания - цилиндр 4',
      'P0420': 'Низкая эффективность катализатора',
      'P0430': 'Низкая эффективность катализатора (банка 2)',
      'P0171': 'Бедная смесь - банка 1',
      'P0174': 'Бедная смесь - банка 2',
      'P0128': 'Низкая температура охлаждающей жидкости',
      'P0500': 'Неисправность датчика скорости',
      'P0562': 'Низкое напряжение бортовой сети'
    };

    return titles[code] || `Ошибка системы (${code})`;
  }

  private getClientFriendlyExplanation(code: string): string {
    const explanations: Record<string, string> = {
      'P0300': 'Двигатель работает неровно из-за пропусков воспламенения топлива в одном или нескольких цилиндрах.',
      'P0420': 'Катализатор не справляется с очисткой выхлопных газов. Может быть вызвано износом катализатора или проблемами с топливной системой.',
      'P0171': 'В топливно-воздушной смеси слишком много воздуха. Возможна утечка вакуума или неисправность датчиков.',
      'P0128': 'Двигатель не прогревается до рабочей температуры. Обычно причина - термостат.',
      'P0562': 'Напряжение в бортовой сети ниже нормы. Может быть проблема с генератором или аккумулятором.'
    };

    return explanations[code] || 'Обнаружена неисправность в одной из систем автомобиля. Рекомендуется диагностика в СТО для точного определения причины.';
  }

  private getCostForCode(code: string): CostEstimate {
    const costs: Record<string, CostEstimate> = {
      'P0300': { min: 3000, max: 15000, currency: 'RUB', factors: ['замена свечей зажигания', 'диагностика системы'] },
      'P0420': { min: 5000, max: 50000, currency: 'RUB', factors: ['замена катализатора', 'диагностика датчиков'] },
      'P0171': { min: 2000, max: 10000, currency: 'RUB', factors: ['устранение утечек', 'замена датчиков'] },
      'P0128': { min: 2000, max: 5000, currency: 'RUB', factors: ['замена термостата'] },
      'P0562': { min: 3000, max: 12000, currency: 'RUB', factors: ['проверка генератора', 'замена аккумулятора'] }
    };

    return costs[code] || { 
      min: 2000, 
      max: 8000, 
      currency: 'RUB', 
      factors: ['диагностика', 'ремонт системы'] 
    };
  }

  private getRecommendationForCode(code: string): Recommendation | null {
    const recommendations: Record<string, Recommendation> = {
      'P0300': { action: 'Проверить свечи зажигания и катушки', priority: 'high', timeframe: 'в течение недели' },
      'P0420': { action: 'Диагностика системы выхлопа и катализатора', priority: 'medium', timeframe: 'в течение месяца' },
      'P0171': { action: 'Проверить герметичность впускной системы', priority: 'high', timeframe: 'в течение недели' }
    };

    return recommendations[code] || null;
  }

  private calculateOverallHealth(critical: number, high: number, medium: number): 'excellent' | 'good' | 'fair' | 'poor' {
    if (critical > 0) return 'poor';
    if (high > 1) return 'poor';
    if (high === 1) return 'fair';
    if (medium > 2) return 'fair';
    if (medium > 0) return 'good';
    return 'excellent';
  }

  private generateSummary(critical: number, high: number, medium: number, total: number): string {
    if (total === 0) return 'Проблем не обнаружено. Все системы в норме.';
    
    const parts: string[] = [`Обнаружено ${total} ${this.pluralize(total, 'проблема', 'проблемы', 'проблем')}`];
    
    if (critical > 0) {
      parts.push(`${critical} критич${critical === 1 ? 'ная' : 'ных'}`);
    }
    if (high > 0) {
      parts.push(`${high} серьёзн${high === 1 ? 'ая' : 'ых'}`);
    }
    if (medium > 0) {
      parts.push(`${medium} средн${medium === 1 ? 'яя' : 'их'}`);
    }

    return parts.join(': ');
  }

  private generateNextSteps(critical: number, high: number): string {
    if (critical > 0) {
      return 'Немедленно обратитесь на СТО. Эксплуатация автомобиля может быть небезопасна.';
    }
    if (high > 0) {
      return 'Запишитесь на диагностику в СТО в ближайшее время для предотвращения дальнейших повреждений.';
    }
    return 'Запланируйте диагностику при следующем плановом ТО.';
  }

  private pluralize(n: number, one: string, few: string, many: string): string {
    const mod10 = n % 10;
    const mod100 = n % 100;
    
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
    return many;
  }
}
