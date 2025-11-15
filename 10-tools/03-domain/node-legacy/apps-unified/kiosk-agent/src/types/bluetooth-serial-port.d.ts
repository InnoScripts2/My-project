declare module '@abandonware/bluetooth-serial-port' {
  import { EventEmitter } from 'events';

  export class BluetoothSerialPort extends EventEmitter {
    inquire(): void;
    close(): void;
    isOpen(): boolean;
    findSerialPortChannel(
      address: string,
      success: (channel: number) => void,
      error: () => void
    ): void;
    connect(
      address: string,
      channel: number,
      success: () => void,
      error: (err?: Error) => void
    ): void;
    write(buffer: Buffer, callback: (err?: Error) => void): void;
  }
}
