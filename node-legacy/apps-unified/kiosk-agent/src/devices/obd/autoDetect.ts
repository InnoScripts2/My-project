// Устаревший автодетект для ELM327. Для KINGBOLEN BLE используйте методы
// драйвера `KingbolenEdiagDriver.connect()` без автодетекта COM-портов.
import { SerialPort } from 'serialport';

export interface AutoDetectOptions {
  /** Optional hint list to prioritise certain port paths. */
  portHints?: string[];
  /** Baud rates to probe. Defaults to [38400, 115200, 9600]. */
  baudRates?: number[];
  /** Timeout for identification commands. Defaults to 1500ms. */
  timeoutMs?: number;
  /** Optional keep-alive interval applied after detection (ms). */
  keepAliveIntervalMs?: number;
  /** Optional logger callback for diagnostics. */
  logger?: (message: string) => void;
  /** Protocol profile name (e.g., 'toyota_lexus') */
  protocolProfile?: string;
  /** Manual protocol override */
  protocol?: string;
}

export interface AutoDetectResult {
  // Сохранено для обратной совместимости типизации, но не используется в BLE сценарии
  driver: unknown;
  portPath: string;
  baudRate: number;
  identity: string;
  portInfo: SerialPortPortInfo;
}

export type SerialPortPortInfo = {
  path: string;
  manufacturer?: string;
  serialNumber?: string;
  pnpId?: string;
  locationId?: string;
  productId?: string;
  vendorId?: string;
  friendlyName?: string;
  [key: string]: unknown;
};

const DEFAULT_BAUD_RATES = [38400, 115200, 9600];
const LIKELY_KEYWORDS = ['ediag', 'kingbolen', 'obd', 'elm'];

export async function autoDetectElm327(options: AutoDetectOptions = {}): Promise<AutoDetectResult | null> {
  // Явно запрещаем использование в новой архитектуре
  throw new Error('autoDetectElm327 is deprecated. Use KingbolenEdiagDriver.connect() for BLE.');
  /*
  const logger = options.logger ?? (() => {});
  let portList: SerialPortPortInfo[];
  try {
    portList = (await SerialPort.list()) as SerialPortPortInfo[];
  } catch (error) {
    logger(`auto-detect: failed to enumerate serial ports (${stringifyError(error)})`);
    return null;
  }

  if (!portList.length) {
    logger('auto-detect: serial port list is empty');
    return null;
  }

  const rankedPorts = rankPorts(portList, options.portHints);
  const baudRates = options.baudRates && options.baudRates.length
    ? options.baudRates
    : DEFAULT_BAUD_RATES;

  for (const port of rankedPorts) {
    for (const baud of baudRates) {
      logger(`auto-detect: probing ${port.path} @ ${baud}`);
      const driver = new Elm327Driver({
        portPath: port.path,
        baudRate: baud,
        timeoutMs: options.timeoutMs ?? 1500,
        protocolProfile: options.protocolProfile,
        protocol: options.protocol as any,
      });
      try {
        await driver.open();
        const identity = await driver.identify();
        if (isLikelyElm(identity)) {
          logger(`auto-detect: detected ${identity} on ${port.path}`);
          if (options.keepAliveIntervalMs && options.keepAliveIntervalMs > 0) {
            driver.startKeepAlive(options.keepAliveIntervalMs);
          }
          return {
            driver,
            portPath: port.path,
            baudRate: baud,
            identity,
            portInfo: port,
          };
        }
        logger(`auto-detect: ${port.path} responded with unsupported identity: ${identity}`);
      } catch (error) {
        logger(`auto-detect: ${port.path} probe failed (${stringifyError(error)})`);
      }

      try {
        await driver.close();
      } catch (closeError) {
        logger(`auto-detect: failed to close ${port.path} (${stringifyError(closeError)})`);
      }
    }
  }

  logger('auto-detect: no suitable adapter found');
  return null;
  */
}

function rankPorts(list: SerialPortPortInfo[], hints?: string[]): SerialPortPortInfo[] {
  const hintSet = new Set((hints ?? []).filter(Boolean));
  const scored = list.map((port) => ({
    port,
    score: computeScore(port, hintSet),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.map((item) => item.port);
}

function computeScore(info: SerialPortPortInfo, hintSet: Set<string>): number {
  let score = 0;
  if (hintSet.has(info.path)) score += 50;
  const haystack = `${info.path} ${info.manufacturer ?? ''} ${info.friendlyName ?? ''} ${info.serialNumber ?? ''} ${info.pnpId ?? ''}`.toLowerCase();
  for (const keyword of LIKELY_KEYWORDS) {
    if (haystack.includes(keyword)) {
      score += 10;
    }
  }
  if (haystack.includes('bluetooth')) score += 5;
  if (haystack.includes('usb')) score += 2;
  if (info.vendorId) score += 1;
  return score - listIndexPenalty(info.path);
}

function listIndexPenalty(path: string): number {
  const match = path.match(/(\d+)/);
  if (!match) return 0;
  const value = Number.parseInt(match[1], 10);
  if (!Number.isFinite(value)) return 0;
  return value * 0.01;
}

function isLikelyElm(identity: string): boolean {
  const text = identity.toLowerCase();
  return LIKELY_KEYWORDS.some((keyword) => text.includes(keyword));
}

function stringifyError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return JSON.stringify(error);
}
