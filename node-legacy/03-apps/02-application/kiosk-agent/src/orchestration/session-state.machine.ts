/**
 * Session State Machine for OBD-II Diagnostics Workflow
 * Manages state transitions and validates allowed actions
 */

export enum SessionState {
  CREATED = 'CREATED',
  ADAPTER_ISSUED = 'ADAPTER_ISSUED',
  CONNECTION_FAILED = 'CONNECTION_FAILED',
  CONNECTED = 'CONNECTED',
  SCANNING = 'SCANNING',
  SCAN_FAILED = 'SCAN_FAILED',
  SCAN_COMPLETED = 'SCAN_COMPLETED',
  PAYMENT_PENDING = 'PAYMENT_PENDING',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  PAID = 'PAID',
  GENERATING_REPORT = 'GENERATING_REPORT',
  REPORT_FAILED = 'REPORT_FAILED',
  COMPLETED = 'COMPLETED',
  ADAPTER_RETURN_PENDING = 'ADAPTER_RETURN_PENDING',
  SESSION_CLOSED = 'SESSION_CLOSED',
  CANCELLED = 'CANCELLED',
}

export type SessionAction = 
  | 'issue_adapter'
  | 'connect'
  | 'retry_connection'
  | 'start_scan'
  | 'retry_scan'
  | 'complete_scan'
  | 'request_payment'
  | 'retry_payment'
  | 'confirm_payment'
  | 'generate_report'
  | 'retry_report'
  | 'complete_report'
  | 'wait_adapter_return'
  | 'close_session'
  | 'cancel';

interface StateTransitionEvent {
  from: SessionState;
  to: SessionState;
  action: SessionAction;
  timestamp: string;
}

export class SessionStateMachine {
  private state: SessionState;
  private readonly allowedTransitions: Map<SessionState, Map<SessionAction, SessionState>>;
  private readonly transitionHistory: StateTransitionEvent[] = [];
  private readonly listeners: Set<(event: StateTransitionEvent) => void> = new Set();

  constructor(initialState: SessionState = SessionState.CREATED) {
    this.state = initialState;
    this.allowedTransitions = this.buildTransitionMap();
  }

  getCurrentState(): SessionState {
    return this.state;
  }

  getTransitionHistory(): StateTransitionEvent[] {
    return [...this.transitionHistory];
  }

  transition(action: SessionAction, reason?: string): SessionState {
    const targetState = this.allowedTransitions.get(this.state)?.get(action);
    
    if (!targetState) {
      throw new Error(
        `Invalid transition: ${action} from state ${this.state}` +
        (reason ? ` (reason: ${reason})` : '')
      );
    }

    const event: StateTransitionEvent = {
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

  canTransitionTo(action: SessionAction): boolean {
    return this.allowedTransitions.get(this.state)?.has(action) ?? false;
  }

  getAvailableActions(): SessionAction[] {
    const stateTransitions = this.allowedTransitions.get(this.state);
    return stateTransitions ? Array.from(stateTransitions.keys()) : [];
  }

  onTransition(listener: (event: StateTransitionEvent) => void): void {
    this.listeners.add(listener);
  }

  removeListener(listener: (event: StateTransitionEvent) => void): void {
    this.listeners.delete(listener);
  }

  private emitEvent(event: StateTransitionEvent): void {
    this.listeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('[SessionStateMachine] Listener error:', error);
      }
    });
  }

  private buildTransitionMap(): Map<SessionState, Map<SessionAction, SessionState>> {
    const map = new Map<SessionState, Map<SessionAction, SessionState>>();

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
