import { EventEmitter } from 'events';
import { Transport } from '../transport/Transport.js';
import { PidDatabase } from '../database/PidDatabase.js';
import { DtcDatabase } from '../database/DtcDatabase.js';
import { parsePidResponse } from '../parsers/PidParser.js';
import { parseDtc } from '../parsers/DtcParser.js';
import { DeviceObd, ObdStatus, PidResponse, DtcEntry, ObdConfig } from '../types/ObdTypes.js';

/**
 * ELM327 команды инициализации (на основе node-bluetooth-obd)
 */
const INIT_COMMANDS = [
  'ATZ',    // Reset
  'ATE0',   // Echo off
  'ATL0',   // Linefeeds off
  'ATS0',   // Spaces off
  'ATH0',   // Headers off
  'ATSP0'   // Set protocol to auto
];

/**
 * Конфигурация ELM327 драйвера
 */
export interface Elm327Config extends ObdConfig {
  initTimeout?: number;
  commandTimeout?: number;
  maxRetries?: number;
  protocol?: string;
}

/**
 * ELM327 драйвер на основе анализа node-bluetooth-obd и node-obd2
 */
export class Elm327Driver extends EventEmitter implements DeviceObd {
  private transport: Transport;
  private pidDatabase: PidDatabase;
  private dtcDatabase: DtcDatabase;
  private status: ObdStatus = ObdStatus.DISCONNECTED;
  private config: Elm327Config;
  private commandQueue: Array<{ command: string, resolve: Function, reject: Function }> = [];
  private isProcessingQueue: boolean = false;
  private currentCommand: string | null = null;
  private responseBuffer: string = '';
  private commandTimer: NodeJS.Timeout | null = null;

  constructor(transport: Transport, config: Partial<Elm327Config> = {}) {
    super();
    this.transport = transport;
    this.config = {
      transport: 'serial',
      port: 'COM1',
      initTimeout: 5000,
      commandTimeout: 3000,
      maxRetries: 3,
      protocol: 'auto',
      ...config
    };

    this.pidDatabase = new PidDatabase();
    this.dtcDatabase = new DtcDatabase();

    this.setupTransportEvents();
  }

  private setupTransportEvents(): void {
    this.transport.on('open', () => {
      this.emit('connected');
    });

    this.transport.on('close', () => {
      this.status = ObdStatus.DISCONNECTED;
      this.emit('disconnected');
    });

    this.transport.on('error', (error: Error) => {
      this.status = ObdStatus.ERROR;
      this.emit('error', error);
    });

    this.transport.on('data', (data: string) => {
      this.handleIncomingData(data);
    });
  }

  async init(config: ObdConfig): Promise<void> {
    // Обновляем конфигурацию
    this.config = { ...this.config, ...config };

    // Вызываем connect
    await this.connect();
  }

  async connect(): Promise<void> {
    try {
      this.status = ObdStatus.CONNECTING;
      this.emit('connecting');

      // Открываем транспорт
      await this.transport.open();

      // Инициализация ELM327
      await this.initializeElm327();

      this.status = ObdStatus.READY;
      this.emit('connected');

    } catch (error) {
      this.status = ObdStatus.ERROR;
      this.emit('error', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      this.status = ObdStatus.DISCONNECTED;

      // Очищаем очередь команд
      this.clearCommandQueue();

      // Закрываем транспорт
      await this.transport.close();

      this.status = ObdStatus.DISCONNECTED;
      this.emit('disconnected');

    } catch (error) {
      this.status = ObdStatus.ERROR;
      this.emit('error', error);
      throw error;
    }
  }

  private async initializeElm327(): Promise<void> {
    for (const command of INIT_COMMANDS) {
      const response = await this.sendCommand(command, this.config.initTimeout);

      // Проверяем ответы на критичные команды
      if (command === 'ATZ' && !response.includes('ELM327')) {
        throw new Error('ELM327 not detected. Expected identification response.');
      }

      if (command !== 'ATZ' && response !== 'OK') {
        console.warn(`ELM327 init warning: Command ${command} returned: ${response}`);
      }
    }

    // Получаем информацию о версии
    const version = await this.sendCommand('ATI');
    this.emit('initialized', { version });
  }

  async readPid(pid: string): Promise<PidResponse> {
    if (this.status !== ObdStatus.READY) {
      throw new Error('OBD device not connected');
    }

    // Проверяем PID в базе данных
    const pidInfo = this.pidDatabase.getPidByCode('01', pid);
    if (!pidInfo) {
      throw new Error(`Unknown PID: ${pid}`);
    }

    try {
      // Формируем команду (Mode 01 + PID)
      const command = `01${pid}`;
      const response = await this.sendCommand(command);

      // Парсим ответ
      const parsedResponse = parsePidResponse(response, pid);

      // Эмитим событие для мониторинга
      this.emit('pidRead', { pid, response: parsedResponse });

      return parsedResponse;

    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  async readDtc(): Promise<DtcEntry[]> {
    if (this.status !== ObdStatus.READY) {
      throw new Error('OBD device not connected');
    }

    try {
      // Mode 03 - Запрос кодов неисправностей
      const response = await this.sendCommand('03');

      // Парсим DTC коды
      const dtcCodes = parseDtc(response);

      // Обогащаем описаниями из базы данных (parseDtc уже возвращает DtcEntry[])
      const dtcEntries: DtcEntry[] = dtcCodes.map((entry: DtcEntry) => {
        const dtcInfo = this.dtcDatabase.getDtcInfo(entry.code);
        return {
          ...entry,
          description: dtcInfo?.description || entry.description
        };
      });      // Эмитим событие
      this.emit('dtcRead', dtcEntries);

      return dtcEntries;

    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  async clearDtc(): Promise<boolean> {
    if (this.status !== ObdStatus.READY) {
      throw new Error('OBD device not connected');
    }

    try {
      // Mode 04 - Очистка кодов неисправностей
      const response = await this.sendCommand('04');

      // Проверяем успешность операции
      const success = response.includes('44') || response === 'OK';

      // Эмитим событие
      this.emit('dtcCleared', { success });

      return success;

    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  async getSupportedPids(): Promise<string[]> {
    if (this.status !== ObdStatus.READY) {
      throw new Error('OBD device not connected');
    }

    try {
      const supportedPids: string[] = [];

      // Проверяем поддержку PIDs 01-20
      const response1 = await this.sendCommand('0100');
      const pids1 = this.parseSupportedPidsResponse(response1, 1);
      supportedPids.push(...pids1);

      // Если поддерживается PID 20, проверяем PIDs 21-40
      if (pids1.includes('20')) {
        const response2 = await this.sendCommand('0120');
        const pids2 = this.parseSupportedPidsResponse(response2, 21);
        supportedPids.push(...pids2);
      }

      // Если поддерживается PID 40, проверяем PIDs 41-60
      if (supportedPids.includes('40')) {
        const response3 = await this.sendCommand('0140');
        const pids3 = this.parseSupportedPidsResponse(response3, 41);
        supportedPids.push(...pids3);
      }

      return supportedPids;

    } catch (error) {
      this.emit('error', error);
      throw error;
    }
  }

  private parseSupportedPidsResponse(response: string, startPid: number): string[] {
    // Алгоритм из node-bluetooth-obd для парсинга битовой маски поддерживаемых PIDs
    const supported: string[] = [];

    // Удаляем заголовок ответа "41 XX "
    const dataHex = response.replace(/^41\s\w{2}\s/, '').replace(/\s/g, '');

    if (dataHex.length < 8) {
      return supported;
    }

    // Конвертируем hex в бинарное представление
    const binaryString = parseInt(dataHex, 16).toString(2).padStart(32, '0');

    // Проверяем каждый бит
    for (let i = 0; i < 32; i++) {
      if (binaryString[i] === '1') {
        const pidNumber = startPid + i;
        const pidHex = pidNumber.toString(16).toUpperCase().padStart(2, '0');
        supported.push(pidHex);
      }
    }

    return supported;
  }

  private async sendCommand(command: string, timeout?: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeoutMs = timeout || this.config.commandTimeout || 3000;

      this.commandQueue.push({
        command: command.trim().toUpperCase(),
        resolve,
        reject
      });

      // Устанавливаем таймаут
      const timer = setTimeout(() => {
        reject(new Error(`Command timeout: ${command}`));
      }, timeoutMs);

      // Сохраняем таймер для возможной отмены
      const originalResolve = resolve;
      const originalReject = reject;

      const wrappedResolve = (result: any) => {
        clearTimeout(timer);
        originalResolve(result);
      };

      const wrappedReject = (error: any) => {
        clearTimeout(timer);
        originalReject(error);
      };

      // Обновляем в очереди
      const queueItem = this.commandQueue[this.commandQueue.length - 1];
      queueItem.resolve = wrappedResolve;
      queueItem.reject = wrappedReject;

      // Обрабатываем очередь
      this.processCommandQueue();
    });
  }

  private async processCommandQueue(): Promise<void> {
    if (this.isProcessingQueue || this.commandQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.commandQueue.length > 0) {
      const { command, resolve, reject } = this.commandQueue.shift()!;

      try {
        this.currentCommand = command;
        this.responseBuffer = '';

        // Отправляем команду
        await this.transport.write(command + '\r');

        // Ждем ответ (будет обработан в handleIncomingData)
        const response = await this.waitForResponse();

        this.currentCommand = null;
        resolve(response);

      } catch (error) {
        this.currentCommand = null;
        reject(error);
      }
    }

    this.isProcessingQueue = false;
  }

  private waitForResponse(): Promise<string> {
    return new Promise((resolve) => {
      const checkResponse = () => {
        if (this.responseBuffer.includes('>') ||
            this.responseBuffer.includes('OK') ||
            this.responseBuffer.includes('ERROR') ||
            this.responseBuffer.includes('?') ||
            this.responseBuffer.includes('NO DATA')) {

          const response = this.responseBuffer.replace(/>/g, '').trim();
          resolve(response);
        } else {
          // Продолжаем ждать
          setTimeout(checkResponse, 50);
        }
      };

      checkResponse();
    });
  }

  private handleIncomingData(data: string): void {
    // Добавляем данные в буфер
    this.responseBuffer += data;

    // Эмитим сырые данные для отладки
    this.emit('rawData', data);
  }

  private clearCommandQueue(): void {
    // Отклоняем все ожидающие команды
    for (const { reject } of this.commandQueue) {
      reject(new Error('Connection closed'));
    }
    this.commandQueue = [];
    this.isProcessingQueue = false;
    this.currentCommand = null;
    this.responseBuffer = '';

    if (this.commandTimer) {
      clearTimeout(this.commandTimer);
      this.commandTimer = null;
    }
  }

  getStatus(): ObdStatus {
    return this.status;
  }

  getConnectionInfo(): string {
    return this.transport.getConnectionInfo();
  }

  isConnected(): boolean {
    return this.status === ObdStatus.READY;
  }

  /**
   * Получить конфигурацию драйвера
   */
  getConfig(): Elm327Config {
    return { ...this.config };
  }

  /**
   * Обновить конфигурацию драйвера
   */
  updateConfig(newConfig: Partial<Elm327Config>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Получить статистику драйвера
   */
  getStats(): any {
    return {
      status: this.status,
      queueLength: this.commandQueue.length,
      currentCommand: this.currentCommand,
      isProcessing: this.isProcessingQueue,
      connectionInfo: this.getConnectionInfo()
    };
  }
}

export default Elm327Driver;
