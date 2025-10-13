import type { BleClient, BleDevice, BleService } from './BleClient.js';
import { BleConnectionError, BleTimeoutError, BleDeviceNotFoundError } from './BleClient.js';

let noble: any = null;

async function loadNoble() {
  if (noble !== null) return noble;

  // Порядок: сначала noble-winrt (Windows), затем @abandonware/noble
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    noble = require('noble-winrt');
    return noble;
  } catch (e1) {
    try {
      noble = await import('@abandonware/noble');
      return noble;
    } catch (e2) {
      console.warn('[NobleBleClient] BLE стек noble недоступен', { e1: String(e1), e2: String(e2) });
      noble = false;
      return false;
    }
  }
}

export class NobleBleClient implements BleClient {
  private peripheral: any;
  private isScanning = false;
  private scanHandler?: (peripheral: any) => void;
  private stateHandler?: (state: string) => void;

  async startScan(serviceUuids?: string[], timeout = 15000): Promise<BleDevice> {
    const nobleInstance = await loadNoble();
    if (!nobleInstance) {
      throw new BleConnectionError('@abandonware/noble не доступен', 'NOBLE_UNAVAILABLE');
    }

    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.stopScan();
        reject(new BleDeviceNotFoundError(`Устройство не найдено за ${timeout}ms`));
      }, timeout);

      const onStateChange = (state: string) => {
        if (state === 'poweredOn') {
          nobleInstance.startScanning(serviceUuids || [], false);
          this.isScanning = true;
        } else {
          clearTimeout(timeoutHandle);
          this.cleanup();
          reject(new BleConnectionError(`BLE адаптер не готов: ${state}`, 'ADAPTER_NOT_READY'));
        }
      };

      const onDiscover = (peripheral: any) => {
        clearTimeout(timeoutHandle);
        this.stopScan();

        const device: BleDevice = {
          id: peripheral.id,
          name: peripheral.advertisement?.localName || 'Unknown',
          rssi: peripheral.rssi,
          advertisedServices: peripheral.advertisement?.serviceUuids,
        };

        this.peripheral = peripheral;
        resolve(device);
      };

      this.stateHandler = onStateChange;
      this.scanHandler = onDiscover;

      nobleInstance.on('stateChange', onStateChange);
      nobleInstance.on('discover', onDiscover);

      if (nobleInstance.state === 'poweredOn') {
        onStateChange('poweredOn');
      }
    });
  }

  stopScan(): void {
    if (this.isScanning && noble) {
      try {
        noble?.stopScanning();
      } catch (e) {
        void e;
      }
      this.isScanning = false;
    }
    this.cleanup();
  }

  async connect(deviceId: string, timeout = 10000): Promise<void> {
    if (!this.peripheral) {
      throw new BleConnectionError('Устройство не найдено для подключения', 'DEVICE_NOT_FOUND');
    }

    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        reject(new BleTimeoutError(`Таймаут подключения ${timeout}ms`));
      }, timeout);

      this.peripheral.connect((error: Error) => {
        clearTimeout(timeoutHandle);

        if (error) {
          reject(new BleConnectionError(`Ошибка подключения: ${error.message}`, 'CONNECT_FAILED'));
        } else {
          resolve();
        }
      });
    });
  }

  async disconnect(): Promise<void> {
    if (!this.peripheral) {
      return;
    }

    return new Promise((resolve) => {
      this.peripheral.disconnect(() => {
        this.peripheral = undefined;
        resolve();
      });
    });
  }

  async discoverServices(serviceUuid: string): Promise<BleService[]> {
    if (!this.peripheral) {
      throw new BleConnectionError('Устройство не подключено', 'NOT_CONNECTED');
    }

    return new Promise((resolve, reject) => {
      this.peripheral.discoverServices([serviceUuid], (error: Error, services: any[]) => {
        if (error) {
          reject(new BleConnectionError(`Ошибка обнаружения сервисов: ${error.message}`, 'DISCOVER_SERVICES_FAILED'));
          return;
        }

        const bleServices: BleService[] = [];
        let pending = services.length;

        if (pending === 0) {
          resolve(bleServices);
          return;
        }

        services.forEach(service => {
          service.discoverCharacteristics([], (charError: Error, characteristics: any[]) => {
            if (!charError) {
              bleServices.push({
                uuid: service.uuid,
                characteristics: characteristics.map(c => ({
                  uuid: c.uuid,
                  properties: c.properties,
                })),
              });
            }

            pending--;
            if (pending === 0) {
              resolve(bleServices);
            }
          });
        });
      });
    });
  }

  async subscribeCharacteristic(
    serviceUuid: string,
    characteristicUuid: string,
    callback: (data: Buffer) => void
  ): Promise<void> {
    const characteristic = await this.getCharacteristic(serviceUuid, characteristicUuid);

    return new Promise((resolve, reject) => {
      characteristic.subscribe((error: Error) => {
        if (error) {
          reject(new BleConnectionError(`Ошибка подписки: ${error.message}`, 'SUBSCRIBE_FAILED'));
        } else {
          characteristic.on('data', callback);
          resolve();
        }
      });
    });
  }

  async writeCharacteristic(
    serviceUuid: string,
    characteristicUuid: string,
    data: Buffer
  ): Promise<void> {
    const characteristic = await this.getCharacteristic(serviceUuid, characteristicUuid);

    return new Promise((resolve, reject) => {
      characteristic.write(data, false, (error: Error) => {
        if (error) {
          reject(new BleConnectionError(`Ошибка записи: ${error.message}`, 'WRITE_FAILED'));
        } else {
          resolve();
        }
      });
    });
  }

  async readCharacteristic(
    serviceUuid: string,
    characteristicUuid: string
  ): Promise<Buffer> {
    const characteristic = await this.getCharacteristic(serviceUuid, characteristicUuid);

    return new Promise((resolve, reject) => {
      characteristic.read((error: Error, data: Buffer) => {
        if (error) {
          reject(new BleConnectionError(`Ошибка чтения: ${error.message}`, 'READ_FAILED'));
        } else {
          resolve(data);
        }
      });
    });
  }

  private async getCharacteristic(serviceUuid: string, characteristicUuid: string): Promise<any> {
    if (!this.peripheral) {
      throw new BleConnectionError('Устройство не подключено', 'NOT_CONNECTED');
    }

    return new Promise((resolve, reject) => {
      this.peripheral.discoverServices([serviceUuid], (error: Error, services: any[]) => {
        if (error || services.length === 0) {
          reject(new BleConnectionError('Сервис не найден', 'SERVICE_NOT_FOUND'));
          return;
        }

        const service = services[0];
        service.discoverCharacteristics([characteristicUuid], (charError: Error, characteristics: any[]) => {
          if (charError || characteristics.length === 0) {
            reject(new BleConnectionError('Характеристика не найдена', 'CHARACTERISTIC_NOT_FOUND'));
          } else {
            resolve(characteristics[0]);
          }
        });
      });
    });
  }

  private cleanup(): void {
    const nobleInstance = noble;
    if (this.stateHandler && nobleInstance) {
      nobleInstance?.removeListener('stateChange', this.stateHandler);
      this.stateHandler = undefined;
    }
    if (this.scanHandler && nobleInstance) {
      nobleInstance?.removeListener('discover', this.scanHandler);
      this.scanHandler = undefined;
    }
  }
}
