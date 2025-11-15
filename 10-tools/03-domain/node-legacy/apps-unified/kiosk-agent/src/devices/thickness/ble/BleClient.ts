/**
 * BLE Client интерфейс
 * Обёртка над @abandonware/noble для изоляции зависимости
 */

export interface BleDevice {
  id: string;
  name: string;
  rssi: number;
  advertisedServices?: string[];
}

export interface BleCharacteristic {
  uuid: string;
  properties: string[];
}

export interface BleService {
  uuid: string;
  characteristics: BleCharacteristic[];
}

export interface BleClient {
  startScan(serviceUuids?: string[], timeout?: number): Promise<BleDevice>;
  stopScan(): void;
  connect(deviceId: string, timeout?: number): Promise<void>;
  disconnect(): Promise<void>;
  discoverServices(serviceUuid: string): Promise<BleService[]>;
  subscribeCharacteristic(
    serviceUuid: string,
    characteristicUuid: string,
    callback: (data: Buffer) => void
  ): Promise<void>;
  writeCharacteristic(
    serviceUuid: string,
    characteristicUuid: string,
    data: Buffer
  ): Promise<void>;
  readCharacteristic(
    serviceUuid: string,
    characteristicUuid: string
  ): Promise<Buffer>;
}

export class BleConnectionError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'BleConnectionError';
  }
}

export class BleTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BleTimeoutError';
  }
}

export class BleDeviceNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BleDeviceNotFoundError';
  }
}
