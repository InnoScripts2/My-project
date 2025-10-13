/**
 * Набор базовых AT-команд ELM327, используемых драйвером.
 * Список собран на основе официальной документации ELM Electronics.
 */
export const ElmAt = {
  reset: 'ATZ',
  warmStart: 'ATWS',
  setProtocol: (code: string) => `ATSP${code}`,
  setProtocolAuto: 'ATSPA0',
  echoOff: 'ATE0',
  lineFeedsOff: 'ATL0',
  spacesOff: 'ATS0',
  headersOff: 'ATH0',
  adaptiveTiming: (mode: 0 | 1 | 2) => `ATAT${mode}`,
  setTimeout: (hex: string) => `ATST${hex}`,
  setTxHeader: (hex: string) => `ATSH${hex}`,
  setCanFilter: (hex: string) => `ATCRA${hex}`,
  clearCanFilter: 'ATCRA'
} as const;

type ElmAtValue = (typeof ElmAt)[keyof typeof ElmAt];
export type ElmAtCommand = ElmAtValue extends (...args: any[]) => infer R ? R : ElmAtValue;
