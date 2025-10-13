import { BleConnectionError, BleTimeoutError, BleDeviceNotFoundError } from './BleClient.js';
let noble = null;
async function loadNoble() {
    if (noble !== null)
        return noble;
    // Порядок: сначала noble-winrt (Windows), затем @abandonware/noble
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        noble = require('noble-winrt');
        return noble;
    }
    catch (e1) {
        try {
            noble = await import('@abandonware/noble');
            return noble;
        }
        catch (e2) {
            console.warn('[NobleBleClient] BLE стек noble недоступен', { e1: String(e1), e2: String(e2) });
            noble = false;
            return false;
        }
    }
}
export class NobleBleClient {
    constructor() {
        this.isScanning = false;
    }
    async startScan(serviceUuids, timeout = 15000) {
        const nobleInstance = await loadNoble();
        if (!nobleInstance) {
            throw new BleConnectionError('@abandonware/noble не доступен', 'NOBLE_UNAVAILABLE');
        }
        return new Promise((resolve, reject) => {
            const timeoutHandle = setTimeout(() => {
                this.stopScan();
                reject(new BleDeviceNotFoundError(`Устройство не найдено за ${timeout}ms`));
            }, timeout);
            const onStateChange = (state) => {
                if (state === 'poweredOn') {
                    nobleInstance.startScanning(serviceUuids || [], false);
                    this.isScanning = true;
                }
                else {
                    clearTimeout(timeoutHandle);
                    this.cleanup();
                    reject(new BleConnectionError(`BLE адаптер не готов: ${state}`, 'ADAPTER_NOT_READY'));
                }
            };
            const onDiscover = (peripheral) => {
                clearTimeout(timeoutHandle);
                this.stopScan();
                const device = {
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
    stopScan() {
        if (this.isScanning && noble) {
            try {
                noble?.stopScanning();
            }
            catch (e) {
                void e;
            }
            this.isScanning = false;
        }
        this.cleanup();
    }
    async connect(deviceId, timeout = 10000) {
        if (!this.peripheral) {
            throw new BleConnectionError('Устройство не найдено для подключения', 'DEVICE_NOT_FOUND');
        }
        return new Promise((resolve, reject) => {
            const timeoutHandle = setTimeout(() => {
                reject(new BleTimeoutError(`Таймаут подключения ${timeout}ms`));
            }, timeout);
            this.peripheral.connect((error) => {
                clearTimeout(timeoutHandle);
                if (error) {
                    reject(new BleConnectionError(`Ошибка подключения: ${error.message}`, 'CONNECT_FAILED'));
                }
                else {
                    resolve();
                }
            });
        });
    }
    async disconnect() {
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
    async discoverServices(serviceUuid) {
        if (!this.peripheral) {
            throw new BleConnectionError('Устройство не подключено', 'NOT_CONNECTED');
        }
        return new Promise((resolve, reject) => {
            this.peripheral.discoverServices([serviceUuid], (error, services) => {
                if (error) {
                    reject(new BleConnectionError(`Ошибка обнаружения сервисов: ${error.message}`, 'DISCOVER_SERVICES_FAILED'));
                    return;
                }
                const bleServices = [];
                let pending = services.length;
                if (pending === 0) {
                    resolve(bleServices);
                    return;
                }
                services.forEach(service => {
                    service.discoverCharacteristics([], (charError, characteristics) => {
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
    async subscribeCharacteristic(serviceUuid, characteristicUuid, callback) {
        const characteristic = await this.getCharacteristic(serviceUuid, characteristicUuid);
        return new Promise((resolve, reject) => {
            characteristic.subscribe((error) => {
                if (error) {
                    reject(new BleConnectionError(`Ошибка подписки: ${error.message}`, 'SUBSCRIBE_FAILED'));
                }
                else {
                    characteristic.on('data', callback);
                    resolve();
                }
            });
        });
    }
    async writeCharacteristic(serviceUuid, characteristicUuid, data) {
        const characteristic = await this.getCharacteristic(serviceUuid, characteristicUuid);
        return new Promise((resolve, reject) => {
            characteristic.write(data, false, (error) => {
                if (error) {
                    reject(new BleConnectionError(`Ошибка записи: ${error.message}`, 'WRITE_FAILED'));
                }
                else {
                    resolve();
                }
            });
        });
    }
    async readCharacteristic(serviceUuid, characteristicUuid) {
        const characteristic = await this.getCharacteristic(serviceUuid, characteristicUuid);
        return new Promise((resolve, reject) => {
            characteristic.read((error, data) => {
                if (error) {
                    reject(new BleConnectionError(`Ошибка чтения: ${error.message}`, 'READ_FAILED'));
                }
                else {
                    resolve(data);
                }
            });
        });
    }
    async getCharacteristic(serviceUuid, characteristicUuid) {
        if (!this.peripheral) {
            throw new BleConnectionError('Устройство не подключено', 'NOT_CONNECTED');
        }
        return new Promise((resolve, reject) => {
            this.peripheral.discoverServices([serviceUuid], (error, services) => {
                if (error || services.length === 0) {
                    reject(new BleConnectionError('Сервис не найден', 'SERVICE_NOT_FOUND'));
                    return;
                }
                const service = services[0];
                service.discoverCharacteristics([characteristicUuid], (charError, characteristics) => {
                    if (charError || characteristics.length === 0) {
                        reject(new BleConnectionError('Характеристика не найдена', 'CHARACTERISTIC_NOT_FOUND'));
                    }
                    else {
                        resolve(characteristics[0]);
                    }
                });
            });
        });
    }
    cleanup() {
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
