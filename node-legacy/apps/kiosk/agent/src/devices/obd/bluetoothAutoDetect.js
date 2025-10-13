import { EventEmitter } from 'events';
import { Elm327Driver } from './Elm327Driver.js';
const LIKELY_NAMES = ['ediag', 'kingbolen', 'obd', 'elm', 'vlinker', 'icar', 'bt'];
export async function autoDetectBluetoothElm327(options = {}) {
    const logger = options.logger ?? (() => { });
    const BluetoothSerialPortCtor = await loadBluetoothSerialPort(logger);
    if (!BluetoothSerialPortCtor) {
        return null;
    }
    const devices = await discoverDevices(BluetoothSerialPortCtor, options.discoveryTimeoutMs, logger);
    if (!devices.length) {
        logger('bluetooth-auto-detect: no bluetooth devices found');
        return null;
    }
    const rankedDevices = rankDevices(devices, options.deviceHints);
    for (const device of rankedDevices) {
        logger(`bluetooth-auto-detect: probing ${device.name ?? 'unknown'} (${device.address})`);
        const transport = new BluetoothTransport({
            address: device.address,
            name: device.name,
            BluetoothSerialPortCtor,
            channelHints: options.channelHints,
            logger,
        });
        const driver = new Elm327Driver({
            transport,
            timeoutMs: options.timeoutMs ?? 2500,
            keepAliveIntervalMs: 0,
        });
        try {
            await driver.open();
            const identity = await driver.identify();
            if (isLikelyElm(identity)) {
                logger(`bluetooth-auto-detect: detected ${identity} on ${device.address}`);
                if (options.keepAliveIntervalMs && options.keepAliveIntervalMs > 0) {
                    driver.startKeepAlive(options.keepAliveIntervalMs);
                }
                return {
                    driver,
                    address: device.address,
                    name: device.name,
                    channel: transport.getActiveChannel() ?? -1,
                    identity,
                };
            }
            logger(`bluetooth-auto-detect: ${device.address} responded with unsupported identity: ${identity}`);
        }
        catch (error) {
            logger(`bluetooth-auto-detect: probe failed for ${device.address} (${stringifyError(error)})`);
        }
        try {
            await driver.close();
        }
        catch {
            // swallow
        }
    }
    logger('bluetooth-auto-detect: no compatible adapter found');
    return null;
}
async function discoverDevices(BluetoothSerialPortCtor, timeoutMs = 15000, logger) {
    const adapter = new BluetoothSerialPortCtor();
    const devices = [];
    return new Promise((resolve) => {
        let timer = null;
        const onFound = (address, name) => {
            devices.push({ address, name });
        };
        const finalize = () => {
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
            adapter.removeListener('found', onFound);
            adapter.removeListener('finished', finalize);
            try {
                adapter.close();
            }
            catch {
                // ignore
            }
            resolve(devices);
        };
        adapter.on('found', onFound);
        adapter.on('finished', finalize);
        try {
            adapter.inquire();
        }
        catch (error) {
            logger(`bluetooth-auto-detect: inquiry failed (${stringifyError(error)})`);
            finalize();
            return;
        }
        timer = setTimeout(finalize, timeoutMs);
    });
}
function rankDevices(devices, hints) {
    const hintSet = new Set((hints ?? []).map((item) => item.toLowerCase()));
    return devices
        .map(device => ({
        device,
        score: computeDeviceScore(device, hintSet),
    }))
        .sort((a, b) => b.score - a.score)
        .map(item => item.device);
}
function computeDeviceScore(device, hintSet) {
    let score = 0;
    const label = `${device.address} ${device.name ?? ''}`.toLowerCase();
    if (hintSet.has(device.address.toLowerCase()) || hintSet.has((device.name ?? '').toLowerCase())) {
        score += 50;
    }
    for (const keyword of LIKELY_NAMES) {
        if (label.includes(keyword))
            score += 10;
    }
    if (device.name)
        score += Math.min(device.name.length, 5);
    return score;
}
function isLikelyElm(identity) {
    const text = identity.toLowerCase();
    return LIKELY_NAMES.some((keyword) => text.includes(keyword));
}
const BLUETOOTH_MODULE_ID = '@abandonware/bluetooth-serial-port';
async function loadBluetoothSerialPort(logger) {
    try {
        const module = await import(BLUETOOTH_MODULE_ID);
        const ctor = module.BluetoothSerialPort;
        if (!ctor) {
            logger('bluetooth-auto-detect: module does not export BluetoothSerialPort');
            return null;
        }
        return ctor;
    }
    catch (error) {
        logger(`bluetooth-auto-detect: bluetooth module unavailable (${stringifyError(error)})`);
        return null;
    }
}
function stringifyError(error) {
    if (error instanceof Error)
        return error.message;
    if (typeof error === 'string')
        return error;
    return JSON.stringify(error);
}
class BluetoothTransport extends EventEmitter {
    adapter;
    address;
    channelHints;
    logger;
    openState = false;
    activeChannel;
    constructor(options) {
        super();
        this.adapter = new options.BluetoothSerialPortCtor();
        this.address = options.address;
        this.channelHints = options.channelHints;
        this.logger = options.logger;
    }
    getActiveChannel() {
        return this.activeChannel;
    }
    async open() {
        if (this.openState && this.adapter.isOpen())
            return;
        if (this.openState && !this.adapter.isOpen()) {
            this.openState = false;
            this.activeChannel = undefined;
        }
        const attemptedChannels = new Set();
        const channelCandidates = [...(this.channelHints ?? [])];
        for (const candidate of channelCandidates) {
            if (attemptedChannels.has(candidate))
                continue;
            attemptedChannels.add(candidate);
            try {
                await this.connect(candidate);
                this.activeChannel = candidate;
                this.openState = true;
                this.adapter.on('data', this.handleData);
                return;
            }
            catch (error) {
                const normalized = error instanceof Error ? error : new Error(String(error));
                this.logger(`bluetooth-auto-detect: channel ${candidate} failed (${stringifyError(normalized)})`);
                this.emit('error', normalized);
                try {
                    this.adapter.close();
                }
                catch {
                    // ignore cleanup errors
                }
            }
        }
        const discoveredChannel = await this.findChannel();
        await this.connect(discoveredChannel);
        this.activeChannel = discoveredChannel;
        this.openState = true;
        this.adapter.on('data', this.handleData);
    }
    async close() {
        if (!this.openState && !this.adapter.isOpen())
            return;
        this.adapter.removeListener('data', this.handleData);
        try {
            this.adapter.close();
        }
        catch (error) {
            this.logger(`bluetooth-auto-detect: close failed (${stringifyError(error)})`);
        }
        this.openState = false;
        this.activeChannel = undefined;
        this.emit('close');
    }
    async write(data) {
        if (!this.adapter.isOpen()) {
            throw new Error('Bluetooth channel is not open');
        }
        await new Promise((resolve, reject) => {
            this.adapter.write(Buffer.from(data, 'utf8'), (err) => (err ? reject(err) : resolve()));
        });
    }
    onData(listener) {
        this.on('data', listener);
    }
    offData(listener) {
        this.off('data', listener);
    }
    onClose(listener) {
        this.on('close', listener);
    }
    offClose(listener) {
        this.off('close', listener);
    }
    onError(listener) {
        this.on('error', listener);
    }
    offError(listener) {
        this.off('error', listener);
    }
    async connect(channel) {
        await new Promise((resolve, reject) => {
            this.adapter.connect(this.address, channel, () => resolve(), (err) => {
                try {
                    this.adapter.close();
                }
                catch {
                    // ignore
                }
                reject(err ?? new Error('bluetooth connection failed'));
            });
        });
    }
    async findChannel() {
        return new Promise((resolve, reject) => {
            this.adapter.findSerialPortChannel(this.address, (channel) => resolve(channel), () => reject(new Error('bluetooth serial channel not found')));
        });
    }
    handleData = (buffer) => {
        const text = buffer.toString('utf8');
        this.emit('data', text);
    };
}
