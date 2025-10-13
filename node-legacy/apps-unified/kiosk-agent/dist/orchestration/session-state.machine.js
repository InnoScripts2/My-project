/**
 * Session State Machine for OBD-II Diagnostics Workflow
 * Manages state transitions and validates allowed actions
 */
export var SessionState;
(function (SessionState) {
    SessionState["CREATED"] = "CREATED";
    SessionState["ADAPTER_ISSUED"] = "ADAPTER_ISSUED";
    SessionState["CONNECTION_FAILED"] = "CONNECTION_FAILED";
    SessionState["CONNECTED"] = "CONNECTED";
    SessionState["SCANNING"] = "SCANNING";
    SessionState["SCAN_FAILED"] = "SCAN_FAILED";
    SessionState["SCAN_COMPLETED"] = "SCAN_COMPLETED";
    SessionState["PAYMENT_PENDING"] = "PAYMENT_PENDING";
    SessionState["PAYMENT_FAILED"] = "PAYMENT_FAILED";
    SessionState["PAID"] = "PAID";
    SessionState["GENERATING_REPORT"] = "GENERATING_REPORT";
    SessionState["REPORT_FAILED"] = "REPORT_FAILED";
    SessionState["COMPLETED"] = "COMPLETED";
    SessionState["ADAPTER_RETURN_PENDING"] = "ADAPTER_RETURN_PENDING";
    SessionState["SESSION_CLOSED"] = "SESSION_CLOSED";
    SessionState["CANCELLED"] = "CANCELLED";
})(SessionState || (SessionState = {}));
export class SessionStateMachine {
    constructor(initialState = SessionState.CREATED) {
        this.transitionHistory = [];
        this.listeners = new Set();
        this.state = initialState;
        this.allowedTransitions = this.buildTransitionMap();
    }
    getCurrentState() {
        return this.state;
    }
    getTransitionHistory() {
        return [...this.transitionHistory];
    }
    transition(action, reason) {
        const targetState = this.allowedTransitions.get(this.state)?.get(action);
        if (!targetState) {
            throw new Error(`Invalid transition: ${action} from state ${this.state}` +
                (reason ? ` (reason: ${reason})` : ''));
        }
        const event = {
            from: this.state,
            to: targetState,
            action,
            timestamp: new Date().toISOString(),
        };
        this.state = targetState;
        this.transitionHistory.push(event);
        this.emitEvent(event);
        return this.state;
    }
    canTransitionTo(action) {
        return this.allowedTransitions.get(this.state)?.has(action) ?? false;
    }
    getAvailableActions() {
        const stateTransitions = this.allowedTransitions.get(this.state);
        return stateTransitions ? Array.from(stateTransitions.keys()) : [];
    }
    onTransition(listener) {
        this.listeners.add(listener);
    }
    removeListener(listener) {
        this.listeners.delete(listener);
    }
    emitEvent(event) {
        this.listeners.forEach(listener => {
            try {
                listener(event);
            }
            catch (error) {
                console.error('[SessionStateMachine] Listener error:', error);
            }
        });
    }
    buildTransitionMap() {
        const map = new Map();
        // CREATED -> ADAPTER_ISSUED
        map.set(SessionState.CREATED, new Map([
            ['issue_adapter', SessionState.ADAPTER_ISSUED],
            ['cancel', SessionState.CANCELLED],
        ]));
        // ADAPTER_ISSUED -> CONNECTED | CONNECTION_FAILED
        map.set(SessionState.ADAPTER_ISSUED, new Map([
            ['connect', SessionState.CONNECTED],
            ['cancel', SessionState.CANCELLED],
        ]));
        // CONNECTION_FAILED -> retry or cancel
        map.set(SessionState.CONNECTION_FAILED, new Map([
            ['retry_connection', SessionState.ADAPTER_ISSUED],
            ['cancel', SessionState.CANCELLED],
        ]));
        // CONNECTED -> SCANNING
        map.set(SessionState.CONNECTED, new Map([
            ['start_scan', SessionState.SCANNING],
            ['cancel', SessionState.CANCELLED],
        ]));
        // SCANNING -> SCAN_COMPLETED | SCAN_FAILED
        map.set(SessionState.SCANNING, new Map([
            ['complete_scan', SessionState.SCAN_COMPLETED],
            ['cancel', SessionState.CANCELLED],
        ]));
        // SCAN_FAILED -> retry or cancel
        map.set(SessionState.SCAN_FAILED, new Map([
            ['retry_scan', SessionState.CONNECTED],
            ['cancel', SessionState.CANCELLED],
        ]));
        // SCAN_COMPLETED -> PAYMENT_PENDING
        map.set(SessionState.SCAN_COMPLETED, new Map([
            ['request_payment', SessionState.PAYMENT_PENDING],
            ['cancel', SessionState.CANCELLED],
        ]));
        // PAYMENT_PENDING -> PAID | PAYMENT_FAILED
        map.set(SessionState.PAYMENT_PENDING, new Map([
            ['confirm_payment', SessionState.PAID],
            ['cancel', SessionState.CANCELLED],
        ]));
        // PAYMENT_FAILED -> retry or cancel
        map.set(SessionState.PAYMENT_FAILED, new Map([
            ['retry_payment', SessionState.PAYMENT_PENDING],
            ['cancel', SessionState.CANCELLED],
        ]));
        // PAID -> GENERATING_REPORT
        map.set(SessionState.PAID, new Map([
            ['generate_report', SessionState.GENERATING_REPORT],
        ]));
        // GENERATING_REPORT -> COMPLETED | REPORT_FAILED
        map.set(SessionState.GENERATING_REPORT, new Map([
            ['complete_report', SessionState.COMPLETED],
        ]));
        // REPORT_FAILED -> retry
        map.set(SessionState.REPORT_FAILED, new Map([
            ['retry_report', SessionState.GENERATING_REPORT],
        ]));
        // COMPLETED -> ADAPTER_RETURN_PENDING
        map.set(SessionState.COMPLETED, new Map([
            ['wait_adapter_return', SessionState.ADAPTER_RETURN_PENDING],
        ]));
        // ADAPTER_RETURN_PENDING -> SESSION_CLOSED
        map.set(SessionState.ADAPTER_RETURN_PENDING, new Map([
            ['close_session', SessionState.SESSION_CLOSED],
        ]));
        // Terminal states
        map.set(SessionState.SESSION_CLOSED, new Map());
        map.set(SessionState.CANCELLED, new Map());
        return map;
    }
}
