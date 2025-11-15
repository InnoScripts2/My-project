// Заглушка ThicknessManager: минимальные типы и функции
export type ThkVehicleType = 'sedan' | 'hatchback' | 'minivan';
interface ThicknessPointTemplate { code: string; label: string; }
const template: ThicknessPointTemplate[] = [
  { code: 'F01', label: 'Капот центр' },
  { code: 'F02', label: 'Крыло левое переднее' }
];
export function getPointsTemplate(_t?: ThkVehicleType) { return template; }
interface ThicknessSessionPoint { id: string; code: string; ts: string; valueMicrons?: number; status: 'pending' | 'marked' }
interface ThicknessSessionSnapshot { startedAt: string; vehicle: ThkVehicleType; points: ThicknessSessionPoint[]; state: 'idle' | 'active' }
class ThicknessManagerImpl {
  private session: ThicknessSessionSnapshot | null = null;
  getSnapshot(): ThicknessSessionSnapshot | null { return this.session; }
  getSessionSnapshot(): ThicknessSessionSnapshot | null { return this.session; }
  startSession(vehicleType: ThkVehicleType | { vehicleType: ThkVehicleType }) {
    const vt = typeof vehicleType === 'string' ? vehicleType : vehicleType.vehicleType;
    this.session = { startedAt: new Date().toISOString(), vehicle: vt, points: [], state: 'active' };
    return this.session;
  }
  markPoint(id: string) {
    if (!this.session) return { ok: false, error: 'no_session' };
    const code = id;
    const pt: ThicknessSessionPoint = { id, code, ts: new Date().toISOString(), status: 'marked' };
    this.session.points.push(pt);
    return { ok: true, point: pt, session: this.session };
  }
  open(opts: { vehicleType: ThkVehicleType }) {
    if (!opts?.vehicleType) return { ok: false, error: 'vehicle_type_required' };
    if (!this.session) this.startSession(opts.vehicleType);
    return { ok: true, snapshot: this.getSnapshot() };
  }
  getPoints(): ThicknessSessionPoint[] { return this.session?.points || []; }
  stopSession() { if (this.session) this.session.state = 'idle'; const s = this.session; this.session = null; return { stoppedAt: new Date().toISOString(), prev: s }; }
}
export const thicknessManager = new ThicknessManagerImpl();
