import { EventEmitter } from 'events';
import { describeDtc, DtcSeverity } from './dtcDescriptions.js';

// Локальная загрузка BLE стека (noble-winrt предпочтительно, затем @abandonware/noble)
let noble: any = null;
async function loadNoble(): Promise<any> {
	if (noble !== null) return noble;
	try {
		try {
			const mod = (await import('module')) as any;
			const req = mod?.createRequire ? mod.createRequire(import.meta.url) : undefined;
			if (req) {
				noble = req('noble-winrt');
				if (process.env.OBD_BLE_DEBUG) console.log('[KingbolenEdiag] noble-winrt via createRequire');
				return noble;
			}
		} catch {}
		const winrtModule: any = await import('noble-winrt');
		noble = winrtModule?.default ?? winrtModule;
		if (process.env.OBD_BLE_DEBUG) console.log('[KingbolenEdiag] noble-winrt via dynamic import');
		return noble;
	} catch (e1) {
		try {
			const nobleModule = await import('@abandonware/noble');
			noble = (nobleModule as any).default ?? nobleModule;
			if (process.env.OBD_BLE_DEBUG) console.log('[KingbolenEdiag] @abandonware/noble fallback');
			return noble;
		} catch (e2) {
			console.warn('[KingbolenEdiag] BLE стек не доступен', { e1: String(e1), e2: String(e2) });
			noble = false;
			return false;
		}
	}
}

export interface ObdDtc { code: string; description?: string; status?: 'current' | 'pending' | 'permanent'; severity?: DtcSeverity; }
export interface ObdResult<T> { ok: boolean; data?: T; error?: string; }
export interface ObdStatus { mil: boolean; dtcCount: number; readiness: Record<string, boolean>; }
export interface ObdLiveData { rpm: number; coolantTemp: number; intakeTemp: number; speed: number; voltage: number; throttle: number; }
export interface ToyotaHybridData { battery_soc: number; mg1_rpm: number; mg2_rpm: number; trans_temp: number; gear_position: string; egr_position: number; catalyst_temp: number; }

export interface KingbolenEdiagOptions {
	deviceName?: string; deviceAddress?: string; serviceUUID?: string; txCharacteristicUUID?: string; rxCharacteristicUUID?: string; timeoutMs?: number; autoReconnect?: boolean; canFdEnabled?: boolean;
}

export interface KingbolenEdiagMetrics {
	totalCommands: number;
	successfulCommands: number;
	failedCommands: number;
	timeouts: number;
	averageLatencyMs: number;
	averageSuccessLatencyMs?: number;
	averageErrorLatencyMs?: number;
	lastCommand: string;
	lastDurationMs: number;
	lastError?: string;
	lastUpdatedAt: string;
	protocolUsed?: string;
	firmwareVersion?: string;
	connectionAttempts?: number;
	lastConnectPhase?: 'initial' | 'widened';
	bytesSent?: number;
	bytesReceived?: number;
	connectStartedAt?: string;
	connectedAt?: string;
	lastRssi?: number;
	queueDepth?: number;
	maxQueueDepthObserved?: number;
	lastReconnectDurationSeconds?: number;
	totalReconnectDurationSeconds?: number;
	watchdogTriggers?: number;
	lastReconnectAt?: string;
	lastWatchdogTriggerAt?: string;
	lastCommandCompletedAt?: string;
	secondsSinceLastCommandCompleted?: number;
}

export class KingbolenEdiagDriver extends EventEmitter {
	private peripheral: any; private txCharacteristic: any; private rxCharacteristic: any; private connected = false;
	private isReconnectAttempt = false; // флаг текущей попытки переподключения
	private options: Required<KingbolenEdiagOptions>;
	private nobleStateChangeHandler?: (state: string) => void; private nobleDiscoverHandler?: (p: any) => void; private rxDataHandler?: (data: Buffer) => void; private peripheralDisconnectHandler?: () => void;
	private commandQueue: Array<{ resolve: (v: string) => void; reject: (e: Error) => void; command: string; }> = [];
	private responseBuffer = '';
	private pendingResponse?: { resolve: (v: string) => void; reject: (e: Error) => void; timeout: NodeJS.Timeout };
	private metrics: KingbolenEdiagMetrics = {
		totalCommands: 0,
		successfulCommands: 0,
		failedCommands: 0,
		timeouts: 0,
		averageLatencyMs: 0,
		averageSuccessLatencyMs: 0,
		averageErrorLatencyMs: 0,
		lastCommand: '',
		lastDurationMs: 0,
		lastUpdatedAt: new Date().toISOString(),
		connectionAttempts: 0,
		bytesSent: 0,
		bytesReceived: 0,
		queueDepth: 0,
		maxQueueDepthObserved: 0,
		totalReconnectDurationSeconds: 0,
		watchdogTriggers: 0,
		lastCommandCompletedAt: undefined
	};
	private latencySuccessAccumMs = 0;
	private latencyErrorAccumMs = 0;
	private lastReconnectStartTs?: number;
	private watchdogTimer?: NodeJS.Timeout;
	private lastActivityTs: number = Date.now();

	constructor(options: KingbolenEdiagOptions = {}) {
		super();
		this.options = { deviceName: options.deviceName ?? process.env.EDIAG_DEVICE_NAME ?? 'KINGBOLEN', deviceAddress: options.deviceAddress ?? process.env.EDIAG_DEVICE_ADDR ?? '', serviceUUID: options.serviceUUID ?? process.env.EDIAG_SERVICE_UUID ?? '0000ffe0-0000-1000-8000-00805f9b34fb', txCharacteristicUUID: options.txCharacteristicUUID ?? process.env.EDIAG_TX_UUID ?? '0000ffe1-0000-1000-8000-00805f9b34fb', rxCharacteristicUUID: options.rxCharacteristicUUID ?? process.env.EDIAG_RX_UUID ?? '0000ffe1-0000-1000-8000-00805f9b34fb', timeoutMs: options.timeoutMs ?? (process.env.EDIAG_TIMEOUT_MS ? Number(process.env.EDIAG_TIMEOUT_MS) : 5000), autoReconnect: options.autoReconnect ?? (process.env.EDIAG_AUTORECONNECT === '1'), canFdEnabled: options.canFdEnabled ?? (process.env.EDIAG_CANFD !== '0') };
	}

	async connect(abortSignal?: AbortSignal): Promise<boolean> {
		if (this.connected) return true;
		if (this.metrics.connectedAt && !this.connected) {
			this.isReconnectAttempt = true;
			this.lastReconnectStartTs = Date.now();
			this.emit('ble_reconnect_attempt', { previousConnectedAt: this.metrics.connectedAt, attempt: (this.metrics.connectionAttempts || 0) + 1 });
		}
		const nobleInstance = await loadNoble();
		if (!nobleInstance) throw new Error('BLE стек noble не доступен');
		return new Promise((resolve, reject) => {
			let found = false; this.metrics.connectionAttempts = (this.metrics.connectionAttempts || 0) + 1; this.metrics.connectStartedAt = new Date().toISOString(); this.emit('ble_connect_attempt', { attempt: this.metrics.connectionAttempts, startedAt: this.metrics.connectStartedAt });
			let deadline = Date.now() + this.options.timeoutMs; let connectTimeoutTimer: NodeJS.Timeout | undefined;
			const scheduleTimeout = () => { if (connectTimeoutTimer) clearTimeout(connectTimeoutTimer); const remaining = deadline - Date.now(); connectTimeoutTimer = setTimeout(() => { if (found) return; try { noble.stopScanning(); } catch {} this.cleanupNobleListeners(); reject(new Error(`Таймаут поиска устройства ${this.options.deviceName} (${this.options.timeoutMs}ms, phase=${this.metrics.lastConnectPhase || 'initial'})`)); }, remaining); };
			scheduleTimeout();
			const widenMs = (() => { const envMs = process.env.OBD_BLE_WIDEN_SCAN_MS ? Number(process.env.OBD_BLE_WIDEN_SCAN_MS) : NaN; if (!isNaN(envMs) && envMs > 0) return envMs; const calc = Math.min(Math.floor(this.options.timeoutMs * 0.5), this.options.timeoutMs - 1500); return calc > 0 ? calc : Math.floor(this.options.timeoutMs * 0.4); })();
			const secondPhaseExtraMs = (() => { const envMs = process.env.OBD_BLE_SECOND_PHASE_MS ? Number(process.env.OBD_BLE_SECOND_PHASE_MS) : NaN; if (!isNaN(envMs) && envMs > 0) return envMs; return Math.floor(this.options.timeoutMs * 0.4); })();
			let widenTimer: NodeJS.Timeout | undefined;
			const startWidenTimer = (initiallyFiltered: boolean) => { if (!initiallyFiltered || widenMs <= 0) return; widenTimer = setTimeout(() => { if (found) return; try { noble.stopScanning(); } catch {} try { noble.startScanning([], process.env.OBD_BLE_ALLOW_DUP === '1'); } catch {} this.metrics.lastConnectPhase = 'widened'; if (secondPhaseExtraMs > 0) { deadline += secondPhaseExtraMs; scheduleTimeout(); } }, widenMs); };
			const onDone = (ok: boolean, err?: Error) => { if (connectTimeoutTimer) clearTimeout(connectTimeoutTimer); if (widenTimer) clearTimeout(widenTimer); try { noble.stopScanning(); } catch {} this.cleanupNobleListeners(); if (ok) { if (this.isReconnectAttempt) { this.emit('ble_reconnect_success', { at: new Date().toISOString() }); this.isReconnectAttempt = false; } resolve(true); } else { if (this.isReconnectAttempt) { this.emit('ble_reconnect_failed', { error: err?.message || 'reconnect_error' }); this.isReconnectAttempt = false; } reject(err || new Error('Ошибка подключения')); } };
			if (abortSignal) { if (abortSignal.aborted) { onDone(false, new Error('Отменено')); return; } const abortListener = () => { if (found) return; onDone(false, new Error('Отменено')); }; abortSignal.addEventListener('abort', abortListener, { once: true }); }
			this.nobleStateChangeHandler = (state: string) => { if (state === 'poweredOn') { const scanServices = this.computeScanServices(); const useFilter = process.env.OBD_BLE_SCAN_FILTER === '1'; const services = useFilter ? scanServices : []; const allowDup = process.env.OBD_BLE_ALLOW_DUP === '1'; try { noble.startScanning(services, allowDup); } catch {} startWidenTimer(useFilter); } };
			noble.once('stateChange', this.nobleStateChangeHandler);
			this.nobleDiscoverHandler = async (peripheral: any) => { const adv = peripheral.advertisement || {}; const name: string = adv?.localName || ''; const upper = (s: string) => s?.toUpperCase?.() || s; const svcUuids: string[] = (adv?.serviceUuids || []).map((u: string) => (u?.toLowerCase?.() || u)); const wanted16 = this.shortUuid(this.options.serviceUUID); const addrRaw = (peripheral.address || peripheral.uuid || '').toLowerCase(); const addr = addrRaw.replace(/:/g, ''); const wantAddrRaw = (this.options.deviceAddress || '').toLowerCase(); const wantAddr = wantAddrRaw.replace(/:/g, ''); const matchName = upper(name).includes('EDIAG') || upper(name).includes(this.options.deviceName.toUpperCase()) || upper(name).includes('OBD') || upper(name).includes('VCI'); const matchSvc = wanted16 ? svcUuids.includes(wanted16) : false; const matchAddr = wantAddr ? (addr === wantAddr || addr.endsWith(wantAddr)) : false; this.metrics.lastRssi = typeof peripheral.rssi === 'number' ? peripheral.rssi : this.metrics.lastRssi; if (matchAddr || matchName || matchSvc) { found = true; if (widenTimer) clearTimeout(widenTimer); try { noble.stopScanning(); } catch {} try { await this.connectToPeripheral(peripheral); await this.initialize(); this.connected = true; this.metrics.connectedAt = new Date().toISOString(); if (this.isReconnectAttempt && this.lastReconnectStartTs) { const dur = (Date.now() - this.lastReconnectStartTs) / 1000; this.metrics.lastReconnectDurationSeconds = dur; this.metrics.totalReconnectDurationSeconds = (this.metrics.totalReconnectDurationSeconds || 0) + dur; this.metrics.lastReconnectAt = new Date().toISOString(); this.emit('ble_reconnect_success', { at: this.metrics.lastReconnectAt, durationSeconds: dur }); this.isReconnectAttempt = false; this.lastReconnectStartTs = undefined; } this.emit('connected', { uuid: peripheral.uuid, name }); if (this.metrics.connectStartedAt && this.metrics.connectedAt) { const durationSec = (Date.parse(this.metrics.connectedAt) - Date.parse(this.metrics.connectStartedAt)) / 1000; this.emit('ble_connected', { uuid: peripheral.uuid, name, connectedAt: this.metrics.connectedAt, startedAt: this.metrics.connectStartedAt, durationSeconds: durationSec, rssi: this.metrics.lastRssi }); } if (!this.metrics.lastReconnectAt) { this.metrics.lastReconnectAt = this.metrics.connectedAt; } this.startWatchdog(); onDone(true); } catch (error: any) { onDone(false, new Error(`Ошибка подключения: ${error.message}`)); } } };
			noble.on('discover', this.nobleDiscoverHandler);
			if (noble.state === 'poweredOn') { const scanServices = this.computeScanServices(); const useFilter = process.env.OBD_BLE_SCAN_FILTER === '1'; const services = useFilter ? scanServices : []; const allowDup = process.env.OBD_BLE_ALLOW_DUP === '1'; try { noble.startScanning(services, allowDup); } catch {} startWidenTimer(useFilter); }
		});
	}

	private computeScanServices(): string[] { const short = this.shortUuid(this.options.serviceUUID); return short ? [short] : []; }
	private shortUuid(uuid: string | undefined): string | undefined { if (!uuid) return undefined; const m = uuid.toLowerCase().match(/^0000([0-9a-f]{4})-0000-1000-8000-00805f9b34fb$/); if (m) return m[1]; if (/^[0-9a-f]{4}$/.test(uuid)) return uuid.toLowerCase(); return undefined; }

	private connectToPeripheral(peripheral: any): Promise<void> { this.peripheral = peripheral; return new Promise((resolve, reject) => { (async () => { try { await peripheral.connectAsync(); const trySome = async () => { try { const { characteristics } = await peripheral.discoverSomeServicesAndCharacteristicsAsync([this.options.serviceUUID], [this.options.txCharacteristicUUID, this.options.rxCharacteristicUUID]); return characteristics as any[]; } catch { return [] as any[]; } }; const tryAll = async () => { try { const { characteristics } = await peripheral.discoverAllServicesAndCharacteristicsAsync(); return characteristics as any[]; } catch { return [] as any[]; } }; let characteristics: any[] = await trySome(); if (characteristics.length === 0) characteristics = await tryAll(); const norm = (u: string) => (u || '').toLowerCase().replace(/-/g, ''); const expand16 = (u: string) => (/^[0-9a-f]{4}$/i.test(u) ? `0000${u.toLowerCase()}-0000-1000-8000-00805f9b34fb` : u); const wantTxFull = norm(expand16(this.options.txCharacteristicUUID)); const wantRxFull = norm(expand16(this.options.rxCharacteristicUUID)); const toShort = (u: string | undefined) => this.shortUuid(u || '') || ''; const wantTxShort = toShort(this.options.txCharacteristicUUID); const wantRxShort = toShort(this.options.rxCharacteristicUUID); const byUuid = (c: any, wantFull: string, wantShort: string) => { const cu = norm(c.uuid); const cShort = toShort(c.uuid); return cu === wantFull || (wantShort && cShort === wantShort); }; this.txCharacteristic = characteristics.find((c: any) => byUuid(c, wantTxFull, wantTxShort)); this.rxCharacteristic = characteristics.find((c: any) => byUuid(c, wantRxFull, wantRxShort)); if (!this.txCharacteristic) this.txCharacteristic = characteristics.find((c: any) => Array.isArray(c.properties) && (c.properties.includes('write') || c.properties.includes('writeWithoutResponse'))); if (!this.rxCharacteristic) this.rxCharacteristic = characteristics.find((c: any) => Array.isArray(c.properties) && (c.properties.includes('notify') || c.properties.includes('indicate'))); if (!this.txCharacteristic || !this.rxCharacteristic) throw new Error('Не найдены характеристики TX/RX'); if (typeof this.rxCharacteristic.subscribeAsync === 'function') await this.rxCharacteristic.subscribeAsync(); else if (typeof this.rxCharacteristic.subscribe === 'function') await new Promise<void>((res, rej) => this.rxCharacteristic.subscribe((err: any) => err ? rej(err) : res())); this.rxDataHandler = (data: Buffer) => { this.handleData(data.toString()); }; this.rxCharacteristic.on('data', this.rxDataHandler); this.peripheralDisconnectHandler = () => { this.handleClosed(); }; peripheral.on('disconnect', this.peripheralDisconnectHandler); resolve(); } catch (error: any) { reject(new Error(`Ошибка подключения к peripheral: ${error.message}`)); } })(); }); }

	private async initialize(): Promise<void> { try { await this.sendCommand('ATZ'); await new Promise(r => setTimeout(r, 1000)); await this.sendCommand('ATE0'); await this.sendCommand('ATL1'); await this.sendCommand('ATS0'); await this.sendCommand('ATH1'); await this.sendCommand('ATSP0'); if (this.options.canFdEnabled) { try { await this.sendCommand('AT#2'); } catch { console.warn('[KingbolenEdiag] CAN-FD не поддерживается'); } } try { const deviceInfo = await this.sendCommand('AT#1'); this.metrics.firmwareVersion = deviceInfo.trim(); } catch { console.warn('[KingbolenEdiag] Не удалось получить информацию об устройстве'); } try { await this.sendCommand('ATRV'); } catch { console.warn('[KingbolenEdiag] Не удалось получить напряжение'); } try { const protocol = await this.sendCommand('ATDPN'); this.metrics.protocolUsed = protocol.trim(); } catch { console.warn('[KingbolenEdiag] Не удалось определить протокол'); } } catch (error: any) { throw new Error(`Ошибка инициализации: ${error.message}`); } }

	async sendCommand(command: string, timeoutMs?: number): Promise<string> { const timeout = timeoutMs ?? this.options.timeoutMs; const startTime = Date.now(); return new Promise((resolve, reject) => { this.commandQueue.push({ resolve, reject, command }); this.updateQueueDepth(); if (this.commandQueue.length === 1) { this.processNextCommand(timeout, startTime); } }); }
	private async processNextCommand(timeout: number, startTime: number): Promise<void> {
		if (this.commandQueue.length === 0 || this.pendingResponse) return;
		const { resolve, reject, command } = this.commandQueue[0];
		try {
			const buffer = Buffer.from(`${command}\r`);
			this.metrics.bytesSent = (this.metrics.bytesSent || 0) + buffer.length;
			await this.txCharacteristic.writeAsync(buffer, false);
			this.emit('ble_command_sent', { command, bytes: buffer.length });
			this.metrics.totalCommands++;
			this.metrics.lastCommand = command;
			this.lastActivityTs = Date.now();
			this.pendingResponse = {
				resolve: (response: string) => {
					const duration = Date.now() - startTime;
					this.metrics.successfulCommands++;
					this.metrics.lastDurationMs = duration;
					this.metrics.averageLatencyMs = (this.metrics.averageLatencyMs * (this.metrics.totalCommands - 1) + duration) / this.metrics.totalCommands;
					this.latencySuccessAccumMs += duration;
					this.metrics.averageSuccessLatencyMs = this.metrics.successfulCommands > 0 ? (this.latencySuccessAccumMs / this.metrics.successfulCommands) : 0;
					this.metrics.lastUpdatedAt = new Date().toISOString();
					this.metrics.lastCommandCompletedAt = this.metrics.lastUpdatedAt;
					this.emit('ble_command_completed', { command, durationMs: duration });
					this.commandQueue.shift();
					this.updateQueueDepth();
					resolve(response);
					this.pendingResponse = undefined;
					this.lastActivityTs = Date.now();
					this.restartWatchdog();
					if (this.commandQueue.length > 0) this.processNextCommand(timeout, Date.now());
				},
				reject: (error: Error) => {
					this.metrics.failedCommands++;
					this.metrics.lastError = error.message;
					this.metrics.lastUpdatedAt = new Date().toISOString();
					this.metrics.lastCommandCompletedAt = this.metrics.lastUpdatedAt;
					const errDuration = Date.now() - startTime;
					this.latencyErrorAccumMs += errDuration;
					this.metrics.averageErrorLatencyMs = this.metrics.failedCommands > 0 ? (this.latencyErrorAccumMs / this.metrics.failedCommands) : 0;
					this.emit('ble_command_failed', { command, error: error.message });
					this.commandQueue.shift();
					this.updateQueueDepth();
					reject(error);
					this.pendingResponse = undefined;
					this.lastActivityTs = Date.now();
					this.restartWatchdog();
					if (this.commandQueue.length > 0) this.processNextCommand(timeout, Date.now());
				},
				timeout: setTimeout(() => {
					this.metrics.timeouts++;
					this.metrics.failedCommands++;
					this.metrics.lastError = 'Timeout';
					this.metrics.lastUpdatedAt = new Date().toISOString();
					this.metrics.lastCommandCompletedAt = this.metrics.lastUpdatedAt;
					const timeoutDuration = Date.now() - startTime;
					this.latencyErrorAccumMs += timeoutDuration;
					this.metrics.averageErrorLatencyMs = this.metrics.failedCommands > 0 ? (this.latencyErrorAccumMs / this.metrics.failedCommands) : 0;
					this.emit('ble_command_failed', { command, error: 'Timeout' });
					this.commandQueue.shift();
					this.updateQueueDepth();
					reject(new Error(`Timeout waiting for response to: ${command}`));
					this.pendingResponse = undefined;
					this.lastActivityTs = Date.now();
					this.restartWatchdog();
					if (this.commandQueue.length > 0) this.processNextCommand(timeout, Date.now());
				}, timeout)
			};
			this.restartWatchdog();
		} catch (error: any) {
			this.metrics.failedCommands++;
			this.metrics.lastError = error.message;
			this.commandQueue.shift();
			this.updateQueueDepth();
			reject(new Error(`Ошибка отправки команды: ${error.message}`));
			this.emit('ble_command_failed', { command, error: error.message });
			this.metrics.lastUpdatedAt = new Date().toISOString();
			this.metrics.lastCommandCompletedAt = this.metrics.lastUpdatedAt;
			const errDuration = Date.now() - startTime;
			this.latencyErrorAccumMs += errDuration;
			this.metrics.averageErrorLatencyMs = this.metrics.failedCommands > 0 ? (this.latencyErrorAccumMs / this.metrics.failedCommands) : 0;
			this.lastActivityTs = Date.now();
			this.restartWatchdog();
			if (this.commandQueue.length > 0) this.processNextCommand(timeout, Date.now());
		}
	}
	private handleData(data: string): void { this.metrics.bytesReceived = (this.metrics.bytesReceived || 0) + Buffer.byteLength(data); this.emit('ble_data_received', { bytes: Buffer.byteLength(data) }); this.responseBuffer += data; if (this.responseBuffer.includes('>')) { const response = this.responseBuffer.split('>')[0].trim().replace(/\r\n/g, '\n'); this.responseBuffer = ''; if (this.pendingResponse) { clearTimeout(this.pendingResponse.timeout); this.pendingResponse.resolve(response); } } }
	private handleClosed(): void {
		this.connected = false;
		this.cleanupPeripheralListeners();
		this.emit('disconnect');
		this.emit('ble_disconnected', { at: new Date().toISOString() });
		this.stopWatchdog();
		if (this.options.autoReconnect) {
			const delayMs = 5000;
			this.emit('ble_reconnect_scheduled', { inMs: delayMs });
			setTimeout(() => {
				this.isReconnectAttempt = true;
				this.lastReconnectStartTs = Date.now();
				this.emit('ble_reconnect_attempt', { previousConnectedAt: this.metrics.connectedAt, attempt: (this.metrics.connectionAttempts || 0) + 1 });
				this.connect().catch(e => {
					if (this.isReconnectAttempt) {
						this.emit('ble_reconnect_failed', { error: e.message });
						this.isReconnectAttempt = false;
					}
					console.error('[KingbolenEdiag] Ошибка переподключения:', e);
				});
			}, delayMs);
		}
	}
	private updateQueueDepth(): void { const depth = this.commandQueue.length; this.metrics.queueDepth = depth; if ((this.metrics.maxQueueDepthObserved || 0) < depth) this.metrics.maxQueueDepthObserved = depth; }
	private startWatchdog(): void { const intervalMs = (() => { const v = Number(process.env.OBD_BLE_WATCHDOG_MS || '0'); return !isNaN(v) && v > 0 ? v : 15000; })(); if (intervalMs <= 0) return; this.stopWatchdog(); this.watchdogTimer = setInterval(() => { const now = Date.now(); const inactiveMs = now - this.lastActivityTs; if (inactiveMs > intervalMs) { this.metrics.watchdogTriggers = (this.metrics.watchdogTriggers || 0) + 1; this.metrics.lastWatchdogTriggerAt = new Date().toISOString(); this.emit('ble_watchdog_trigger', { inactiveMs }); this.stopWatchdog(); try { this.peripheral?.disconnectAsync?.(); } catch {} this.handleClosed(); } }, intervalMs); }
	private restartWatchdog(): void { if (this.watchdogTimer) { this.lastActivityTs = Date.now(); } }
	private stopWatchdog(): void { if (this.watchdogTimer) { clearInterval(this.watchdogTimer); this.watchdogTimer = undefined; } }
	async readDTC(): Promise<ObdResult<ObdDtc[]>> { try { const response = await this.sendCommand('03'); const dtcs = this.parseDTC(response); return { ok: true, data: dtcs.map(code => ({ code, description: describeDtc(code).description, status: 'current', severity: describeDtc(code).severity })) }; } catch (e: any) { return { ok: false, error: e.message }; } }
	async clearDTC(): Promise<ObdResult<boolean>> { try { const response = await this.sendCommand('04'); const success = response.includes('OK') || response.includes('44'); return { ok: true, data: success }; } catch (e: any) { return { ok: false, error: e.message }; } }
	async readStatus(): Promise<ObdResult<ObdStatus>> { try { const response = await this.sendCommand('0101'); const bytes = this.parseHexResponse(response); if (bytes.length < 4) throw new Error('Недостаточно данных'); const mil = (bytes[0] & 0x80) !== 0; const dtcCount = bytes[0] & 0x7f; const readiness = { misfire: (bytes[1] & 0x01) === 0, fuel: (bytes[1] & 0x02) === 0, components: (bytes[1] & 0x04) === 0, catalyst: (bytes[2] & 0x01) === 0, heatedCatalyst: (bytes[2] & 0x02) === 0, evaporative: (bytes[2] & 0x04) === 0, secondaryAir: (bytes[2] & 0x08) === 0, acRefrigerant: (bytes[2] & 0x10) === 0, oxygenSensor: (bytes[2] & 0x20) === 0, oxygenHeater: (bytes[2] & 0x40) === 0, egrVvt: (bytes[2] & 0x80) === 0 } as Record<string, boolean>; return { ok: true, data: { mil, dtcCount, readiness } }; } catch (e: any) { return { ok: false, error: e.message }; } }
	async readLiveData(): Promise<ObdResult<ObdLiveData>> { try { const [rpm, coolant, intake, speed, voltage, throttle] = await Promise.all([this.readPID('0C'), this.readPID('05'), this.readPID('0F'), this.readPID('0D'), this.readPID('42'), this.readPID('11')]); return { ok: true, data: { rpm: this.decodePID('0C', rpm) as number, coolantTemp: this.decodePID('05', coolant) as number, intakeTemp: this.decodePID('0F', intake) as number, speed: this.decodePID('0D', speed) as number, voltage: this.decodePID('42', voltage) as number, throttle: this.decodePID('11', throttle) as number } }; } catch (e: any) { return { ok: false, error: e.message }; } }
	async readToyotaHybrid(): Promise<ObdResult<ToyotaHybridData>> { try { const [soc, mg1, mg2, transTemp, gear, egr, catalyst] = await Promise.all([this.readPID('D2'), this.readPID('D3'), this.readPID('D4'), this.readPID('E4'), this.readPID('A4'), this.readPID('F0'), this.readPID('F1')]); return { ok: true, data: { battery_soc: this.decodePID('D2', soc) as number, mg1_rpm: this.decodePID('D3', mg1) as number, mg2_rpm: this.decodePID('D4', mg2) as number, trans_temp: this.decodePID('E4', transTemp) as number, gear_position: this.decodePID('A4', gear) as string, egr_position: this.decodePID('F0', egr) as number, catalyst_temp: this.decodePID('F1', catalyst) as number } }; } catch (e: any) { return { ok: false, error: e.message }; } }
	async readPID(pid: string): Promise<string> { return this.sendCommand(`01${pid}`); }
	private decodePID(pid: string, response: string): number | string { const bytes = this.parseHexResponse(response); if (bytes.length === 0) return 0; switch (pid) { case '0C': return bytes.length >= 2 ? ((bytes[0] * 256 + bytes[1]) / 4).toFixed(0) : 0; case '05': case '0F': return bytes[0] - 40; case '0D': return bytes[0]; case '42': return bytes.length >= 2 ? ((bytes[0] * 256 + bytes[1]) / 1000).toFixed(2) : 0; case '11': return ((bytes[0] / 255) * 100).toFixed(1); case 'D2': return ((bytes[0] / 255) * 100).toFixed(1); case 'D3': case 'D4': return bytes.length >= 2 ? (bytes[0] * 256 + bytes[1]) - 32768 : 0; case 'E4': return bytes[0] - 40; case 'A4': { const gearMap: Record<number, string> = { 0: 'P', 1: 'R', 2: 'N', 3: 'D', 4: 'B' }; return gearMap[bytes[0]] || 'Unknown'; } case 'F0': case 'F1': return ((bytes[0] / 255) * 100).toFixed(1); default: return bytes[0]; } }
	private parseDTC(response: string): string[] { const dtcPattern = /43\s?([0-9A-F]{2})\s?([0-9A-F]{2})/gi; const matches = [...response.matchAll(dtcPattern)]; return matches.map(match => { const high = parseInt(match[1], 16); const low = parseInt(match[2], 16); const prefixMap: Record<number, string> = { 0: 'P', 1: 'C', 2: 'B', 3: 'U' }; const prefix = prefixMap[(high >> 6) & 0x03] || 'P'; const code = `${prefix}${((high & 0x3f) << 8 | low).toString(16).toUpperCase().padStart(4, '0')}`; return code; }); }
	private parseHexResponse(response: string): number[] { const hex = response.replace(/\s+/g, '').replace(/^41[0-9A-F]{2}/, ''); const bytes: number[] = []; for (let i = 0; i < hex.length; i += 2) { const byte = parseInt(hex.substr(i, 2), 16); if (!isNaN(byte)) bytes.push(byte); } return bytes; }
	async identify(): Promise<string> { try { const vinResponse = await this.sendCommand('0902'); const vin = vinResponse.replace(/\s+/g, '').replace(/^49/, '').replace(/[^A-Z0-9]/g, ''); return `KINGBOLEN Ediag Plus\nFirmware: ${this.metrics.firmwareVersion || 'Unknown'}\nVIN: ${vin || 'Not available'}`; } catch { return `KINGBOLEN Ediag Plus\nFirmware: ${this.metrics.firmwareVersion || 'Unknown'}\nVIN: Error reading VIN`; } }
	async readVoltage(): Promise<ObdResult<number>> { try { const raw = await this.sendCommand('ATRV'); const match = raw.match(/([0-9]+\.[0-9]+)/); const value = match ? parseFloat(match[1]) : NaN; if (!isNaN(value)) return { ok: true, data: value }; return { ok: false, error: 'parse_error' }; } catch (e: any) { return { ok: false, error: e.message }; } }
	async disconnect(): Promise<void> { if (this.peripheral) { try { this.cleanupPeripheralListeners(); await this.peripheral.disconnectAsync(); } catch {} this.connected = false; this.emit('disconnect'); } try { noble.stopScanning(); } catch {} this.cleanupNobleListeners(); }
	async close(): Promise<void> { await this.disconnect(); }
	getMetrics(): KingbolenEdiagMetrics {
		if (this.metrics.lastCommandCompletedAt) {
			this.metrics.secondsSinceLastCommandCompleted = Math.max(0, (Date.now() - Date.parse(this.metrics.lastCommandCompletedAt)) / 1000);
		} else {
			this.metrics.secondsSinceLastCommandCompleted = undefined;
		}
		return { ...this.metrics };
	}
	private cleanupNobleListeners(): void { if (this.nobleStateChangeHandler) { try { noble.removeListener('stateChange', this.nobleStateChangeHandler); } catch {} this.nobleStateChangeHandler = undefined; } if (this.nobleDiscoverHandler) { try { noble.removeListener('discover', this.nobleDiscoverHandler); } catch {} this.nobleDiscoverHandler = undefined; } }
	private cleanupPeripheralListeners(): void { if (this.rxCharacteristic && this.rxDataHandler) { try { this.rxCharacteristic.removeListener('data', this.rxDataHandler); } catch {} } if (this.rxCharacteristic) { try { if (typeof this.rxCharacteristic.unsubscribeAsync === 'function') { this.rxCharacteristic.unsubscribeAsync(); } else if (typeof this.rxCharacteristic.unsubscribe === 'function') { this.rxCharacteristic.unsubscribe(() => void 0); } } catch {} } if (this.peripheral && this.peripheralDisconnectHandler) { try { this.peripheral.removeListener('disconnect', this.peripheralDisconnectHandler); } catch {} } this.rxDataHandler = undefined; this.peripheralDisconnectHandler = undefined; }
	async shutdown(): Promise<void> { try { if (this.peripheral) { this.cleanupPeripheralListeners(); await this.peripheral.disconnectAsync(); } } catch {} try { noble.stopScanning(); } catch {} this.cleanupNobleListeners(); this.connected = false; }
}
