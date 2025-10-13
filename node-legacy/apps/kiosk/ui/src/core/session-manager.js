import { config } from './config.js';
import { showScreen } from './navigation.js';

const sessionState = {
  contact: {
    thickness: null,
    diagnostics: null,
  },
  session: {
    thicknessId: null,
    obdId: null,
  },
  reportSent: {
    thickness: false,
    diagnostics: false,
  },
  selectedService: null,
  thicknessType: null,
  obdMode: 'general',
  obdMake: null,
};

let idleTimer = null;

export function getSessionState() {
  return sessionState;
}

export function setSessionValue(key, value) {
  const keys = key.split('.');
  let target = sessionState;
  
  for (let i = 0; i < keys.length - 1; i++) {
    if (!target[keys[i]]) {
      target[keys[i]] = {};
    }
    target = target[keys[i]];
  }
  
  target[keys[keys.length - 1]] = value;
  
  if (typeof sessionStorage !== 'undefined') {
    try {
      sessionStorage.setItem('sessionState', JSON.stringify(sessionState));
    } catch (e) {}
  }
}

export function clearSessionState() {
  sessionState.contact.thickness = null;
  sessionState.contact.diagnostics = null;
  sessionState.session.thicknessId = null;
  sessionState.session.obdId = null;
  sessionState.reportSent.thickness = false;
  sessionState.reportSent.diagnostics = false;
  sessionState.selectedService = null;
  sessionState.thicknessType = null;
  sessionState.obdMode = 'general';
  sessionState.obdMake = null;
  
  if (typeof sessionStorage !== 'undefined') {
    try {
      sessionStorage.removeItem('sessionState');
    } catch (e) {}
  }
}

export function resetIdleTimer() {
  if (idleTimer) {
    clearTimeout(idleTimer);
  }
  
  idleTimer = setTimeout(() => {
    console.log('[session] Idle timeout - returning to attract screen');
    clearSessionState();
    showScreen('screen-attract');
  }, config.sessionTimeout);
}

export function initSessionManager() {
  if (typeof sessionStorage !== 'undefined') {
    try {
      const saved = sessionStorage.getItem('sessionState');
      if (saved) {
        const parsed = JSON.parse(saved);
        Object.assign(sessionState, parsed);
      }
    } catch (e) {}
  }
  
  ['click', 'keydown', 'pointerdown', 'touchstart'].forEach(eventName => {
    document.addEventListener(eventName, resetIdleTimer, { passive: true });
  });
  
  resetIdleTimer();
  
  console.log('[session] Session manager initialized');
}

export function generateSessionId(prefix) {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 6);
  return `${prefix}-${timestamp}-${random}`;
}
