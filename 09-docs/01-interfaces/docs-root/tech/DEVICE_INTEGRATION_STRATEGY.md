# Стратегия интеграции устройств

## Обзор

Документ описывает расширяемую архитектуру для поддержки множества устройств, транспортов и протоколов в системе автономных терминалов.

## 1. OBD-II Расширенная интеграция

### 1.1 Поддерживаемые транспорты

```typescript
// apps/kiosk-agent/src/devices/obd/transports/TransportFactory.ts
interface ObdTransport {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(command: string): Promise<string>;
  isConnected(): boolean;
}

class TransportFactory {
  static create(type: TransportType, config: TransportConfig): ObdTransport {
    switch (type) {
      case 'serial':
        return new SerialPortTransport(config);
      case 'bluetooth':
        return new BluetoothClassicTransport(config);
      case 'ble':
        return new BLETransport(config);
      case 'wifi':
        return new WiFiELM327Transport(config);
      case 'doip':
        return new DoIPTransport(config);
      default:
        throw new Error(`Unsupported transport: ${type}`);
    }
  }
}
```

**Детали реализации транспортов:**

#### Serial Port (COM/USB-Serial)
- Использование: `serialport` package
- Конфигурация: `baudRate: 38400`, `dataBits: 8`, `stopBits: 1`
- Timeout: 2000ms по умолчанию
- Автоопределение порта через `SerialPort.list()`

#### Bluetooth Classic (SPP)
- Использование: `@abandonware/bluetooth-serial-port`
- Сканирование устройств: 10 секунд
- Фильтрация по имени: `OBD`, `ELM`, `OBDII`
- Переподключение при разрыве

#### Bluetooth Low Energy
- Использование: `@abandonware/noble` или `webbluetooth` (для браузера)
- GATT сервис UUID: `0000fff0-0000-1000-8000-00805f9b34fb`
- Характеристика: `0000fff1-0000-1000-8000-00805f9b34fb`
- Уведомления для получения данных

#### WiFi ELM327
- HTTP/TCP соединение на порт 35000
- IP обнаружение через mDNS или фиксированный IP (192.168.0.10)
- Keep-alive каждые 30 секунд

#### DoIP (Diagnostics over IP)
- Для современных автомобилей BMW, VW, Audi
- TCP порт 13400
- Использование библиотеки `doip-client`
- Поддержка UDS (Unified Diagnostic Services)

### 1.2 Профили протоколов

```typescript
// apps/kiosk-agent/src/devices/obd/profiles/ProtocolProfiles.ts
interface ProtocolProfile {
  name: string;
  protocol: ObdProtocol;
  initCommands: string[];
  headers?: string;
  timeout?: number;
  specificPIDs?: Record<string, string>;
}

const profiles: Record<string, ProtocolProfile> = {
  toyota: {
    name: 'Toyota',
    protocol: 'ISO_15765_4_CAN',
    initCommands: ['ATZ', 'ATE0', 'ATL0', 'ATSP6', 'ATH1'],
    headers: '7E0',
    specificPIDs: {
      '0140': 'PIDs supported [41-60]',
      '0D': 'Vehicle Speed',
    },
  },
  
  lexus: {
    name: 'Lexus',
    protocol: 'ISO_15765_4_CAN',
    initCommands: ['ATZ', 'ATE0', 'ATL0', 'ATSP6', 'ATH1'],
    headers: '7E0',
    specificPIDs: {
      '0140': 'PIDs supported [41-60]',
    },
  },
  
  bmw: {
    name: 'BMW',
    protocol: 'ISO_15765_4_CAN',
    initCommands: ['ATZ', 'ATE0', 'ATL0', 'ATSP6', 'ATCAF0'],
    headers: '6F1',
    timeout: 3000,
    specificPIDs: {
      '22F190': 'VIN (UDS)',
      '22F40D': 'ECU Software Version',
    },
  },
  
  mercedes: {
    name: 'Mercedes-Benz',
    protocol: 'ISO_15765_4_CAN',
    initCommands: ['ATZ', 'ATE0', 'ATL0', 'ATSP6'],
    headers: '7E0',
    timeout: 2500,
  },
  
  generic: {
    name: 'Generic OBD-II',
    protocol: 'AUTO',
    initCommands: ['ATZ', 'ATE0', 'ATL0', 'ATSPA'],
  },
};
```

### 1.3 Автоопределение протокола

```typescript
class ProtocolDetector {
  async detectProtocol(transport: ObdTransport): Promise<ObdProtocol> {
    const protocols: ObdProtocol[] = [
      'ISO_15765_4_CAN',    // Попробовать CAN первым (большинство современных)
      'ISO_9141_2',
      'KWP2000',
      'J1850_PWM',
      'J1850_VPW',
    ];
    
    for (const protocol of protocols) {
      try {
        await this.tryProtocol(transport, protocol);
        return protocol;
      } catch (error) {
        // Продолжить со следующим протоколом
      }
    }
    
    throw new Error('Unable to detect OBD protocol');
  }
  
  private async tryProtocol(transport: ObdTransport, protocol: ObdProtocol): Promise<void> {
    const command = this.getProtocolCommand(protocol);
    await transport.send(command);
    
    // Попытка прочитать базовый PID
    const response = await transport.send('0100');
    
    if (response.includes('NO DATA') || response.includes('ERROR')) {
      throw new Error(`Protocol ${protocol} not supported`);
    }
  }
}
```

### 1.4 Обновление прошивки адаптера

```typescript
// apps/kiosk-agent/src/devices/obd/FirmwareUpdater.ts
class FirmwareUpdater {
  async checkForUpdates(): Promise<FirmwareInfo | null> {
    const currentVersion = await this.getCurrentVersion();
    const latestVersion = await this.fetchLatestVersion();
    
    if (this.compareVersions(currentVersion, latestVersion) < 0) {
      return latestVersion;
    }
    
    return null;
  }
  
  async downloadFirmware(version: string): Promise<Buffer> {
    const url = `https://firmware.example.com/elm327/${version}.hex`;
    const response = await fetch(url);
    return Buffer.from(await response.arrayBuffer());
  }
  
  async flashFirmware(firmware: Buffer): Promise<void> {
    // Переключение адаптера в режим bootloader
    await this.enterBootloaderMode();
    
    // Отправка прошивки блоками
    const chunkSize = 256;
    for (let i = 0; i < firmware.length; i += chunkSize) {
      const chunk = firmware.slice(i, i + chunkSize);
      await this.sendChunk(chunk, i / chunkSize);
      
      // Прогресс
      this.emit('progress', (i / firmware.length) * 100);
    }
    
    // Перезагрузка адаптера
    await this.reboot();
  }
  
  async verifyFlash(): Promise<boolean> {
    const checksum = await this.calculateChecksum();
    const expected = await this.getExpectedChecksum();
    return checksum === expected;
  }
}
```

### 1.5 Расширяемая база DTC

```typescript
// apps/kiosk-agent/src/devices/obd/dtc/DTCDatabase.ts
interface DTCDescription {
  code: string;
  description: string;
  severity: 'critical' | 'warning' | 'info';
  possibleCauses?: string[];
  recommendedActions?: string[];
  manufacturer?: string;
}

class DTCDatabase {
  private codes: Map<string, DTCDescription> = new Map();
  
  constructor() {
    this.loadStandardCodes();
  }
  
  lookup(code: string, manufacturer?: string): DTCDescription {
    // Поиск manufacturer-specific кода
    if (manufacturer) {
      const key = `${manufacturer}:${code}`;
      const specific = this.codes.get(key);
      if (specific) return specific;
    }
    
    // Поиск стандартного кода
    const standard = this.codes.get(code);
    if (standard) return standard;
    
    // Генерация базового описания
    return this.generateGenericDescription(code);
  }
  
  addCustomDescription(code: string, description: DTCDescription): void {
    const key = description.manufacturer 
      ? `${description.manufacturer}:${code}`
      : code;
    
    this.codes.set(key, description);
  }
  
  async importFromFile(filePath: string): Promise<void> {
    const data = await fs.promises.readFile(filePath, 'utf-8');
    const codes = JSON.parse(data) as DTCDescription[];
    
    for (const code of codes) {
      this.addCustomDescription(code.code, code);
    }
  }
  
  private loadStandardCodes(): void {
    // P0xxx — Powertrain codes
    this.codes.set('P0300', {
      code: 'P0300',
      description: 'Random/Multiple Cylinder Misfire Detected',
      severity: 'critical',
      possibleCauses: [
        'Faulty spark plugs',
        'Faulty ignition coils',
        'Low fuel pressure',
        'Vacuum leak',
      ],
      recommendedActions: [
        'Check spark plugs and replace if needed',
        'Test ignition coils',
        'Check fuel pressure',
      ],
    });
    
    // Загрузка остальных стандартных кодов...
  }
  
  private generateGenericDescription(code: string): DTCDescription {
    const prefix = code.charAt(0);
    const severity = code.startsWith('P0') ? 'critical' : 'warning';
    
    return {
      code,
      description: `${prefix} - ${this.getPrefixDescription(prefix)} code`,
      severity,
    };
  }
}
```

### 1.6 Диагностика качества соединения

```typescript
// apps/kiosk-agent/src/devices/obd/ConnectionQualityMonitor.ts
class ConnectionQualityMonitor {
  private latencies: number[] = [];
  private errors: number = 0;
  private totalCommands: number = 0;
  
  async measureLatency(): Promise<number> {
    const start = Date.now();
    await this.transport.send('0100'); // Базовая команда
    const latency = Date.now() - start;
    
    this.latencies.push(latency);
    if (this.latencies.length > 20) {
      this.latencies.shift(); // Хранить последние 20 измерений
    }
    
    return latency;
  }
  
  getAverageLatency(): number {
    if (this.latencies.length === 0) return 0;
    return this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length;
  }
  
  calculatePacketLoss(): number {
    if (this.totalCommands === 0) return 0;
    return (this.errors / this.totalCommands) * 100;
  }
  
  getSignalStrength(): number | null {
    // Для BLE/WiFi транспортов
    if (this.transport instanceof BLETransport) {
      return this.transport.getRSSI();
    }
    
    if (this.transport instanceof WiFiELM327Transport) {
      return this.transport.getSignalStrength();
    }
    
    return null;
  }
  
  recommendOptimizations(): string[] {
    const recommendations: string[] = [];
    
    const avgLatency = this.getAverageLatency();
    if (avgLatency > 1000) {
      recommendations.push('High latency detected. Consider using faster transport (e.g., USB instead of Bluetooth)');
    }
    
    const packetLoss = this.calculatePacketLoss();
    if (packetLoss > 5) {
      recommendations.push('High packet loss. Check connection stability and reduce distance between adapter and device');
    }
    
    const signalStrength = this.getSignalStrength();
    if (signalStrength !== null && signalStrength < -80) {
      recommendations.push('Weak signal. Move closer to the adapter or use a different connection method');
    }
    
    return recommendations;
  }
  
  getQualityReport(): ConnectionQualityReport {
    return {
      averageLatency: this.getAverageLatency(),
      packetLoss: this.calculatePacketLoss(),
      signalStrength: this.getSignalStrength(),
      recommendations: this.recommendOptimizations(),
      timestamp: new Date(),
    };
  }
}
```

## 2. Толщиномер интеграция

### 2.1 Поддержка нескольких моделей

```typescript
// apps/kiosk-agent/src/devices/thickness/ThicknessDeviceFactory.ts
interface ThicknessDevice {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  measure(): Promise<number>;
  calibrate(referenceValue: number): Promise<void>;
  getBatteryLevel(): Promise<number>;
  getSelfTestResults(): Promise<SelfTestReport>;
}

class ThicknessDeviceFactory {
  async detectAndConnect(): Promise<ThicknessDevice> {
    const devices = await this.scanBLE();
    
    for (const device of devices) {
      const model = this.identifyModel(device);
      
      if (model) {
        return this.createDriver(model, device);
      }
    }
    
    throw new Error('No compatible thickness measurement device found');
  }
  
  private identifyModel(device: BLEDevice): string | null {
    const name = device.name.toLowerCase();
    
    if (name.includes('defelsko')) return 'defelsko_positector';
    if (name.includes('elcometer')) return 'elcometer_456';
    if (name.includes('qnix')) return 'qnix_4500';
    
    // Generic BLE thickness gauge
    if (device.services.includes('0000fff0-0000-1000-8000-00805f9b34fb')) {
      return 'generic_ble';
    }
    
    return null;
  }
  
  private createDriver(model: string, device: BLEDevice): ThicknessDevice {
    switch (model) {
      case 'defelsko_positector':
        return new DefelskoPositectorDriver(device);
      case 'elcometer_456':
        return new Elcometer456Driver(device);
      case 'qnix_4500':
        return new Qnix4500Driver(device);
      case 'generic_ble':
        return new GenericBLEThicknessDriver(device);
      default:
        throw new Error(`Unsupported model: ${model}`);
    }
  }
}
```

### 2.2 Калибровка через UI

```typescript
// API endpoint: POST /api/thickness/calibrate
app.post('/api/thickness/calibrate', async (req: Request, res: Response) => {
  const schema = z.object({
    referenceValue: z.number().positive(),
    sampleMeasurements: z.array(z.number()).min(3),
  });
  
  const { referenceValue, sampleMeasurements } = schema.parse(req.body);
  
  try {
    const device = await thicknessManager.getDevice();
    
    // Проверка стабильности измерений
    const stdDev = calculateStdDev(sampleMeasurements);
    if (stdDev > 5.0) {
      return res.status(400).json({
        error: 'Measurements are not stable. Please ensure proper contact with reference sample',
        stdDev,
      });
    }
    
    // Выполнение калибровки
    await device.calibrate(referenceValue);
    
    // Логирование калибровки
    await store.saveCalibration({
      deviceId: device.getId(),
      referenceValue,
      sampleMeasurements,
      deviation: stdDev,
      performedAt: new Date(),
    });
    
    res.json({
      success: true,
      message: 'Calibration completed successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      error: error.message,
    });
  }
});
```

### 2.3 Самотестирование толщиномера

```typescript
// apps/kiosk-agent/src/devices/thickness/SelfTest.ts
class ThicknessSelfTest {
  async runTest(device: ThicknessDevice): Promise<SelfTestReport> {
    const results: SelfTestReport = {
      connectivity: await this.testConnectivity(device),
      accuracy: await this.testAccuracy(device),
      repeatability: await this.testRepeatability(device),
      battery: await this.checkBattery(device),
      overall: 'pass',
      timestamp: new Date(),
    };
    
    // Определение общего статуса
    if (Object.values(results).some(r => typeof r === 'object' && r.status === 'fail')) {
      results.overall = 'fail';
    } else if (Object.values(results).some(r => typeof r === 'object' && r.status === 'warning')) {
      results.overall = 'warning';
    }
    
    return results;
  }
  
  private async testConnectivity(device: ThicknessDevice): Promise<TestResult> {
    try {
      await device.connect();
      
      // Проверка чтения данных
      const measurement = await device.measure();
      
      return {
        status: 'pass',
        message: 'Device connected successfully',
        value: measurement,
      };
    } catch (error: any) {
      return {
        status: 'fail',
        message: `Connection failed: ${error.message}`,
      };
    }
  }
  
  private async testAccuracy(device: ThicknessDevice): Promise<TestResult> {
    // Измерение на эталонном образце (если доступен)
    const referenceValue = 100.0; // мкм
    const measurements: number[] = [];
    
    for (let i = 0; i < 5; i++) {
      const value = await device.measure();
      measurements.push(value);
      await sleep(100);
    }
    
    const avg = measurements.reduce((a, b) => a + b, 0) / measurements.length;
    const deviation = Math.abs(avg - referenceValue);
    
    if (deviation > 5.0) {
      return {
        status: 'fail',
        message: `High deviation from reference: ${deviation.toFixed(2)} μm`,
        value: avg,
      };
    } else if (deviation > 2.0) {
      return {
        status: 'warning',
        message: `Moderate deviation from reference: ${deviation.toFixed(2)} μm`,
        value: avg,
      };
    }
    
    return {
      status: 'pass',
      message: `Accuracy within tolerance: ${deviation.toFixed(2)} μm`,
      value: avg,
    };
  }
  
  private async testRepeatability(device: ThicknessDevice): Promise<TestResult> {
    const measurements: number[] = [];
    
    for (let i = 0; i < 10; i++) {
      const value = await device.measure();
      measurements.push(value);
      await sleep(100);
    }
    
    const stdDev = calculateStdDev(measurements);
    
    if (stdDev > 3.0) {
      return {
        status: 'fail',
        message: `Poor repeatability: σ = ${stdDev.toFixed(2)} μm`,
        value: stdDev,
      };
    } else if (stdDev > 1.5) {
      return {
        status: 'warning',
        message: `Moderate repeatability: σ = ${stdDev.toFixed(2)} μm`,
        value: stdDev,
      };
    }
    
    return {
      status: 'pass',
      message: `Good repeatability: σ = ${stdDev.toFixed(2)} μm`,
      value: stdDev,
    };
  }
  
  private async checkBattery(device: ThicknessDevice): Promise<TestResult> {
    const batteryLevel = await device.getBatteryLevel();
    
    if (batteryLevel < 20) {
      return {
        status: 'warning',
        message: `Low battery: ${batteryLevel}%`,
        value: batteryLevel,
      };
    }
    
    return {
      status: 'pass',
      message: `Battery OK: ${batteryLevel}%`,
      value: batteryLevel,
    };
  }
}

function calculateStdDev(values: number[]): number {
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / values.length;
  return Math.sqrt(variance);
}
```

## 3. Выдача устройств и замки

### 3.1 Типы замков

```typescript
// apps/kiosk-agent/src/devices/locks/LockFactory.ts
interface Lock {
  open(): Promise<void>;
  close(): Promise<void>;
  getStatus(): Promise<LockStatus>;
}

class LockFactory {
  static create(type: LockType, config: LockConfig): Lock {
    switch (type) {
      case 'electromagnetic':
        return new ElectromagneticLock(config);
      case 'servo':
        return new ServoLock(config);
      case 'rfid':
        return new RFIDLock(config);
      case 'solenoid':
        return new SolenoidLock(config);
      default:
        throw new Error(`Unsupported lock type: ${type}`);
    }
  }
}

// Электромагнитный замок
class ElectromagneticLock implements Lock {
  private gpio: GPIO;
  
  constructor(private config: { pin: number }) {
    this.gpio = new GPIO(config.pin, 'out');
  }
  
  async open(): Promise<void> {
    await this.gpio.write(1); // Подача питания
  }
  
  async close(): Promise<void> {
    await this.gpio.write(0); // Отключение питания
  }
  
  async getStatus(): Promise<LockStatus> {
    const value = await this.gpio.read();
    return value === 1 ? 'open' : 'closed';
  }
}

// Сервопривод
class ServoLock implements Lock {
  private servo: Servo;
  
  constructor(private config: { pin: number, openAngle: number, closeAngle: number }) {
    this.servo = new Servo(config.pin);
  }
  
  async open(): Promise<void> {
    await this.servo.setAngle(this.config.openAngle);
  }
  
  async close(): Promise<void> {
    await this.servo.setAngle(this.config.closeAngle);
  }
  
  async getStatus(): Promise<LockStatus> {
    const angle = await this.servo.getAngle();
    return angle === this.config.openAngle ? 'open' : 'closed';
  }
}
```

### 3.2 Автоматическое закрытие и безопасность

```typescript
// apps/kiosk-agent/src/devices/locks/LockController.ts
class LockController {
  private locks: Map<string, Lock> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private camera?: SecurityCamera;
  
  constructor(lockConfigs: LockConfig[], cameraConfig?: CameraConfig) {
    this.initializeLocks(lockConfigs);
    
    if (cameraConfig) {
      this.camera = new SecurityCamera(cameraConfig);
    }
  }
  
  async openSlot(slotId: string, autoCloseMs: number = 30000): Promise<void> {
    const lock = this.locks.get(slotId);
    if (!lock) throw new Error(`Lock ${slotId} not found`);
    
    // Запись видео при открытии
    if (this.camera) {
      await this.camera.startRecording(`dispense_${slotId}_${Date.now()}`);
    }
    
    // Открытие замка
    await lock.open();
    
    // Логирование
    await this.logAction(slotId, 'opened');
    
    // Установка таймера автозакрытия
    const timer = setTimeout(async () => {
      await this.closeSlot(slotId);
    }, autoCloseMs);
    
    this.timers.set(slotId, timer);
  }
  
  async closeSlot(slotId: string): Promise<void> {
    const lock = this.locks.get(slotId);
    if (!lock) throw new Error(`Lock ${slotId} not found`);
    
    // Отмена таймера
    const timer = this.timers.get(slotId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(slotId);
    }
    
    // Закрытие замка
    await lock.close();
    
    // Остановка записи
    if (this.camera) {
      await this.camera.stopRecording();
    }
    
    // Логирование
    await this.logAction(slotId, 'closed');
  }
  
  async getStatus(slotId: string): Promise<LockStatus> {
    const lock = this.locks.get(slotId);
    if (!lock) throw new Error(`Lock ${slotId} not found`);
    
    return await lock.getStatus();
  }
  
  private async logAction(slotId: string, action: 'opened' | 'closed'): Promise<void> {
    await store.saveLockLog({
      slotId,
      action,
      timestamp: new Date(),
      sessionId: this.getCurrentSessionId(),
    });
  }
}
```

### 3.3 Интеграция с видеонаблюдением

```typescript
// apps/kiosk-agent/src/devices/camera/SecurityCamera.ts
class SecurityCamera {
  private ffmpeg: FFmpeg;
  private isRecording: boolean = false;
  
  constructor(private config: CameraConfig) {
    this.ffmpeg = new FFmpeg(config.devicePath);
  }
  
  async startRecording(filename: string): Promise<void> {
    if (this.isRecording) {
      throw new Error('Already recording');
    }
    
    const outputPath = path.join(this.config.storagePath, `${filename}.mp4`);
    
    await this.ffmpeg.start({
      input: this.config.devicePath,
      output: outputPath,
      duration: this.config.maxDurationSeconds || 60,
      resolution: '1280x720',
      framerate: 15,
    });
    
    this.isRecording = true;
  }
  
  async stopRecording(): Promise<string> {
    if (!this.isRecording) {
      throw new Error('Not recording');
    }
    
    const outputPath = await this.ffmpeg.stop();
    this.isRecording = false;
    
    // Сохранение метаданных
    await this.saveMetadata(outputPath);
    
    return outputPath;
  }
  
  async captureFrame(): Promise<Buffer> {
    const tmpPath = `/tmp/frame_${Date.now()}.jpg`;
    
    await this.ffmpeg.captureFrame({
      input: this.config.devicePath,
      output: tmpPath,
    });
    
    const buffer = await fs.promises.readFile(tmpPath);
    await fs.promises.unlink(tmpPath);
    
    return buffer;
  }
  
  private async saveMetadata(videoPath: string): Promise<void> {
    const metadata = {
      path: videoPath,
      timestamp: new Date(),
      sessionId: this.getCurrentSessionId(),
      duration: await this.getVideoDuration(videoPath),
    };
    
    await store.saveCameraRecord(metadata);
  }
}
```

## Заключение

Эта стратегия обеспечивает:
- **Расширяемость:** легко добавлять новые устройства и транспорты
- **Надёжность:** автотесты, диагностика качества, обработка ошибок
- **Безопасность:** видеонаблюдение, логирование, автозакрытие
- **Производительность:** оптимизация протоколов, кеширование

Все компоненты модульны и могут быть заменены или расширены без изменения core системы.
