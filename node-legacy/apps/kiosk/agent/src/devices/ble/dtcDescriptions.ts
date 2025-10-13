export type DtcSeverity = 'critical' | 'warning' | 'info';
export type DtcPrefix = 'P' | 'B' | 'C' | 'U';
export interface DtcInfo { code: string; description: string; severity: DtcSeverity; prefix: DtcPrefix; category?: string; }
const DTC_MAP: Record<string,{description:string;category:string}> = {
  P0300:{description:'Случайные/множественные пропуски воспламенения',category:'Misfire'},
  P0420:{description:'Эффективность катализатора ниже порога (банк 1)',category:'Emissions'},
  U0100:{description:'Потеря связи с ECM/PCM',category:'Network'},
  U0101:{description:'Потеря связи с TCM',category:'Network'},
  U0121:{description:'Потеря связи с модулем управления ABS',category:'Network'}
};
export function normalizeDtcCode(code:string):string { let n=code.replace(/\s+/g,'').toUpperCase(); if(/^[PBCU]\d{3}$/.test(n)) n=n.charAt(0)+'0'+n.substring(1); return n; }
export function parseDtcPrefix(code:string):DtcPrefix { const p=normalizeDtcCode(code).charAt(0) as DtcPrefix; return (p==='P'||p==='B'||p==='C'||p==='U')?p:'P'; }
function getCategoryByPrefix(prefix:DtcPrefix):string { switch(prefix){case'P':return'Powertrain';case'B':return'Body';case'C':return'Chassis';case'U':return'Network';} }
export function severityFor(code:string):DtcSeverity { const n=normalizeDtcCode(code); if(/^P03\d\d$/.test(n)) return'critical'; if(n==='P0420') return'warning'; if(/U010[01]|U0121/.test(n)) return'critical'; return'info'; }
export function describeDtc(code:string):DtcInfo { const n=normalizeDtcCode(code); const prefix=parseDtcPrefix(n); const entry=DTC_MAP[n]; if(entry) return {code:n,description:entry.description,severity:severityFor(n),prefix,category:entry.category}; return {code:n,description:`Стандартный код OBD-II (${getCategoryByPrefix(prefix)})`,severity:'info',prefix,category:getCategoryByPrefix(prefix)}; }
