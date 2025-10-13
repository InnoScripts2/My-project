/**
 * predictive-diagnostics.ts - AI-powered predictive diagnostics engine
 *
 * Analyzes vehicle diagnostic history to predict future issues and correlations.
 */
export class PredictiveDiagnostics {
    constructor() {
        this.supabaseUrl = process.env.SUPABASE_URL || null;
        this.supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || null;
    }
    async predictFutureIssues(vehicleHistory) {
        const analysis = await this.performPredictiveAnalysis(vehicleHistory);
        return analysis.predictions;
    }
    async analyzeCorrelations(currentDtcs) {
        if (!this.supabaseUrl || !this.supabaseKey) {
            return this.fallbackCorrelations(currentDtcs);
        }
        try {
            const url = new URL('/functions/v1/ai-predictive-analysis', this.supabaseUrl);
            const response = await fetch(url.toString(), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.supabaseKey}`
                },
                body: JSON.stringify({
                    operation: 'correlations',
                    currentDtcs
                })
            });
            if (!response.ok) {
                throw new Error(`AI analysis failed: ${response.status}`);
            }
            const data = await response.json();
            return data.correlations || [];
        }
        catch (error) {
            console.warn('[PredictiveDiagnostics] AI analysis failed, using fallback', error);
            return this.fallbackCorrelations(currentDtcs);
        }
    }
    async predictComponentLifespan(component, mileage, history) {
        // Rule-based fallback
        const componentLifespans = {
            'oxygen_sensor': 100000,
            'catalytic_converter': 150000,
            'spark_plugs': 50000,
            'fuel_pump': 120000,
            'battery': 80000,
            'alternator': 100000
        };
        const baseLifespan = componentLifespans[component] || 100000;
        const relatedDtcs = this.getRelatedDtcs(component, history);
        const wearFactor = Math.min(relatedDtcs.length * 0.1, 0.5); // Max 50% reduction
        const estimatedRemainingMileage = Math.max(0, Math.floor(baseLifespan * (1 - wearFactor) - mileage));
        const confidenceInterval = [
            Math.floor(estimatedRemainingMileage * 0.7),
            Math.floor(estimatedRemainingMileage * 1.3)
        ];
        const factors = [];
        if (mileage > 100000)
            factors.push('high mileage');
        if (relatedDtcs.length > 0)
            factors.push(`${relatedDtcs.length} related codes`);
        return {
            component,
            estimatedRemainingMileage,
            confidenceInterval,
            factors
        };
    }
    async calculateRiskScore(vehicleId) {
        // Simplified risk scoring
        // In production, this would query historical data
        return {
            engine: 30,
            transmission: 15,
            emissions: 45,
            electrical: 20,
            overall: 28
        };
    }
    async performPredictiveAnalysis(vehicleHistory) {
        if (!this.supabaseUrl || !this.supabaseKey) {
            return this.fallbackAnalysis(vehicleHistory);
        }
        try {
            const url = new URL('/functions/v1/ai-predictive-analysis', this.supabaseUrl);
            const response = await fetch(url.toString(), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.supabaseKey}`
                },
                body: JSON.stringify({
                    operation: 'full_analysis',
                    vehicleHistory
                })
            });
            if (!response.ok) {
                throw new Error(`AI analysis failed: ${response.status}`);
            }
            const data = await response.json();
            return data;
        }
        catch (error) {
            console.warn('[PredictiveDiagnostics] AI analysis failed, using fallback', error);
            return this.fallbackAnalysis(vehicleHistory);
        }
    }
    fallbackAnalysis(vehicleHistory) {
        const predictions = this.generateRuleBasedPredictions(vehicleHistory);
        const correlations = this.fallbackCorrelations(vehicleHistory.dtcHistory.slice(0, 5).map(h => h.code));
        return {
            predictions,
            correlations,
            lifespans: [],
            riskScores: {
                engine: 25,
                transmission: 15,
                emissions: 35,
                electrical: 20,
                overall: 24
            }
        };
    }
    generateRuleBasedPredictions(vehicleHistory) {
        const predictions = [];
        const codeCounts = new Map();
        // Count occurrences of each code
        for (const dtc of vehicleHistory.dtcHistory) {
            codeCounts.set(dtc.code, (codeCounts.get(dtc.code) || 0) + 1);
        }
        // Generate predictions for recurring codes
        for (const [code, count] of codeCounts.entries()) {
            if (count >= 3) {
                const probability = Math.min(count / 5, 0.9);
                predictions.push({
                    dtcCode: code,
                    probability,
                    timeframe: probability > 0.7 ? '1_month' : '3_months',
                    reasoning: `Код появлялся ${count} раз(а) за последние 6 месяцев`,
                    preventiveMeasures: [
                        'Проверить связанные компоненты',
                        'Провести детальную диагностику',
                        'Рассмотреть профилактическую замену'
                    ]
                });
            }
        }
        return predictions;
    }
    fallbackCorrelations(currentDtcs) {
        const correlations = [];
        // Known correlation patterns
        const patterns = {
            'P0171,P0174': {
                root: 'vacuum_leak',
                explanation: 'Обе банки слишком бедны - вероятна утечка вакуума'
            },
            'P0300,P0301,P0302,P0303,P0304': {
                root: 'ignition_system',
                explanation: 'Множественные пропуски зажигания - проверить свечи и катушки'
            },
            'P0420,P0430': {
                root: 'catalytic_converter',
                explanation: 'Низкая эффективность обоих катализаторов'
            }
        };
        const dtcSet = currentDtcs.join(',');
        for (const [pattern, info] of Object.entries(patterns)) {
            const patternCodes = pattern.split(',');
            const matches = patternCodes.filter(code => currentDtcs.includes(code));
            if (matches.length >= 2) {
                correlations.push({
                    dtcCodes: matches,
                    likelyRoot: info.root,
                    confidence: matches.length / patternCodes.length,
                    aiExplanation: info.explanation
                });
            }
        }
        return correlations;
    }
    getRelatedDtcs(component, history) {
        const componentCodePatterns = {
            'oxygen_sensor': ['P013', 'P014', 'P015', 'P016'],
            'catalytic_converter': ['P0420', 'P0430'],
            'spark_plugs': ['P030'],
            'fuel_pump': ['P0230', 'P0231', 'P0232'],
            'alternator': ['P0620', 'P0621', 'P0622'],
            'battery': ['P0560', 'P0561', 'P0562', 'P0563']
        };
        const patterns = componentCodePatterns[component] || [];
        return history.filter(h => patterns.some(pattern => h.code.startsWith(pattern)));
    }
}
