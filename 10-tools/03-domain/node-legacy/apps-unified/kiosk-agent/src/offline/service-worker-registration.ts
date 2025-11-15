/**
 * Service Worker Registration
 * Registers service worker for offline support and background sync
 */

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) {
    console.warn('[SW Registration] Service Workers not supported');
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });

    console.log('[SW Registration] Service Worker registered:', registration);

    // Check for updates
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) return;

      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          console.log('[SW Registration] New version available');
          
          // Notify user about update
          if (confirm('Доступна новая версия приложения. Обновить?')) {
            newWorker.postMessage({ type: 'SKIP_WAITING' });
            window.location.reload();
          }
        }
      });
    });

    // Register background sync if supported
    if ('sync' in registration) {
      try {
        await registration.sync.register('sync-offline-data');
        console.log('[SW Registration] Background sync registered');
      } catch (error) {
        console.error('[SW Registration] Background sync registration failed:', error);
      }
    }

    // Listen for controller change (service worker activated)
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      console.log('[SW Registration] New service worker activated');
    });

    return registration;
  } catch (error) {
    console.error('[SW Registration] Service Worker registration failed:', error);
    return null;
  }
}

/**
 * Unregister service worker (for cleanup)
 */
export async function unregisterServiceWorker(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) {
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration) {
      const success = await registration.unregister();
      console.log('[SW Registration] Service Worker unregistered:', success);
      return success;
    }
    return false;
  } catch (error) {
    console.error('[SW Registration] Failed to unregister service worker:', error);
    return false;
  }
}

/**
 * Trigger background sync manually
 */
export async function triggerBackgroundSync(): Promise<void> {
  const registration = await navigator.serviceWorker.ready;

  if ('sync' in registration) {
    try {
      await registration.sync.register('sync-offline-data');
      console.log('[SW Registration] Background sync triggered');
    } catch (error) {
      console.error('[SW Registration] Failed to trigger background sync:', error);
      
      // Fallback: sync via message
      if (navigator.serviceWorker.controller) {
        const messageChannel = new MessageChannel();
        
        return new Promise((resolve, reject) => {
          messageChannel.port1.onmessage = (event) => {
            if (event.data.success) {
              resolve();
            } else {
              reject(new Error(event.data.error));
            }
          };

          navigator.serviceWorker.controller!.postMessage(
            { type: 'SYNC_NOW' },
            [messageChannel.port2]
          );
        });
      }
    }
  } else {
    console.warn('[SW Registration] Background Sync API not supported');
  }
}

/**
 * Check if service worker is active
 */
export function isServiceWorkerActive(): boolean {
  return navigator.serviceWorker?.controller !== null;
}

/**
 * Get service worker state
 */
export async function getServiceWorkerState(): Promise<{
  supported: boolean;
  registered: boolean;
  active: boolean;
  backgroundSyncSupported: boolean;
}> {
  const supported = 'serviceWorker' in navigator;
  
  if (!supported) {
    return {
      supported: false,
      registered: false,
      active: false,
      backgroundSyncSupported: false,
    };
  }

  const registration = await navigator.serviceWorker.getRegistration();
  const registered = !!registration;
  const active = isServiceWorkerActive();
  const backgroundSyncSupported = registration ? 'sync' in registration : false;

  return {
    supported,
    registered,
    active,
    backgroundSyncSupported,
  };
}
