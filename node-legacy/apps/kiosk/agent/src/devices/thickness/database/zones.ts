/**
 * База зон кузова для измерения толщины ЛКП
 */

export interface BodyZone {
  id: number;
  name: string;
  description: string;
  category: 'hood' | 'roof' | 'door' | 'fender' | 'quarter_panel' | 'bumper' | 'trunk';
  position: 'front' | 'rear' | 'left' | 'right' | 'center';
  standardThickness: {
    min: number;
    max: number;
    typical: number;
  };
}

/**
 * Стандартные зоны для седана (40 точек)
 */
export const SEDAN_ZONES: BodyZone[] = [
  // Капот (8 точек)
  { id: 1, name: 'Капот левый передний', description: 'Hood left front', category: 'hood', position: 'left', standardThickness: { min: 80, max: 150, typical: 120 } },
  { id: 2, name: 'Капот центр передний', description: 'Hood center front', category: 'hood', position: 'center', standardThickness: { min: 80, max: 150, typical: 120 } },
  { id: 3, name: 'Капот правый передний', description: 'Hood right front', category: 'hood', position: 'right', standardThickness: { min: 80, max: 150, typical: 120 } },
  { id: 4, name: 'Капот левый задний', description: 'Hood left rear', category: 'hood', position: 'left', standardThickness: { min: 80, max: 150, typical: 120 } },
  { id: 5, name: 'Капот центр', description: 'Hood center', category: 'hood', position: 'center', standardThickness: { min: 80, max: 150, typical: 120 } },
  { id: 6, name: 'Капот правый задний', description: 'Hood right rear', category: 'hood', position: 'right', standardThickness: { min: 80, max: 150, typical: 120 } },
  { id: 7, name: 'Капот левый край', description: 'Hood left edge', category: 'hood', position: 'left', standardThickness: { min: 80, max: 150, typical: 120 } },
  { id: 8, name: 'Капот правый край', description: 'Hood right edge', category: 'hood', position: 'right', standardThickness: { min: 80, max: 150, typical: 120 } },

  // Крыша (6 точек)
  { id: 9, name: 'Крыша передняя левая', description: 'Roof front left', category: 'roof', position: 'left', standardThickness: { min: 90, max: 160, typical: 130 } },
  { id: 10, name: 'Крыша передняя центр', description: 'Roof front center', category: 'roof', position: 'center', standardThickness: { min: 90, max: 160, typical: 130 } },
  { id: 11, name: 'Крыша передняя правая', description: 'Roof front right', category: 'roof', position: 'right', standardThickness: { min: 90, max: 160, typical: 130 } },
  { id: 12, name: 'Крыша задняя левая', description: 'Roof rear left', category: 'roof', position: 'left', standardThickness: { min: 90, max: 160, typical: 130 } },
  { id: 13, name: 'Крыша задняя центр', description: 'Roof rear center', category: 'roof', position: 'center', standardThickness: { min: 90, max: 160, typical: 130 } },
  { id: 14, name: 'Крыша задняя правая', description: 'Roof rear right', category: 'roof', position: 'right', standardThickness: { min: 90, max: 160, typical: 130 } },

  // Передние крылья (4 точки)
  { id: 15, name: 'Переднее крыло левое верх', description: 'Front fender left top', category: 'fender', position: 'left', standardThickness: { min: 70, max: 140, typical: 110 } },
  { id: 16, name: 'Переднее крыло левое низ', description: 'Front fender left bottom', category: 'fender', position: 'left', standardThickness: { min: 70, max: 140, typical: 110 } },
  { id: 17, name: 'Переднее крыло правое верх', description: 'Front fender right top', category: 'fender', position: 'right', standardThickness: { min: 70, max: 140, typical: 110 } },
  { id: 18, name: 'Переднее крыло правое низ', description: 'Front fender right bottom', category: 'fender', position: 'right', standardThickness: { min: 70, max: 140, typical: 110 } },

  // Передние двери (6 точек)
  { id: 19, name: 'Передняя дверь левая верх', description: 'Front door left top', category: 'door', position: 'left', standardThickness: { min: 75, max: 145, typical: 115 } },
  { id: 20, name: 'Передняя дверь левая центр', description: 'Front door left center', category: 'door', position: 'left', standardThickness: { min: 75, max: 145, typical: 115 } },
  { id: 21, name: 'Передняя дверь левая низ', description: 'Front door left bottom', category: 'door', position: 'left', standardThickness: { min: 75, max: 145, typical: 115 } },
  { id: 22, name: 'Передняя дверь правая верх', description: 'Front door right top', category: 'door', position: 'right', standardThickness: { min: 75, max: 145, typical: 115 } },
  { id: 23, name: 'Передняя дверь правая центр', description: 'Front door right center', category: 'door', position: 'right', standardThickness: { min: 75, max: 145, typical: 115 } },
  { id: 24, name: 'Передняя дверь правая низ', description: 'Front door right bottom', category: 'door', position: 'right', standardThickness: { min: 75, max: 145, typical: 115 } },

  // Задние двери (6 точек)
  { id: 25, name: 'Задняя дверь левая верх', description: 'Rear door left top', category: 'door', position: 'left', standardThickness: { min: 75, max: 145, typical: 115 } },
  { id: 26, name: 'Задняя дверь левая центр', description: 'Rear door left center', category: 'door', position: 'left', standardThickness: { min: 75, max: 145, typical: 115 } },
  { id: 27, name: 'Задняя дверь левая низ', description: 'Rear door left bottom', category: 'door', position: 'left', standardThickness: { min: 75, max: 145, typical: 115 } },
  { id: 28, name: 'Задняя дверь правая верх', description: 'Rear door right top', category: 'door', position: 'right', standardThickness: { min: 75, max: 145, typical: 115 } },
  { id: 29, name: 'Задняя дверь правая центр', description: 'Rear door right center', category: 'door', position: 'right', standardThickness: { min: 75, max: 145, typical: 115 } },
  { id: 30, name: 'Задняя дверь правая низ', description: 'Rear door right bottom', category: 'door', position: 'right', standardThickness: { min: 75, max: 145, typical: 115 } },

  // Задние крылья (4 точки)
  { id: 31, name: 'Заднее крыло левое верх', description: 'Rear quarter left top', category: 'quarter_panel', position: 'left', standardThickness: { min: 70, max: 140, typical: 110 } },
  { id: 32, name: 'Заднее крыло левое низ', description: 'Rear quarter left bottom', category: 'quarter_panel', position: 'left', standardThickness: { min: 70, max: 140, typical: 110 } },
  { id: 33, name: 'Заднее крыло правое верх', description: 'Rear quarter right top', category: 'quarter_panel', position: 'right', standardThickness: { min: 70, max: 140, typical: 110 } },
  { id: 34, name: 'Заднее крыло правое низ', description: 'Rear quarter right bottom', category: 'quarter_panel', position: 'right', standardThickness: { min: 70, max: 140, typical: 110 } },

  // Багажник (6 точек)
  { id: 35, name: 'Багажник левый передний', description: 'Trunk left front', category: 'trunk', position: 'left', standardThickness: { min: 80, max: 150, typical: 120 } },
  { id: 36, name: 'Багажник центр передний', description: 'Trunk center front', category: 'trunk', position: 'center', standardThickness: { min: 80, max: 150, typical: 120 } },
  { id: 37, name: 'Багажник правый передний', description: 'Trunk right front', category: 'trunk', position: 'right', standardThickness: { min: 80, max: 150, typical: 120 } },
  { id: 38, name: 'Багажник левый задний', description: 'Trunk left rear', category: 'trunk', position: 'left', standardThickness: { min: 80, max: 150, typical: 120 } },
  { id: 39, name: 'Багажник центр задний', description: 'Trunk center rear', category: 'trunk', position: 'center', standardThickness: { min: 80, max: 150, typical: 120 } },
  { id: 40, name: 'Багажник правый задний', description: 'Trunk right rear', category: 'trunk', position: 'right', standardThickness: { min: 80, max: 150, typical: 120 } },
];

/**
 * Расширенные зоны для минивэна/SUV (60 точек)
 */
export const MINIVAN_ZONES: BodyZone[] = [
  ...SEDAN_ZONES,
  // Дополнительные зоны для минивэна
  { id: 41, name: 'Боковая панель левая передняя', description: 'Left side panel front', category: 'quarter_panel', position: 'left', standardThickness: { min: 70, max: 140, typical: 110 } },
  { id: 42, name: 'Боковая панель левая центр', description: 'Left side panel center', category: 'quarter_panel', position: 'left', standardThickness: { min: 70, max: 140, typical: 110 } },
  { id: 43, name: 'Боковая панель левая задняя', description: 'Left side panel rear', category: 'quarter_panel', position: 'left', standardThickness: { min: 70, max: 140, typical: 110 } },
  { id: 44, name: 'Боковая панель правая передняя', description: 'Right side panel front', category: 'quarter_panel', position: 'right', standardThickness: { min: 70, max: 140, typical: 110 } },
  { id: 45, name: 'Боковая панель правая центр', description: 'Right side panel center', category: 'quarter_panel', position: 'right', standardThickness: { min: 70, max: 140, typical: 110 } },
  { id: 46, name: 'Боковая панель правая задняя', description: 'Right side panel rear', category: 'quarter_panel', position: 'right', standardThickness: { min: 70, max: 140, typical: 110 } },
  { id: 47, name: 'Крыша центр левая', description: 'Roof center left', category: 'roof', position: 'left', standardThickness: { min: 90, max: 160, typical: 130 } },
  { id: 48, name: 'Крыша центр правая', description: 'Roof center right', category: 'roof', position: 'right', standardThickness: { min: 90, max: 160, typical: 130 } },
  { id: 49, name: 'Задний бампер левый', description: 'Rear bumper left', category: 'bumper', position: 'left', standardThickness: { min: 100, max: 200, typical: 150 } },
  { id: 50, name: 'Задний бампер центр', description: 'Rear bumper center', category: 'bumper', position: 'center', standardThickness: { min: 100, max: 200, typical: 150 } },
  { id: 51, name: 'Задний бампер правый', description: 'Rear bumper right', category: 'bumper', position: 'right', standardThickness: { min: 100, max: 200, typical: 150 } },
  { id: 52, name: 'Передний бампер левый', description: 'Front bumper left', category: 'bumper', position: 'left', standardThickness: { min: 100, max: 200, typical: 150 } },
  { id: 53, name: 'Передний бампер центр', description: 'Front bumper center', category: 'bumper', position: 'center', standardThickness: { min: 100, max: 200, typical: 150 } },
  { id: 54, name: 'Передний бампер правый', description: 'Front bumper right', category: 'bumper', position: 'right', standardThickness: { min: 100, max: 200, typical: 150 } },
  { id: 55, name: 'Стойка A левая', description: 'A-pillar left', category: 'door', position: 'left', standardThickness: { min: 75, max: 145, typical: 115 } },
  { id: 56, name: 'Стойка A правая', description: 'A-pillar right', category: 'door', position: 'right', standardThickness: { min: 75, max: 145, typical: 115 } },
  { id: 57, name: 'Стойка B левая', description: 'B-pillar left', category: 'door', position: 'left', standardThickness: { min: 75, max: 145, typical: 115 } },
  { id: 58, name: 'Стойка B правая', description: 'B-pillar right', category: 'door', position: 'right', standardThickness: { min: 75, max: 145, typical: 115 } },
  { id: 59, name: 'Стойка C левая', description: 'C-pillar left', category: 'door', position: 'left', standardThickness: { min: 75, max: 145, typical: 115 } },
  { id: 60, name: 'Стойка C правая', description: 'C-pillar right', category: 'door', position: 'right', standardThickness: { min: 75, max: 145, typical: 115 } },
];

/**
 * Класс для работы с базой зон
 */
export class ZoneDatabase {
  private zones: BodyZone[];

  constructor(vehicleType: 'sedan' | 'minivan' = 'sedan') {
    this.zones = vehicleType === 'sedan' ? SEDAN_ZONES : MINIVAN_ZONES;
  }

  /**
   * Получить зону по ID
   */
  getZone(id: number): BodyZone | null {
    return this.zones.find((zone) => zone.id === id) || null;
  }

  /**
   * Получить все зоны
   */
  getAllZones(): BodyZone[] {
    return this.zones;
  }

  /**
   * Получить зоны по категории
   */
  getZonesByCategory(category: BodyZone['category']): BodyZone[] {
    return this.zones.filter((zone) => zone.category === category);
  }

  /**
   * Получить зоны по позиции
   */
  getZonesByPosition(position: BodyZone['position']): BodyZone[] {
    return this.zones.filter((zone) => zone.position === position);
  }

  /**
   * Проверить, является ли толщина нормальной для зоны
   */
  isThicknessNormal(zoneId: number, thickness: number): boolean {
    const zone = this.getZone(zoneId);
    if (!zone) return false;

    return (
      thickness >= zone.standardThickness.min && thickness <= zone.standardThickness.max
    );
  }

  /**
   * Получить отклонение от типичной толщины
   */
  getDeviation(zoneId: number, thickness: number): number {
    const zone = this.getZone(zoneId);
    if (!zone) return 0;

    return thickness - zone.standardThickness.typical;
  }
}

// Экспорт экземпляров по умолчанию
export const sedanZones = new ZoneDatabase('sedan');
export const minivanZones = new ZoneDatabase('minivan');
