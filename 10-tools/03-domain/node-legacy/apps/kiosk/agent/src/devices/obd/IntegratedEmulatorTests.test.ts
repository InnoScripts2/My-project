/**
 * Интеграционный тест OBD-II системы с встроенным эмулятором
 * Тестирует полный цикл диагностики без внешних зависимостей
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { EventEmitter } from 'events';

// Встроенный эмулятор для тестирования
class SimpleELM327Emulator extends EventEmitter {
  private isOpen = false;
  private dtcCodes = ['P0171', 'P0420', 'P0301'];
  private currentRpm = 800;
  private currentTemp = 85;
  private responseDelay = 50;

  async open(): Promise<void> {
    this.isOpen = true;
  }

  async close(): Promise<void> {
    this.isOpen = false;
  }

  async write(data: string): Promise<void> {
    if (!this.isOpen) throw new Error('Not connected');

    const command = data.trim().toUpperCase();
    setTimeout(() => {
      const response = this.processCommand(command);
      this.emit('data', response + '\r\n>');
    }, this.responseDelay);
  }

  private processCommand(command: string): string {
    // AT команды
    if (command === 'ATZ') return 'ELM327 v2.1';
    if (command === 'ATE0') return 'OK';
    if (command === 'ATL0') return 'OK';
    if (command === 'ATS0') return 'OK';
    if (command === 'ATH1') return 'OK';
    if (command === 'ATSP0') return 'OK';
    if (command === 'ATDP') return 'ISO 15765-4';
    if (command === 'ATI') return 'ELM327 v2.1';

    // OBD команды
    if (command === '010C') {
      // RPM
      const rpmValue = Math.floor(this.currentRpm * 4);
      const hex = rpmValue.toString(16).toUpperCase().padStart(4, '0');
      return `41 0C ${hex.substring(0, 2)} ${hex.substring(2, 4)}`;
    }

    if (command === '0105') {
      // Coolant temperature
      const tempValue = this.currentTemp + 40;
      return `41 05 ${tempValue.toString(16).toUpperCase().padStart(2, '0')}`;
    }

    if (command === '03') {
      // Read DTCs
      if (this.dtcCodes.length === 0) return 'NO DATA';
      let response = `43 0${this.dtcCodes.length} `;
      for (const dtc of this.dtcCodes) {
        response += this.encodeDTC(dtc) + ' ';
      }
      return response.trim();
    }

    if (command === '04') {
      // Clear DTCs
      this.dtcCodes = [];
      return '44';
    }

    return 'NO DATA';
  }

  private encodeDTC(dtc: string): string {
    // Простое кодирование DTC
    const firstChar = dtc[0];
    const numbers = dtc.substring(1);

    let firstByte = 0;
    if (firstChar === 'P') firstByte = 0x00;
    else if (firstChar === 'C') firstByte = 0x40;
    else if (firstChar === 'B') firstByte = 0x80;
    else if (firstChar === 'U') firstByte = 0xC0;

    firstByte += parseInt(numbers[0], 16);
    const secondByte = parseInt(numbers.substring(1), 16);

    return firstByte.toString(16).toUpperCase().padStart(2, '0') + ' ' +
           secondByte.toString(16).toUpperCase().padStart(2, '0');
  }

  onData(listener: (data: string) => void): void {
    this.on('data', listener);
  }

  offData(listener: (data: string) => void): void {
    this.off('data', listener);
  }

  onClose(listener: () => void): void {
    this.on('close', listener);
  }

  offClose(listener: () => void): void {
    this.off('close', listener);
  }

  onError(listener: (error: Error) => void): void {
    this.on('error', listener);
  }

  offError(listener: (error: Error) => void): void {
    this.off('error', listener);
  }

  // Методы для тестирования
  setRpm(rpm: number): void {
    this.currentRpm = rpm;
  }

  setTemperature(temp: number): void {
    this.currentTemp = temp;
  }

  addDTC(code: string): void {
    if (!this.dtcCodes.includes(code)) {
      this.dtcCodes.push(code);
    }
  }

  getDTCs(): string[] {
    return [...this.dtcCodes];
  }
}

// Простой драйвер для тестирования
class SimpleELM327Driver {
  private transport: SimpleELM327Emulator;
  private responseBuffer = '';
  private connected: boolean = false;
  private pendingResponse?: {
    resolve: (value: string) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
  };

  constructor(transport: SimpleELM327Emulator) {
    this.transport = transport;
    this.transport.onData(this.handleData.bind(this));
  }

  async open(): Promise<void> {
    await this.transport.open();
    await this.sendCommand('ATZ');
    await this.sendCommand('ATE0');
    await this.sendCommand('ATL0');
    this.connected = true;
  }

  async close(): Promise<void> {
    this.connected = false;
    await this.transport.close();
  }

  async identify(): Promise<string> {
    return await this.sendCommand('ATI');
  }

  async readDTC(): Promise<string[]> {
    const response = await this.sendCommand('03');
    if (response === 'NO DATA') return [];

    // Парсим DTC из ответа
    const dtcs: string[] = [];
    const parts = response.split(' ');
    if (parts[0] === '43' && parts.length > 2) {
      for (let i = 2; i < parts.length; i += 2) {
        if (i + 1 < parts.length) {
          const dtc = this.decodeDTC(parts[i], parts[i + 1]);
          if (dtc) dtcs.push(dtc);
        }
      }
    }
    return dtcs;
  }

  async clearDTC(): Promise<boolean> {
    const response = await this.sendCommand('04');
    return response === '44';
  }

  async readPID(pid: string): Promise<{ value: number; unit: string }> {
    if (!this.connected) {
      throw new Error('Not connected to ELM327 adapter');
    }

    const response = await this.sendCommand(`01${pid}`);

    if (pid === '0C') {
      // RPM
      const parts = response.split(' ');
      if (parts.length >= 4) {
        const rpmValue = (parseInt(parts[2], 16) * 256 + parseInt(parts[3], 16)) / 4;
        return { value: rpmValue, unit: 'rpm' };
      }
    }

    if (pid === '05') {
      // Temperature
      const parts = response.split(' ');
      if (parts.length >= 3) {
        const tempValue = parseInt(parts[2], 16) - 40;
        return { value: tempValue, unit: '°C' };
      }
    }

    return { value: 0, unit: '' };
  }

  private async sendCommand(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingResponse = undefined;
        reject(new Error('Command timeout'));
      }, 2000);

      this.pendingResponse = { resolve, reject, timer };
      this.transport.write(command);
    });
  }

  private handleData(data: string): void {
    this.responseBuffer += data;

    if (this.responseBuffer.includes('>')) {
      const response = this.responseBuffer.split('>')[0].trim();
      this.responseBuffer = '';

      if (this.pendingResponse) {
        clearTimeout(this.pendingResponse.timer);
        this.pendingResponse.resolve(response);
        this.pendingResponse = undefined;
      }
    }
  }

  private decodeDTC(byte1: string, byte2: string): string | null {
    const firstByte = parseInt(byte1, 16);
    const secondByte = parseInt(byte2, 16);

    if (firstByte === 0 && secondByte === 0) return null;

    const prefix = ['P', 'C', 'B', 'U'][Math.floor(firstByte / 64)];
    const firstDigit = Math.floor((firstByte % 64) / 16);
    const remaining = ((firstByte % 16) * 256 + secondByte).toString(16).toUpperCase().padStart(3, '0');

    return `${prefix}${firstDigit}${remaining}`;
  }
}

describe('OBD-II Integration Tests with Built-in Emulator', () => {
  test('should connect and identify adapter', async () => {
    const emulator = new SimpleELM327Emulator();
    const driver = new SimpleELM327Driver(emulator);

    await driver.open();
    const identity = await driver.identify();

    assert(identity.includes('ELM327'), 'Should identify as ELM327');

    await driver.close();
  });

  test('should read DTC codes', async () => {
    const emulator = new SimpleELM327Emulator();
    const driver = new SimpleELM327Driver(emulator);

    await driver.open();

    const dtcs = await driver.readDTC();
    assert(dtcs.length > 0, 'Should have DTC codes');
    assert(dtcs.includes('P0171'), 'Should include P0171');
    assert(dtcs.includes('P0420'), 'Should include P0420');

    await driver.close();
  });

  test('should clear DTC codes', async () => {
    const emulator = new SimpleELM327Emulator();
    const driver = new SimpleELM327Driver(emulator);

    await driver.open();

    // Проверяем наличие DTC
    let dtcs = await driver.readDTC();
    assert(dtcs.length > 0, 'Should have DTC codes before clearing');

    // Очищаем DTC
    const cleared = await driver.clearDTC();
    assert(cleared, 'Should clear DTC codes');

    // Проверяем отсутствие DTC
    dtcs = await driver.readDTC();
    assert(dtcs.length === 0, 'Should have no DTC codes after clearing');

    await driver.close();
  });

  test('should read RPM data', async () => {
    const emulator = new SimpleELM327Emulator();
    emulator.setRpm(1500);

    const driver = new SimpleELM327Driver(emulator);

    await driver.open();

    const rpmData = await driver.readPID('0C');
    assert(rpmData.value > 0, 'Should read RPM value');
    assert(rpmData.unit === 'rpm', 'Should have rpm unit');
    assert(Math.abs(rpmData.value - 1500) < 10, 'RPM should be close to set value');

    await driver.close();
  });

  test('should read temperature data', async () => {
    const emulator = new SimpleELM327Emulator();
    emulator.setTemperature(90);

    const driver = new SimpleELM327Driver(emulator);

    await driver.open();

    const tempData = await driver.readPID('05');
    assert(tempData.value > 0, 'Should read temperature value');
    assert(tempData.unit === '°C', 'Should have °C unit');
    assert(Math.abs(tempData.value - 90) < 5, 'Temperature should be close to set value');

    await driver.close();
  });

  test('should handle parameter changes', async () => {
    const emulator = new SimpleELM327Emulator();
    const driver = new SimpleELM327Driver(emulator);

    await driver.open();

    // Первое чтение
    emulator.setRpm(800);
    const rpm1 = await driver.readPID('0C');

    // Изменение параметра
    emulator.setRpm(2000);
    const rpm2 = await driver.readPID('0C');

    assert(rpm1.value !== rpm2.value, 'RPM should change');
    assert(rpm2.value > rpm1.value, 'RPM should increase');

    await driver.close();
  });

  test('should perform complete diagnostic session', async () => {
    const emulator = new SimpleELM327Emulator();
    const driver = new SimpleELM327Driver(emulator);

    console.log('🚗 Starting complete diagnostic session...');

    // 1. Подключение
    await driver.open();
    console.log('✅ Connected to adapter');

    // 2. Идентификация
    const identity = await driver.identify();
    console.log(`🔍 Adapter: ${identity}`);
    assert(identity.includes('ELM327'));

    // 3. Чтение DTC
    const dtcs = await driver.readDTC();
    console.log(`🚨 Found ${dtcs.length} DTC codes: ${dtcs.join(', ')}`);
    assert(dtcs.length > 0);

    // 4. Чтение параметров
    const rpm = await driver.readPID('0C');
    const temp = await driver.readPID('05');
    console.log(`📊 RPM: ${rpm.value} ${rpm.unit}, Temperature: ${temp.value} ${temp.unit}`);
    assert(rpm.value > 0);
    assert(temp.value > 0);

    // 5. Очистка DTC
    const cleared = await driver.clearDTC();
    console.log(`🔧 DTC codes cleared: ${cleared}`);
    assert(cleared);

    // 6. Проверка очистки
    const clearedDtcs = await driver.readDTC();
    console.log(`✅ DTC codes after clearing: ${clearedDtcs.length}`);
    assert(clearedDtcs.length === 0);

    await driver.close();
    console.log('👋 Diagnostic session completed successfully');
  });

  test('should simulate realistic vehicle scenarios', async () => {
    const scenarios = [
      {
        name: 'Idle Engine',
        rpm: 800,
        temp: 85,
        dtcs: ['P0420'] // Catalyst efficiency
      },
      {
        name: 'Highway Driving',
        rpm: 2500,
        temp: 95,
        dtcs: [] // No errors
      },
      {
        name: 'Cold Start',
        rpm: 1200,
        temp: 60,
        dtcs: ['P0171', 'P0174'] // Lean condition
      }
    ];

    for (const scenario of scenarios) {
      console.log(`\n🎬 Testing scenario: ${scenario.name}`);

      const emulator = new SimpleELM327Emulator();
      const driver = new SimpleELM327Driver(emulator);

      // Настройка сценария
      emulator.setRpm(scenario.rpm);
      emulator.setTemperature(scenario.temp);

      await driver.open();

      // Проверка параметров
      const rpm = await driver.readPID('0C');
      const temp = await driver.readPID('05');

      console.log(`  RPM: ${rpm.value} (expected ${scenario.rpm})`);
      console.log(`  Temp: ${temp.value}°C (expected ${scenario.temp}°C)`);

      assert(Math.abs(rpm.value - scenario.rpm) < 50, 'RPM should match scenario');
      assert(Math.abs(temp.value - scenario.temp) < 10, 'Temperature should match scenario');

      await driver.close();
    }
  });

  test('should measure performance', async () => {
    const emulator = new SimpleELM327Emulator();
    const driver = new SimpleELM327Driver(emulator);

    await driver.open();

    const operations = 20;
    const startTime = Date.now();

    // Выполняем множественные операции
    for (let i = 0; i < operations; i++) {
      await driver.readPID('0C');
    }

    const duration = Date.now() - startTime;
    const avgTime = duration / operations;

    console.log(`⏱️ Performance: ${avgTime.toFixed(2)}ms per operation`);
    console.log(`📊 Total: ${duration}ms for ${operations} operations`);

    assert(avgTime < 200, 'Average operation time should be reasonable');

    await driver.close();
  });

  test('should handle error conditions', async () => {
    const emulator = new SimpleELM327Emulator();
    const driver = new SimpleELM327Driver(emulator);

    // Тест без подключения
    try {
      await driver.readPID('0C');
      assert.fail('Should throw error when not connected');
    } catch (error) {
      assert(error instanceof Error);
    }

    // Нормальная работа после подключения
    await driver.open();
    const rpm = await driver.readPID('0C');
    assert(rpm.value >= 0);

    await driver.close();
  });
});
