import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import path from 'node:path';
import {
	generateDiagnosticsReport,
	generateThicknessReport,
	type DiagnosticsReportData,
	type ThicknessReportData,
} from '../reporting/module.js';

type ReportKind = 'diagnostics' | 'thickness';

export interface GeneratedReport {
	id: string;
	sessionId: string;
	type: ReportKind;
	htmlPath: string;
	pdfPath?: string;
}

type AnyReportPayload = (DiagnosticsReportData & { type?: string })
	| (ThicknessReportData & { type?: string })
	| (Record<string, unknown> & { sessionId: string });

export async function writeReportToOutbox(data: AnyReportPayload, outboxRoot: string): Promise<GeneratedReport> {
	const kind = detectReportKind(data);
	if (!kind) {
		throw new Error('Unsupported report payload: cannot detect report type');
	}
	await fs.mkdir(outboxRoot, { recursive: true });

	if (kind === 'diagnostics') {
		const normalized = normalizeDiagnosticsPayload(data);
		const reportId = `${normalized.sessionId}-${Date.now()}`;
		const htmlContent = renderDiagnosticsHtml(normalized);
		const htmlPath = path.join(outboxRoot, `${reportId}.html`);
		await fs.writeFile(htmlPath, htmlContent, 'utf8');

		let pdfPath: string | undefined;
		try {
			const options = { outputPath: outboxRoot };
			pdfPath = await generateDiagnosticsReport(normalized, options);
		} catch (error) {
			console.warn('[reports] PDF generation failed, continuing with HTML only', error);
		}

		return {
			id: reportId,
			sessionId: normalized.sessionId,
			type: kind,
			htmlPath,
			pdfPath,
		};
	}

	const normalized = normalizeThicknessPayload(data);
	const reportId = `${normalized.sessionId}-${Date.now()}`;
	const htmlContent = renderThicknessHtml(normalized);
	const htmlPath = path.join(outboxRoot, `${reportId}.html`);
	await fs.writeFile(htmlPath, htmlContent, 'utf8');

	let pdfPath: string | undefined;
	try {
		const options = { outputPath: outboxRoot };
		pdfPath = await generateThicknessReport(normalized, options);
	} catch (error) {
		console.warn('[reports] PDF generation failed, continuing with HTML only', error);
	}

	return {
		id: reportId,
		sessionId: normalized.sessionId,
		type: kind,
		htmlPath,
		pdfPath,
	};
}

export function resolveReportHtmlPathById(outboxRoot: string, id: string): string | null {
	if (!/^[a-zA-Z0-9._-]+$/.test(id)) {
		return null;
	}
	const fullPath = path.join(outboxRoot, `${id}.html`);
		return existsSync(fullPath) ? fullPath : null;
}

export async function simulateSend(report: GeneratedReport, recipient: { email?: string; phone?: string }, outboxRoot: string): Promise<void> {
	const logDir = path.join(outboxRoot, 'sent');
	await fs.mkdir(logDir, { recursive: true });
	const payload = {
		id: report.id,
		sessionId: report.sessionId,
		type: report.type,
		recipient,
		htmlPath: report.htmlPath,
		pdfPath: report.pdfPath,
		simulatedAt: new Date().toISOString(),
		note: 'DEV only: simulated delivery',
	};
	await fs.writeFile(path.join(logDir, `${report.id}.json`), JSON.stringify(payload, null, 2), 'utf8');
}

function detectReportKind(payload: AnyReportPayload): ReportKind | null {
	const candidate = typeof payload.type === 'string' ? payload.type.toLowerCase() : undefined;
	if (candidate === 'diagnostics' || candidate === 'dtc' || candidate === 'obd') {
		return 'diagnostics';
	}
	if (candidate === 'thickness' || candidate === 'paint' || candidate === 'thk') {
		return 'thickness';
	}
	if (Array.isArray((payload as any).dtcCodes) || Array.isArray((payload as any).dtc)) {
		return 'diagnostics';
	}
	if (Array.isArray((payload as any).measurements) || Array.isArray((payload as any).points)) {
		return 'thickness';
	}
	return null;
}

function normalizeDiagnosticsPayload(payload: AnyReportPayload): DiagnosticsReportData {
	const raw = payload as Record<string, any>;
	const dtcList = Array.isArray(raw.dtcCodes) ? raw.dtcCodes : Array.isArray(raw.dtc)
		? raw.dtc
		: [];

	const normalizedCodes = dtcList
		.map((entry: any) => {
			const code = entry?.code || entry?.id || '';
			if (!code) {
				return undefined;
			}
			const severity = toDiagnosticsSeverity(entry?.severity);
			return {
				code: String(code),
				description: entry?.description ? String(entry.description) : '',
				severity,
			} satisfies DiagnosticsReportData['dtcCodes'][number];
		})
		.filter((item): item is DiagnosticsReportData['dtcCodes'][number] => Boolean(item));

	return {
		sessionId: String(raw.sessionId || 'unknown-session'),
		vehicleMake: String(raw.vehicleMake || raw.make || 'Unknown'),
		vehicleModel: String(raw.vehicleModel || raw.model || 'Vehicle'),
		dtcCodes: normalizedCodes,
		timestamp: String(raw.timestamp || new Date().toISOString()),
		cleared: Boolean(raw.cleared ?? raw.clearStatus?.success ?? false),
		clearedAt: raw.clearedAt || raw.clearStatus?.at,
	} satisfies DiagnosticsReportData;
}

function normalizeThicknessPayload(payload: AnyReportPayload): ThicknessReportData {
	const raw = payload as Record<string, any>;
	const measurementsSource = Array.isArray(raw.measurements) ? raw.measurements : Array.isArray(raw.points)
		? raw.points
		: [];

	const measurements = measurementsSource
		.map((entry: any) => {
			const zone = entry?.zone || entry?.id;
			if (!zone) {
				return undefined;
			}
			const value = typeof entry?.value === 'number' ? entry.value : typeof entry?.valueMicrons === 'number' ? entry.valueMicrons : Number(entry?.value);
			const status = toThicknessStatus(entry?.status || entry?.level);
			return {
				zone: String(zone),
				value: Number.isFinite(value) ? Number(value) : 0,
				status,
			} satisfies ThicknessReportData['measurements'][number];
		})
		.filter((item): item is ThicknessReportData['measurements'][number] => Boolean(item));

	return {
		sessionId: String(raw.sessionId || 'unknown-session'),
		vehicleType: String(raw.vehicleType || raw.vehicle || 'sedan'),
		measurements,
		timestamp: String(raw.timestamp || new Date().toISOString()),
	} satisfies ThicknessReportData;
}

function toDiagnosticsSeverity(value: unknown): DiagnosticsReportData['dtcCodes'][number]['severity'] {
	const normalized = typeof value === 'string' ? value.toLowerCase() : '';
	if (normalized === 'high' || normalized === 'critical') {
		return 'high';
	}
	if (normalized === 'medium' || normalized === 'warning') {
		return 'medium';
	}
	return 'low';
}

function toThicknessStatus(value: unknown): ThicknessReportData['measurements'][number]['status'] {
	const normalized = typeof value === 'string' ? value.toLowerCase() : '';
	if (normalized === 'critical' || normalized === 'bad') {
		return 'critical';
	}
	if (normalized === 'warning' || normalized === 'medium') {
		return 'warning';
	}
	return 'normal';
}

function renderDiagnosticsHtml(data: DiagnosticsReportData): string {
		const dtcRows = data.dtcCodes.length
			? data.dtcCodes.map((dtc: DiagnosticsReportData['dtcCodes'][number], index: number) => `
			<tr>
				<td>${index + 1}</td>
				<td>${escapeHtml(dtc.code)}</td>
				<td>${escapeHtml(dtc.description || 'Описание отсутствует')}</td>
				<td>${escapeHtml(severityLabel(dtc.severity))}</td>
			</tr>
		`).join('\n')
		: '<tr><td colspan="4" class="muted">Коды неисправностей отсутствуют</td></tr>';

	const cleared = data.cleared
		? `<p class="info">Коды были сброшены${data.clearedAt ? `: ${escapeHtml(new Date(data.clearedAt).toLocaleString('ru-RU'))}` : ''}</p>`
		: '';

	return wrapHtml(`
		<h1>Отчет диагностики OBD-II</h1>
		<section>
			<p><strong>Сессия:</strong> ${escapeHtml(data.sessionId)}</p>
			<p><strong>Автомобиль:</strong> ${escapeHtml(`${data.vehicleMake} ${data.vehicleModel}`.trim())}</p>
			<p><strong>Дата:</strong> ${escapeHtml(new Date(data.timestamp).toLocaleString('ru-RU'))}</p>
			${cleared}
		</section>
		<section>
			<h2>Коды неисправностей</h2>
			<table>
				<thead>
					<tr><th>#</th><th>Код</th><th>Описание</th><th>Серьезность</th></tr>
				</thead>
				<tbody>${dtcRows}</tbody>
			</table>
		</section>
	`);
}

function renderThicknessHtml(data: ThicknessReportData): string {
		const rows = data.measurements.length
			? data.measurements.map((measurement: ThicknessReportData['measurements'][number], index: number) => `
			<tr>
				<td>${index + 1}</td>
				<td>${escapeHtml(measurement.zone)}</td>
				<td class="num">${escapeHtml(measurement.value.toFixed(0))} мкм</td>
				<td>${escapeHtml(thicknessStatusLabel(measurement.status))}</td>
			</tr>
		`).join('\n')
		: '<tr><td colspan="4" class="muted">Измерения не выполнены</td></tr>';

	return wrapHtml(`
		<h1>Отчет толщинометрии ЛКП</h1>
		<section>
			<p><strong>Сессия:</strong> ${escapeHtml(data.sessionId)}</p>
			<p><strong>Тип автомобиля:</strong> ${escapeHtml(data.vehicleType)}</p>
			<p><strong>Дата:</strong> ${escapeHtml(new Date(data.timestamp).toLocaleString('ru-RU'))}</p>
		</section>
		<section>
			<h2>Измерения</h2>
			<table>
				<thead>
					<tr><th>#</th><th>Зона</th><th class="num">Толщина</th><th>Статус</th></tr>
				</thead>
				<tbody>${rows}</tbody>
			</table>
		</section>
	`);
}

function wrapHtml(body: string): string {
	return `<!doctype html>
<html lang="ru">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<title>Отчет автосервиса самообслуживания</title>
		<style>
			body { font-family: "Segoe UI", Roboto, system-ui, sans-serif; color: #0f172a; background: #f8fafc; margin: 0; padding: 24px; }
			h1 { margin-bottom: 8px; }
			h2 { margin-top: 24px; }
			section { margin-bottom: 24px; background: #fff; padding: 16px; border-radius: 12px; box-shadow: 0 2px 6px rgba(15, 23, 42, 0.08); }
			table { width: 100%; border-collapse: collapse; margin-top: 12px; }
			th, td { border: 1px solid #e2e8f0; padding: 8px 10px; text-align: left; font-size: 14px; }
			th { background: #f1f5f9; text-transform: uppercase; letter-spacing: 0.02em; font-size: 12px; color: #475569; }
			.num { text-align: right; }
			.muted { color: #94a3b8; font-style: italic; text-align: center; }
			.info { background: #e0f2fe; color: #0369a1; padding: 8px 10px; border-radius: 8px; margin-top: 12px; display: inline-block; }
			footer { color: #94a3b8; font-size: 12px; text-align: center; margin-top: 32px; }
		</style>
	</head>
	<body>
		${body}
		<footer>Отчет сгенерирован терминалом автосервиса самообслуживания</footer>
	</body>
</html>`;
}

function escapeHtml(value: unknown): string {
	return String(value ?? '').replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function severityLabel(severity: DiagnosticsReportData['dtcCodes'][number]['severity']): string {
	switch (severity) {
		case 'high':
			return 'Высокая';
		case 'medium':
			return 'Средняя';
		default:
			return 'Низкая';
	}
}

function thicknessStatusLabel(status: ThicknessReportData['measurements'][number]['status']): string {
	switch (status) {
		case 'critical':
			return 'Критично';
		case 'warning':
			return 'Предупреждение';
		default:
			return 'Норма';
	}
}

