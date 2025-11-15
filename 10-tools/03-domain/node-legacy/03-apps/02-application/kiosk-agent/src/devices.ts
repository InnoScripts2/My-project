/** Device detection utilities — no simulation of data. Only real presence checks. */
import { obdConnectionManager } from './devices/obd/ObdConnectionManager.js'

export type DeviceStatus = 'connected' | 'connecting' | 'not_connected'

export async function getDevicesStatus(): Promise<{ thickness: DeviceStatus; obd: DeviceStatus }> {
  const snapshot = obdConnectionManager.getSnapshot()

  if (snapshot.state === 'disconnected') {
    void obdConnectionManager.connect().catch(() => undefined)
  }

  const obdStatus: DeviceStatus = snapshot.state === 'connected'
    ? 'connected'
    : snapshot.state === 'connecting'
      ? 'connecting'
      : 'not_connected'

  return { thickness: 'not_connected', obd: obdStatus }
}
