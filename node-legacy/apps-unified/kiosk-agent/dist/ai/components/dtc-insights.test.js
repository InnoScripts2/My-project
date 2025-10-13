/**
 * Unit tests for dtc-insights.ts - DTC code analyzer
 */
import { describe, it } from 'node:test';
import assert from 'node:assert';
import { getDtcInsight } from './dtc-insights.js';
describe('getDtcInsight', () => {
    it('returns detailed insight for known P0300 code', () => {
        const insight = getDtcInsight('P0300');
        assert.strictEqual(insight.code, 'P0300');
        assert.ok(insight.title.length > 0);
        assert.ok(insight.description.length > 0);
        assert.ok(insight.possibleCauses.length > 0);
        assert.ok(insight.recommendations.length > 0);
        assert.strictEqual(insight.severity, 'CRITICAL');
        assert.ok(insight.estimatedCost);
        assert.strictEqual(insight.estimatedCost.currency, 'RUB');
    });
    it('returns detailed insight for known P0301 code', () => {
        const insight = getDtcInsight('P0301');
        assert.strictEqual(insight.code, 'P0301');
        assert.ok(insight.title.includes('цилиндр 1'));
        assert.strictEqual(insight.severity, 'HIGH');
        assert.ok(insight.estimatedCost);
    });
    it('returns detailed insight for known P0420 code', () => {
        const insight = getDtcInsight('P0420');
        assert.strictEqual(insight.code, 'P0420');
        assert.ok(insight.title.includes('катализатор'));
        assert.strictEqual(insight.severity, 'MEDIUM');
        assert.ok(insight.estimatedCost);
    });
    it('returns detailed insight for known P0171 code', () => {
        const insight = getDtcInsight('P0171');
        assert.strictEqual(insight.code, 'P0171');
        assert.ok(insight.title.includes('бедная'));
        assert.strictEqual(insight.severity, 'MEDIUM');
    });
    it('returns detailed insight for known P0172 code', () => {
        const insight = getDtcInsight('P0172');
        assert.strictEqual(insight.code, 'P0172');
        assert.ok(insight.title.includes('богатая'));
        assert.strictEqual(insight.severity, 'MEDIUM');
    });
    it('returns detailed insight for known P0128 code', () => {
        const insight = getDtcInsight('P0128');
        assert.strictEqual(insight.code, 'P0128');
        assert.strictEqual(insight.severity, 'LOW');
    });
    it('returns detailed insight for known P0133 code', () => {
        const insight = getDtcInsight('P0133');
        assert.strictEqual(insight.code, 'P0133');
        assert.ok(insight.title.includes('кислород'));
        assert.strictEqual(insight.severity, 'MEDIUM');
    });
    it('returns detailed insight for known P0401 code', () => {
        const insight = getDtcInsight('P0401');
        assert.strictEqual(insight.code, 'P0401');
        assert.ok(insight.title.includes('EGR'));
        assert.strictEqual(insight.severity, 'MEDIUM');
    });
    it('returns detailed insight for known U0100 code', () => {
        const insight = getDtcInsight('U0100');
        assert.strictEqual(insight.code, 'U0100');
        assert.strictEqual(insight.severity, 'CRITICAL');
    });
    it('returns detailed insight for known C1201 code', () => {
        const insight = getDtcInsight('C1201');
        assert.strictEqual(insight.code, 'C1201');
        assert.ok(insight.title.includes('ABS'));
        assert.strictEqual(insight.severity, 'HIGH');
    });
    it('returns fallback insight for unknown P code', () => {
        const insight = getDtcInsight('P9999');
        assert.strictEqual(insight.code, 'P9999');
        assert.ok(insight.title.includes('Силовой агрегат'));
        assert.strictEqual(insight.severity, 'MEDIUM');
        assert.ok(insight.description.includes('P9999'));
        assert.ok(insight.possibleCauses.some(c => c.includes('диагностика')));
    });
    it('returns fallback insight for unknown B code', () => {
        const insight = getDtcInsight('B1234');
        assert.strictEqual(insight.code, 'B1234');
        assert.ok(insight.title.includes('Кузов'));
        assert.strictEqual(insight.severity, 'LOW');
    });
    it('returns fallback insight for unknown C code', () => {
        const insight = getDtcInsight('C9999');
        assert.strictEqual(insight.code, 'C9999');
        assert.ok(insight.title.includes('Шасси'));
        assert.strictEqual(insight.severity, 'HIGH');
    });
    it('returns fallback insight for unknown U code', () => {
        const insight = getDtcInsight('U9999');
        assert.strictEqual(insight.code, 'U9999');
        assert.ok(insight.title.includes('Сеть'));
        assert.strictEqual(insight.severity, 'CRITICAL');
    });
    it('normalizes code to uppercase', () => {
        const insight = getDtcInsight('p0300');
        assert.strictEqual(insight.code, 'P0300');
    });
    it('handles code with extra whitespace', () => {
        const insight = getDtcInsight('  P0301  ');
        assert.strictEqual(insight.code, 'P0301');
    });
    it('returns all required fields for known codes', () => {
        const insight = getDtcInsight('P0300');
        assert.ok(insight.code);
        assert.ok(insight.title);
        assert.ok(insight.description);
        assert.ok(Array.isArray(insight.possibleCauses));
        assert.ok(Array.isArray(insight.recommendations));
        assert.ok(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(insight.severity));
    });
    it('returns all required fields for unknown codes', () => {
        const insight = getDtcInsight('P9876');
        assert.ok(insight.code);
        assert.ok(insight.title);
        assert.ok(insight.description);
        assert.ok(Array.isArray(insight.possibleCauses));
        assert.ok(Array.isArray(insight.recommendations));
        assert.ok(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(insight.severity));
    });
    it('includes cost estimates for known codes where applicable', () => {
        const codes = ['P0300', 'P0301', 'P0420', 'P0171'];
        for (const code of codes) {
            const insight = getDtcInsight(code);
            if (insight.estimatedCost) {
                assert.ok(insight.estimatedCost.min > 0);
                assert.ok(insight.estimatedCost.max >= insight.estimatedCost.min);
                assert.strictEqual(insight.estimatedCost.currency, 'RUB');
            }
        }
    });
});
