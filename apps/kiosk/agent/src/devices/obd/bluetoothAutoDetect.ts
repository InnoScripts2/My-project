import { EventEmitter } from 'events';
// BLE-first build: do not depend on Elm327Driver here; keep a minimal stub
import type { Elm327Driver } from './Elm327Driver.js';
const LIKELY_NAMES = ['ediag', 'kingbolen', 'obd', 'elm', 'vlinker', 'icar', 'bt'];

export interface BluetoothAutoDetectOptions {
  deviceHints?: string[];
  channelHints?: number[];
  discoveryTimeoutMs?: number;
  timeoutMs?: number;
  keepAliveIntervalMs?: number;
  logger?: (message: string) => void;
}

export interface BluetoothAutoDetectResult {
  // In BLE-first build we don't construct a driver here; only metadata
  address: string;
  name?: string;
  channel: number;
  identity: string;
  driver?: Elm327Driver;
}

export async function autoDetectBluetoothElm327(
  options: BluetoothAutoDetectOptions = {}
): Promise<BluetoothAutoDetectResult | null> {
  const logger = options.logger ?? (() => {});
  const BluetoothSerialPortCtor = await loadBluetoothSerialPort(logger);
  if (!BluetoothSerialPortCtor) return null;
  const devices = await discoverDevices(BluetoothSerialPortCtor, options.discoveryTimeoutMs, logger);
  if (!devices.length) {
    logger('bluetooth-auto-detect: no bluetooth devices found');
    return null;
  }

  const rankedDevices = rankDevices(devices, options.deviceHints);
  for (const device of rankedDevices) {
    logger(`bluetooth-auto-detect: probing ${device.name ?? 'unknown'} (${device.address})`);
    // Minimal probe via SDP channel check (no driver construction here)
    const transport = new BluetoothTransport({
      address: device.address,
      name: device.name,
      BluetoothSerialPortCtor,
      channelHints: options.channelHints,
      logger,
    });
    const identity = `${device.name ?? 'unknown'}-${device.address}`;
    if (isLikelyElm(identity)) {
      logger(`bluetooth-auto-detect: detected candidate ${identity}`);
      return {
        address: device.address,
        name: device.name,
        channel: transport.getActiveChannel() ?? -1,
        identity,
      };
    }
  }

  logger('bluetooth-auto-detect: no compatible adapter found');
  return null;
}

interface DiscoveredDevice {
  address: string;
  name?: string;
}

async function discoverDevices(
  BluetoothSerialPortCtor: BluetoothSerialPortConstructor,
  timeoutMs = 15000,
  logger: (message: string) => void
): Promise<DiscoveredDevice[]> {
  const adapter = new BluetoothSerialPortCtor();
  const devices: DiscoveredDevice[] = [];

  return new Promise((resolve) => {
    let timer: NodeJS.Timeout | null = null;
    const onFound = (address: string, name?: string) => {
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
      } catch {
        // ignore
      }
      resolve(devices);
    };

    adapter.on('found', onFound);
    adapter.on('finished', finalize);

    try {
      adapter.inquire();
    } catch (error) {
      logger(`bluetooth-auto-detect: inquiry failed (${stringifyError(error)})`);
      finalize();
      return;
    }
    timer = setTimeout(finalize, timeoutMs);
  });
}

function rankDevices(devices: DiscoveredDevice[], hints?: string[]): DiscoveredDevice[] {
  const hintSet = new Set((hints ?? []).map((item) => item.toLowerCase()));
  return devices
    .map(device => ({
      device,
      score: computeDeviceScore(device, hintSet),
    }))
    .sort((a, b) => b.score - a.score)
    .map(item => item.device);
}

function computeDeviceScore(device: DiscoveredDevice, hintSet: Set<string>): number {
  let score = 0;
  const label = `${device.address} ${device.name ?? ''}`.toLowerCase();
  if (hintSet.has(device.address.toLowerCase()) || hintSet.has((device.name ?? '').toLowerCase())) {
    score += 50;
  }
  for (const keyword of LIKELY_NAMES) {
    if (label.includes(keyword)) score += 10;
  }
  if (device.name) score += Math.min(device.name.length, 5);
  return score;
}

function isLikelyElm(identity: string): boolean {
  const text = identity.toLowerCase();
  return LIKELY_NAMES.some((keyword) => text.includes(keyword));
}

const BLUETOOTH_MODULE_ID: string = '@abandonware/bluetooth-serial-port';

async function loadBluetoothSerialPort(logger: (message: string) => void): Promise<BluetoothSerialPortConstructor | null> {
  try {
    const module = await import(BLUETOOTH_MODULE_ID);
    const ctor = module.BluetoothSerialPort as BluetoothSerialPortConstructor | undefined;
    if (!ctor) {
      logger('bluetooth-auto-detect: module does not export BluetoothSerialPort');
      return null;
    }
    return ctor;
  } catch (error) {
    logger(`bluetooth-auto-detect: bluetooth module unavailable (${stringifyError(error)})`);
    return null;
  }
}

function stringifyError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return JSON.stringify(error);
}

type BluetoothSerialPortConstructor = new () => BluetoothSerialPortLike;

interface BluetoothSerialPortLike extends EventEmitter {
  inquire(): void;
  close(): void;
  isOpen(): boolean;
  findSerialPortChannel(address: string, success: (channel: number) => void, error: () => void): void;
  connect(address: string, channel: number, success: () => void, error: (err?: Error) => void): void;
  write(buffer: Buffer, callback: (err?: Error) => void): void;
}

interface BluetoothTransportOptions {
  address: string;
  name?: string;
  BluetoothSerialPortCtor: BluetoothSerialPortConstructor;
  channelHints?: number[];
  logger: (message: string) => void;
}

class BluetoothTransport extends EventEmitter {
  private readonly adapter: BluetoothSerialPortLike;
  private readonly address: string;
  private readonly channelHints?: number[];
  private readonly logger: (message: string) => void;
  private openState = false;
  private activeChannel?: number;

  constructor(options: BluetoothTransportOptions) {
    super();
    this.adapter = new options.BluetoothSerialPortCtor();
    this.address = options.address;
    this.channelHints = options.channelHints;
    this.logger = options.logger;
  }

  getActiveChannel(): number | undefined {
    return this.activeChannel;
  }

  async open(): Promise<void> {
    if (this.openState && this.adapter.isOpen()) return;
    if (this.openState && !this.adapter.isOpen()) {
      this.openState = false;
      this.activeChannel = undefined;
    }

    const attemptedChannels = new Set<number>();
    const channelCandidates = [...(this.channelHints ?? [])];

    for (const candidate of channelCandidates) {
      if (attemptedChannels.has(candidate)) continue;
      attemptedChannels.add(candidate);
      try {
        await this.connect(candidate);
        this.activeChannel = candidate;
        this.openState = true;
        this.adapter.on('data', this.handleData);
        return;
      } catch (error) {
        const normalized = error instanceof Error ? error : new Error(String(error));
        this.logger(`bluetooth-auto-detect: channel ${candidate} failed (${stringifyError(normalized)})`);
        this.emit('error', normalized);
        try {
          this.adapter.close();
        } catch {
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

  async close(): Promise<void> {
    if (!this.openState && !this.adapter.isOpen()) return;
    this.adapter.removeListener('data', this.handleData);
    try {
      this.adapter.close();
    } catch (error) {
      this.logger(`bluetooth-auto-detect: close failed (${stringifyError(error)})`);
    }
    this.openState = false;
    this.activeChannel = undefined;
    this.emit('close');
  }

  async write(data: string): Promise<void> {
    if (!this.adapter.isOpen()) {
      throw new Error('Bluetooth channel is not open');
    }
    await new Promise<void>((resolve, reject) => {
      this.adapter.write(Buffer.from(data, 'utf8'), (err) => (err ? reject(err) : resolve()));
    });
  }

  onData(listener: (chunk: string) => void): void {
    this.on('data', listener);
  }

  offData(listener: (chunk: string) => void): void {
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

  private async connect(channel: number): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.adapter.connect(
        this.address,
        channel,
        () => resolve(),
        (err) => {
          try {
            this.adapter.close();
          } catch {
            // ignore
          }
          reject(err ?? new Error('bluetooth connection failed'));
        }
      );
    });
  }

  private async findChannel(): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      this.adapter.findSerialPortChannel(
        this.address,
        (channel) => resolve(channel),
        () => reject(new Error('bluetooth serial channel not found'))
      );
    });
  }

  private readonly handleData = (buffer: Buffer): void => {
    const text = buffer.toString('utf8');
    this.emit('data', text);
  };
}
