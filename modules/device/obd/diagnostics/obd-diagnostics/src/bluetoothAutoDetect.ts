// BLE-only: автодетект Bluetooth Classic (ELM327) удалён после миграции.
export interface BluetoothAutoDetectOptions { deviceHints?: string[]; channelHints?: number[]; discoveryTimeoutMs?: number; timeoutMs?: number; keepAliveIntervalMs?: number; logger?: (message: string) => void }
export interface BluetoothAutoDetectResult { address: string; name?: string; channel: number; identity: string }
export async function autoDetectBluetoothElm327(_options: BluetoothAutoDetectOptions = {}): Promise<BluetoothAutoDetectResult | null> {
  throw new Error('autoDetectBluetoothElm327 is removed. Use KingbolenEdiagDriver.connect() (BLE).');
}
