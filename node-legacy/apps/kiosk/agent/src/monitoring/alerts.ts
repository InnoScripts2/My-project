
interface AlertsInput {
	environment: string;
	timestamp: string;
	payments?: { total: number; confirmed: number };
	ble?: {
		queueDepth?: number;
		maxQueueDepthObserved?: number;
		watchdogTriggers?: number;
		lastWatchdogTriggerAt?: string;
		lastReconnectAt?: string;
		lastReconnectDurationSeconds?: number;
		totalReconnectDurationSeconds?: number;
		secondsSinceLastReconnect?: number;
		secondsSinceLastWatchdogTrigger?: number;
		averageLatencyMs?: number;
		lastDurationMs?: number;
		secondsSinceLastCommandCompleted?: number;
		lastCommandCompletedAt?: string;
		averageSuccessLatencyMs?: number;
		averageErrorLatencyMs?: number;
	};
}

interface AlertItem {
	id: string;
	type: 'ble' | 'payments' | 'system';
	severity: 'info' | 'warning' | 'critical';
	message: string;
	context?: Record<string, unknown>;
	detectedAt: string;
}

export function evaluateAlerts(input: AlertsInput): AlertItem[] {
	const alerts: AlertItem[] = [];
	const now = Date.parse(input.timestamp);
	const payments = input.payments ?? { total: 0, confirmed: 0 };

	function envNumber(name: string, fallback: number): number {
		const raw = process.env[name];
		if (!raw) return fallback;
		const v = Number(raw);
		return isNaN(v) ? fallback : v;
	}

	// Пороговые значения (env переопределяет, иначе дефолты)
	const queueWarn = envNumber('BLE_QUEUE_WARN', 10);
	const queueCrit = envNumber('BLE_QUEUE_CRIT', 25);
	const watchdogWarn = envNumber('BLE_WATCHDOG_WARN', 3);
	const watchdogCrit = envNumber('BLE_WATCHDOG_CRIT', 10);
	const longStableReconnectSec = envNumber('BLE_LONG_STABLE_SEC', 3600); // инфо при отсутствии reconnect дольше этого
	const latencyWarnMs = envNumber('BLE_LATENCY_WARN_MS', 800); // средняя латентность > warn
	const latencyCritMs = envNumber('BLE_LATENCY_CRIT_MS', 1500); // средняя латентность > crit
	const commandStallWarnSec = envNumber('BLE_COMMAND_STALL_WARN_SEC', 20); // отсутствие завершённых команд > warn
	const commandStallCritSec = envNumber('BLE_COMMAND_STALL_CRIT_SEC', 60); // критический простой

	// BLE правила только не в PROD? Нет — в PROD особенно нужны.
	if (input.ble) {
		const {
			queueDepth,
			maxQueueDepthObserved,
			watchdogTriggers,
			lastWatchdogTriggerAt,
			lastReconnectAt,
			lastReconnectDurationSeconds,
			totalReconnectDurationSeconds,
			secondsSinceLastReconnect,
			secondsSinceLastWatchdogTrigger,
			averageLatencyMs,
			lastDurationMs,
			secondsSinceLastCommandCompleted,
			lastCommandCompletedAt,
			averageSuccessLatencyMs,
			averageErrorLatencyMs,
		} = input.ble;
		// 0) Средняя латентность команд (производительность адаптера)
		if (typeof averageLatencyMs === 'number' && averageLatencyMs > latencyWarnMs) {
			alerts.push({
				id: 'ble_latency_high',
				type: 'ble',
				severity: averageLatencyMs > latencyCritMs ? 'critical' : 'warning',
				message: `Средняя латентность BLE команд: ${Math.round(averageLatencyMs)}ms`,
				context: { averageLatencyMs, lastDurationMs, latencyWarnMs, latencyCritMs },
				detectedAt: input.timestamp,
			});
		}

		// 0a) Средняя латентность успешных команд — ранний признак деградации без ошибок
		if (typeof averageSuccessLatencyMs === 'number' && averageSuccessLatencyMs > latencyWarnMs) {
			alerts.push({
				id: 'ble_success_latency_high',
				type: 'ble',
				severity: averageSuccessLatencyMs > latencyCritMs ? 'critical' : 'warning',
				message: `Высокая средняя латентность успешных команд: ${Math.round(averageSuccessLatencyMs)}ms`,
				context: { averageSuccessLatencyMs, latencyWarnMs, latencyCritMs },
				detectedAt: input.timestamp,
			});
		}

		// 0b) Средняя латентность ошибочных/таймаут команд — индикатор нестабильности
		if (typeof averageErrorLatencyMs === 'number' && averageErrorLatencyMs > latencyWarnMs) {
			alerts.push({
				id: 'ble_error_latency_high',
				type: 'ble',
				severity: averageErrorLatencyMs > latencyCritMs ? 'critical' : 'warning',
				message: `Высокая средняя латентность ошибочных команд: ${Math.round(averageErrorLatencyMs)}ms`,
				context: { averageErrorLatencyMs, latencyWarnMs, latencyCritMs },
				detectedAt: input.timestamp,
			});
		}

		// 1) Глубокая очередь команд (возможная задержка адаптера)
		if (typeof queueDepth === 'number' && queueDepth > queueWarn) {
			alerts.push({
				id: 'ble_queue_depth_high',
				type: 'ble',
				severity: queueDepth > queueCrit ? 'critical' : 'warning',
				message: `Глубина очереди BLE команд высокая: ${queueDepth}`,
				context: { queueDepth, maxQueueDepthObserved, queueWarn, queueCrit },
				detectedAt: input.timestamp,
			});
		}

		// 2) Частые watchdog-триггеры
		if (typeof watchdogTriggers === 'number' && watchdogTriggers >= watchdogWarn) {
			const lastTriggerAgeSec = secondsSinceLastWatchdogTrigger != null
				? secondsSinceLastWatchdogTrigger
				: (lastWatchdogTriggerAt ? (now - Date.parse(lastWatchdogTriggerAt)) / 1000 : null);
			alerts.push({
				id: 'ble_watchdog_many_triggers',
				type: 'ble',
				severity: watchdogTriggers >= watchdogCrit ? 'critical' : 'warning',
				message: `Watchdog BLE срабатывал ${watchdogTriggers} раз(а)`,
				context: { watchdogTriggers, lastWatchdogTriggerAt, lastTriggerAgeSec, watchdogWarn, watchdogCrit },
				detectedAt: input.timestamp,
			});
		}

		// 3) Длительное отсутствие reconnect (стабильность)
		if (lastReconnectAt || typeof secondsSinceLastReconnect === 'number') {
			const sinceReconnectSec = typeof secondsSinceLastReconnect === 'number'
				? secondsSinceLastReconnect
				: (lastReconnectAt ? (now - Date.parse(lastReconnectAt)) / 1000 : null);
			if (sinceReconnectSec != null && sinceReconnectSec > longStableReconnectSec && input.environment !== 'DEV') {
				alerts.push({
					id: 'ble_no_reconnect_long_period',
					type: 'ble',
					severity: 'info',
					message: `Более ${(sinceReconnectSec / 3600).toFixed(1)}ч без переподключений BLE`,
					context: { sinceReconnectSec, longStableReconnectSec, totalReconnectDurationSeconds, lastReconnectDurationSeconds },
					detectedAt: input.timestamp,
				});
			}
		}

		// 4) Простой обработки команд (stall) — отсутствие завершения команд длительное время
		const stallAgeSec = typeof secondsSinceLastCommandCompleted === 'number'
			? secondsSinceLastCommandCompleted
			: (lastCommandCompletedAt ? (now - Date.parse(lastCommandCompletedAt)) / 1000 : null);
		if (stallAgeSec != null && stallAgeSec > commandStallWarnSec) {
			alerts.push({
				id: 'ble_command_processing_stall',
				type: 'ble',
				severity: stallAgeSec > commandStallCritSec ? 'critical' : 'warning',
				message: `Нет завершённых команд ${Math.round(stallAgeSec)}с`,
				context: { stallAgeSec, commandStallWarnSec, commandStallCritSec, lastCommandCompletedAt, lastCommand: input.ble.lastDurationMs },
				detectedAt: input.timestamp,
			});
		}
	}

	// Пример платежного алерта (placeholder)
	if (payments.total > 0 && payments.confirmed / payments.total < 0.2) {
		alerts.push({
			id: 'payments_low_confirmation_ratio',
			type: 'payments',
			severity: 'warning',
			message: 'Низкая доля подтверждённых платежей (<20%)',
			context: { total: payments.total, confirmed: payments.confirmed },
			detectedAt: input.timestamp,
		});
	}

	return alerts;
}

