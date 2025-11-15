/**
 * ELM327 Emulator - Эмулятор OBD-II адаптера для тестирования
 * Симулирует реальное поведение ELM327 чипа с различными сценариями
 */

import { EventEmitter } from 'events';
// Определяем интерфейс транспорта локально для эмулятора
export interface Elm327Transport {
  open(): Promise<void>;
  close(): Promise<void>;
  write(data: string): Promise<void>;
  onData(listener: (chunk: string) => void): void;
  offData(listener: (chunk: string) => void): void;
  onClose(listener: () => void): void;
  offClose(listener: () => void): void;
  onError(listener: (error: Error) => void): void;
  offError(listener: (error: Error) => void): void;
}

export interface EmulatorConfig {
  vehicleProfile: VehicleProfile;
  responseDelay: number; // мс
  errorRate: number; // 0-1, вероятность ошибки
  includeFrameData: boolean;
  simulateConnectionLoss: boolean;
  customDtcCodes?: string[];
}

export interface VehicleProfile {
  make: string;
  model: string;
  year: number;
  engine: string;
  transmission: string;
  ecuProtocol: 'ISO 14230-4' | 'ISO 15765-4' | 'ISO 9141-2' | 'J1850 PWM' | 'J1850 VPW';
  supportedPids: string[];
  basePidValues: Record<string, number>;
  commonDtcCodes: string[];
}

// Предустановленные профили автомобилей
export const VEHICLE_PROFILES: Record<string, VehicleProfile> = {
  toyota_camry_2015: {
    make: 'Toyota',
    model: 'Camry',
    year: 2015,
    engine: '2.5L 4-cylinder',
    transmission: 'CVT',
    ecuProtocol: 'ISO 15765-4',
    supportedPids: ['01', '05', '06', '07', '0A', '0B', '0C', '0D', '0E', '0F', '10', '11', '13', '14', '15', '1C', '1F', '21', '2F', '30', '31', '33', '42', '43', '44', '45', '46', '47', '48', '49', '4A', '4B', '4C', '4D', '4E', '51', '52'],
    basePidValues: {
      '05': 85,    // Coolant temp: 85°C
      '06': 15,    // Short term fuel trim: 15%
      '07': 10,    // Long term fuel trim: 10%
      '0A': 35,    // Fuel pressure: 35 kPa
      '0B': 29,    // Intake manifold pressure: 29 kPa
      '0C': 800,   // RPM: 800
      '0D': 0,     // Speed: 0 km/h
      '0E': 10,    // Timing advance: 10°
      '0F': 25,    // Intake air temp: 25°C
      '10': 15,    // MAF: 15 g/s
      '11': 0,     // Throttle: 0%
      '21': 35000, // Distance with MIL: 35000 km
      '2F': 45,    // Fuel level: 45%
      '33': 101,   // Barometric pressure: 101 kPa
      '42': 12500, // Control module voltage: 12.5V
      '43': 25,    // Absolute load: 25%
      '44': 1.0,   // Fuel/air ratio: 1.0
      '45': 15,    // Relative throttle: 15%
      '46': 22,    // Ambient air temp: 22°C
      '47': 0,     // Absolute throttle B: 0%
      '48': 0,     // Absolute throttle C: 0%
      '49': 0,     // Accelerator pedal D: 0%
      '4A': 0,     // Accelerator pedal E: 0%
      '4B': 0,     // Accelerator pedal F: 0%
      '4C': 0,     // Commanded throttle: 0%
      '51': 1,     // Fuel type: Gasoline
      '52': 75     // Ethanol fuel %: 75%
    },
    commonDtcCodes: ['P0301', 'P0171', 'P0420']
  },

  lexus_rx350_2018: {
    make: 'Lexus',
    model: 'RX350',
    year: 2018,
    engine: '3.5L V6',
    transmission: '8-speed automatic',
    ecuProtocol: 'ISO 15765-4',
    supportedPids: ['01', '05', '06', '07', '0A', '0B', '0C', '0D', '0E', '0F', '10', '11', '13', '14', '15', '1C', '1F', '21', '2F', '30', '31', '33', '42', '43', '44', '45', '46', '47', '48', '49', '4A', '4B', '4C', '4D', '4E', '51', '52'],
    basePidValues: {
      '05': 88,
      '0C': 750,
      '0D': 0,
      '11': 0,
      '2F': 60,
      '42': 13200,
      '46': 24
    },
    commonDtcCodes: ['P0300', 'P0401', 'P0442', 'P0506']
  },

  bmw_x5_2019: {
    make: 'BMW',
    model: 'X5',
    year: 2019,
    engine: '3.0L Turbo I6',
    transmission: '8-speed automatic',
    ecuProtocol: 'ISO 15765-4',
    supportedPids: ['01', '05', '06', '07', '0A', '0B', '0C', '0D', '0E', '0F', '10', '11', '13', '14', '15', '1C', '1F', '21', '2F', '30', '31', '33', '42', '43', '44', '45', '46'],
    basePidValues: {
      '05': 90,
      '0C': 850,
      '0D': 0,
      '11': 0,
      '2F': 55,
      '42': 13800
    },
    commonDtcCodes: ['P0171', 'P0174', 'P2177', 'P2187']
  }
};

export class ELM327EmulatorTransport extends EventEmitter implements Elm327Transport {
  private config: EmulatorConfig;
  private isOpen = false;
  private currentRpm = 800;
  private currentSpeed = 0;
  private currentCoolantTemp = 85;
  private currentThrottle = 0;
  private currentFuelLevel = 50;
  private engineRunning = true;
  private dtcCodes: string[] = [];
  private responseBuffer = '';
  private commandHistory: string[] = [];

  constructor(config: Partial<EmulatorConfig> = {}) {
    super();
    this.config = {
      vehicleProfile: VEHICLE_PROFILES.toyota_camry_2015,
      responseDelay: 100,
      errorRate: 0.05,
      includeFrameData: true,
      simulateConnectionLoss: false,
      ...config
    };

    // Инициализация DTC кодов
    this.dtcCodes = [...this.config.vehicleProfile.commonDtcCodes];
    if (config.customDtcCodes) {
      this.dtcCodes.push(...config.customDtcCodes);
    }

    // Симуляция изменений параметров
    this.startParameterSimulation();
  }

  async open(): Promise<void> {
    if (this.isOpen) return;

    await this.delay(200); // Симуляция времени подключения
    this.isOpen = true;
    this.emit('connected');
  }

  async close(): Promise<void> {
    if (!this.isOpen) return;

    this.isOpen = false;
    this.emit('disconnected');
  }

  async write(data: string): Promise<void> {
    if (!this.isOpen) {
      throw new Error('Transport not open');
    }

    const command = data.trim().toUpperCase();
    this.commandHistory.push(command);

    // Симуляция потери соединения
    if (this.config.simulateConnectionLoss && Math.random() < 0.01) {
      this.emit('error', new Error('Connection lost'));
      return;
    }

    // Симуляция ошибок
    if (Math.random() < this.config.errorRate) {
      setTimeout(() => {
        this.emit('data', 'ERROR\r\n>');
      }, this.config.responseDelay);
      return;
    }

    // Обработка команды
    setTimeout(() => {
      const response = this.processCommand(command);
      this.emit('data', response + '\r\n>');
    }, this.config.responseDelay);
  }

  onData(listener: (chunk: string) => void): void {
    this.on('data', listener);
  }

  offData(listener: (chunk: string) => void): void {
    this.off('data', listener);
  }

  onClose(listener: () => void): void {
    this.on('disconnected', listener);
  }

  offClose(listener: () => void): void {
    this.off('disconnected', listener);
  }

  onError(listener: (error: Error) => void): void {
    this.on('error', listener);
  }

  offError(listener: (error: Error) => void): void {
    this.off('error', listener);
  }

  private processCommand(command: string): string {
    // ELM327 AT команды
    if (command.startsWith('AT')) {
      return this.processAtCommand(command);
    }

    // OBD команды (Mode 01, 03, 04, etc.)
    if (command.match(/^[0-9A-F]{2,}/)) {
      return this.processObdCommand(command);
    }

    return 'UNKNOWN COMMAND';
  }

  private processAtCommand(command: string): string {
    switch (command) {
      case 'ATZ':
        return 'ELM327 v2.1';
      case 'ATE0':
        return 'OK';
      case 'ATL0':
        return 'OK';
      case 'ATS0':
        return 'OK';
      case 'ATH1':
        return 'OK';
      case 'ATSP0':
        return 'OK';
      case 'ATDP':
        return this.config.vehicleProfile.ecuProtocol;
      case 'ATRV':
        return `${(this.config.vehicleProfile.basePidValues['42'] / 1000).toFixed(1)}V`;
      case 'ATI':
        return `ELM327 v2.1\r\nOBD Emulator\r\n${this.config.vehicleProfile.make} ${this.config.vehicleProfile.model}`;
      default:
        return 'OK';
    }
  }

  private processObdCommand(command: string): string {
    const mode = command.substring(0, 2);
    const pid = command.substring(2, 4);

    switch (mode) {
      case '01': // Show current data
        return this.processMode01(pid);
      case '03': // Show stored DTCs
        return this.processMode03();
      case '04': // Clear DTCs
        return this.processMode04();
      case '09': // Vehicle info
        return this.processMode09(pid);
      default:
        return 'NO DATA';
    }
  }

  private processMode01(pid: string): string {
    const profile = this.config.vehicleProfile;

    if (!profile.supportedPids.includes(pid)) {
      return 'NO DATA';
    }

    const responseHeader = this.config.includeFrameData ? '41 ' : '';

    switch (pid) {
      case '00': // PIDs supported
        return responseHeader + 'BE1FA813';
      case '05': // Engine coolant temperature
        return responseHeader + pid + ' ' + (this.currentCoolantTemp + 40).toString(16).toUpperCase().padStart(2, '0');
      case '0C': { // Engine RPM
        const rpmHex = (this.currentRpm * 4).toString(16).toUpperCase().padStart(4, '0');
        return responseHeader + pid + ' ' + rpmHex.substring(0, 2) + ' ' + rpmHex.substring(2, 4);
      }
      case '0D': // Vehicle speed
        return responseHeader + pid + ' ' + this.currentSpeed.toString(16).toUpperCase().padStart(2, '0');
      case '11': // Throttle position
        return responseHeader + pid + ' ' + Math.round(this.currentThrottle * 2.55).toString(16).toUpperCase().padStart(2, '0');
      case '2F': // Fuel level
        return responseHeader + pid + ' ' + Math.round(this.currentFuelLevel * 2.55).toString(16).toUpperCase().padStart(2, '0');
      case '42': { // Control module voltage
        const voltage = profile.basePidValues[pid] || 12500;
        const voltageHex = voltage.toString(16).toUpperCase().padStart(4, '0');
        return responseHeader + pid + ' ' + voltageHex.substring(0, 2) + ' ' + voltageHex.substring(2, 4);
      }
      default: {
        const value = profile.basePidValues[pid] || 0;
        return responseHeader + pid + ' ' + value.toString(16).toUpperCase().padStart(2, '0');
      }
    }
  }

  private processMode03(): string {
    if (this.dtcCodes.length === 0) {
      return 'NO DATA';
    }

    let response = '43 '; // Mode 03 response
    response += this.dtcCodes.length.toString(16).toUpperCase().padStart(2, '0') + ' ';

    for (const dtc of this.dtcCodes) {
      const dtcBytes = this.encodeDtc(dtc);
      response += dtcBytes + ' ';
    }

    return response.trim();
  }

  private processMode04(): string {
    this.dtcCodes = [];
    return '44'; // Mode 04 response - DTCs cleared
  }

  private processMode09(pid: string): string {
    const profile = this.config.vehicleProfile;

    switch (pid) {
      case '02': // VIN
        return '49 02 01 ' + this.generateVin();
      case '04': // Calibration ID
        return '49 04 01 ' + Buffer.from(profile.make + profile.model).toString('hex').toUpperCase();
      case '0A': // ECU name
        return '49 0A 01 ' + Buffer.from(`${profile.make} ECU`).toString('hex').toUpperCase();
      default:
        return 'NO DATA';
    }
  }

  private encodeDtc(dtc: string): string {
    // Кодирование DTC в hex формат
    const firstChar = dtc[0];
    const numbers = dtc.substring(1);

    let firstByte = 0;
    switch (firstChar) {
      case 'P': firstByte = 0x00; break;
      case 'C': firstByte = 0x40; break;
      case 'B': firstByte = 0x80; break;
      case 'U': firstByte = 0xC0; break;
    }

    firstByte += parseInt(numbers[0], 16);
    const secondByte = parseInt(numbers.substring(1), 16);

    return firstByte.toString(16).toUpperCase().padStart(2, '0') + ' ' +
           secondByte.toString(16).toUpperCase().padStart(2, '0');
  }

  private generateVin(): string {
    const profile = this.config.vehicleProfile;
    // Генерация простого VIN на основе профиля
    const makeCode = profile.make.substring(0, 3).toUpperCase();
    const year = profile.year.toString().substring(2);
    const randomSerial = Math.random().toString(36).substring(2, 8).toUpperCase();
    return Buffer.from(`${makeCode}${year}${randomSerial}000000`).toString('hex').toUpperCase();
  }

  private startParameterSimulation(): void {
    // Симуляция изменения параметров двигателя
    setInterval(() => {
      if (this.engineRunning) {
        // Небольшие флуктуации RPM
        this.currentRpm += (Math.random() - 0.5) * 50;
        this.currentRpm = Math.max(600, Math.min(8000, this.currentRpm));

        // Изменение температуры охлаждающей жидкости
        this.currentCoolantTemp += (Math.random() - 0.5) * 2;
        this.currentCoolantTemp = Math.max(70, Math.min(110, this.currentCoolantTemp));

        // Симуляция движения
        if (Math.random() < 0.1) {
          this.currentSpeed = Math.random() * 120;
          this.currentThrottle = Math.random() * 100;
        } else {
          this.currentSpeed *= 0.95; // Постепенное замедление
          this.currentThrottle *= 0.9;
        }

        // Расход топлива
        if (this.currentSpeed > 0) {
          this.currentFuelLevel -= 0.01;
          this.currentFuelLevel = Math.max(0, this.currentFuelLevel);
        }
      }
    }, 1000);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Публичные методы для управления симуляцией
  public setEngineRunning(running: boolean): void {
    this.engineRunning = running;
    if (!running) {
      this.currentRpm = 0;
      this.currentSpeed = 0;
      this.currentThrottle = 0;
    }
  }

  public addDtcCode(code: string): void {
    if (!this.dtcCodes.includes(code)) {
      this.dtcCodes.push(code);
    }
  }

  public setParameter(pid: string, value: number): void {
    switch (pid) {
      case '0C': this.currentRpm = value; break;
      case '0D': this.currentSpeed = value; break;
      case '05': this.currentCoolantTemp = value; break;
      case '11': this.currentThrottle = value; break;
      case '2F': this.currentFuelLevel = value; break;
    }
  }

  public getStats(): any {
    return {
      isOpen: this.isOpen,
      commandHistory: this.commandHistory.slice(-10),
      currentState: {
        rpm: this.currentRpm,
        speed: this.currentSpeed,
        coolantTemp: this.currentCoolantTemp,
        throttle: this.currentThrottle,
        fuelLevel: this.currentFuelLevel,
        engineRunning: this.engineRunning
      },
      dtcCodes: this.dtcCodes
    };
  }
}
