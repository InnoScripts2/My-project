/**
 * Общие ошибки устройств
 */

export class DeviceError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: Record<string, any>
  ) {
    super(message);
    this.name = 'DeviceError';
  }
}

export class DeviceConnectionError extends DeviceError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'device_connection_error', details);
    this.name = 'DeviceConnectionError';
  }
}

export class DeviceTimeoutError extends DeviceError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'device_timeout_error', details);
    this.name = 'DeviceTimeoutError';
  }
}

export class DeviceProtocolError extends DeviceError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'device_protocol_error', details);
    this.name = 'DeviceProtocolError';
  }
}

export class DeviceNotFoundError extends DeviceError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'device_not_found', details);
    this.name = 'DeviceNotFoundError';
  }
}

export class DeviceConfigurationError extends DeviceError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'device_configuration_error', details);
    this.name = 'DeviceConfigurationError';
  }
}
