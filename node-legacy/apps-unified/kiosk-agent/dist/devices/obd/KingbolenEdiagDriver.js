/**
 * DEPRECATED: локальный драйвер Ediag.
 * Источник истины перемещён в пакет `@selfservice/obd-diagnostics`.
 * Этот файл сохранён для обратной совместимости и реэкспортирует актуальные сущности.
 */
export * from '@selfservice/obd-diagnostics';
/**
 * KingbolenEdiagDriver.ts — Драйвер для KINGBOLEN Ediag Plus (BLE версия)
 *
 * Использует @abandonware/noble для BLE коммуникации.
 * Поддерживает CAN-FD режим через команду AT#2.
 */
import { EventEmitter } from 'events';
import { describeDtc } from './dtcDescriptions.js';
// BLE стек: сначала пробуем noble-winrt (Windows), затем @abandonware/noble
let noble = null;
async function loadNoble() {
    if (noble !== null)
        return noble;
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        noble = require('noble-winrt');
        if (process.env.OBD_BLE_DEBUG)
            console.log('[KingbolenEdiag] Используется noble-winrt');
        return noble;
    }
    catch (e1) {
        try {
            const nobleModule = await import('@abandonware/noble');
            noble = nobleModule.default ?? nobleModule;
            if (process.env.OBD_BLE_DEBUG)
                console.log('[KingbolenEdiag] Используется @abandonware/noble');
            return noble;
        }
        catch (e2) {
            console.warn('[KingbolenEdiag] BLE стек noble недоступен', { e1: String(e1), e2: String(e2) });
            noble = false;
            return false;
        }
    }
}
export class KingbolenEdiagDriver extends EventEmitter {
    constructor(options = {}) {
        super();
        this.connected = false;
        this.commandQueue = [];
        this.responseBuffer = '';
        this.metrics = {
            totalCommands: 0,
            successfulCommands: 0,
            failedCommands: 0,
            timeouts: 0,
            averageLatencyMs: 0,
            lastCommand: '',
            lastDurationMs: 0,
            lastUpdatedAt: new Date().toISOString(),
        };
        this.options = {
            deviceName: options.deviceName ?? 'KINGBOLEN',
            // Стандартные BLE UUID для OBD-II адаптеров (могут отличаться для конкретного устройства)
            serviceUUID: options.serviceUUID ?? '0000ffe0-0000-1000-8000-00805f9b34fb',
            txCharacteristicUUID: options.txCharacteristicUUID ?? '0000ffe1-0000-1000-8000-00805f9b34fb',
            rxCharacteristicUUID: options.rxCharacteristicUUID ?? '0000ffe1-0000-1000-8000-00805f9b34fb',
            timeoutMs: options.timeoutMs ?? 5000,
            autoReconnect: options.autoReconnect ?? false,
            canFdEnabled: options.canFdEnabled ?? true,
        };
    }
    async connect() {
        if (this.connected)
            return true;
        const nobleInstance = await loadNoble();
        if (!nobleInstance) {
            throw new Error('BLE стек noble не доступен - установите noble-winrt или @abandonware/noble');
        }
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                try {
                    noble.stopScanning();
                }
                catch (e) {
                    void e;
                }
                this.cleanupNobleListeners();
                reject(new Error(`Таймаут поиска устройства ${this.options.deviceName} (${this.options.timeoutMs}ms)`));
            }, this.options.timeoutMs);
            // Обёртка очистки слушателей noble
            const onDone = (ok, err) => {
                clearTimeout(timeout);
                try {
                    noble.stopScanning();
                }
                catch (e) {
                    void e;
                }
                this.cleanupNobleListeners();
                if (ok)
                    resolve(true);
                else
                    reject(err ?? new Error('Неизвестная ошибка подключения'));
            };
            this.nobleStateChangeHandler = (state) => {
                if (process.env.OBD_BLE_DEBUG)
                    console.log('[KingbolenEdiag] stateChange:', state);
                if (state === 'poweredOn') {
                    const scanServices = this.computeScanServices();
                    const useFilter = process.env.OBD_BLE_SCAN_FILTER === '1';
                    const services = useFilter ? scanServices : [];
                    try {
                        noble.startScanning(services, false);
                        if (process.env.OBD_BLE_DEBUG)
                            console.log('[KingbolenEdiag] startScanning', services);
                    }
                    catch (e) {
                        void e;
                    }
                }
            };
            noble.once('stateChange', this.nobleStateChangeHandler);
            this.nobleDiscoverHandler = async (peripheral) => {
                const adv = peripheral.advertisement || {};
                const name = adv?.localName || '';
                const svcUuids = (adv?.serviceUuids || []).map((u) => (u?.toLowerCase?.() || u));
                const upper = (s) => s?.toUpperCase?.() || s;
                const wanted16 = this.shortUuid(this.options.serviceUUID);
                const matchName = upper(name).includes('EDIAG') || upper(name).includes(this.options.deviceName.toUpperCase()) || upper(name).includes('OBD') || upper(name).includes('VCI');
                const matchSvc = wanted16 ? svcUuids.includes(wanted16) : false;
                if (process.env.OBD_BLE_DEBUG)
                    console.log('[KingbolenEdiag] discover:', { name, rssi: peripheral.rssi, serviceUuids: svcUuids });
                if (matchName || matchSvc) {
                    clearTimeout(timeout);
                    try {
                        noble.stopScanning();
                    }
                    catch (e) {
                        void e;
                    }
                    try {
                        await this.connectToPeripheral(peripheral);
                        await this.initialize();
                        this.connected = true;
                        this.emit('connected', { uuid: peripheral.uuid, name });
                        onDone(true);
                    }
                    catch (error) {
                        onDone(false, new Error(`Ошибка подключения: ${error.message}`));
                    }
                }
            };
            noble.once('discover', this.nobleDiscoverHandler);
            if (noble.state === 'poweredOn') {
                const scanServices = this.computeScanServices();
                const useFilter = process.env.OBD_BLE_SCAN_FILTER === '1';
                const services = useFilter ? scanServices : [];
                try {
                    noble.startScanning(services, false);
                    if (process.env.OBD_BLE_DEBUG)
                        console.log('[KingbolenEdiag] startScanning (immediate)', services);
                }
                catch (e) {
                    void e;
                }
            }
        });
    }
    connectToPeripheral(peripheral) {
        this.peripheral = peripheral;
        return new Promise((resolve, reject) => {
            (async () => {
                try {
                    if (typeof peripheral.connectAsync === 'function') {
                        await peripheral.connectAsync();
                    }
                    else {
                        await new Promise((res, rej) => peripheral.connect((err) => err ? rej(err) : res()));
                    }
                    const svc = this.shortUuid(this.options.serviceUUID) ?? this.stripUuid(this.options.serviceUUID);
                    const tx = this.shortUuid(this.options.txCharacteristicUUID) ?? this.stripUuid(this.options.txCharacteristicUUID);
                    const rx = this.shortUuid(this.options.rxCharacteristicUUID) ?? this.stripUuid(this.options.rxCharacteristicUUID);
                    const { characteristics } = await peripheral.discoverSomeServicesAndCharacteristicsAsync([svc], [tx, rx]);
                    this.txCharacteristic = characteristics.find((c) => c.uuid === tx);
                    this.rxCharacteristic = characteristics.find((c) => c.uuid === rx);
                    if (!this.txCharacteristic || !this.rxCharacteristic) {
                        throw new Error('Не найдены характеристики TX/RX для коммуникации');
                    }
                    if (typeof this.rxCharacteristic.subscribeAsync === 'function') {
                        await this.rxCharacteristic.subscribeAsync();
                    }
                    else {
                        await new Promise((res, rej) => this.rxCharacteristic.subscribe((err) => err ? rej(err) : res()));
                    }
                    this.rxDataHandler = (data) => { this.handleData(data.toString()); };
                    this.rxCharacteristic.on('data', this.rxDataHandler);
                    this.peripheralDisconnectHandler = () => {
                        this.handleClosed();
                    };
                    peripheral.on('disconnect', this.peripheralDisconnectHandler);
                    resolve();
                }
                catch (error) {
                    reject(new Error(`Ошибка подключения к peripheral: ${error.message}`));
                }
            })();
        });
    }
    computeScanServices() {
        const short = this.shortUuid(this.options.serviceUUID);
        return short ? [short] : [];
    }
    shortUuid(uuid) {
        if (!uuid)
            return undefined;
        const m = uuid.toLowerCase().match(/^0000([0-9a-f]{4})-0000-1000-8000-00805f9b34fb$/);
        if (m)
            return m[1];
        if (/^[0-9a-f]{4}$/.test(uuid))
            return uuid.toLowerCase();
        return undefined;
    }
    stripUuid(uuid) {
        return uuid.replace(/-/g, '').toLowerCase();
    }
    async initialize() {
        try {
            await this.sendCommand('ATZ');
            await new Promise((resolve) => setTimeout(resolve, 1000));
            await this.sendCommand('ATE0');
            await this.sendCommand('ATL1');
            await this.sendCommand('ATS0');
            await this.sendCommand('ATH1');
            await this.sendCommand('ATSP0');
            if (this.options.canFdEnabled) {
                try {
                    await this.sendCommand('AT#2');
                }
                catch (err) {
                    console.warn('[KingbolenEdiag] CAN-FD не поддерживается или команда отклонена');
                }
            }
            try {
                const deviceInfo = await this.sendCommand('AT#1');
                this.metrics.firmwareVersion = deviceInfo.trim();
            }
            catch (err) {
                console.warn('[KingbolenEdiag] Не удалось получить информацию об устройстве');
            }
            try {
                await this.sendCommand('ATRV');
            }
            catch (err) {
                console.warn('[KingbolenEdiag] Не удалось получить напряжение бортсети');
            }
            try {
                const protocol = await this.sendCommand('ATDPN');
                this.metrics.protocolUsed = protocol.trim();
            }
            catch (err) {
                console.warn('[KingbolenEdiag] Не удалось определить используемый протокол');
            }
        }
        catch (error) {
            throw new Error(`Ошибка инициализации: ${error.message}`);
        }
    }
    async sendCommand(command, timeoutMs) {
        const timeout = timeoutMs ?? this.options.timeoutMs;
        const startTime = Date.now();
        return new Promise((resolve, reject) => {
            this.commandQueue.push({ resolve, reject, command });
            if (this.commandQueue.length === 1) {
                this.processNextCommand(timeout, startTime);
            }
        });
    }
    async processNextCommand(timeout, startTime) {
        if (this.commandQueue.length === 0 || this.pendingResponse)
            return;
        const { resolve, reject, command } = this.commandQueue[0];
        try {
            const buffer = Buffer.from(`${command}\r`);
            await this.txCharacteristic.writeAsync(buffer, false);
            this.metrics.totalCommands++;
            this.metrics.lastCommand = command;
            this.pendingResponse = {
                resolve: (response) => {
                    const duration = Date.now() - startTime;
                    this.metrics.successfulCommands++;
                    this.metrics.lastDurationMs = duration;
                    this.metrics.averageLatencyMs =
                        (this.metrics.averageLatencyMs * (this.metrics.totalCommands - 1) + duration) / this.metrics.totalCommands;
                    this.metrics.lastUpdatedAt = new Date().toISOString();
                    this.commandQueue.shift();
                    resolve(response);
                    this.pendingResponse = undefined;
                    if (this.commandQueue.length > 0) {
                        this.processNextCommand(timeout, Date.now());
                    }
                },
                reject: (error) => {
                    this.metrics.failedCommands++;
                    this.metrics.lastError = error.message;
                    this.metrics.lastUpdatedAt = new Date().toISOString();
                    this.commandQueue.shift();
                    reject(error);
                    this.pendingResponse = undefined;
                    if (this.commandQueue.length > 0) {
                        this.processNextCommand(timeout, Date.now());
                    }
                },
                timeout: setTimeout(() => {
                    this.metrics.timeouts++;
                    this.metrics.failedCommands++;
                    this.metrics.lastError = 'Timeout';
                    this.metrics.lastUpdatedAt = new Date().toISOString();
                    this.commandQueue.shift();
                    reject(new Error(`Timeout waiting for response to: ${command}`));
                    this.pendingResponse = undefined;
                    if (this.commandQueue.length > 0) {
                        this.processNextCommand(timeout, Date.now());
                    }
                }, timeout),
            };
        }
        catch (error) {
            this.metrics.failedCommands++;
            this.metrics.lastError = error.message;
            this.commandQueue.shift();
            reject(new Error(`Ошибка отправки команды: ${error.message}`));
            if (this.commandQueue.length > 0) {
                this.processNextCommand(timeout, Date.now());
            }
        }
    }
    handleData(data) {
        this.responseBuffer += data;
        if (this.responseBuffer.includes('>')) {
            const response = this.responseBuffer
                .split('>')[0]
                .trim()
                .replace(/\r\n/g, '\n');
            this.responseBuffer = '';
            if (this.pendingResponse) {
                clearTimeout(this.pendingResponse.timeout);
                this.pendingResponse.resolve(response);
            }
        }
    }
    handleClosed() {
        this.connected = false;
        // Очистить слушатели peripheral/characteristic
        this.cleanupPeripheralListeners();
        this.emit('disconnect');
        if (this.options.autoReconnect) {
            setTimeout(() => {
                this.connect().catch((e) => {
                    console.error('[KingbolenEdiag] Ошибка переподключения:', e);
                });
            }, 5000);
        }
    }
    handleError(error) {
        this.emit('error', error);
    }
    async readDTC() {
        try {
            const response = await this.sendCommand('03');
            const dtcs = this.parseDTC(response);
            return {
                ok: true,
                data: dtcs.map((code) => ({
                    code,
                    description: describeDtc(code).description,
                    status: 'current',
                    severity: describeDtc(code).severity,
                })),
            };
        }
        catch (error) {
            return { ok: false, error: error.message };
        }
    }
    async clearDTC() {
        try {
            const response = await this.sendCommand('04');
            const success = response.includes('OK') || response.includes('44');
            return { ok: true, data: success };
        }
        catch (error) {
            return { ok: false, error: error.message };
        }
    }
    async readStatus() {
        try {
            const response = await this.sendCommand('0101');
            const bytes = this.parseHexResponse(response);
            if (bytes.length < 4) {
                throw new Error('Недостаточно данных в ответе');
            }
            const mil = (bytes[0] & 0x80) !== 0;
            const dtcCount = bytes[0] & 0x7f;
            const readiness = {
                misfire: (bytes[1] & 0x01) === 0,
                fuel: (bytes[1] & 0x02) === 0,
                components: (bytes[1] & 0x04) === 0,
                catalyst: (bytes[2] & 0x01) === 0,
                heatedCatalyst: (bytes[2] & 0x02) === 0,
                evaporative: (bytes[2] & 0x04) === 0,
                secondaryAir: (bytes[2] & 0x08) === 0,
                acRefrigerant: (bytes[2] & 0x10) === 0,
                oxygenSensor: (bytes[2] & 0x20) === 0,
                oxygenHeater: (bytes[2] & 0x40) === 0,
                egrVvt: (bytes[2] & 0x80) === 0,
            };
            return { ok: true, data: { mil, dtcCount, readiness } };
        }
        catch (error) {
            return { ok: false, error: error.message };
        }
    }
    async readLiveData() {
        try {
            const [rpm, coolant, intake, speed, voltage, throttle] = await Promise.all([
                this.readPID('0C'),
                this.readPID('05'),
                this.readPID('0F'),
                this.readPID('0D'),
                this.readPID('42'),
                this.readPID('11'),
            ]);
            return {
                ok: true,
                data: {
                    rpm: this.decodePID('0C', rpm),
                    coolantTemp: this.decodePID('05', coolant),
                    intakeTemp: this.decodePID('0F', intake),
                    speed: this.decodePID('0D', speed),
                    voltage: this.decodePID('42', voltage),
                    throttle: this.decodePID('11', throttle),
                },
            };
        }
        catch (error) {
            return { ok: false, error: error.message };
        }
    }
    async readToyotaHybrid() {
        try {
            const [soc, mg1, mg2, transTemp, gear, egr, catalyst] = await Promise.all([
                this.readPID('D2'),
                this.readPID('D3'),
                this.readPID('D4'),
                this.readPID('E4'),
                this.readPID('A4'),
                this.readPID('F0'),
                this.readPID('F1'),
            ]);
            return {
                ok: true,
                data: {
                    battery_soc: this.decodePID('D2', soc),
                    mg1_rpm: this.decodePID('D3', mg1),
                    mg2_rpm: this.decodePID('D4', mg2),
                    trans_temp: this.decodePID('E4', transTemp),
                    gear_position: this.decodePID('A4', gear),
                    egr_position: this.decodePID('F0', egr),
                    catalyst_temp: this.decodePID('F1', catalyst),
                },
            };
        }
        catch (error) {
            return { ok: false, error: error.message };
        }
    }
    async readPID(pid) {
        return this.sendCommand(`01${pid}`);
    }
    decodePID(pid, response) {
        const bytes = this.parseHexResponse(response);
        if (bytes.length === 0)
            return 0;
        switch (pid) {
            case '0C':
                return bytes.length >= 2 ? ((bytes[0] * 256 + bytes[1]) / 4).toFixed(0) : 0;
            case '05':
            case '0F':
                return bytes[0] - 40;
            case '0D':
                return bytes[0];
            case '42':
                return bytes.length >= 2 ? ((bytes[0] * 256 + bytes[1]) / 1000).toFixed(2) : 0;
            case '11':
                return ((bytes[0] / 255) * 100).toFixed(1);
            case 'D2':
                return ((bytes[0] / 255) * 100).toFixed(1);
            case 'D3':
            case 'D4':
                return bytes.length >= 2 ? (bytes[0] * 256 + bytes[1]) - 32768 : 0;
            case 'E4':
                return bytes[0] - 40;
            case 'A4': {
                const gearMap = { 0: 'P', 1: 'R', 2: 'N', 3: 'D', 4: 'B' };
                return gearMap[bytes[0]] || 'Unknown';
            }
            case 'F0':
            case 'F1':
                return ((bytes[0] / 255) * 100).toFixed(1);
            default:
                return bytes[0];
        }
    }
    parseDTC(response) {
        const dtcPattern = /43\s?([0-9A-F]{2})\s?([0-9A-F]{2})/gi;
        const matches = [...response.matchAll(dtcPattern)];
        return matches.map((match) => {
            const high = parseInt(match[1], 16);
            const low = parseInt(match[2], 16);
            const prefixMap = { 0: 'P', 1: 'C', 2: 'B', 3: 'U' };
            const prefix = prefixMap[(high >> 6) & 0x03] || 'P';
            const code = `${prefix}${((high & 0x3f) << 8 | low).toString(16).toUpperCase().padStart(4, '0')}`;
            return code;
        });
    }
    parseHexResponse(response) {
        const hex = response.replace(/\s+/g, '').replace(/^41[0-9A-F]{2}/, '');
        const bytes = [];
        for (let i = 0; i < hex.length; i += 2) {
            const byte = parseInt(hex.substr(i, 2), 16);
            if (!isNaN(byte))
                bytes.push(byte);
        }
        return bytes;
    }
    async identify() {
        try {
            const vinResponse = await this.sendCommand('0902');
            const vin = vinResponse.replace(/\s+/g, '').replace(/^49/, '').replace(/[^A-Z0-9]/g, '');
            return `KINGBOLEN Ediag Plus\nFirmware: ${this.metrics.firmwareVersion || 'Unknown'}\nVIN: ${vin || 'Not available'}`;
        }
        catch (error) {
            return `KINGBOLEN Ediag Plus\nFirmware: ${this.metrics.firmwareVersion || 'Unknown'}\nVIN: Error reading VIN`;
        }
    }
    async disconnect() {
        if (this.peripheral) {
            try {
                // Сначала отписаться и снять слушателей
                this.cleanupPeripheralListeners();
                await this.peripheral.disconnectAsync();
            }
            catch (e) {
                void e;
            }
            this.connected = false;
            this.emit('disconnect');
        }
        // Остановить возможное сканирование и снять слушателей noble
        try {
            noble.stopScanning();
        }
        catch (e) {
            void e;
        }
        this.cleanupNobleListeners();
    }
    getMetrics() {
        return { ...this.metrics };
    }
    // Утилиты очистки слушателей, чтобы не накапливались и не возникали MaxListeners
    cleanupNobleListeners() {
        if (this.nobleStateChangeHandler) {
            try {
                noble.removeListener('stateChange', this.nobleStateChangeHandler);
            }
            catch (e) {
                void e;
            }
            this.nobleStateChangeHandler = undefined;
        }
        if (this.nobleDiscoverHandler) {
            try {
                noble.removeListener('discover', this.nobleDiscoverHandler);
            }
            catch (e) {
                void e;
            }
            this.nobleDiscoverHandler = undefined;
        }
    }
    cleanupPeripheralListeners() {
        if (this.rxCharacteristic && this.rxDataHandler) {
            try {
                this.rxCharacteristic.removeListener('data', this.rxDataHandler);
            }
            catch (e) {
                void e;
            }
        }
        if (this.rxCharacteristic && this.rxCharacteristic.unsubscribeAsync) {
            try {
                this.rxCharacteristic.unsubscribeAsync();
            }
            catch (e) {
                void e;
            }
        }
        if (this.peripheral && this.peripheralDisconnectHandler) {
            try {
                this.peripheral.removeListener('disconnect', this.peripheralDisconnectHandler);
            }
            catch (e) {
                void e;
            }
        }
        this.rxDataHandler = undefined;
        this.peripheralDisconnectHandler = undefined;
    }
    /** Полное завершение активности драйвера (для тестовой среды) */
    async shutdown() {
        try {
            if (this.peripheral) {
                this.cleanupPeripheralListeners();
                await this.peripheral.disconnectAsync();
            }
        }
        catch (e) {
            void e;
        }
        try {
            noble.stopScanning();
        }
        catch (e) {
            void e;
        }
        this.cleanupNobleListeners();
        this.connected = false;
    }
}
