export type PaymentStatus = 'created' | 'confirmed' | 'manual';
export interface PaymentIntentRecord {
    id: string;
    amount: number;
    currency: string;
    status: PaymentStatus;
    meta?: Record<string, unknown>;
    createdAt: string;
    confirmedAt?: string;
    environment: string;
}
export interface CreateIntentPayload {
    amount: number;
    currency: string;
    meta?: Record<string, unknown>;
}
export interface ManualConfirmPayload {
    id: string;
    meta?: Record<string, unknown>;
}
export declare class PaymentModule {
    private readonly intents;
    private readonly env;
    constructor(environment: string);
    createIntent(payload: CreateIntentPayload): {
        intent: PaymentIntentRecord;
        breakdown: {
            subtotal: number;
            currency: string;
        };
    };
    getStatus(id: string): PaymentStatus | 'not_found';
    getIntent(id: string): PaymentIntentRecord | undefined;
    confirmDev(id: string): PaymentIntentRecord | undefined;
    manualConfirm(payload: ManualConfirmPayload): PaymentIntentRecord | undefined;
    getMetricsSnapshot(): {
        total: number;
        confirmed: number;
        manual: number;
    };
    private buildIntentId;
}
//# sourceMappingURL=payment-module.d.ts.map