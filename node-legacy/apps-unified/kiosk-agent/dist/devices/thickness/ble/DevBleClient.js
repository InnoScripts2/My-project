/**
 * Dev Mock BLE Client
 * Эмуляция BLE устройства для разработки без реального BLE адаптера
 */
export class DevBleClient {
    constructor() {
        this.connected = false;
    }
    async startScan(serviceUuids, timeout = 15000) {
        await this.delay(500);
        return {
            id: 'dev-thickness-device',
            name: 'TH_Sensor_DEV',
            rssi: -60,
            advertisedServices: serviceUuids,
        };
    }
    stopScan() {
        // No-op in dev mode
    }
    async connect(deviceId, timeout = 10000) {
        await this.delay(300);
        this.connected = true;
    }
    async disconnect() {
        this.connected = false;
        if (this.measurementInterval) {
            clearInterval(this.measurementInterval);
            this.measurementInterval = undefined;
        }
        this.measurementCallback = undefined;
    }
    async discoverServices(serviceUuid) {
        await this.delay(200);
        return [
            {
                uuid: serviceUuid,
                characteristics: [
                    { uuid: '0000FFF1-0000-1000-8000-00805F9B34FB', properties: ['read', 'notify'] },
                    { uuid: '0000FFF2-0000-1000-8000-00805F9B34FB', properties: ['write'] },
                    { uuid: '0000FFF3-0000-1000-8000-00805F9B34FB', properties: ['read'] },
                ],
            },
        ];
    }
    async subscribeCharacteristic(serviceUuid, characteristicUuid, callback) {
        await this.delay(100);
        this.measurementCallback = callback;
    }
    async writeCharacteristic(serviceUuid, characteristicUuid, data) {
        await this.delay(50);
        const command = data[0];
        if (command === 0x01) {
            this.startMockMeasurements();
        }
        else if (command === 0x02) {
            this.stopMockMeasurements();
        }
    }
    async readCharacteristic(serviceUuid, characteristicUuid) {
        await this.delay(50);
        return Buffer.from([0x00]);
    }
    startMockMeasurements() {
        if (this.measurementInterval) {
            return;
        }
        let zoneId = 0;
        const fixedValue = 100;
        this.measurementInterval = setInterval(() => {
            if (this.measurementCallback && zoneId < 60) {
                const valueHigh = (fixedValue >> 8) & 0xFF;
                const valueLow = fixedValue & 0xFF;
                const data = Buffer.from([zoneId, valueHigh, valueLow]);
                this.measurementCallback(data);
                zoneId++;
                if (zoneId >= 60) {
                    this.stopMockMeasurements();
                }
            }
        }, 1000);
    }
    stopMockMeasurements() {
        if (this.measurementInterval) {
            clearInterval(this.measurementInterval);
            this.measurementInterval = undefined;
        }
    }
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
