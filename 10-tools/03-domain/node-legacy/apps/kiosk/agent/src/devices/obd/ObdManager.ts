import { EventEmitter } from 'events';
import { Transport, TransportFactory, MockTransport } from './transport/Transport.js';
import { Elm327Driver } from './drivers/Elm327Driver.js';
import { ObdStatus, ObdConfig, PidResponse, DtcEntry } from './types/ObdTypes.js';

/**
 * Конфигурация менеджера OBD соединений
 */
export interface ObdManagerConfig {
  /** Режим работы: dev, qa, prod */
  mode?: 'dev' | 'qa' | 'prod';
  /** Автоматический поиск портов */
  autoDetect?: boolean;
  /** Список предпочтительных портов */
  preferredPorts?: string[];
  /** Таймаут соединения */
  connectionTimeout?: number;
  /** Интервал переподключения при ошибках */
  reconnectInterval?: number;
  /** Максимальное количество попыток переподключения */
  maxReconnectAttempts?: number;
}

/**
 * Информация о доступном OBD устройстве
 */
export interface ObdDeviceInfo {
  /** Тип транспорта */
  transport: 'serial' | 'bluetooth' | 'usb' | 'mock';
  /** Порт или адрес */
  port: string;
  /** Имя устройства (если доступно) */
  name?: string;
  /** Доступность устройства */
  available: boolean;
  /** Дополнительная информация */
  info?: string;
}

/**
 * Менеджер OBD соединений
 * Основан на паттернах из node-bluetooth-obd и node-obd2
 */
export class ObdManager extends EventEmitter {
  private config: Required<ObdManagerConfig>;
  private driver: Elm327Driver | null = null;
  private transport: Transport | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts: number = 0;
  private isConnecting: boolean = false;

  constructor(config: ObdManagerConfig = {}) {
    super();

    this.config = {
      mode: 'dev',
      autoDetect: true,
      preferredPorts: ['COM3', 'COM4', 'COM5'],
      connectionTimeout: 10000,
      reconnectInterval: 5000,
      maxReconnectAttempts: 3,
      ...config
    };
  }

  /**
   * Получить список доступных OBD устройств
   */
  async getAvailableDevices(): Promise<ObdDeviceInfo[]> {
    const devices: ObdDeviceInfo[] = [];

    try {
      // В DEV режиме всегда добавляем Mock устройство
      if (this.config.mode === 'dev') {
        devices.push({
          transport: 'mock',
          port: 'mock',
          name: 'Mock OBD-II Adapter (DEV)',
          available: true,
          info: 'Simulated ELM327 adapter for development'
        });
      }

      // Сканируем доступные порты (пока заглушки)
      const serialPorts = await TransportFactory.getAvailablePorts('serial');
      for (const port of serialPorts) {
        devices.push({
          transport: 'serial',
          port,
          name: `Serial OBD Adapter (${port})`,
          available: TransportFactory.isAvailable('serial'),
          info: 'Serial COM port adapter'
        });
      }

      const bluetoothDevices = await TransportFactory.getAvailablePorts('bluetooth');
      for (const device of bluetoothDevices) {
        devices.push({
          transport: 'bluetooth',
          port: device,
          name: `Bluetooth OBD Adapter`,
          available: TransportFactory.isAvailable('bluetooth'),
          info: 'Bluetooth ELM327 adapter'
        });
      }

      const usbDevices = await TransportFactory.getAvailablePorts('usb');
      for (const device of usbDevices) {
        devices.push({
          transport: 'usb',
          port: device,
          name: `USB OBD Adapter`,
          available: TransportFactory.isAvailable('usb'),
          info: 'USB OBD-II adapter'
        });
      }

    } catch (error) {
      this.emit('error', new Error(`Failed to scan for devices: ${error}`));
    }

    return devices;
  }

  /**
   * Подключиться к OBD устройству
   */
  async connect(deviceInfo?: ObdDeviceInfo): Promise<void> {
    if (this.isConnecting) {
      throw new Error('Connection already in progress');
    }

    if (this.driver && this.driver.isConnected()) {
      throw new Error('Device already connected');
    }

    this.isConnecting = true;
    this.emit('connecting');

    try {
      // Если устройство не указано, пытаемся найти автоматически
      if (!deviceInfo) {
        deviceInfo = await this.autoDetectDevice();
      }

      // Создаем транспорт
      this.transport = TransportFactory.create(deviceInfo.transport, {
        port: deviceInfo.port
      });

      // Создаем драйвер
      this.driver = new Elm327Driver(this.transport);
      this.setupDriverEvents();

      // Подключаемся
      const config: ObdConfig = {
        transport: deviceInfo.transport === 'mock' ? 'serial' : deviceInfo.transport,
        port: deviceInfo.port,
        timeout: this.config.connectionTimeout
      };

      await this.driver.init(config);

      this.reconnectAttempts = 0;
      this.isConnecting = false;
      this.emit('connected', deviceInfo);

    } catch (error) {
      this.isConnecting = false;
      this.cleanup();
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Отключиться от OBD устройства
   */
  async disconnect(): Promise<void> {
    this.clearReconnectTimer();

    if (this.driver) {
      try {
        await this.driver.disconnect();
      } catch (error) {
        // Игнорируем ошибки при отключении
      }
    }

    this.cleanup();
    this.emit('disconnected');
  }

  /**
   * Получить текущий статус
   */
  getStatus(): ObdStatus {
    return this.driver ? this.driver.getStatus() : ObdStatus.DISCONNECTED;
  }

  /**
   * Проверить подключение
   */
  isConnected(): boolean {
    return this.driver ? this.driver.isConnected() : false;
  }

  /**
   * Прочитать PID
   */
  async readPid(pid: string): Promise<PidResponse> {
    if (!this.driver) {
      throw new Error('No OBD device connected');
    }
    return this.driver.readPid(pid);
  }

  /**
   * Прочитать DTC коды
   */
  async readDtc(): Promise<DtcEntry[]> {
    if (!this.driver) {
      throw new Error('No OBD device connected');
    }
    return this.driver.readDtc();
  }

  /**
   * Очистить DTC коды
   */
  async clearDtc(): Promise<boolean> {
    if (!this.driver) {
      throw new Error('No OBD device connected');
    }
    return this.driver.clearDtc();
  }

  /**
   * Получить поддерживаемые PIDs
   */
  async getSupportedPids(): Promise<string[]> {
    if (!this.driver) {
      throw new Error('No OBD device connected');
    }
    return this.driver.getSupportedPids();
  }

  /**
   * Получить информацию о соединении
   */
  getConnectionInfo(): string {
    if (!this.driver) {
      return 'Not connected';
    }
    return this.driver.getConnectionInfo();
  }

  /**
   * Получить статистику драйвера
   */
  getDriverStats(): any {
    if (!this.driver) {
      return null;
    }
    return this.driver.getStats();
  }

  private async autoDetectDevice(): Promise<ObdDeviceInfo> {
    const devices = await this.getAvailableDevices();
    const availableDevices = devices.filter(d => d.available);

    if (availableDevices.length === 0) {
      throw new Error('No OBD devices found');
    }

    // В DEV режиме предпочитаем Mock устройство
    if (this.config.mode === 'dev') {
      const mockDevice = availableDevices.find(d => d.transport === 'mock');
      if (mockDevice) {
        return mockDevice;
      }
    }

    // Пытаемся найти предпочтительные порты
    for (const preferredPort of this.config.preferredPorts) {
      const device = availableDevices.find(d => d.port === preferredPort);
      if (device) {
        return device;
      }
    }

    // Возвращаем первое доступное устройство
    return availableDevices[0];
  }

  private setupDriverEvents(): void {
    if (!this.driver) return;

    this.driver.on('connected', () => {
      this.emit('deviceConnected');
    });

    this.driver.on('disconnected', () => {
      this.emit('deviceDisconnected');
      if (this.config.maxReconnectAttempts > 0) {
        this.scheduleReconnect();
      }
    });

    this.driver.on('error', (error: Error) => {
      this.emit('deviceError', error);
      if (this.config.maxReconnectAttempts > 0) {
        this.scheduleReconnect();
      }
    });

    this.driver.on('pidRead', (data: any) => {
      this.emit('pidRead', data);
    });

    this.driver.on('dtcRead', (data: any) => {
      this.emit('dtcRead', data);
    });

    this.driver.on('dtcCleared', (data: any) => {
      this.emit('dtcCleared', data);
    });

    this.driver.on('rawData', (data: any) => {
      this.emit('rawData', data);
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.emit('reconnectFailed', {
        attempts: this.reconnectAttempts,
        maxAttempts: this.config.maxReconnectAttempts
      });
      return;
    }

    this.clearReconnectTimer();

    this.reconnectAttempts++;
    this.emit('reconnectScheduled', {
      attempt: this.reconnectAttempts,
      maxAttempts: this.config.maxReconnectAttempts,
      delay: this.config.reconnectInterval
    });

    this.reconnectTimer = setTimeout(async () => {
      try {
        this.emit('reconnecting', this.reconnectAttempts);
        await this.connect();
      } catch (error) {
        this.emit('reconnectError', error);
        this.scheduleReconnect();
      }
    }, this.config.reconnectInterval);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private cleanup(): void {
    this.driver = null;
    this.transport = null;
    this.isConnecting = false;
  }

  /**
   * Обновить конфигурацию
   */
  updateConfig(newConfig: Partial<ObdManagerConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Получить текущую конфигурацию
   */
  getConfig(): Required<ObdManagerConfig> {
    return { ...this.config };
  }
}

export default ObdManager;
