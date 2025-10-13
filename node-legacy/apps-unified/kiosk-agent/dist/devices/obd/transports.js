import { EventEmitter } from 'events';
import { SerialPort } from 'serialport';
export class SerialPortTransport extends EventEmitter {
    constructor(options) {
        super();
        this.openState = false;
        this.handleData = (buffer) => {
            const text = buffer.toString('utf8');
            this.emit('data', text);
        };
        this.handleClose = () => {
            this.openState = false;
            this.emit('close');
        };
        this.handleError = (error) => {
            this.emit('error', error);
        };
        this.options = options;
    }
    async open() {
        if (this.openState)
            return;
        this.port = new SerialPort({
            path: this.options.path,
            baudRate: this.options.baudRate,
            autoOpen: false,
        });
        await new Promise((resolve, reject) => {
            this.port.open(err => (err ? reject(err) : resolve()));
        });
        this.port.on('data', this.handleData);
        this.port.on('close', this.handleClose);
        this.port.on('error', this.handleError);
        this.openState = true;
    }
    async close() {
        if (!this.port) {
            this.openState = false;
            return;
        }
        this.port.removeListener('data', this.handleData);
        this.port.removeListener('close', this.handleClose);
        this.port.removeListener('error', this.handleError);
        await new Promise((resolve) => {
            this.port.close(() => resolve());
        });
        this.port = undefined;
        this.openState = false;
    }
    async write(data) {
        if (!this.port || !this.openState)
            throw new Error('Serial port is not open');
        await new Promise((resolve, reject) => {
            this.port.write(data, err => (err ? reject(err) : resolve()));
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
}
