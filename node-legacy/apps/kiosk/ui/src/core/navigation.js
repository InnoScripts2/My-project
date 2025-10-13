let currentScreen = 'screen-attract';
const screenHistory = [];
const screenChangeListeners = [];

export function showScreen(screenId) {
  const screens = document.querySelectorAll('.screen');
  screens.forEach(screen => {
    screen.classList.remove('active');
  });

  const targetScreen = document.getElementById(screenId);
  if (targetScreen) {
    targetScreen.classList.add('active');
    currentScreen = screenId;
    
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem('currentScreen', screenId);
    }
    
    screenChangeListeners.forEach(listener => {
      try {
        listener(screenId);
      } catch (e) {
        console.error('[navigation] Listener error:', e);
      }
    });
  } else {
    console.warn('[navigation] Screen not found:', screenId);
  }
}

export function hideScreen(screenId) {
  const screen = document.getElementById(screenId);
  if (screen) {
    screen.classList.remove('active');
  }
}

export function getCurrentScreen() {
  return currentScreen;
}

export function onScreenChange(listener) {
  if (typeof listener === 'function') {
    screenChangeListeners.push(listener);
  }
}

export function initNavigation() {
  const backButtons = document.querySelectorAll('[data-back]');
  
  backButtons.forEach(button => {
    button.addEventListener('click', () => {
      handleBackNavigation();
    });
  });

  console.log('[navigation] Navigation initialized');
}

export function handleBackNavigation() {
  const current = getCurrentScreen();
  
  const flowRoots = ['screen-thk-intro', 'screen-obd-intro'];
  if (flowRoots.includes(current)) {
    showScreen('screen-services');
    return;
  }
  
  if (current.startsWith('screen-thk')) {
    showScreen('screen-thk-intro');
    return;
  }
  
  if (current.startsWith('screen-obd')) {
    showScreen('screen-obd-intro');
    return;
  }
  
  showScreen('screen-services');
}
