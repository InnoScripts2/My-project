import { EventEmitter } from 'events';
import { SerialPort } from 'serialport';

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

interface SerialPortTransportOptions {
  path: string;
  baudRate: number;
}

export class SerialPortTransport extends EventEmitter implements Elm327Transport {
  private port?: SerialPort;
  private readonly options: SerialPortTransportOptions;
  private openState = false;

  constructor(options: SerialPortTransportOptions) {
    super();
    this.options = options;
  }

  async open(): Promise<void> {
    if (this.openState) return;

    this.port = new SerialPort({
      path: this.options.path,
      baudRate: this.options.baudRate,
      autoOpen: false,
    });

    await new Promise<void>((resolve, reject) => {
      this.port!.open(err => (err ? reject(err) : resolve()));
    });

    this.port.on('data', this.handleData);
    this.port.on('close', this.handleClose);
    this.port.on('error', this.handleError);
    this.openState = true;
  }

  async close(): Promise<void> {
    if (!this.port) {
      this.openState = false;
      return;
    }

    this.port.removeListener('data', this.handleData);
    this.port.removeListener('close', this.handleClose);
    this.port.removeListener('error', this.handleError);

    await new Promise<void>((resolve) => {
      this.port!.close(() => resolve());
    });

    this.port = undefined;
    this.openState = false;
  }

  async write(data: string): Promise<void> {
    if (!this.port || !this.openState) throw new Error('Serial port is not open');
    await new Promise<void>((resolve, reject) => {
      this.port!.write(data, err => (err ? reject(err) : resolve()));
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

  private readonly handleData = (buffer: Buffer): void => {
    const text = buffer.toString('utf8');
    this.emit('data', text);
  };

  private readonly handleClose = (): void => {
    this.openState = false;
    this.emit('close');
  };

  private readonly handleError = (error: Error): void => {
    this.emit('error', error);
  };
}
