import { config } from './config.js';

export function isDevMode() {
  return config.devMode || import.meta.env.DEV;
}

export function enableDevMode() {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('devMode', 'true');
    config.devMode = true;
    updateDevUI();
    showDevNotification('Dev mode enabled');
  }
}

export function disableDevMode() {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('devMode');
    config.devMode = false;
    updateDevUI();
    showDevNotification('Dev mode disabled');
  }
}

export function toggleDevMode() {
  if (isDevMode()) {
    disableDevMode();
  } else {
    enableDevMode();
  }
}

function updateDevUI() {
  const devElements = document.querySelectorAll('[data-dev-only]');
  const shouldShow = isDevMode();
  
  devElements.forEach(el => {
    el.style.display = shouldShow ? '' : 'none';
  });
  
  let indicator = document.getElementById('dev-mode-indicator');
  if (shouldShow) {
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'dev-mode-indicator';
      indicator.className = 'dev-mode-indicator';
      indicator.textContent = 'DEV MODE';
      indicator.setAttribute('aria-live', 'polite');
      document.body.appendChild(indicator);
    }
  } else {
    if (indicator) {
      indicator.remove();
    }
  }
}

function showDevNotification(message) {
  const notification = document.createElement('div');
  notification.className = 'dev-notification';
  notification.textContent = message;
  notification.setAttribute('role', 'status');
  notification.setAttribute('aria-live', 'polite');
  
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.classList.add('dev-notification--show');
  }, 10);
  
  setTimeout(() => {
    notification.classList.remove('dev-notification--show');
    setTimeout(() => {
      notification.remove();
    }, 300);
  }, 3000);
}

let touchCount = 0;
let touchTimer = null;
const TOUCH_THRESHOLD = 3;
const TOUCH_DURATION = 5000;

export function initDevMode() {
  updateDevUI();
  
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'D') {
      e.preventDefault();
      toggleDevMode();
    }
  });
  
  document.addEventListener('touchstart', (e) => {
    if (e.touches.length >= TOUCH_THRESHOLD) {
      if (!touchTimer) {
        touchCount = 0;
        touchTimer = setTimeout(() => {
          touchTimer = null;
          touchCount = 0;
        }, TOUCH_DURATION);
      }
      
      touchCount++;
      
      if (touchCount >= 3) {
        enableDevMode();
        touchCount = 0;
        if (touchTimer) {
          clearTimeout(touchTimer);
          touchTimer = null;
        }
      }
    }
  });
  
  console.log('[dev-mode] Dev mode initialized');
}
