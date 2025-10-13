/**
 * Модели измерений толщины ЛКП
 */

const zonesData: ZoneDefinition[] = [
  { zoneId: 0, zoneName: "Капот передний левый", normMin: 80, normMax: 150 },
  { zoneId: 1, zoneName: "Капот передний центр", normMin: 80, normMax: 150 },
  { zoneId: 2, zoneName: "Капот передний правый", normMin: 80, normMax: 150 },
  { zoneId: 3, zoneName: "Капот задний левый", normMin: 80, normMax: 150 },
  { zoneId: 4, zoneName: "Капот задний центр", normMin: 80, normMax: 150 },
  { zoneId: 5, zoneName: "Капот задний правый", normMin: 80, normMax: 150 },
  { zoneId: 6, zoneName: "Крыша передняя левая", normMin: 80, normMax: 150 },
  { zoneId: 7, zoneName: "Крыша передняя центр", normMin: 80, normMax: 150 },
  { zoneId: 8, zoneName: "Крыша передняя правая", normMin: 80, normMax: 150 },
  { zoneId: 9, zoneName: "Крыша центральная левая", normMin: 80, normMax: 150 },
  { zoneId: 10, zoneName: "Крыша центральная центр", normMin: 80, normMax: 150 },
  { zoneId: 11, zoneName: "Крыша центральная правая", normMin: 80, normMax: 150 },
  { zoneId: 12, zoneName: "Крыша задняя левая", normMin: 80, normMax: 150 },
  { zoneId: 13, zoneName: "Крыша задняя центр", normMin: 80, normMax: 150 },
  { zoneId: 14, zoneName: "Крыша задняя правая", normMin: 80, normMax: 150 },
  { zoneId: 15, zoneName: "Дверь передняя левая верх", normMin: 80, normMax: 150 },
  { zoneId: 16, zoneName: "Дверь передняя левая низ", normMin: 80, normMax: 150 },
  { zoneId: 17, zoneName: "Дверь передняя правая верх", normMin: 80, normMax: 150 },
  { zoneId: 18, zoneName: "Дверь передняя правая низ", normMin: 80, normMax: 150 },
  { zoneId: 19, zoneName: "Дверь задняя левая верх", normMin: 80, normMax: 150 },
  { zoneId: 20, zoneName: "Дверь задняя левая низ", normMin: 80, normMax: 150 },
  { zoneId: 21, zoneName: "Дверь задняя правая верх", normMin: 80, normMax: 150 },
  { zoneId: 22, zoneName: "Дверь задняя правая низ", normMin: 80, normMax: 150 },
  { zoneId: 23, zoneName: "Крыло переднее левое верх", normMin: 80, normMax: 150 },
  { zoneId: 24, zoneName: "Крыло переднее левое низ", normMin: 80, normMax: 150 },
  { zoneId: 25, zoneName: "Крыло переднее правое верх", normMin: 80, normMax: 150 },
  { zoneId: 26, zoneName: "Крыло переднее правое низ", normMin: 80, normMax: 150 },
  { zoneId: 27, zoneName: "Крыло заднее левое верх", normMin: 80, normMax: 150 },
  { zoneId: 28, zoneName: "Крыло заднее левое низ", normMin: 80, normMax: 150 },
  { zoneId: 29, zoneName: "Крыло заднее правое верх", normMin: 80, normMax: 150 },
  { zoneId: 30, zoneName: "Крыло заднее правое низ", normMin: 80, normMax: 150 },
  { zoneId: 31, zoneName: "Порог левый передний", normMin: 80, normMax: 150 },
  { zoneId: 32, zoneName: "Порог левый задний", normMin: 80, normMax: 150 },
  { zoneId: 33, zoneName: "Порог правый передний", normMin: 80, normMax: 150 },
  { zoneId: 34, zoneName: "Порог правый задний", normMin: 80, normMax: 150 },
  { zoneId: 35, zoneName: "Багажник левый", normMin: 80, normMax: 150 },
  { zoneId: 36, zoneName: "Багажник центр", normMin: 80, normMax: 150 },
  { zoneId: 37, zoneName: "Багажник правый", normMin: 80, normMax: 150 },
  { zoneId: 38, zoneName: "Крышка багажника левая", normMin: 80, normMax: 150 },
  { zoneId: 39, zoneName: "Крышка багажника центр", normMin: 80, normMax: 150 },
  { zoneId: 40, zoneName: "Крышка багажника правая", normMin: 80, normMax: 150 },
  { zoneId: 41, zoneName: "Стойка A левая", normMin: 80, normMax: 150 },
  { zoneId: 42, zoneName: "Стойка A правая", normMin: 80, normMax: 150 },
  { zoneId: 43, zoneName: "Стойка B левая", normMin: 80, normMax: 150 },
  { zoneId: 44, zoneName: "Стойка B правая", normMin: 80, normMax: 150 },
  { zoneId: 45, zoneName: "Стойка C левая", normMin: 80, normMax: 150 },
  { zoneId: 46, zoneName: "Стойка C правая", normMin: 80, normMax: 150 },
  { zoneId: 47, zoneName: "Кромка крыши левая передняя", normMin: 80, normMax: 150 },
  { zoneId: 48, zoneName: "Кромка крыши левая задняя", normMin: 80, normMax: 150 },
  { zoneId: 49, zoneName: "Кромка крыши правая передняя", normMin: 80, normMax: 150 },
  { zoneId: 50, zoneName: "Кромка крыши правая задняя", normMin: 80, normMax: 150 },
  { zoneId: 51, zoneName: "Кромка двери передней левой", normMin: 80, normMax: 150 },
  { zoneId: 52, zoneName: "Кромка двери передней правой", normMin: 80, normMax: 150 },
  { zoneId: 53, zoneName: "Кромка двери задней левой", normMin: 80, normMax: 150 },
  { zoneId: 54, zoneName: "Кромка двери задней правой", normMin: 80, normMax: 150 },
  { zoneId: 55, zoneName: "Бампер передний левый", normMin: 80, normMax: 150 },
  { zoneId: 56, zoneName: "Бампер передний центр", normMin: 80, normMax: 150 },
  { zoneId: 57, zoneName: "Бампер передний правый", normMin: 80, normMax: 150 },
  { zoneId: 58, zoneName: "Бампер задний левый", normMin: 80, normMax: 150 },
  { zoneId: 59, zoneName: "Бампер задний центр", normMin: 80, normMax: 150 }
];

export interface ZoneDefinition {
  zoneId: number;
  zoneName: string;
  normMin: number;
  normMax: number;
}

export interface MeasurementPoint {
  zoneId: number;
  zoneName: string;
  value: number;
  timestamp: number;
  isNormal: boolean;
}

export enum ThicknessStatus {
  IDLE = 'idle',
  SCANNING = 'scanning',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  MEASURING = 'measuring',
  COMPLETE = 'complete',
  INCOMPLETE = 'incomplete',
  ERROR = 'error',
  UNAVAILABLE = 'unavailable',
}

export interface MeasurementSession {
  sessionId: string;
  measurements: MeasurementPoint[];
  totalZones: number;
  measuredZones: number;
  startTime: number;
  endTime?: number;
  status: ThicknessStatus;
}

export function getZoneDefinition(zoneId: number): ZoneDefinition | undefined {
  return zonesData.find(z => z.zoneId === zoneId);
}

export function getAllZones(): ZoneDefinition[] {
  return zonesData;
}

export function createMeasurementPoint(
  zoneId: number,
  value: number,
  timestamp: number
): MeasurementPoint | null {
  const zone = getZoneDefinition(zoneId);
  if (!zone) {
    return null;
  }
  
  return {
    zoneId,
    zoneName: zone.zoneName,
    value,
    timestamp,
    isNormal: value >= zone.normMin && value <= zone.normMax,
  };
}

export function createSession(totalZones: number = 60): MeasurementSession {
  return {
    sessionId: generateSessionId(),
    measurements: [],
    totalZones,
    measuredZones: 0,
    startTime: Date.now(),
    status: ThicknessStatus.MEASURING,
  };
}

export function addMeasurement(
  session: MeasurementSession,
  point: MeasurementPoint
): MeasurementSession {
  const updated = {
    ...session,
    measurements: [...session.measurements, point],
    measuredZones: session.measuredZones + 1,
  };
  
  if (updated.measuredZones >= updated.totalZones) {
    updated.status = ThicknessStatus.COMPLETE;
    updated.endTime = Date.now();
  }
  
  return updated;
}

function generateSessionId(): string {
  return `thk_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
