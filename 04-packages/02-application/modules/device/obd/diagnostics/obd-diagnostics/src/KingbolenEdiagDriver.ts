/*
 * KingbolenEdiagDriver.ts — Драйвер для KINGBOLEN Ediag Plus (BLE версия)
 * Использует @abandonware/noble (или noble-winrt) для BLE коммуникации.
 * Поддерживает CAN-FD режим через команду AT#2.
 */

import { EventEmitter } from 'events';
import { describeDtc, DtcSeverity } from './dtcDescriptions.js';
import type { ObdMode, PidIdentifier, DtcCode } from './database/types.js';

// BLE библиотека для Node.js (Windows: предпочитаем noble-winrt)
let noble: any = null;
async function loadNoble(): Promise<any> {
  if (noble !== null) return noble;
  // Сначала пытаемся noble-winrt (Windows стек), затем @abandonware/noble
  try {
    // Попытка загрузить noble-winrt в окружении ESM через createRequire
    try {
      const mod = (await import('module')) as any;
      const req = mod?.createRequire ? mod.createRequire(import.meta.url) : undefined;
      if (req) {
        noble = req('noble-winrt');
        if (process.env.OBD_BLE_DEBUG) console.log('[KingbolenEdiag] Используется noble-winrt (createRequire)');
        return noble;
      }
    } catch (eCreateReq) {
      // no-op, попробуем dynamic import ниже
    }
    // Фолбэк: динамический import (если пакет поддерживает его напрямую)
    const winrtModule: any = await import('noble-winrt');
    noble = winrtModule?.default ?? winrtModule;
    if (process.env.OBD_BLE_DEBUG) console.log('[KingbolenEdiag] Используется noble-winrt (dynamic import)');
    return noble;
  } catch (e1) {
    try {
      const nobleModule = await import('@abandonware/noble');
      noble = (nobleModule as any).default ?? nobleModule;
      if (process.env.OBD_BLE_DEBUG) console.log('[KingbolenEdiag] Используется @abandonware/noble');
      return noble;
    } catch (e2) {
      console.warn('[KingbolenEdiag] BLE стек noble недоступен', { e1: String(e1), e2: String(e2) });
      noble = false;
      return false;
    }
  }
}

// Типы
export interface ObdDtc {
  code: string;
  description?: string;
  status?: 'current' | 'pending' | 'permanent';
  severity?: DtcSeverity;
}

export interface ObdResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

export interface ObdStatus {
  mil: boolean;
  dtcCount: number;
  readiness: Record<string, boolean>;
}

export interface ObdLiveData {
  rpm: number;
  coolantTemp: number;
  intakeTemp: number;
  speed: number;
  voltage: number;
  throttle: number;
}

export interface ToyotaHybridData {
  battery_soc: number;
  mg1_rpm: number;
  mg2_rpm: number;
  trans_temp: number;
  gear_position: string;
  egr_position: number;
  catalyst_temp: number;
}

export interface KingbolenEdiagOptions {
  deviceName?: string;
  /** MAC/UUID адрес BLE-устройства (если известен). Даёт точное сопоставление при поиске. */
  deviceAddress?: string;
  serviceUUID?: string;
  txCharacteristicUUID?: string;
  rxCharacteristicUUID?: string;
  timeoutMs?: number;
  autoReconnect?: boolean;
  canFdEnabled?: boolean;
}

export interface KingbolenEdiagMetrics {
  totalCommands: number;
  successfulCommands: number;
  failedCommands: number;
  timeouts: number;
  averageLatencyMs: number;
  averageSuccessLatencyMs?: number; // средняя латентность успешных команд
  averageErrorLatencyMs?: number; // средняя латентность завершившихся ошибкой/таймаутом
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
  reconnectAttempts?: number;
  reconnectSuccesses?: number;
  reconnectFailures?: number;
  lastDisconnectAt?: string;
  lastReconnectScheduledAt?: string;
  lastReconnectAttemptAt?: string;
  queueDepth?: number;
  maxQueueDepthObserved?: number;
  lastQueueDepthChangeAt?: string;
  lastReconnectDurationSeconds?: number;
  totalReconnectDurationSeconds?: number;
  watchdogTriggers?: number;
  lastReconnectAt?: string; // время последнего успешного подключения (initial или reconnect)
  lastWatchdogTriggerAt?: string; // время последнего срабатывания watchdog
  lastCommandCompletedAt?: string; // время завершения последней команды (успех/ошибка/таймаут)
  secondsSinceLastCommandCompleted?: number; // обновляется on demand (derive)
}

export class KingbolenEdiagDriver extends EventEmitter {
  private peripheral: any; // noble Peripheral
  private txCharacteristic: any; // noble Characteristic для отправки
  private rxCharacteristic: any; // noble Characteristic для получения
  private connected = false;
  private options: Required<KingbolenEdiagOptions>;
  // Хендлеры событий для корректной очистки слушателей
  private nobleStateChangeHandler?: (state: string) => void;
  private nobleDiscoverHandler?: (peripheral: any) => void;
  private rxDataHandler?: (data: Buffer) => void;
  private peripheralDisconnectHandler?: () => void;
  private commandQueue: Array<{
    resolve: (value: string) => void;
    reject: (error: Error) => void;
    command: string;
  }> = [];
  private responseBuffer = '';
  private pendingResponse?: {
    resolve: (value: string) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  };
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
    reconnectAttempts: 0,
    reconnectSuccesses: 0,
    reconnectFailures: 0,
    watchdogTriggers: 0,
    lastCommandCompletedAt: undefined,
  };
  // Аккумуляторы для вычисления средних латентностей (internal)
  private latencySuccessAccumMs = 0;
  private latencyErrorAccumMs = 0;
  private isActiveReconnectAttempt = false;
  private lastReconnectStartTs: number | null = null;
  private watchdogTimer: NodeJS.Timeout | null = null;
  private readonly watchdogIntervalMs = 15000;

  constructor(options: KingbolenEdiagOptions = {}) {
    super();
    this.options = {
      deviceName: options.deviceName ?? process.env.EDIAG_DEVICE_NAME ?? 'KINGBOLEN',
  deviceAddress: options.deviceAddress ?? process.env.EDIAG_DEVICE_ADDR ?? '',
      // Стандартные BLE UUID для OBD-II адаптеров (могут отличаться для конкретного устройства)
      serviceUUID: options.serviceUUID ?? process.env.EDIAG_SERVICE_UUID ?? '0000ffe0-0000-1000-8000-00805f9b34fb',
      txCharacteristicUUID: options.txCharacteristicUUID ?? process.env.EDIAG_TX_UUID ?? '0000ffe1-0000-1000-8000-00805f9b34fb',
      rxCharacteristicUUID: options.rxCharacteristicUUID ?? process.env.EDIAG_RX_UUID ?? '0000ffe1-0000-1000-8000-00805f9b34fb',
      timeoutMs: options.timeoutMs ?? (process.env.EDIAG_TIMEOUT_MS ? Number(process.env.EDIAG_TIMEOUT_MS) : 5000),
      autoReconnect: options.autoReconnect ?? (process.env.EDIAG_AUTORECONNECT === '1'),
      canFdEnabled: options.canFdEnabled ?? (process.env.EDIAG_CANFD !== '0'),
    };
  }

  async connect(abortSignal?: AbortSignal, isReconnect: boolean = false): Promise<boolean> {
    if (this.connected) return true;

    const nobleInstance = await loadNoble();
    if (!nobleInstance) {
      throw new Error('BLE стек noble не доступен - установите один из: noble-winrt или @abandonware/noble');
    }

    return new Promise((resolve, reject) => {
      let found = false;
      this.metrics.connectionAttempts = (this.metrics.connectionAttempts || 0) + 1;
      this.metrics.connectStartedAt = new Date().toISOString();
      this.isActiveReconnectAttempt = isReconnect;
      if (isReconnect) {
        this.metrics.lastReconnectAttemptAt = this.metrics.connectStartedAt;
        this.lastReconnectStartTs = Date.now();
        this.emit('ble_reconnect_attempt', { attempt: this.metrics.connectionAttempts, reconnectAttempt: (this.metrics.reconnectAttempts || 0) + 1, startedAt: this.metrics.connectStartedAt });
      } else {
        this.emit('ble_connect_attempt', { attempt: this.metrics.connectionAttempts, startedAt: this.metrics.connectStartedAt });
      }
      let deadline = Date.now() + this.options.timeoutMs;
      let connectTimeoutTimer: NodeJS.Timeout | undefined;
      const scheduleTimeout = () => {
        if (connectTimeoutTimer) clearTimeout(connectTimeoutTimer);
        const remaining = deadline - Date.now();
        connectTimeoutTimer = setTimeout(() => {
          if (found) return;
          try { noble.stopScanning(); } catch (e) { void e; }
          this.cleanupNobleListeners();
          const err = new Error(`Таймаут поиска устройства ${this.options.deviceName} (${this.options.timeoutMs}ms, phase=${this.metrics.lastConnectPhase || 'initial'})`);
          if (this.isActiveReconnectAttempt) {
            this.metrics.reconnectFailures = (this.metrics.reconnectFailures || 0) + 1;
            this.emit('ble_reconnect_failed', { error: err.message });
          }
          reject(err);
        }, remaining);
      };
      scheduleTimeout();

      // Таймер расширения параметров сканирования (если сначала фильтруем по сервису и не находим)
      const widenMs = (() => {
        const envMs = process.env.OBD_BLE_WIDEN_SCAN_MS ? Number(process.env.OBD_BLE_WIDEN_SCAN_MS) : NaN;
        if (!isNaN(envMs) && envMs > 0) return envMs;
        const calc = Math.min(Math.floor(this.options.timeoutMs * 0.5), this.options.timeoutMs - 1500);
        return calc > 0 ? calc : Math.floor(this.options.timeoutMs * 0.4);
      })();
      const secondPhaseExtraMs = (() => {
        const envMs = process.env.OBD_BLE_SECOND_PHASE_MS ? Number(process.env.OBD_BLE_SECOND_PHASE_MS) : NaN;
        if (!isNaN(envMs) && envMs > 0) return envMs;
        // По умолчанию даём ещё 40% первоначального таймаута если расширили сканирование
        return Math.floor(this.options.timeoutMs * 0.4);
      })();
      let widenTimer: NodeJS.Timeout | undefined;
      const startWidenTimer = (initiallyFiltered: boolean) => {
        if (!initiallyFiltered || widenMs <= 0) return;
        widenTimer = setTimeout(() => {
          if (found) return;
          if (process.env.OBD_BLE_DEBUG) console.log('[KingbolenEdiag] widen scan: повторный старт без сервис-фильтра');
          try { noble.stopScanning(); } catch (e) { void e; }
          try { noble.startScanning([], process.env.OBD_BLE_ALLOW_DUP === '1'); } catch (e) { void e; }
          this.metrics.lastConnectPhase = 'widened';
          // Продлить дедлайн второй фазой, если ещё не продлевали
          if (secondPhaseExtraMs > 0) {
            deadline += secondPhaseExtraMs;
            scheduleTimeout();
            if (process.env.OBD_BLE_DEBUG) console.log('[KingbolenEdiag] second-phase timeout extension', { addedMs: secondPhaseExtraMs, newDeadlineInMs: deadline - Date.now() });
          }
        }, widenMs);
        if (process.env.OBD_BLE_DEBUG) console.log('[KingbolenEdiag] widen timer scheduled', { widenMs });
      };

      // Обёртка очистки слушателей noble
      const onDone = (ok: boolean, err?: Error) => {
        if (connectTimeoutTimer) clearTimeout(connectTimeoutTimer);
        if (widenTimer) clearTimeout(widenTimer);
        try { noble.stopScanning(); } catch (e) { void e; }
        this.cleanupNobleListeners();
        if (ok) {
          if (this.isActiveReconnectAttempt) {
            this.metrics.reconnectSuccesses = (this.metrics.reconnectSuccesses || 0) + 1;
            this.emit('ble_reconnect_success', { connectedAt: this.metrics.connectedAt, attempt: this.metrics.connectionAttempts });
          }
          resolve(true);
        } else {
          const finalErr = err ?? new Error('Неизвестная ошибка подключения');
          if (this.isActiveReconnectAttempt) {
            this.metrics.reconnectFailures = (this.metrics.reconnectFailures || 0) + 1;
            this.emit('ble_reconnect_failed', { error: finalErr.message });
          }
          reject(finalErr);
        }
        this.isActiveReconnectAttempt = false;
      };

      if (abortSignal) {
        if (abortSignal.aborted) {
          onDone(false, new Error('Операция подключения отменена (pre-abort)'));
          return;
        }
        const abortListener = () => {
          if (found) return; // если уже нашли, игнорируем
          onDone(false, new Error('Операция подключения отменена'));
        };
        abortSignal.addEventListener('abort', abortListener, { once: true });
      }

      this.nobleStateChangeHandler = (state: string) => {
        if (process.env.OBD_BLE_DEBUG) console.log('[KingbolenEdiag] stateChange:', state);
        if (state === 'poweredOn') {
          const scanServices = this.computeScanServices();
          const useFilter = process.env.OBD_BLE_SCAN_FILTER === '1';
          const services = useFilter ? scanServices : [];
          const allowDup = process.env.OBD_BLE_ALLOW_DUP === '1';
          try {
            noble.startScanning(services, allowDup);
            if (process.env.OBD_BLE_DEBUG) console.log('[KingbolenEdiag] startScanning', { services, allowDuplicates: allowDup });
          } catch (e) { void e; }
          startWidenTimer(useFilter);
        }
      };
      noble.once('stateChange', this.nobleStateChangeHandler);

      this.nobleDiscoverHandler = async (peripheral: any) => {
        const adv = peripheral.advertisement || {};
        const name: string = adv?.localName || '';
        const upper = (s: string) => s?.toUpperCase?.() || s;
        const svcUuids: string[] = (adv?.serviceUuids || []).map((u: string) => (u?.toLowerCase?.() || u));
        const wanted16 = this.shortUuid(this.options.serviceUUID);
        const addrRaw = (peripheral.address || peripheral.uuid || '').toLowerCase();
        const addr = addrRaw.replace(/:/g, '');
        const wantAddrRaw = (this.options.deviceAddress || '').toLowerCase();
        const wantAddr = wantAddrRaw.replace(/:/g, '');
        const matchName = upper(name).includes('EDIAG')
          || upper(name).includes(this.options.deviceName.toUpperCase())
          || upper(name).includes('OBD')
          || upper(name).includes('VCI');
        const matchSvc = wanted16 ? svcUuids.includes(wanted16) : false;
        const matchAddr = wantAddr ? (addr === wantAddr || addr.endsWith(wantAddr)) : false;
        if (process.env.OBD_BLE_DEBUG) console.log('[KingbolenEdiag] discover:', { name, rssi: peripheral.rssi, addr, serviceUuids: svcUuids });
        // обновляем последний RSSI
        this.metrics.lastRssi = typeof peripheral.rssi === 'number' ? peripheral.rssi : this.metrics.lastRssi;

        if (matchAddr || matchName || matchSvc) {
          found = true;
          if (widenTimer) clearTimeout(widenTimer);
          try { noble.stopScanning(); } catch (e) { void e; }

          try {
            await this.connectToPeripheral(peripheral);
            await this.initialize();
            this.connected = true;
            this.metrics.connectedAt = new Date().toISOString();
            this.emit('connected', { uuid: peripheral.uuid, name, reconnect: this.isActiveReconnectAttempt });
            if (this.metrics.connectStartedAt && this.metrics.connectedAt) {
              const durationSec = (Date.parse(this.metrics.connectedAt) - Date.parse(this.metrics.connectStartedAt)) / 1000;
              if (this.isActiveReconnectAttempt && this.lastReconnectStartTs) {
                this.metrics.lastReconnectDurationSeconds = durationSec;
                this.metrics.totalReconnectDurationSeconds = (this.metrics.totalReconnectDurationSeconds || 0) + durationSec;
                this.metrics.lastReconnectAt = this.metrics.connectedAt;
              }
              if (this.isActiveReconnectAttempt) {
                this.emit('ble_reconnect_success', {
                  uuid: peripheral.uuid,
                  name,
                  connectedAt: this.metrics.connectedAt,
                  startedAt: this.metrics.connectStartedAt,
                  durationSeconds: durationSec,
                  rssi: this.metrics.lastRssi,
                });
              } else {
                this.emit('ble_connected', {
                  uuid: peripheral.uuid,
                  name,
                  connectedAt: this.metrics.connectedAt,
                  startedAt: this.metrics.connectStartedAt,
                  durationSeconds: durationSec,
                  rssi: this.metrics.lastRssi,
                });
                // initial connect: зафиксировать как lastReconnectAt если ещё не установлено
                if (!this.metrics.lastReconnectAt) {
                  this.metrics.lastReconnectAt = this.metrics.connectedAt;
                }
              }
            }
            this.startWatchdog();
            onDone(true);
          } catch (error: any) {
            onDone(false, new Error(`Ошибка подключения: ${error.message}`));
          }
        } else {
          // Продолжаем слушать другие устройства
          if (process.env.OBD_BLE_DEBUG) console.log('[KingbolenEdiag] пропуск peripheral (нет совпадения)');
        }
      };
      // Используем постоянный слушатель, удалим вручную при завершении
      noble.on('discover', this.nobleDiscoverHandler);

      if (noble.state === 'poweredOn') {
        const scanServices = this.computeScanServices();
        const useFilter = process.env.OBD_BLE_SCAN_FILTER === '1';
        const services = useFilter ? scanServices : [];
        const allowDup = process.env.OBD_BLE_ALLOW_DUP === '1';
        try {
          noble.startScanning(services, allowDup);
          if (process.env.OBD_BLE_DEBUG) console.log('[KingbolenEdiag] startScanning (immediate)', { services, allowDuplicates: allowDup });
        } catch (e) { void e; }
        startWidenTimer(useFilter);
      }
    });
  }

  private computeScanServices(): string[] {
    // Noble ожидает 16-битный UUID сервиса без префикса/дефисов, например 'ffe0'
    const short = this.shortUuid(this.options.serviceUUID);
    return short ? [short] : [];
  }

  private shortUuid(uuid: string | undefined): string | undefined {
    if (!uuid) return undefined;
    // 0000ffff-0000-1000-8000-00805f9b34fb -> ffff
    const m = uuid.toLowerCase().match(/^0000([0-9a-f]{4})-0000-1000-8000-00805f9b34fb$/);
    if (m) return m[1];
    // если уже короткий формат, вернуть как есть
    if (/^[0-9a-f]{4}$/.test(uuid)) return uuid.toLowerCase();
    return undefined;
  }

  private connectToPeripheral(peripheral: any): Promise<void> {
    this.peripheral = peripheral;

    return new Promise((resolve, reject) => {
      (async () => {
        try {
          await peripheral.connectAsync();
          // 1) Целенаправленно пробуем найти заданные сервис/характеристики
          const trySome = async () => {
            try {
              const { characteristics } = await peripheral.discoverSomeServicesAndCharacteristicsAsync(
                [this.options.serviceUUID],
                [this.options.txCharacteristicUUID, this.options.rxCharacteristicUUID]
              );
              return characteristics as any[];
            } catch (e) {
              return [] as any[];
            }
          };

          // 2) Фолбэк: полное перечисление сервисов/характеристик
          const tryAll = async () => {
            try {
              const { characteristics } = await peripheral.discoverAllServicesAndCharacteristicsAsync();
              return characteristics as any[];
            } catch (e) {
              return [] as any[];
            }
          };

          let characteristics: any[] = await trySome();
          if (characteristics.length === 0) {
            if (process.env.OBD_BLE_DEBUG) console.log('[KingbolenEdiag] Fallback to discoverAllServicesAndCharacteristics');
            characteristics = await tryAll();
          }

          const norm = (u: string) => (u || '').toLowerCase().replace(/-/g, '');
          const expand16 = (u: string) => (/^[0-9a-f]{4}$/i.test(u) ? `0000${u.toLowerCase()}-0000-1000-8000-00805f9b34fb` : u);
          const wantTxFull = norm(expand16(this.options.txCharacteristicUUID));
          const wantRxFull = norm(expand16(this.options.rxCharacteristicUUID));
          const toShort = (u: string | undefined) => this.shortUuid(u || '') || '';
          const wantTxShort = toShort(this.options.txCharacteristicUUID);
          const wantRxShort = toShort(this.options.rxCharacteristicUUID);

          const byUuid = (c: any, wantFull: string, wantShort: string) => {
            const cu = norm(c.uuid);
            const cShort = toShort(c.uuid);
            return cu === wantFull || (wantShort && cShort === wantShort);
          };

          this.txCharacteristic = characteristics.find((c: any) => byUuid(c, wantTxFull, wantTxShort));
          this.rxCharacteristic = characteristics.find((c: any) => byUuid(c, wantRxFull, wantRxShort));

          // Фолбэк по свойствам: ищем write*/notify, если точных UUID нет
          if (!this.txCharacteristic) {
            this.txCharacteristic = characteristics.find((c: any) => Array.isArray(c.properties) && (c.properties.includes('write') || c.properties.includes('writeWithoutResponse')));
          }
          if (!this.rxCharacteristic) {
            this.rxCharacteristic = characteristics.find((c: any) => Array.isArray(c.properties) && (c.properties.includes('notify') || c.properties.includes('indicate')));
          }

          if (!this.txCharacteristic || !this.rxCharacteristic) {
            if (process.env.OBD_BLE_DEBUG) console.log('[KingbolenEdiag] Characteristics not found', {
              wanted: { tx: this.options.txCharacteristicUUID, rx: this.options.rxCharacteristicUUID },
              found: characteristics.map((c: any) => ({ uuid: c.uuid, properties: c.properties }))
            });
            throw new Error('Не найдены характеристики TX/RX для коммуникации');
          }

          // Подписка на нотификации RX (совместимость с разными noble)
          if (typeof this.rxCharacteristic.subscribeAsync === 'function') {
            await this.rxCharacteristic.subscribeAsync();
          } else if (typeof this.rxCharacteristic.subscribe === 'function') {
            await new Promise<void>((res, rej) => this.rxCharacteristic.subscribe((err: any) => err ? rej(err) : res()));
          }
          this.rxDataHandler = (data: Buffer) => {
            this.handleData(data.toString());
          };
          this.rxCharacteristic.on('data', this.rxDataHandler);

          this.peripheralDisconnectHandler = () => {
            this.handleClosed();
          };
          peripheral.on('disconnect', this.peripheralDisconnectHandler);

          resolve();
        } catch (error: any) {
          reject(new Error(`Ошибка подключения к peripheral: ${error.message}`));
        }
      })();
    });
  }

  private async initialize(): Promise<void> {
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
        } catch (err) {
          console.warn('[KingbolenEdiag] CAN-FD не поддерживается или команда отклонена');
        }
      }

      try {
        const deviceInfo = await this.sendCommand('AT#1');
        this.metrics.firmwareVersion = deviceInfo.trim();
      } catch (err) {
        console.warn('[KingbolenEdiag] Не удалось получить информацию об устройстве');
      }

      try {
        await this.sendCommand('ATRV');
      } catch (err) {
        console.warn('[KingbolenEdiag] Не удалось получить напряжение бортсети');
      }

      try {
        const protocol = await this.sendCommand('ATDPN');
        this.metrics.protocolUsed = protocol.trim();
      } catch (err) {
        console.warn('[KingbolenEdiag] Не удалось определить используемый протокол');
      }
    } catch (error: any) {
      throw new Error(`Ошибка инициализации: ${error.message}`);
    }
  }

  async sendCommand(command: string, timeoutMs?: number): Promise<string> {
    const timeout = timeoutMs ?? this.options.timeoutMs;
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      this.commandQueue.push({ resolve, reject, command });
      this.updateQueueDepthMetric();
      if (this.commandQueue.length === 1) {
        this.processNextCommand(timeout, startTime);
      }
    });
  }

  private async processNextCommand(timeout: number, startTime: number): Promise<void> {
    if (this.commandQueue.length === 0 || this.pendingResponse) return;

    const { resolve, reject, command } = this.commandQueue[0];

    try {
      // Засчитываем попытку команды сразу, чтобы любые исходы (успех/ошибка/таймаут) попадали в агрегаты
      this.metrics.totalCommands++;
      this.metrics.lastCommand = command;

      const buffer = Buffer.from(`${command}\r`);
      this.metrics.bytesSent = (this.metrics.bytesSent || 0) + buffer.length;
      await this.txCharacteristic.writeAsync(buffer, false);
      this.emit('ble_command_sent', { command, bytes: buffer.length });

      this.pendingResponse = {
        resolve: (response: string) => {
          const duration = Date.now() - startTime;
          this.metrics.successfulCommands++;
          this.metrics.lastDurationMs = duration;
          this.metrics.averageLatencyMs =
            (this.metrics.averageLatencyMs * (this.metrics.totalCommands - 1) + duration) / this.metrics.totalCommands;
          this.latencySuccessAccumMs += duration;
          this.metrics.averageSuccessLatencyMs = this.metrics.successfulCommands > 0 ? (this.latencySuccessAccumMs / this.metrics.successfulCommands) : 0;
          this.metrics.lastUpdatedAt = new Date().toISOString();
          this.metrics.lastCommandCompletedAt = this.metrics.lastUpdatedAt;
          this.emit('ble_command_completed', { command, durationMs: duration });

          this.commandQueue.shift();
          resolve(response);
          this.pendingResponse = undefined;

          if (this.commandQueue.length > 0) {
            this.processNextCommand(timeout, Date.now());
          }
        },
        reject: (error: Error) => {
          this.metrics.failedCommands++;
          this.metrics.lastError = error.message;
          this.metrics.lastUpdatedAt = new Date().toISOString();
          this.metrics.lastCommandCompletedAt = this.metrics.lastUpdatedAt;
          // duration ошибки (от начала отправки, если есть) — может быть 0 если ошибка при writeAsync
          const errDuration = Date.now() - startTime;
          this.metrics.lastDurationMs = errDuration;
          this.latencyErrorAccumMs += errDuration;
          const errorCount = this.metrics.failedCommands;
          this.metrics.averageErrorLatencyMs = errorCount > 0 ? (this.latencyErrorAccumMs / errorCount) : 0;
          // Средняя латентность по всем командам
          this.metrics.averageLatencyMs =
            (this.metrics.averageLatencyMs * (this.metrics.totalCommands - 1) + errDuration) / this.metrics.totalCommands;
          this.emit('ble_command_failed', { command, error: error.message });

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
          this.metrics.lastCommandCompletedAt = this.metrics.lastUpdatedAt;
          this.emit('ble_command_failed', { command, error: 'Timeout' });
          // Таймаут считается ошибкой, добавим его в накопитель errorLatency
          const timeoutDuration = Date.now() - startTime;
          this.metrics.lastDurationMs = timeoutDuration;
          this.latencyErrorAccumMs += timeoutDuration;
          const errorCount = this.metrics.failedCommands;
          this.metrics.averageErrorLatencyMs = errorCount > 0 ? (this.latencyErrorAccumMs / errorCount) : 0;
          // Обновить среднюю латентность по всем командам
          this.metrics.averageLatencyMs =
            (this.metrics.averageLatencyMs * (this.metrics.totalCommands - 1) + timeoutDuration) / this.metrics.totalCommands;

          this.commandQueue.shift();
          reject(new Error(`Timeout waiting for response to: ${command}`));
          this.pendingResponse = undefined;

          if (this.commandQueue.length > 0) {
            this.processNextCommand(timeout, Date.now());
          }
        }, timeout),
      };
    } catch (error: any) {
      this.metrics.failedCommands++;
      this.metrics.lastError = error.message;
      this.commandQueue.shift();
      reject(new Error(`Ошибка отправки команды: ${error.message}`));
      this.emit('ble_command_failed', { command, error: error.message });
      this.metrics.lastUpdatedAt = new Date().toISOString();
      this.metrics.lastCommandCompletedAt = this.metrics.lastUpdatedAt;
      const errDuration = Date.now() - startTime;
      this.metrics.lastDurationMs = errDuration;
      this.latencyErrorAccumMs += errDuration;
      const errorCount = this.metrics.failedCommands;
      this.metrics.averageErrorLatencyMs = errorCount > 0 ? (this.latencyErrorAccumMs / errorCount) : 0;
      // Средняя латентность по всем командам
      this.metrics.averageLatencyMs =
        (this.metrics.averageLatencyMs * (this.metrics.totalCommands - 1) + errDuration) / this.metrics.totalCommands;

      if (this.commandQueue.length > 0) {
        this.processNextCommand(timeout, Date.now());
      }
      this.updateQueueDepthMetric();
    }
  }

  private handleData(data: string): void {
    this.metrics.bytesReceived = (this.metrics.bytesReceived || 0) + Buffer.byteLength(data);
    this.emit('ble_data_received', { bytes: Buffer.byteLength(data) });
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

  private handleClosed(): void {
    this.connected = false;
    // Очистить слушатели peripheral/characteristic
    this.cleanupPeripheralListeners();
    this.emit('disconnect');
    const at = new Date().toISOString();
    this.metrics.lastDisconnectAt = at;
    this.emit('ble_disconnected', { at });

    if (this.options.autoReconnect) {
      const inMs = 5000;
      const scheduledAt = new Date(Date.now() + inMs).toISOString();
      this.metrics.lastReconnectScheduledAt = scheduledAt;
      this.emit('ble_reconnect_scheduled', { inMs, at: scheduledAt });
      setTimeout(() => {
        this.metrics.reconnectAttempts = (this.metrics.reconnectAttempts || 0) + 1;
        this.connect(undefined, true).catch((e) => {
          console.error('[KingbolenEdiag] Ошибка переподключения:', e);
        });
      }, inMs);
    }
  }

  private handleError(error: Error): void {
    this.emit('error', error);
  }

  async readDTC(): Promise<ObdResult<ObdDtc[]>> {
    try {
      const response = await this.sendCommand('03');
      const dtcs = this.parseDTC(response);

      return {
        ok: true,
        data: dtcs.map((code) => ({
          code,
          description: describeDtc(code).description,
          status: 'current' as const,
          severity: describeDtc(code).severity,
        })),
      };
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
  }

  async clearDTC(): Promise<ObdResult<boolean>> {
    try {
      const response = await this.sendCommand('04');
      const success = response.includes('OK') || response.includes('44');

      return { ok: true, data: success };
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
  }

  async readStatus(): Promise<ObdResult<ObdStatus>> {
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
      } as Record<string, boolean>;

      return { ok: true, data: { mil, dtcCount, readiness } };
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
  }

  async readLiveData(): Promise<ObdResult<ObdLiveData>> {
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
          rpm: this.decodePID('0C', rpm) as number,
          coolantTemp: this.decodePID('05', coolant) as number,
          intakeTemp: this.decodePID('0F', intake) as number,
          speed: this.decodePID('0D', speed) as number,
          voltage: this.decodePID('42', voltage) as number,
          throttle: this.decodePID('11', throttle) as number,
        },
      };
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
  }

  async readToyotaHybrid(): Promise<ObdResult<ToyotaHybridData>> {
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
          battery_soc: this.decodePID('D2', soc) as number,
          mg1_rpm: this.decodePID('D3', mg1) as number,
          mg2_rpm: this.decodePID('D4', mg2) as number,
          trans_temp: this.decodePID('E4', transTemp) as number,
          gear_position: this.decodePID('A4', gear) as string,
          egr_position: this.decodePID('F0', egr) as number,
          catalyst_temp: this.decodePID('F1', catalyst) as number,
        },
      };
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
  }

  async readPID(pid: string): Promise<string> {
    return this.sendCommand(`01${pid}`);
  }

  private decodePID(pid: string, response: string): number | string {
    const bytes = this.parseHexResponse(response);
    if (bytes.length === 0) return 0;

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
        const gearMap: Record<number, string> = { 0: 'P', 1: 'R', 2: 'N', 3: 'D', 4: 'B' };
        return gearMap[bytes[0]] || 'Unknown';
      }
      case 'F0':
      case 'F1':
        return ((bytes[0] / 255) * 100).toFixed(1);
      default:
        return bytes[0];
    }
  }

  private parseDTC(response: string): string[] {
    const dtcPattern = /43\s?([0-9A-F]{2})\s?([0-9A-F]{2})/gi;
    const matches = [...response.matchAll(dtcPattern)];

    return matches.map((match) => {
      const high = parseInt(match[1], 16);
      const low = parseInt(match[2], 16);

      const prefixMap: Record<number, string> = { 0: 'P', 1: 'C', 2: 'B', 3: 'U' };
      const prefix = prefixMap[(high >> 6) & 0x03] || 'P';

      const code = `${prefix}${((high & 0x3f) << 8 | low).toString(16).toUpperCase().padStart(4, '0')}`;
      return code;
    });
  }

  private parseHexResponse(response: string): number[] {
    const hex = response.replace(/\s+/g, '').replace(/^41[0-9A-F]{2}/, '');
    const bytes: number[] = [];

    for (let i = 0; i < hex.length; i += 2) {
      const byte = parseInt(hex.substr(i, 2), 16);
      if (!isNaN(byte)) bytes.push(byte);
    }

    return bytes;
  }

  async identify(): Promise<string> {
    try {
      const vinResponse = await this.sendCommand('0902');
      const vin = vinResponse.replace(/\s+/g, '').replace(/^49/, '').replace(/[^A-Z0-9]/g, '');

      return `KINGBOLEN Ediag Plus\nFirmware: ${this.metrics.firmwareVersion || 'Unknown'}\nVIN: ${vin || 'Not available'}`;
    } catch (error: any) {
      return `KINGBOLEN Ediag Plus\nFirmware: ${this.metrics.firmwareVersion || 'Unknown'}\nVIN: Error reading VIN`;
    }
  }

  async readVoltage(): Promise<ObdResult<number>> {
    try {
      const raw = await this.sendCommand('ATRV');
      // Ответ может содержать, например: "12.4V" или "12.48V". Извлечём число.
      const match = raw.match(/([0-9]+\.[0-9]+)/);
      const value = match ? parseFloat(match[1]) : NaN;
      if (!isNaN(value)) return { ok: true, data: value };
      return { ok: false, error: 'Не удалось распарсить напряжение' };
    } catch (error: any) {
      return { ok: false, error: error.message };
    }
  }

  async disconnect(): Promise<void> {
    if (this.peripheral) {
      try {
        // Сначала отписаться и снять слушателей
        this.cleanupPeripheralListeners();
        await this.peripheral.disconnectAsync();
      } catch (e) { void e; }
      this.connected = false;
      this.emit('disconnect');
    }
    // Остановить возможное сканирование и снять слушателей noble
    try { noble.stopScanning(); } catch (e) { void e; }
    this.cleanupNobleListeners();
  }

  async close(): Promise<void> { // алиас
    await this.disconnect();
  }

  /** Соединение активно? */
  isConnected(): boolean {
    return this.connected === true;
  }

  getMetrics(): KingbolenEdiagMetrics {
    // Дериватив: secondsSinceLastCommandCompleted
    if (this.metrics.lastCommandCompletedAt) {
      this.metrics.secondsSinceLastCommandCompleted = Math.max(0, (Date.now() - Date.parse(this.metrics.lastCommandCompletedAt)) / 1000);
    } else {
      this.metrics.secondsSinceLastCommandCompleted = undefined;
    }
    return { ...this.metrics };
  }

  /**
   * Совместимость с обобщённым интерфейсом ObdDriver: запрос PID
   * @param mode OBD mode, например '01'
   * @param pid Двухсимвольный HEX PID, например '0C'
   */
  async requestPid(mode: ObdMode, pid: PidIdentifier): Promise<string> {
    const m = String(mode).toUpperCase();
    const p = String(pid).toUpperCase();
    return this.sendCommand(`${m}${p}`);
  }

  /**
   * Совместимость: запрос DTC-кодов с типизацией DtcCode
   */
  async requestDtc(): Promise<DtcCode[]> {
    const res = await this.readDTC();
    if (!res.ok || !res.data) throw new Error(res.error || 'readDTC failed');
    const mapType = (code: string): DtcCode['type'] => {
      const c = (code || 'P0000').toUpperCase();
      const prefix = c[0];
      if (prefix === 'P') return 'Powertrain';
      if (prefix === 'C') return 'Chassis';
      if (prefix === 'B') return 'Body';
      if (prefix === 'U') return 'Network';
      return 'Powertrain';
    };
    return res.data.map(({ code }) => ({
      code,
      type: mapType(code),
      description: describeDtc(code).description,
    }));
  }

  /**
   * Совместимость: alias в верблюжьем регистре
   */
  async readDtc(): Promise<ObdResult<ObdDtc[]>> {
    return this.readDTC();
  }

  /**
   * Совместимость: camelCase версия очистки DTC
   */
  async clearDtc(): Promise<void> {
    const res = await this.clearDTC();
    if (!res.ok) throw new Error(res.error || 'clearDTC failed');
    if (!res.data) throw new Error('Adapter rejected clear DTC');
  }

  private updateQueueDepthMetric(): void {
    const depth = this.commandQueue.length;
    this.metrics.queueDepth = depth;
    this.metrics.maxQueueDepthObserved = Math.max(this.metrics.maxQueueDepthObserved || 0, depth);
    this.metrics.lastQueueDepthChangeAt = new Date().toISOString();
  }

  private startWatchdog(): void {
    this.stopWatchdog();
    this.watchdogTimer = setInterval(() => {
      if (this.pendingResponse && this.metrics.lastUpdatedAt) {
        const last = Date.parse(this.metrics.lastUpdatedAt);
        const now = Date.now();
        const timeoutMs = this.options.timeoutMs * 2;
        if (now - last > timeoutMs) {
          this.metrics.watchdogTriggers = (this.metrics.watchdogTriggers || 0) + 1;
          this.metrics.lastWatchdogTriggerAt = new Date().toISOString();
          this.emit('ble_watchdog_trigger', { sinceLastUpdateMs: now - last });
          try { this.peripheral?.disconnectAsync?.(); } catch { /* ignore disconnect error */ }
        }
      }
    }, this.watchdogIntervalMs);
  }

  private stopWatchdog(): void {
    if (this.watchdogTimer) { clearInterval(this.watchdogTimer); this.watchdogTimer = null; }
  }

  // Утилиты очистки слушателей, чтобы не накапливались и не возникали MaxListeners
  private cleanupNobleListeners(): void {
    if (this.nobleStateChangeHandler) {
      try { noble.removeListener('stateChange', this.nobleStateChangeHandler); } catch (e) { void e; }
      this.nobleStateChangeHandler = undefined;
    }
    if (this.nobleDiscoverHandler) {
      try { noble.removeListener('discover', this.nobleDiscoverHandler); } catch (e) { void e; }
      this.nobleDiscoverHandler = undefined;
    }
  }

  private cleanupPeripheralListeners(): void {
    if (this.rxCharacteristic && this.rxDataHandler) {
      try { this.rxCharacteristic.removeListener('data', this.rxDataHandler); } catch (e) { void e; }
    }
    if (this.rxCharacteristic) {
      try {
        if (typeof this.rxCharacteristic.unsubscribeAsync === 'function') {
          this.rxCharacteristic.unsubscribeAsync();
        } else if (typeof this.rxCharacteristic.unsubscribe === 'function') {
          this.rxCharacteristic.unsubscribe(() => void 0);
        }
      } catch (e) { void e; }
    }
    if (this.peripheral && this.peripheralDisconnectHandler) {
      try { this.peripheral.removeListener('disconnect', this.peripheralDisconnectHandler); } catch (e) { void e; }
    }
    this.rxDataHandler = undefined;
    this.peripheralDisconnectHandler = undefined;
  }

  /** Полное завершение активности драйвера (для тестовой среды) */
  async shutdown(): Promise<void> {
    try {
      if (this.peripheral) {
        this.cleanupPeripheralListeners();
        await this.peripheral.disconnectAsync();
      }
    } catch (e) { void e; }
    try { noble.stopScanning(); } catch (e) { void e; }
    this.cleanupNobleListeners();
    this.connected = false;
    this.stopWatchdog();
  }
}
