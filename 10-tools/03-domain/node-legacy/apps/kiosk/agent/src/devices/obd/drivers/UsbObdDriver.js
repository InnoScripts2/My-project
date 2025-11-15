/**
 * USB OBD Driver
 * Implements ELM327 protocol over USB Serial Port
 */
import { EventEmitter } from 'events';
import { SerialPort } from 'serialport';
/**
 * Known ELM327 USB adapter vendor IDs
 */
const KNOWN_VENDOR_IDS = ['0403', '10C4', '067B']; // FTDI, Silicon Labs, Prolific
export class UsbObdDriver extends EventEmitter {
    serialPort = null;
    connected = false;
    config;
    deviceInfo = {};
    responseBuffer = '';
    constructor(config) {
        super();
        this.config = {
            usbPath: config.usbPath || '',
            autoDetect: config.autoDetect ?? true,
            baudRate: config.baudRate ?? 38400,
            reconnectOnDisconnect: config.reconnectOnDisconnect ?? false,
        };
    }
    /**
     * Detect USB adapter automatically
     */
    async detectUsbAdapter() {
        const ports = await SerialPort.list();
        // Filter by known vendor IDs
        const obdPorts = ports.filter(port => {
            if (!port.vendorId)
                return false;
            const vid = port.vendorId.toUpperCase();
            return KNOWN_VENDOR_IDS.some(known => vid.includes(known));
        });
        if (obdPorts.length === 0) {
            throw new Error('No USB OBD adapter found');
        }
        // Prioritize FTDI (0x0403)
        const ftdiPort = obdPorts.find(port => port.vendorId?.toUpperCase().includes('0403'));
        const selectedPort = ftdiPort || obdPorts[0];
        // Store device info
        this.deviceInfo = {
            vendorId: selectedPort.vendorId,
            productId: selectedPort.productId,
            manufacturer: selectedPort.manufacturer,
            serialNumber: selectedPort.serialNumber,
        };
        return selectedPort.path;
    }
    /**
     * Connect to USB OBD adapter
     */
    async connect() {
        if (this.connected) {
            return;
        }
        let portPath = this.config.usbPath;
        if (this.config.autoDetect || !portPath) {
            portPath = await this.detectUsbAdapter();
        }
        return new Promise((resolve, reject) => {
            this.serialPort = new SerialPort({
                path: portPath,
                baudRate: this.config.baudRate,
                autoOpen: false,
            });
            this.serialPort.on('data', (data) => {
                this.responseBuffer += data.toString();
            });
            this.serialPort.on('error', (error) => {
                this.emit('error', error);
            });
            this.serialPort.on('close', () => {
                this.connected = false;
                this.emit('USB_DISCONNECTED');
                if (this.config.reconnectOnDisconnect) {
                    setTimeout(() => {
                        this.connect().catch(err => this.emit('error', err));
                    }, 2000);
                }
            });
            this.serialPort.open((error) => {
                if (error) {
                    reject(error);
                    return;
                }
                this.connected = true;
                this.emit('connected');
                // Initialize ELM327
                this.initializeElm327()
                    .then(() => resolve())
                    .catch(reject);
            });
        });
    }
    /**
     * Initialize ELM327 adapter
     */
    async initializeElm327() {
        await this.sendCommand('ATZ'); // Reset
        await this.sendCommand('ATE0'); // Echo off
        await this.sendCommand('ATL0'); // Line feeds off
        await this.sendCommand('ATSP0'); // Auto protocol
    }
    /**
     * Disconnect from adapter
     */
    async disconnect() {
        if (this.serialPort && this.serialPort.isOpen) {
            await new Promise((resolve) => {
                this.serialPort.close(() => {
                    this.connected = false;
                    this.emit('disconnected');
                    resolve();
                });
            });
        }
        this.serialPort = null;
    }
    /**
     * Check if connected
     */
    isConnected() {
        return this.connected && this.serialPort !== null && this.serialPort.isOpen;
    }
    /**
     * Send command to adapter
     */
    async sendCommand(command) {
        if (!this.isConnected()) {
            throw new Error('USB OBD adapter not connected');
        }
        return new Promise((resolve, reject) => {
            this.responseBuffer = '';
            this.serialPort.write(command + '\r', (error) => {
                if (error) {
                    reject(error);
                    return;
                }
                // Wait for response
                setTimeout(() => {
                    const response = this.responseBuffer.trim();
                    resolve(response);
                }, 150);
            });
        });
    }
    /**
     * Request PID data
     */
    async requestPid(mode, pid) {
        const command = `${mode}${pid}`;
        const response = await this.sendCommand(command);
        // Parse ELM327 response
        const match = response.match(/[0-9A-F\s]+/i);
        return match ? match[0].replace(/\s/g, '') : '';
    }
    /**
     * Request diagnostic trouble codes
     */
    async requestDtc() {
        const response = await this.sendCommand('03');
        // Parse DTC codes from response
        const dtcCodes = [];
        const hexMatch = response.match(/43\s*([0-9A-F\s]+)/i);
        if (hexMatch) {
            const hexData = hexMatch[1].replace(/\s/g, '');
            for (let i = 0; i < hexData.length; i += 4) {
                const dtcHex = hexData.substring(i, i + 4);
                if (dtcHex !== '0000') {
                    const code = this.parseDtcCode(dtcHex);
                    dtcCodes.push({
                        code,
                        type: this.getDtcType(code),
                    });
                }
            }
        }
        return dtcCodes;
    }
    /**
     * Clear diagnostic trouble codes
     */
    async clearDtc() {
        await this.sendCommand('04');
    }
    /**
     * Get USB device information
     */
    getUsbDeviceInfo() {
        return { ...this.deviceInfo };
    }
    /**
     * Parse DTC code from hex
     */
    parseDtcCode(hex) {
        const value = parseInt(hex, 16);
        const firstChar = ['P', 'C', 'B', 'U'][(value >> 14) & 0x03];
        const code = (value & 0x3FFF).toString(16).toUpperCase().padStart(4, '0');
        return `${firstChar}${code}`;
    }
    /**
     * Get DTC type from code
     */
    getDtcType(code) {
        const firstChar = code[0];
        switch (firstChar) {
            case 'P': return 'Powertrain';
            case 'C': return 'Chassis';
            case 'B': return 'Body';
            case 'U': return 'Network';
            default: return 'Powertrain';
        }
    }
}
