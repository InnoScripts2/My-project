/**
 * nl-report-generator.test.ts - Unit tests for NL report generator
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { NaturalLanguageReportGenerator, type DiagnosticResult } from './nl-report-generator.js';

describe('NaturalLanguageReportGenerator', () => {
  describe('generateClientFriendlyReport', () => {
    it('should generate report with critical issues', async () => {
      const generator = new NaturalLanguageReportGenerator();
      const diagnostics: DiagnosticResult = {
        dtcCodes: ['P0300', 'P0301'],
        severity: {
          'P0300': 'high',
          'P0301': 'critical'
        }
      };

      const report = await generator.generateClientFriendlyReport(diagnostics);

      assert.strictEqual(report.issues.length, 2);
      assert.strictEqual(report.overallHealth, 'poor');
      assert.ok(report.summary.includes('2'));
      assert.ok(report.nextSteps.includes('Немедленно'));
    });

    it('should generate report with medium issues', async () => {
      const generator = new NaturalLanguageReportGenerator();
      const diagnostics: DiagnosticResult = {
        dtcCodes: ['P0420'],
        severity: { 'P0420': 'medium' }
      };

      const report = await generator.generateClientFriendlyReport(diagnostics);

      assert.strictEqual(report.issues.length, 1);
      assert.strictEqual(report.overallHealth, 'good');
      assert.ok(report.summary.includes('1'));
    });

    it('should generate report with no issues', async () => {
      const generator = new NaturalLanguageReportGenerator();
      const diagnostics: DiagnosticResult = {
        dtcCodes: []
      };

      const report = await generator.generateClientFriendlyReport(diagnostics);

      assert.strictEqual(report.issues.length, 0);
      assert.strictEqual(report.overallHealth, 'excellent');
      assert.ok(report.summary.includes('Проблем не обнаружено'));
    });

    it('should include cost estimates for all issues', async () => {
      const generator = new NaturalLanguageReportGenerator();
      const diagnostics: DiagnosticResult = {
        dtcCodes: ['P0300', 'P0420']
      };

      const report = await generator.generateClientFriendlyReport(diagnostics);

      for (const issue of report.issues) {
        assert.ok(issue.estimatedCost.min > 0);
        assert.ok(issue.estimatedCost.max >= issue.estimatedCost.min);
        assert.strictEqual(issue.estimatedCost.currency, 'RUB');
        assert.ok(issue.estimatedCost.factors.length > 0);
      }
    });

    it('should map severity to urgency correctly', async () => {
      const generator = new NaturalLanguageReportGenerator();
      const diagnostics: DiagnosticResult = {
        dtcCodes: ['P0301', 'P0300', 'P0420', 'P0128'],
        severity: {
          'P0301': 'critical',
          'P0300': 'high',
          'P0420': 'medium',
          'P0128': 'low'
        }
      };

      const report = await generator.generateClientFriendlyReport(diagnostics);

      const urgencies = report.issues.map(i => i.urgency);
      assert.ok(urgencies.includes('immediate'));
      assert.ok(urgencies.includes('soon'));
      assert.ok(urgencies.includes('routine'));
      assert.ok(urgencies.includes('monitor'));
    });
  });

  describe('explainSeverity', () => {
    it('should explain critical severity', async () => {
      const generator = new NaturalLanguageReportGenerator();

      const explanation = await generator.explainSeverity('P0301', 'critical');

      assert.ok(explanation.includes('Критическая'));
      assert.ok(explanation.includes('немедленное'));
    });

    it('should explain medium severity', async () => {
      const generator = new NaturalLanguageReportGenerator();

      const explanation = await generator.explainSeverity('P0420', 'medium');

      assert.ok(explanation.includes('средней важности'));
    });

    it('should explain low severity', async () => {
      const generator = new NaturalLanguageReportGenerator();

      const explanation = await generator.explainSeverity('P0128', 'low');

      assert.ok(explanation.includes('Незначительная'));
      assert.ok(explanation.includes('безопасен'));
    });
  });

  describe('generateActionRecommendations', () => {
    it('should generate recommendations for known codes', async () => {
      const generator = new NaturalLanguageReportGenerator();
      const dtcCodes = ['P0300', 'P0420', 'P0171'];

      const recommendations = await generator.generateActionRecommendations(dtcCodes);

      assert.ok(recommendations.length >= 2);
      assert.ok(recommendations.some(r => r.priority === 'high'));
      assert.ok(recommendations.every(r => r.timeframe));
    });

    it('should handle codes without specific recommendations', async () => {
      const generator = new NaturalLanguageReportGenerator();
      const dtcCodes = ['P9999']; // Unknown code

      const recommendations = await generator.generateActionRecommendations(dtcCodes);

      // Should not crash, may return empty or generic recommendation
      assert.ok(Array.isArray(recommendations));
    });
  });

  describe('estimateRepairCost', () => {
    it('should estimate cost for P0420', async () => {
      const generator = new NaturalLanguageReportGenerator();

      const cost = await generator.estimateRepairCost(['P0420']);

      assert.strictEqual(cost.min, 5000);
      assert.strictEqual(cost.max, 50000);
      assert.strictEqual(cost.currency, 'RUB');
      assert.ok(cost.factors.includes('замена катализатора'));
    });

    it('should sum costs for multiple codes', async () => {
      const generator = new NaturalLanguageReportGenerator();

      const cost = await generator.estimateRepairCost(['P0300', 'P0420']);

      assert.ok(cost.min >= 8000); // 3000 + 5000
      assert.ok(cost.max >= 65000); // 15000 + 50000
      assert.ok(cost.factors.length > 1);
    });

    it('should provide default estimate for unknown codes', async () => {
      const generator = new NaturalLanguageReportGenerator();

      const cost = await generator.estimateRepairCost(['P9999']);

      assert.ok(cost.min > 0);
      assert.ok(cost.max > cost.min);
      assert.strictEqual(cost.currency, 'RUB');
    });

    it('should deduplicate factors', async () => {
      const generator = new NaturalLanguageReportGenerator();

      const cost = await generator.estimateRepairCost(['P0300', 'P0300']);

      const uniqueFactors = new Set(cost.factors);
      assert.strictEqual(uniqueFactors.size, cost.factors.length);
    });
  });

  describe('client-friendly translations', () => {
    it('should translate P0300 to Russian', async () => {
      const generator = new NaturalLanguageReportGenerator();
      const diagnostics: DiagnosticResult = {
        dtcCodes: ['P0300']
      };

      const report = await generator.generateClientFriendlyReport(diagnostics);
      const issue = report.issues[0];

      assert.strictEqual(issue.title, 'Пропуски зажигания двигателя');
      assert.ok(issue.explanation.includes('цилиндр'));
    });

    it('should translate P0420 to Russian', async () => {
      const generator = new NaturalLanguageReportGenerator();
      const diagnostics: DiagnosticResult = {
        dtcCodes: ['P0420']
      };

      const report = await generator.generateClientFriendlyReport(diagnostics);
      const issue = report.issues[0];

      assert.strictEqual(issue.title, 'Низкая эффективность катализатора');
      assert.ok(issue.explanation.includes('катализатор'));
    });

    it('should provide generic translation for unknown codes', async () => {
      const generator = new NaturalLanguageReportGenerator();
      const diagnostics: DiagnosticResult = {
        dtcCodes: ['P9999']
      };

      const report = await generator.generateClientFriendlyReport(diagnostics);
      const issue = report.issues[0];

      assert.ok(issue.title.includes('P9999'));
      assert.ok(issue.explanation.includes('СТО'));
    });
  });
});
