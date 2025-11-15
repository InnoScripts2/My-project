/**
 * ThicknessDriver - BLE драйвер для толщиномера ЛКП
 * 
 * Реализует сканирование, подключение, подписку на notify измерений,
 * управление сессией измерений, обработку разрывов соединения
 */

import { EventEmitter } from 'events';
import type { BleClient, BleDevice } from '../ble/BleClient.js';
import { NobleBleClient } from '../ble/NobleBleClient.js';
import { DevBleClient } from '../ble/DevBleClient.js';
import { GATT_PROFILE, CONTROL_COMMANDS, parseMeasurementData } from '../gatt/profile.js';
import {
  ThicknessStatus,
  createSession,
  addMeasurement,
  createMeasurementPoint,
} from '../models/Measurement.js';
import type { MeasurementSession, MeasurementPoint } from '../models/Measurement.js';
import { createLogger } from '../../../utils/logger.js';

const logger = createLogger('ThicknessDriver');

export interface ThicknessConfig {
  scanTimeout?: number;
  connectionTimeout?: number;
  measurementTimeout?: number;
  targetDeviceName?: string;
  targetMAC?: string;
  totalZones?: number;
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
}

export interface DeviceInfo {
  id: string;
  name: string;
  rssi: number;
}

export interface ThicknessDriverEvents {
  'device-detected': (info: DeviceInfo) => void;
  'connected': () => void;
  'measurement-started': () => void;
  'measurement-received': (point: MeasurementPoint) => void;
  'measurement-progress': (progress: { measured: number; total: number; percent: number }) => void;
  'measurement-complete': (summary: MeasurementSessionSummary) => void;
  'disconnected': () => void;
  'error': (error: Error) => void;
}

export interface MeasurementSessionSummary {
  sessionId: string;
  measurements: MeasurementPoint[];
  measuredZones: number;
  totalZones: number;
  duration: number;
  status: ThicknessStatus;
}

export class ThicknessDriver extends EventEmitter {
  private config: Required<ThicknessConfig>;
  private bleClient: BleClient;
  private status: ThicknessStatus = ThicknessStatus.IDLE;
  private session?: MeasurementSession;
  private deviceInfo?: DeviceInfo;
  private measurementTimer?: NodeJS.Timeout;
  private reconnectAttempts = 0;
  private disconnectCount = 0;

  constructor(config: ThicknessConfig = {}) {
    super();
    
    this.config = {
      scanTimeout: config.scanTimeout ?? 15000,
      connectionTimeout: config.connectionTimeout ?? 10000,
      measurementTimeout: config.measurementTimeout ?? 300000,
      targetDeviceName: config.targetDeviceName ?? 'TH_Sensor',
      targetMAC: config.targetMAC ?? '',
      totalZones: config.totalZones ?? 60,
      autoReconnect: config.autoReconnect ?? true,
      maxReconnectAttempts: config.maxReconnectAttempts ?? 3,
    };

    const isDev = process.env.AGENT_ENV === 'DEV';
    this.bleClient = isDev ? new DevBleClient() : new NobleBleClient();
    
    logger.info('ThicknessDriver создан', {
      mode: isDev ? 'DEV' : 'PROD',
      config: this.config,
    });
  }

  async init(): Promise<void> {
    try {
      this.status = ThicknessStatus.SCANNING;
      logger.info('Начало сканирования BLE устройств', {
        timeout: this.config.scanTimeout,
        targetDevice: this.config.targetDeviceName,
      });

      const device = await this.scanForDevice();
      
      this.deviceInfo = {
        id: device.id,
        name: device.name,
        rssi: device.rssi,
      };
      
      this.emit('device-detected', this.deviceInfo);
      logger.info('Устройство обнаружено', { device: this.deviceInfo });

      await this.connectToDevice();
      
    } catch (error) {
      this.status = ThicknessStatus.ERROR;
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('Ошибка инициализации', { error: err.message, stack: err.stack });
      this.emit('error', err);
      throw err;
    }
  }

  async start(): Promise<void> {
    if (this.status !== ThicknessStatus.CONNECTED) {
      const error = new Error('Устройство не подключено');
      logger.error('Попытка начать измерения без подключения', { status: this.status });
      this.emit('error', error);
      throw error;
    }

    try {
      this.status = ThicknessStatus.MEASURING;
      this.session = createSession(this.config.totalZones);
      
      logger.info('Начало сессии измерений', {
        sessionId: this.session.sessionId,
        totalZones: this.session.totalZones,
      });

      await this.bleClient.writeCharacteristic(
        GATT_PROFILE.SERVICE_UUID,
        GATT_PROFILE.CHARACTERISTICS.CONTROL,
        Buffer.from([CONTROL_COMMANDS.START])
      );

      this.emit('measurement-started');

      this.measurementTimer = setTimeout(() => {
        this.handleMeasurementTimeout();
      }, this.config.measurementTimeout);

    } catch (error) {
      this.status = ThicknessStatus.ERROR;
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('Ошибка начала измерений', { error: err.message });
      this.emit('error', err);
      throw err;
    }
  }

  async stop(): Promise<void> {
    if (this.measurementTimer) {
      clearTimeout(this.measurementTimer);
      this.measurementTimer = undefined;
    }

    if (!this.session) {
      return;
    }

    try {
      await this.bleClient.writeCharacteristic(
        GATT_PROFILE.SERVICE_UUID,
        GATT_PROFILE.CHARACTERISTICS.CONTROL,
        Buffer.from([CONTROL_COMMANDS.STOP])
      );

      this.session.status = ThicknessStatus.COMPLETE;
      this.session.endTime = Date.now();
      this.status = ThicknessStatus.COMPLETE;

      const summary = this.createSessionSummary();
      logger.info('Сессия измерений завершена', {
        sessionId: summary.sessionId,
        measuredZones: summary.measuredZones,
        totalZones: summary.totalZones,
        duration: summary.duration,
        status: summary.status,
      });
      this.emit('measurement-complete', summary);

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('Ошибка остановки измерений', { error: err.message });
      this.emit('error', err);
      throw err;
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.measurementTimer) {
        clearTimeout(this.measurementTimer);
        this.measurementTimer = undefined;
      }

      await this.bleClient.disconnect();
      this.status = ThicknessStatus.IDLE;
      this.session = undefined;
      
      logger.info('Отключение от устройства выполнено');
      
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('Ошибка отключения', { error: err.message });
      throw err;
    }
  }

  getStatus(): ThicknessStatus {
    return this.status;
  }

  getMeasurements(): MeasurementPoint[] {
    return this.session?.measurements ?? [];
  }

  private async scanForDevice(): Promise<BleDevice> {
    const device = await this.bleClient.startScan(
      [GATT_PROFILE.SERVICE_UUID],
      this.config.scanTimeout
    );

    if (this.config.targetDeviceName && !device.name.includes(this.config.targetDeviceName)) {
      throw new Error(`Устройство ${device.name} не соответствует ${this.config.targetDeviceName}`);
    }

    if (this.config.targetMAC && device.id !== this.config.targetMAC) {
      throw new Error(`MAC ${device.id} не соответствует ${this.config.targetMAC}`);
    }

    return device;
  }

  private async connectToDevice(): Promise<void> {
    try {
      this.status = ThicknessStatus.CONNECTING;
      logger.info('Подключение к устройству', { device: this.deviceInfo });

      await this.bleClient.connect(
        this.deviceInfo!.id,
        this.config.connectionTimeout
      );

      await this.bleClient.discoverServices(GATT_PROFILE.SERVICE_UUID);

      await this.subscribeToCharacteristics();

      this.status = ThicknessStatus.CONNECTED;
      this.reconnectAttempts = 0;
      this.disconnectCount = 0;
      
      logger.info('Подключение успешно установлено');
      this.emit('connected');
      
    } catch (error) {
      await this.handleConnectionError(error);
    }
  }

  private async subscribeToCharacteristics(): Promise<void> {
    await this.bleClient.subscribeCharacteristic(
      GATT_PROFILE.SERVICE_UUID,
      GATT_PROFILE.CHARACTERISTICS.MEASUREMENT,
      (data: Buffer) => this.handleMeasurement(data)
    );
    
    logger.debug('Подписка на характеристику измерений выполнена');
  }

  private handleMeasurement(data: Buffer): void {
    if (!this.session || this.status !== ThicknessStatus.MEASURING) {
      return;
    }

    const measurementData = parseMeasurementData(data);
    if (!measurementData) {
      logger.warn('Некорректные данные измерения', { data: data.toString('hex') });
      return;
    }

    const point = createMeasurementPoint(
      measurementData.zoneId,
      measurementData.value,
      measurementData.timestamp
    );

    if (!point) {
      logger.warn('Неизвестная зона', { zoneId: measurementData.zoneId });
      return;
    }

    this.session = addMeasurement(this.session, point);
    
    logger.debug('Измерение получено', {
      sessionId: this.session.sessionId,
      zoneId: point.zoneId,
      zoneName: point.zoneName,
      value: point.value,
      isNormal: point.isNormal,
    });

    this.emit('measurement-received', point);

    const progress = {
      measured: this.session.measuredZones,
      total: this.session.totalZones,
      percent: Math.round((this.session.measuredZones / this.session.totalZones) * 100),
    };
    this.emit('measurement-progress', progress);

    if (this.session.status === ThicknessStatus.COMPLETE) {
      this.handleMeasurementComplete();
    }
  }

  private async handleMeasurementComplete(): Promise<void> {
    if (this.measurementTimer) {
      clearTimeout(this.measurementTimer);
      this.measurementTimer = undefined;
    }

    await this.stop();
  }

  private handleMeasurementTimeout(): void {
    logger.warn('Таймаут измерений', {
      sessionId: this.session?.sessionId,
      measuredZones: this.session?.measuredZones,
      totalZones: this.session?.totalZones,
    });

    if (this.session) {
      this.session.status = ThicknessStatus.INCOMPLETE;
      this.session.endTime = Date.now();
      this.status = ThicknessStatus.INCOMPLETE;

      const summary = this.createSessionSummary();
      this.emit('measurement-complete', summary);
    }
  }

  private async handleConnectionError(error: unknown): Promise<void> {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Ошибка подключения', {
      error: err.message,
      attempt: this.reconnectAttempts + 1,
      maxAttempts: this.config.maxReconnectAttempts,
    });

    if (this.config.autoReconnect && this.reconnectAttempts < this.config.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(5000 * Math.pow(2, this.reconnectAttempts - 1), 20000);
      
      logger.info('Попытка переподключения', { delay, attempt: this.reconnectAttempts });
      
      await new Promise(resolve => setTimeout(resolve, delay));
      await this.connectToDevice();
    } else {
      this.status = ThicknessStatus.UNAVAILABLE;
      this.emit('error', err);
      throw err;
    }
  }

  private handleDisconnect(): void {
    logger.warn('Устройство отключено');
    this.emit('disconnected');
    
    this.disconnectCount++;
    
    if (this.session && this.session.status === ThicknessStatus.MEASURING) {
      this.session.status = ThicknessStatus.INCOMPLETE;
      this.session.endTime = Date.now();
      
      logger.info('Сессия измерений сохранена как incomplete', {
        sessionId: this.session.sessionId,
        measuredZones: this.session.measuredZones,
      });
    }

    if (this.disconnectCount >= 3) {
      this.status = ThicknessStatus.UNAVAILABLE;
      logger.error('Превышен лимит разрывов соединения', { count: this.disconnectCount });
      this.emit('error', new Error('Устройство недоступно после множественных разрывов'));
    } else if (this.config.autoReconnect) {
      this.reconnectAttempts = 0;
      this.connectToDevice().catch(err => {
        logger.error('Ошибка автоматического переподключения', { error: err.message });
      });
    }
  }

  private createSessionSummary(): MeasurementSessionSummary {
    if (!this.session) {
      throw new Error('Нет активной сессии');
    }

    return {
      sessionId: this.session.sessionId,
      measurements: [...this.session.measurements],
      measuredZones: this.session.measuredZones,
      totalZones: this.session.totalZones,
      duration: (this.session.endTime ?? Date.now()) - this.session.startTime,
      status: this.session.status,
    };
  }
}
