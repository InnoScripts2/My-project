import { EventEmitter } from 'events';
import { describeDtc } from './dtcDescriptions.js';
import { SerialPortTransport } from './transports.js';
import { getProtocolProfile, getProtocolCommand } from './protocolProfiles.js';
import { parsePid as parsePidValue } from './pidDecoders.js';
export class Elm327Driver extends EventEmitter {
    constructor(opts) {
        super();
        this.commandQueue = Promise.resolve();
        this.isOpen = false;
        this.responseBuffer = '';
        this.onTransportClose = () => this.handleTransportClosed();
        this.onTransportError = (error) => this.handleTransportError(error);
        this.metrics = {
            totalCommands: 0,
            successfulCommands: 0,
            failedCommands: 0,
            timeouts: 0,
            averageLatencyMs: 0,
        };
        this.handleTransportData = (chunk) => {
            if (!chunk)
                return;
            this.responseBuffer += chunk.replace(/\r/g, '');
            this.flushBuffer();
        };
        if (!opts.transport && !opts.portPath) {
            throw new Error('Elm327Driver requires either transport or portPath');
        }
        this.options = {
            baudRate: opts.baudRate ?? 38400,
            timeoutMs: opts.timeoutMs ?? 2000,
            portPath: opts.portPath,
            keepAliveIntervalMs: opts.keepAliveIntervalMs ?? 0,
            protocolProfile: opts.protocolProfile,
            protocol: opts.protocol,
        };
        this.transport = opts.transport ?? new SerialPortTransport({
            path: this.options.portPath,
            baudRate: this.options.baudRate,
        });
    }
    async open() {
        if (this.isOpen)
            return;
        try {
            await this.transport.open();
            this.transport.onData(this.handleTransportData);
            this.transport.onClose(this.onTransportClose);
            this.transport.onError(this.onTransportError);
            this.isOpen = true;
            this.responseBuffer = '';
            this.pendingResponse = undefined;
            await this.initialiseAdapter();
        }
        catch (error) {
            await this.safeTransportTeardown();
            throw error;
        }
    }
    async close() {
        this.stopKeepAlive();
        if (!this.isOpen) {
            return;
        }
        this.transport.offData(this.handleTransportData);
        this.transport.offClose(this.onTransportClose);
        this.transport.offError(this.onTransportError);
        await this.transport.close();
        this.handleTransportClosed();
    }
    async cmd(command) {
        const run = async () => {
            if (!this.isOpen)
                throw new Error('Transport not open');
            const startedAt = Date.now();
            this.metrics = {
                ...this.metrics,
                totalCommands: this.metrics.totalCommands + 1,
                lastCommand: command,
                lastUpdatedAt: new Date().toISOString(),
            };
            const responsePromise = this.waitForResponse();
            try {
                await this.transport.write(`${command}\r`);
                const response = await responsePromise;
                const duration = Date.now() - startedAt;
                const successfulCommands = this.metrics.successfulCommands + 1;
                const averageLatencyMs = successfulCommands === 0
                    ? 0
                    : ((this.metrics.averageLatencyMs * this.metrics.successfulCommands) + duration) / successfulCommands;
                this.metrics = {
                    ...this.metrics,
                    successfulCommands,
                    averageLatencyMs,
                    lastDurationMs: duration,
                    lastError: undefined,
                    lastUpdatedAt: new Date().toISOString(),
                };
                this.emit('command', { command, durationMs: duration, ok: true });
                return response;
            }
            catch (error) {
                const duration = Date.now() - startedAt;
                const message = error instanceof Error ? error.message : String(error);
                const isTimeout = message.toLowerCase().includes('timeout');
                this.metrics = {
                    ...this.metrics,
                    failedCommands: this.metrics.failedCommands + 1,
                    timeouts: this.metrics.timeouts + (isTimeout ? 1 : 0),
                    lastDurationMs: duration,
                    lastError: message,
                    lastUpdatedAt: new Date().toISOString(),
                };
                this.emit('command', { command, durationMs: duration, ok: false, error: message });
                throw error;
            }
        };
        const result = this.commandQueue.then(run, run);
        this.commandQueue = result
            .then(() => undefined)
            .catch(() => undefined);
        return result;
    }
    async readDtc() {
        try {
            // Mode 03 — stored DTC
            const resp = await this.cmd('03');
            const codes = parseDtcFromResponse(resp).map(c => {
                const meta = describeDtc(c.code);
                return { ...c, description: meta.description, severity: meta.severity, status: c.status };
            });
            return { ok: true, data: codes };
        }
        catch (e) {
            return { ok: false, error: e.message || String(e) };
        }
    }
    async clearDtc() {
        try {
            // Mode 04 — clear DTC
            await this.cmd('04');
            return { ok: true, data: null };
        }
        catch (e) {
            return { ok: false, error: e.message || String(e) };
        }
    }
    async readStatus() {
        try {
            const resp = await this.cmd('0101');
            const parsed = parseStatusFromResponse(resp);
            if (!parsed)
                return { ok: false, error: 'No status data' };
            return { ok: true, data: parsed };
        }
        catch (e) {
            return { ok: false, error: e.message || String(e) };
        }
    }
    async readLiveData() {
        try {
            const [p0C, p05, p0F, p0D, p42, p11] = await Promise.all([
                this.readPid('0C'),
                this.readPid('05'),
                this.readPid('0F'),
                this.readPid('0D'),
                this.readPid('42'),
                this.readPid('11'),
            ]);
            const data = {
                rpm: p0C != null ? parsePidValue('0C', p0C) : undefined,
                coolantTempC: p05 != null ? parsePidValue('05', p05) : undefined,
                intakeTempC: p0F != null ? parsePidValue('0F', p0F) : undefined,
                vehicleSpeedKmh: p0D != null ? parsePidValue('0D', p0D) : undefined,
                batteryVoltageV: p42 != null ? parsePidValue('42', p42) : undefined,
                throttlePosPercent: p11 != null ? parsePidValue('11', p11) : undefined,
            };
            return { ok: true, data };
        }
        catch (e) {
            return { ok: false, error: e.message || String(e) };
        }
    }
    async readPid(pid) {
        const resp = await this.cmd(`01${pid}`);
        return extractMode01Payload(pid, resp);
    }
    async identify() {
        try {
            const resp = await this.cmd('ATI');
            return resp.trim();
        }
        catch (error) {
            throw new Error(`Failed to identify adapter: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    startKeepAlive(intervalMs = 45000) {
        this.stopKeepAlive();
        if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
            return;
        }
        this.keepAliveTimer = setInterval(() => {
            this.cmd('0100').catch(() => {
                // swallow errors; watchdog/self-check will surface persistent failures
            });
        }, intervalMs);
    }
    stopKeepAlive() {
        if (this.keepAliveTimer) {
            clearInterval(this.keepAliveTimer);
            this.keepAliveTimer = undefined;
        }
    }
    async initialiseAdapter() {
        // Basic init sequence per ELM327
        await this.cmd('ATZ'); // reset
        await this.cmd('ATE0'); // echo off
        await this.cmd('ATL0'); // linefeeds off
        await this.cmd('ATS0'); // spaces off
        await this.cmd('ATH1'); // headers on (optional)
        // Протокольная инициализация с профилем или вручную
        if (this.options.protocol) {
            // Ручное указание протокола переопределяет профиль
            const protocolCmd = getProtocolCommand(this.options.protocol);
            await this.cmd(protocolCmd);
            this.metrics.protocolUsed = this.options.protocol;
        }
        else {
            // Используем профиль (по умолчанию 'auto')
            const profile = getProtocolProfile(this.options.protocolProfile);
            // Выполняем дополнительные команды инициализации профиля
            if (profile.initCommands) {
                for (const cmd of profile.initCommands) {
                    try {
                        await this.cmd(cmd);
                    }
                    catch (error) {
                        // Логируем, но не падаем на дополнительных командах
                        console.warn(`[elm327] optional init command failed: ${cmd}`, error);
                    }
                }
            }
            // Пробуем протоколы из профиля по приоритету
            let protocolSet = false;
            for (const protocol of profile.protocols) {
                try {
                    const protocolCmd = getProtocolCommand(protocol);
                    await this.cmd(protocolCmd);
                    // Проверяем, что протокол работает, запросив базовый PID
                    const testResp = await this.cmd('0100');
                    if (testResp && !testResp.includes('UNABLE TO CONNECT') && !testResp.includes('NO DATA')) {
                        this.metrics.protocolUsed = protocol;
                        protocolSet = true;
                        break;
                    }
                }
                catch (error) {
                    // Продолжаем пробовать следующий протокол
                    continue;
                }
            }
            if (!protocolSet) {
                // Fallback на автоопределение, если ничего не подошло
                await this.cmd('ATSP0');
                this.metrics.protocolUsed = 'auto';
            }
        }
        if (this.options.keepAliveIntervalMs > 0) {
            this.startKeepAlive(this.options.keepAliveIntervalMs);
        }
    }
    waitForResponse() {
        return new Promise((resolve, reject) => {
            if (this.pendingResponse) {
                this.pendingResponse.reject(new Error('Previous response pending'));
                clearTimeout(this.pendingResponse.timer);
            }
            const timer = setTimeout(() => {
                if (this.pendingResponse && this.pendingResponse.timer === timer) {
                    this.pendingResponse = undefined;
                }
                reject(new Error('Timeout'));
            }, this.options.timeoutMs);
            this.pendingResponse = {
                resolve: (value) => {
                    clearTimeout(timer);
                    this.pendingResponse = undefined;
                    resolve(value);
                },
                reject: (error) => {
                    clearTimeout(timer);
                    this.pendingResponse = undefined;
                    reject(error);
                },
                timer,
            };
            this.flushBuffer();
        });
    }
    flushBuffer() {
        if (!this.pendingResponse)
            return;
        const delimiterIndex = this.responseBuffer.indexOf('>');
        if (delimiterIndex === -1)
            return;
        const rawResponse = this.responseBuffer.slice(0, delimiterIndex);
        const remainder = this.responseBuffer.slice(delimiterIndex + 1);
        this.responseBuffer = remainder;
        const sanitized = rawResponse
            .split(/\n+/)
            .map(line => line.trim())
            .filter(Boolean)
            .join(' ')
            .trim();
        this.pendingResponse?.resolve(sanitized);
    }
    async safeTransportTeardown() {
        try {
            this.transport.offData(this.handleTransportData);
            this.transport.offClose(this.onTransportClose);
            this.transport.offError(this.onTransportError);
        }
        catch {
            // ignore listener cleanup errors
        }
        try {
            await this.transport.close();
        }
        catch {
            // ignore close errors
        }
        this.handleTransportClosed();
    }
    handleTransportClosed(error) {
        if (!this.isOpen) {
            this.responseBuffer = '';
            this.commandQueue = Promise.resolve();
            return;
        }
        try {
            this.transport.offData(this.handleTransportData);
            this.transport.offClose(this.onTransportClose);
            this.transport.offError(this.onTransportError);
        }
        catch {
            // ignore listener cleanup errors
        }
        this.isOpen = false;
        this.stopKeepAlive();
        this.responseBuffer = '';
        const pending = this.pendingResponse;
        if (pending) {
            pending.reject(error ?? new Error('Transport closed'));
        }
        this.pendingResponse = undefined;
        this.commandQueue = Promise.resolve();
        this.metrics = {
            ...this.metrics,
            lastError: error?.message ?? 'Transport closed',
            lastUpdatedAt: new Date().toISOString(),
        };
        this.emit('disconnect');
    }
    handleTransportError(error) {
        this.emit('error', error);
        this.handleTransportClosed(error);
    }
    getMetrics() {
        return { ...this.metrics };
    }
}
// --- helpers ---
function parseDtcFromResponse(resp) {
    // Basic parser for lines like: 43 01 33 00 00 00 or with headers
    // We'll strip non-hex and decode 2 bytes -> one DTC
    const hex = resp
        .split(/\s+/)
        .filter(x => /^[0-9A-Fa-f]{2}$/.test(x))
        .map(x => x.toUpperCase());
    // Look for a line starting with 43 (Mode 03 response)
    // Many adapters include multiple lines; just parse all bytes after first 43 occurrence
    const idx = hex.indexOf('43');
    if (idx === -1)
        return [];
    const data = hex.slice(idx + 1);
    const dtcs = [];
    for (let i = 0; i + 1 < data.length; i += 2) {
        const A = parseInt(data[i], 16);
        const B = parseInt(data[i + 1], 16);
        const code = decodeDtc(A, B);
        if (code !== 'P0000')
            dtcs.push({ code });
    }
    return dtcs;
}
function decodeDtc(A, B) {
    // Per SAE J2012: first two bytes encode one DTC
    const firstNibble = (A & 0xC0) >> 6; // 2 bits
    const secondNibble = (A & 0x30) >> 4;
    const thirdNibble = A & 0x0F;
    const fourthNibble = (B & 0xF0) >> 4;
    const fifthNibble = B & 0x0F;
    const system = ['P', 'C', 'B', 'U'][firstNibble] ?? 'P';
    return `${system}${secondNibble}${thirdNibble}${fourthNibble}${fifthNibble}`;
}
function parseStatusFromResponse(resp) {
    const hex = resp
        .split(/\s+/)
        .filter(x => /^[0-9A-Fa-f]{2}$/.test(x))
        .map(x => x.toUpperCase());
    const idx = hex.indexOf('41');
    if (idx === -1)
        return null;
    if (hex[idx + 1] !== '01')
        return null;
    const bytes = hex.slice(idx + 2).map(x => parseInt(x, 16));
    if (bytes.length < 4)
        return null;
    const [A, B, C, D] = bytes;
    const milOn = (A & 0x80) === 0x80;
    const dtcCount = A & 0x7f;
    const sparkEngine = (B & 0x08) === 0; // bit3 indicates spark or compression
    const readiness = decodeReadiness({ B, C, D, sparkEngine });
    return { milOn, dtcCount, readiness };
}
function extractMode01Payload(pid, resp) {
    const targetPid = pid.toUpperCase();
    const hex = resp
        .split(/\s+/)
        .filter(x => /^[0-9A-Fa-f]{2}$/.test(x))
        .map(x => x.toUpperCase());
    for (let i = 0; i < hex.length - 2; i++) {
        if (hex[i] === '41' && hex[i + 1] === targetPid) {
            return hex.slice(i + 2).join(' ');
        }
    }
    return null;
}
function parseRpm(payload) {
    const [A, B] = payload.split(' ').map(x => parseInt(x, 16));
    if (Number.isNaN(A) || Number.isNaN(B))
        return NaN;
    return ((A * 256) + B) / 4;
}
function parseTemperature(payload) {
    const A = parseInt(payload.split(' ')[0], 16);
    if (Number.isNaN(A))
        return NaN;
    return A - 40;
}
function parseSpeed(payload) {
    const A = parseInt(payload.split(' ')[0], 16);
    if (Number.isNaN(A))
        return NaN;
    return A;
}
function parseVoltage(payload) {
    const parts = payload.split(' ').map(x => parseInt(x, 16));
    if (parts.length < 2 || parts.some(Number.isNaN))
        return NaN;
    return ((parts[0] * 256) + parts[1]) / 1000;
}
function parseThrottle(payload) {
    const A = parseInt(payload.split(' ')[0], 16);
    if (Number.isNaN(A))
        return NaN;
    return (A * 100) / 255;
}
function decodeReadiness({ B, C, D, sparkEngine }) {
    // Continuous monitors (always the same bits)
    const misfire = (B & 0x01) === 0;
    const fuelSystem = (B & 0x02) === 0;
    const components = (B & 0x04) === 0;
    // For spark vs compression engines different mapping for C & D
    if (sparkEngine) {
        return {
            misfire,
            fuelSystem,
            components,
            catalyst: (C & 0x01) === 0,
            heatedCatalyst: (C & 0x02) === 0,
            evapSystem: (C & 0x04) === 0,
            secondaryAirSystem: (C & 0x08) === 0,
            acRefrigerant: (C & 0x10) === 0,
            oxygenSensor: (C & 0x20) === 0,
            oxygenSensorHeater: (C & 0x40) === 0,
            egrSystem: (C & 0x80) === 0,
        };
    }
    // Compression-ignition (diesel)
    return {
        misfire,
        fuelSystem,
        components,
        catalyst: (D & 0x01) === 0,
        heatedCatalyst: (D & 0x02) === 0,
        evapSystem: (D & 0x04) === 0,
        secondaryAirSystem: true,
        acRefrigerant: (D & 0x08) === 0,
        oxygenSensor: (D & 0x10) === 0,
        oxygenSensorHeater: true,
        egrSystem: (D & 0x20) === 0,
    };
}
