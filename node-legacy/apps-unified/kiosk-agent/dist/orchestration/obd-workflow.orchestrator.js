/**
 * OBD Workflow Orchestrator
 * Manages complete E2E diagnostic session lifecycle
 */
import { randomUUID } from 'crypto';
import { SessionStateMachine, SessionState } from './session-state.machine.js';
import { ErrorRecoveryHandler, ErrorType, ErrorCode, ErrorSeverity } from './error-recovery.handler.js';
export class ObdWorkflowOrchestrator {
    constructor(obdManager, locksController, sessionManager, paymentAdapter, reportGenerator) {
        this.obdManager = obdManager;
        this.locksController = locksController;
        this.sessionManager = sessionManager;
        this.paymentAdapter = paymentAdapter;
        this.reportGenerator = reportGenerator;
        this.sessions = new Map();
        this.activeSessionCount = 0;
    }
    /**
     * Start a new diagnostic session
     */
    async startDiagnosticSession(vehicleData) {
        const sessionId = randomUUID();
        const stateMachine = new SessionStateMachine(SessionState.CREATED);
        const session = {
            sessionId,
            vehicleData,
            state: SessionState.CREATED,
            stateMachine,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            connectionAttempts: 0,
            scanAttempts: 0,
            paymentAttempts: 0,
            reportAttempts: 0,
            errors: [],
        };
        this.sessions.set(sessionId, session);
        this.activeSessionCount++;
        try {
            // Issue adapter
            const lockResult = await this.locksController.openSlot('obd', {
                operationKey: `issue-${sessionId}`,
                autoCloseMs: 300000, // 5 min
                context: { sessionId, action: 'issue_adapter' },
            });
            if (!lockResult.ok) {
                throw new Error('Failed to issue adapter: ' + lockResult.error);
            }
            stateMachine.transition('issue_adapter');
            session.state = SessionState.ADAPTER_ISSUED;
            session.adapterIssuedAt = new Date().toISOString();
            session.updatedAt = new Date().toISOString();
            console.log(`[ObdWorkflow] Session ${sessionId} started, adapter issued`);
        }
        catch (error) {
            this.recordError(session, ErrorType.CONNECTION, ErrorCode.ADAPTER_NOT_FOUND, error);
            throw error;
        }
        return sessionId;
    }
    /**
     * Connect to OBD adapter
     */
    async connectAdapter(sessionId, options = {}) {
        const session = this.getSession(sessionId);
        const retryCount = options.retryCount ?? 3;
        const retryInterval = options.retryInterval ?? 5000;
        let lastError = null;
        for (let attempt = 1; attempt <= retryCount; attempt++) {
            session.connectionAttempts++;
            try {
                console.log(`[ObdWorkflow] Session ${sessionId} connection attempt ${attempt}/${retryCount}`);
                const driver = await this.obdManager.connect({
                    force: attempt > 1,
                    timeoutMs: options.timeoutMs ?? 15000,
                    deviceName: options.deviceName,
                });
                if (!driver) {
                    throw new Error('Failed to connect to adapter');
                }
                session.stateMachine.transition('connect');
                session.state = SessionState.CONNECTED;
                session.connectedAt = new Date().toISOString();
                session.updatedAt = new Date().toISOString();
                console.log(`[ObdWorkflow] Session ${sessionId} connected successfully`);
                return { success: true };
            }
            catch (error) {
                lastError = error;
                const errorContext = {
                    type: ErrorType.CONNECTION,
                    code: ErrorCode.CONNECTION_TIMEOUT,
                    message: lastError.message,
                    attemptNumber: attempt,
                    sessionId,
                    vehicleData: session.vehicleData,
                };
                const strategy = ErrorRecoveryHandler.handleConnectionError(errorContext, lastError);
                ErrorRecoveryHandler.logError(lastError, errorContext, ErrorSeverity.MEDIUM);
                this.recordError(session, ErrorType.CONNECTION, ErrorCode.CONNECTION_TIMEOUT, lastError);
                if (attempt < retryCount && strategy.retry) {
                    console.log(`[ObdWorkflow] Retrying connection in ${retryInterval}ms...`);
                    await this.sleep(retryInterval);
                }
            }
        }
        session.state = SessionState.CONNECTION_FAILED;
        session.updatedAt = new Date().toISOString();
        return {
            success: false,
            message: lastError?.message ?? 'Connection failed after retries',
        };
    }
    /**
     * Perform diagnostic scan
     */
    async performScan(sessionId, options = {}) {
        const session = this.getSession(sessionId);
        if (session.state !== SessionState.CONNECTED) {
            throw new Error(`Cannot scan: session not connected (state: ${session.state})`);
        }
        session.scanAttempts++;
        session.stateMachine.transition('start_scan');
        session.state = SessionState.SCANNING;
        session.updatedAt = new Date().toISOString();
        try {
            console.log(`[ObdWorkflow] Session ${sessionId} starting scan`);
            const obdSessionId = this.sessionManager.createSession({
                make: session.vehicleData.make,
                model: session.vehicleData.model,
            });
            // Simulate scan operations (in real implementation, this would call OBD manager)
            const scanData = await this.executeScan(obdSessionId, options);
            this.sessionManager.updateSession(obdSessionId, scanData);
            const completedSession = this.sessionManager.completeSession(obdSessionId);
            session.stateMachine.transition('complete_scan');
            session.state = SessionState.SCAN_COMPLETED;
            session.scanCompletedAt = new Date().toISOString();
            session.updatedAt = new Date().toISOString();
            console.log(`[ObdWorkflow] Session ${sessionId} scan completed`);
            return {
                success: true,
                data: completedSession,
            };
        }
        catch (error) {
            const err = error;
            this.recordError(session, ErrorType.SCAN, ErrorCode.SCAN_TIMEOUT, err);
            session.state = SessionState.SCAN_FAILED;
            session.updatedAt = new Date().toISOString();
            return {
                success: false,
                message: err.message,
            };
        }
    }
    /**
     * Process payment
     */
    async processPayment(sessionId) {
        const session = this.getSession(sessionId);
        if (session.state !== SessionState.SCAN_COMPLETED) {
            throw new Error(`Cannot process payment: scan not completed (state: ${session.state})`);
        }
        session.paymentAttempts++;
        session.stateMachine.transition('request_payment');
        session.state = SessionState.PAYMENT_PENDING;
        session.updatedAt = new Date().toISOString();
        try {
            console.log(`[ObdWorkflow] Session ${sessionId} creating payment intent`);
            const obdSessionId = this.findObdSessionId(sessionId);
            const paymentIntent = await this.paymentAdapter.createDiagnosticsPayment(obdSessionId);
            // Poll for payment status (simplified - in real implementation would use webhooks)
            const timeoutMs = 300000; // 5 minutes
            const startTime = Date.now();
            const pollInterval = 2000;
            while (Date.now() - startTime < timeoutMs) {
                const status = await this.paymentAdapter.checkPaymentStatus(paymentIntent.intentId);
                if (status.status === 'succeeded') {
                    session.stateMachine.transition('confirm_payment');
                    session.state = SessionState.PAID;
                    session.paidAt = new Date().toISOString();
                    session.updatedAt = new Date().toISOString();
                    console.log(`[ObdWorkflow] Session ${sessionId} payment confirmed`);
                    return {
                        success: true,
                        intentId: paymentIntent.intentId,
                    };
                }
                if (status.status === 'failed') {
                    throw new Error('Payment declined');
                }
                await this.sleep(pollInterval);
            }
            throw new Error('Payment timeout');
        }
        catch (error) {
            const err = error;
            this.recordError(session, ErrorType.PAYMENT, ErrorCode.PAYMENT_DECLINED, err);
            session.state = SessionState.PAYMENT_FAILED;
            session.updatedAt = new Date().toISOString();
            return {
                success: false,
                message: err.message,
            };
        }
    }
    /**
     * Generate and deliver report
     */
    async generateAndDeliverReport(sessionId, deliveryOptions) {
        const session = this.getSession(sessionId);
        if (session.state !== SessionState.PAID) {
            throw new Error(`Cannot generate report: payment not confirmed (state: ${session.state})`);
        }
        session.reportAttempts++;
        session.stateMachine.transition('generate_report');
        session.state = SessionState.GENERATING_REPORT;
        session.updatedAt = new Date().toISOString();
        let reportPath;
        const maxRetries = 3;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`[ObdWorkflow] Session ${sessionId} generating report (attempt ${attempt})`);
                const obdSessionId = this.findObdSessionId(sessionId);
                const obdSession = this.sessionManager.getSession(obdSessionId);
                if (!obdSession) {
                    throw new Error('OBD session not found');
                }
                const reportBuffer = await this.reportGenerator.generateReport(obdSession, { type: 'standard' });
                reportPath = await this.reportGenerator.saveReport(obdSessionId, reportBuffer);
                // Deliver report
                if (deliveryOptions.email || deliveryOptions.phone) {
                    // In real implementation, would send via email/SMS service
                    console.log(`[ObdWorkflow] Report would be delivered to ${deliveryOptions.email || deliveryOptions.phone}`);
                }
                session.stateMachine.transition('complete_report');
                session.state = SessionState.COMPLETED;
                session.completedAt = new Date().toISOString();
                session.updatedAt = new Date().toISOString();
                console.log(`[ObdWorkflow] Session ${sessionId} report generated and delivered`);
                return {
                    success: true,
                    reportPath,
                };
            }
            catch (error) {
                const err = error;
                this.recordError(session, ErrorType.REPORT, ErrorCode.PDF_GENERATION_FAILED, err);
                if (attempt < maxRetries) {
                    console.log(`[ObdWorkflow] Report generation failed, retrying...`);
                    await this.sleep(2000);
                }
            }
        }
        session.state = SessionState.REPORT_FAILED;
        session.updatedAt = new Date().toISOString();
        return {
            success: false,
            message: 'Failed to generate report after retries',
        };
    }
    /**
     * Complete session and wait for adapter return
     */
    async completeSession(sessionId) {
        const session = this.getSession(sessionId);
        if (session.state !== SessionState.COMPLETED) {
            throw new Error(`Cannot complete session: not in completed state (state: ${session.state})`);
        }
        try {
            console.log(`[ObdWorkflow] Session ${sessionId} waiting for adapter return`);
            session.stateMachine.transition('wait_adapter_return');
            session.state = SessionState.ADAPTER_RETURN_PENDING;
            session.updatedAt = new Date().toISOString();
            // Wait for adapter return (simplified - would use sensor/timer in real implementation)
            await this.sleep(5000);
            // Lock adapter
            const lockResult = await this.locksController.closeSlot('obd', {
                operationKey: `return-${sessionId}`,
                reason: 'adapter_returned',
            });
            if (!lockResult.ok) {
                console.warn(`[ObdWorkflow] Failed to lock adapter: ${lockResult.error}`);
            }
            session.stateMachine.transition('close_session');
            session.state = SessionState.SESSION_CLOSED;
            session.closedAt = new Date().toISOString();
            session.updatedAt = new Date().toISOString();
            this.activeSessionCount--;
            console.log(`[ObdWorkflow] Session ${sessionId} closed`);
            // Schedule cleanup after 24h
            setTimeout(() => {
                this.sessions.delete(sessionId);
                console.log(`[ObdWorkflow] Session ${sessionId} cleaned up`);
            }, 24 * 60 * 60 * 1000);
            return { success: true };
        }
        catch (error) {
            return {
                success: false,
                message: error.message,
            };
        }
    }
    /**
     * Cancel session
     */
    async cancelSession(sessionId, reason) {
        const session = this.getSession(sessionId);
        console.log(`[ObdWorkflow] Cancelling session ${sessionId}: ${reason}`);
        try {
            // Disconnect if connected
            if (session.state === SessionState.CONNECTED || session.state === SessionState.SCANNING) {
                // Disconnect adapter (would call obdManager.disconnect in real implementation)
            }
            // Refund if paid
            if (session.state === SessionState.PAID ||
                session.state === SessionState.GENERATING_REPORT ||
                session.state === SessionState.COMPLETED) {
                console.log(`[ObdWorkflow] Session ${sessionId} requires refund`);
                // Implement refund logic
            }
            session.stateMachine.transition('cancel');
            session.state = SessionState.CANCELLED;
            session.cancelledAt = new Date().toISOString();
            session.updatedAt = new Date().toISOString();
            this.activeSessionCount--;
            console.log(`[ObdWorkflow] Session ${sessionId} cancelled`);
        }
        catch (error) {
            console.error(`[ObdWorkflow] Error cancelling session ${sessionId}:`, error);
        }
    }
    /**
     * Get session state
     */
    getSessionState(sessionId) {
        return this.sessions.get(sessionId) ?? null;
    }
    /**
     * Get active session count
     */
    getActiveSessionCount() {
        return this.activeSessionCount;
    }
    getSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error(`Session ${sessionId} not found`);
        }
        return session;
    }
    recordError(session, type, code, error) {
        session.errors.push({
            timestamp: new Date().toISOString(),
            type,
            code,
            message: error.message,
        });
    }
    findObdSessionId(workflowSessionId) {
        // In real implementation, maintain mapping between workflow and OBD sessions
        // For now, return workflowSessionId
        return workflowSessionId;
    }
    async executeScan(obdSessionId, options) {
        // Simulate scan execution
        // In real implementation, would use DiagnosticSessionManager and other OBD components
        await this.sleep(3000);
        return {
            dtc: options.includeDTC !== false ? [] : undefined,
            pids: options.includePIDs !== false ? [] : undefined,
            vin: 'SIMULATED_VIN',
            vendor: options.includeVendor ? {} : undefined,
        };
    }
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
