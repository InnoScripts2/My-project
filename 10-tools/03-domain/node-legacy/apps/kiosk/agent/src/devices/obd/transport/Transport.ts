import { EventEmitter } from 'events';

/**
 * Базовый интерфейс для всех транспортов OBD-II
 */
export interface Transport extends EventEmitter {
  /**
   * Открыть соединение
   */
  open(): Promise<void>;

  /**
   * Закрыть соединение
   */
  close(): Promise<void>;

  /**
   * Отправить данные
   */
  write(data: string): Promise<void>;

  /**
   * Проверить состояние соединения
   */
  isOpen(): boolean;

  /**
   * Получить информацию о порте/устройстве
   */
  getConnectionInfo(): string;
}

/**
 * Конфигурация Serial транспорта
 */
export interface SerialConfig {
  port: string;
  baudRate?: number;
  dataBits?: 5 | 6 | 7 | 8;
  stopBits?: 1 | 1.5 | 2;
  parity?: 'none' | 'even' | 'odd' | 'mark' | 'space';
  rtscts?: boolean;
  xon?: boolean;
  xoff?: boolean;
  timeout?: number;
}

/**
 * Конфигурация Bluetooth транспорта
 */
export interface BluetoothConfig {
  address: string;
  channel?: number;
  name?: string;
  timeout?: number;
}

/**
 * Конфигурация USB транспорта
 */
export interface UsbConfig {
  vendorId?: number;
  productId?: number;
  serialNumber?: string;
  timeout?: number;
}

/**
 * События транспорта
 */
export interface TransportEvents {
  'open': () => void;
  'close': () => void;
  'data': (data: string) => void;
  'error': (error: Error) => void;
}

/**
 * Базовый класс для всех транспортов
 */
export abstract class BaseTransport extends EventEmitter implements Transport {
  protected isConnected: boolean = false;
  protected connectionInfo: string = '';

  abstract open(): Promise<void>;
  abstract close(): Promise<void>;
  abstract write(data: string): Promise<void>;

  isOpen(): boolean {
    return this.isConnected;
  }

  getConnectionInfo(): string {
    return this.connectionInfo;
  }

  protected handleData(data: Buffer | string): void {
    // Преобразуем в строку и нормализуем окончания строк
    const dataString = data.toString().replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Разбиваем на строки и эмитим каждую непустую строку
    const lines = dataString.split('\n');
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine) {
        this.emit('data', trimmedLine);
      }
    }
  }

  protected handleError(error: Error): void {
    this.emit('error', error);
  }

  protected handleClose(): void {
    this.isConnected = false;
    this.emit('close');
  }

  protected handleOpen(): void {
    this.isConnected = true;
    this.emit('open');
  }
}

/**
 * Mock транспорт для тестирования (DEV режим)
 */
export class MockTransport extends BaseTransport {
  private mockResponses: Map<string, string> = new Map();
  private responseDelay: number = 100;

  constructor() {
    super();
    
    // IMPORTANT: MockTransport is ONLY for development and testing
    // Never use in production environment
    if (process.env.AGENT_ENV === 'PROD' || process.env.NODE_ENV === 'production') {
      throw new Error(
        'MockTransport cannot be instantiated in PROD environment. ' +
        'Use real serial/bluetooth/usb transport instead.'
      );
    }
    
    this.setupDefaultMockResponses();
  }

  async open(): Promise<void> {
    await this.delay(50);
    this.connectionInfo = 'Mock OBD-II Transport';
    this.handleOpen();
  }

  async close(): Promise<void> {
    await this.delay(50);
    this.handleClose();
  }

  async write(data: string): Promise<void> {
    const command = data.trim().toUpperCase();

    // Имитируем задержку сети
    await this.delay(this.responseDelay);

    // Находим подходящий ответ
    const response = this.getMockResponse(command);

    if (response) {
      // Эмитим ответ через небольшую задержку
      setTimeout(() => {
        this.handleData(response);
      }, 10);
    } else {
      // Неизвестная команда
      setTimeout(() => {
        this.handleData('?');
      }, 10);
    }
  }

  private setupDefaultMockResponses(): void {
    // AT команды
    this.mockResponses.set('ATZ', 'ELM327 v2.1');
    this.mockResponses.set('ATE0', 'OK');
    this.mockResponses.set('ATL0', 'OK');
    this.mockResponses.set('ATS0', 'OK');
    this.mockResponses.set('ATH0', 'OK');
    this.mockResponses.set('ATSP0', 'OK');
    this.mockResponses.set('ATI', 'ELM327 v2.1');

    // Поддерживаемые PIDs
    this.mockResponses.set('0100', '41 00 BE 3E B8 11'); // PIDs 01-20
    this.mockResponses.set('0120', '41 20 80 07 65 05'); // PIDs 21-40
    this.mockResponses.set('0140', '41 40 40 04 00 00'); // PIDs 41-60

    // Mode 01 PIDs (текущие данные)
    this.mockResponses.set('010C', '41 0C 1A F8'); // RPM = 1726
    this.mockResponses.set('010D', '41 0D 50');    // Speed = 80 km/h
    this.mockResponses.set('0105', '41 05 64');    // Temp = 60°C
    this.mockResponses.set('0104', '41 04 7F');    // Load = 49.8%
    this.mockResponses.set('010B', '41 0B 63');    // MAP = 99 kPa
    this.mockResponses.set('010F', '41 0F 46');    // IAT = 30°C
    this.mockResponses.set('0111', '41 11 80');    // Throttle = 50.2%

    // Mode 03 (DTC коды)
    this.mockResponses.set('03', '43 03 01 71 04 20 03 01'); // P0171, P0420, P0301

    // Mode 04 (Clear DTC)
    this.mockResponses.set('04', '44 00 00 00 00 00 00');

    // Ошибки
    this.mockResponses.set('0199', '41 99 NO DATA'); // Неподдерживаемый PID
  }

  private getMockResponse(command: string): string | undefined {
    // Прямое соответствие
    if (this.mockResponses.has(command)) {
      return this.mockResponses.get(command);
    }

    // Поиск по началу команды (для параметризованных команд)
    for (const [key, value] of this.mockResponses.entries()) {
      if (command.startsWith(key)) {
        return value;
      }
    }

    return undefined;
  }

  /**
   * Добавить кастомный mock ответ
   */
  addMockResponse(command: string, response: string): void {
    this.mockResponses.set(command.toUpperCase(), response);
  }

  /**
   * Установить задержку ответа для имитации реальной сети
   */
  setResponseDelay(delayMs: number): void {
    this.responseDelay = delayMs;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Factory для создания транспортов
 */
export class TransportFactory {
  /**
   * Создать транспорт по типу
   */
  static create(type: 'serial' | 'bluetooth' | 'usb' | 'mock', config?: any): Transport {
    // Guard against mock transport in production
    if (type === 'mock' && (process.env.AGENT_ENV === 'PROD' || process.env.NODE_ENV === 'production')) {
      throw new Error(
        'MockTransport is not available in PROD environment. ' +
        'Use real serial/bluetooth/usb transport instead.'
      );
    }

    switch (type) {
      case 'mock':
        return new MockTransport();

      case 'serial':
        throw new Error('Serial transport not implemented yet. Use mock transport in DEV mode.');

      case 'bluetooth':
        throw new Error('Bluetooth transport not implemented yet. Use mock transport in DEV mode.');

      case 'usb':
        throw new Error('USB transport not implemented yet. Use mock transport in DEV mode.');

      default:
        throw new Error(`Unknown transport type: ${type}`);
    }
  }

  /**
   * Проверить доступность транспорта
   */
  static isAvailable(type: 'serial' | 'bluetooth' | 'usb' | 'mock'): boolean {
    switch (type) {
      case 'mock':
        return true;

      case 'serial':
      case 'bluetooth':
      case 'usb':
        return false; // Пока не реализованы

      default:
        return false;
    }
  }

  /**
   * Получить список доступных портов/устройств
   */
  static async getAvailablePorts(type: 'serial' | 'bluetooth' | 'usb'): Promise<string[]> {
    switch (type) {
      case 'serial':
        return []; // TODO: Реализовать сканирование COM портов

      case 'bluetooth':
        return []; // TODO: Реализовать сканирование Bluetooth устройств

      case 'usb':
        return []; // TODO: Реализовать сканирование USB устройств

      default:
        throw new Error(`Unknown transport type: ${type}`);
    }
  }
}

