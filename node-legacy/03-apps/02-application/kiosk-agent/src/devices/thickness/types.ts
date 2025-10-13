// Local thickness types to decouple from packages/device-thickness in this app build
// Keep in sync with packages/device-thickness if/when wired via proper package build
export interface BleConfig { deviceName?: string; serviceUuid?: string }

export type MeasurePointId = string

export interface MeasurePoint { id: MeasurePointId; label: string }
