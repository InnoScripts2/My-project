class ThicknessManagerImpl {
    constructor() {
        this.snapshot = { state: 'disconnected' };
        this.session = { active: false, points: [], measuredCount: 0, pendingCount: 0, skippedCount: 0 };
    }
    getSnapshot() {
        return { ...this.snapshot };
    }
    getSessionSnapshot() {
        return { ...this.session, points: this.session.points.map(p => ({ ...p })) };
    }
    async open(options) {
        // No actual BLE connection here; just store config and mark connected if provided.
        try {
            this.snapshot = {
                state: 'connected',
                deviceName: options.ble?.deviceName,
                serviceUuid: options.ble?.serviceUuid,
                lastConnectedAt: new Date().toISOString(),
                lastError: undefined,
            };
            return { ok: true };
        }
        catch (e) {
            this.snapshot = { state: 'disconnected', lastError: e?.message || String(e) };
            return { ok: false, error: 'thk_open_failed' };
        }
    }
    async startSession(options) {
        if (this.snapshot.state !== 'connected') {
            const err = new Error('thickness_not_connected');
            err.code = 'thk_not_connected';
            throw err;
        }
        const basePoints = getPointsTemplate(options.vehicleType);
        this.session = {
            active: true,
            vehicleType: options.vehicleType,
            startedAt: new Date().toISOString(),
            points: basePoints.map(p => ({ ...p, status: 'pending' })),
            measuredCount: 0,
            pendingCount: basePoints.length,
            skippedCount: 0,
        };
        return this.getSessionSnapshot();
    }
    async stopSession() {
        this.session.active = false;
    }
    /** DEV helper: mark specific or next pending point as skipped (no fake value). */
    markPoint(id) {
        if (!this.session.active)
            return { ok: false, error: 'thk_no_active_session' };
        const target = id
            ? this.session.points.find(p => p.id === id)
            : this.session.points.find(p => p.status === 'pending');
        if (!target)
            return { ok: false, error: 'thk_no_pending_points' };
        target.status = 'skipped';
        target.ts = new Date().toISOString();
        this.recalcStats();
        return { ok: true, session: this.getSessionSnapshot() };
    }
    recalcStats() {
        const measured = this.session.points.filter(p => p.status === 'measured').length;
        const skipped = this.session.points.filter(p => p.status === 'skipped').length;
        const pending = this.session.points.length - measured - skipped;
        this.session.measuredCount = measured;
        this.session.skippedCount = skipped;
        this.session.pendingCount = pending;
    }
}
export function getPointsTemplate(type) {
    const mk = (id, label) => ({ id, label });
    // 40–60 точек: упрощённые шаблоны; можно расширить по мере необходимости
    const sedan = [
        mk('hood_l', 'Капот лев.'), mk('hood_c', 'Капот центр'), mk('hood_r', 'Капот прав.'),
        mk('roof_f', 'Крыша перед'), mk('roof_c', 'Крыша центр'), mk('roof_r', 'Крыша зад'),
        mk('door_fl', 'Дверь пер. лев.'), mk('door_fr', 'Дверь пер. прав.'),
        mk('door_rl', 'Дверь зад. лев.'), mk('door_rr', 'Дверь зад. прав.'),
        mk('fender_fl', 'Крыло пер. лев.'), mk('fender_fr', 'Крыло пер. прав.'),
        mk('quarter_l', 'Крыло зад. лев.'), mk('quarter_r', 'Крыло зад. прав.'),
        mk('trunk_l', 'Крышка багажн. лев.'), mk('trunk_c', 'Крышка багажн. центр'), mk('trunk_r', 'Крышка багажн. прав.'),
        mk('pillar_a_l', 'Стойка A лев.'), mk('pillar_a_r', 'Стойка A прав.'),
        mk('pillar_b_l', 'Стойка B лев.'), mk('pillar_b_r', 'Стойка B прав.'),
        mk('sill_l', 'Порог лев.'), mk('sill_r', 'Порог прав.'),
        mk('roof_edge_l', 'Кромка крыши лев.'), mk('roof_edge_r', 'Кромка крыши прав.'),
        mk('door_edge_fl', 'Кромка двери пер. лев.'), mk('door_edge_fr', 'Кромка двери пер. прав.'),
        mk('door_edge_rl', 'Кромка двери зад. лев.'), mk('door_edge_rr', 'Кромка двери зад. прав.'),
    ];
    const hatchback = [
        ...sedan,
        mk('hatch_l', 'Крышка багажн. лев.'), mk('hatch_c', 'Крышка багажн. центр'), mk('hatch_r', 'Крышка багажн. прав.'),
    ];
    const minivan = [
        ...sedan,
        mk('sliding_l', 'Сдвижная дверь лев.'), mk('sliding_r', 'Сдвижная дверь прав.'),
        mk('roof_ext1', 'Крыша доп. зона 1'), mk('roof_ext2', 'Крыша доп. зона 2'),
    ];
    if (type === 'hatchback')
        return hatchback;
    if (type === 'minivan')
        return minivan;
    return sedan;
}
export const thicknessManager = new ThicknessManagerImpl();
