export interface ObdPidDefinition {
  /** OBD-II service/mode (e.g. 0x01). */
  mode: string;
  /** Hexadecimal PID within the mode (e.g. 0x0C). */
  pid: string;
  /** Человеко-читаемое описание из спецификаций SAE/ISO. */
  label: string;
  /** Минимальное и максимальное значение (если задокументировано). */
  min?: number;
  max?: number;
  /** Единица измерения (SI). */
  unit?: string;
  /** Ссылочный идентификатор формулы преобразования. */
  conversion?: string;
  /** Формула расчёта, приведённая к нотации A,B,C,... */
  formula?: string;
  /** Интервал опроса в миллисекундах (рекомендация). */
  pollIntervalMs?: number;
  /** Примечания и ссылки на источники. */
  notes?: string;
}
