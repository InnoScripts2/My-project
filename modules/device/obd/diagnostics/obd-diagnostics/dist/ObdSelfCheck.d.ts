import type { KingbolenEdiagDriver, ObdDtc, ObdLiveData, ObdStatus } from './KingbolenEdiagDriver.js';
export type EdiagLike = Pick<KingbolenEdiagDriver, 'readStatus' | 'readLiveData' | 'readDTC' | 'getMetrics'>;
export interface ObdSelfCheckOptions {
    /** Number of iterations to run. Defaults to 3. */
    attempts?: number;
    /** Delay between iterations in milliseconds. Defaults to 500ms. */
    delayMs?: number;
    /** Callback invoked before every attempt. */
    onAttemptStart?: (attempt: number) => void | Promise<void>;
    /** Callback invoked after every attempt with the step payload. */
    onAttemptFinish?: (step: ObdSelfCheckStep) => void | Promise<void>;
}
export interface ObdSelfCheckStep {
    attempt: number;
    startedAt: string;
    durationMs: number;
    dtc?: ObdDtc[];
    status?: ObdStatus;
    liveData?: ObdLiveData;
    errors: string[];
    protocolUsed?: string;
}
export interface ObdSelfCheckReport {
    attemptsPlanned: number;
    attemptsPerformed: number;
    passes: number;
    fails: number;
    consistent: boolean;
    summary: string;
    steps: ObdSelfCheckStep[];
    /** Optional aggregated metrics like max/min RPM for quick glance. */
    metrics: {
        rpm?: {
            min: number;
            max: number;
        };
        coolantTempC?: {
            min: number;
            max: number;
        };
        vehicleSpeedKmh?: {
            min: number;
            max: number;
        };
        protocolUsed?: string;
    };
}
export declare function runObdSelfCheck(driver: EdiagLike, options?: ObdSelfCheckOptions): Promise<ObdSelfCheckReport>;
export declare function selfCheckPassed(report: ObdSelfCheckReport): boolean;
