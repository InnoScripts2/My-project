export interface ThicknessPointRecord { code: string; value?: number; valueMicrons?: number; capturedAt: string; sessionId: string; }
export interface PersistenceStore {
	createSession(type: 'thickness' | 'diagnostics', externalId?: string): Promise<string>;
	recordThicknessPoint(point: ThicknessPointRecord): Promise<void>;
	finishSession(id: string): Promise<void>;
}

