import { EventEmitter } from 'events';
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
export declare class SerialPortTransport extends EventEmitter implements Elm327Transport {
    private port?;
    private readonly options;
    private openState;
    constructor(options: SerialPortTransportOptions);
    open(): Promise<void>;
    close(): Promise<void>;
    write(data: string): Promise<void>;
    onData(listener: (chunk: string) => void): void;
    offData(listener: (chunk: string) => void): void;
    onClose(listener: () => void): void;
    offClose(listener: () => void): void;
    onError(listener: (error: Error) => void): void;
    offError(listener: (error: Error) => void): void;
    private readonly handleData;
    private readonly handleClose;
    private readonly handleError;
}
export {};
