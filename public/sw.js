// Service Worker for offline support and background sync
const CACHE_NAME = 'kiosk-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing Service Worker...');
  
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching static assets');
      return cache.addAll(STATIC_ASSETS);
    })
  );

  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating Service Worker...');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );

  return self.clients.claim();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Skip cross-origin requests
  if (!request.url.startsWith(self.location.origin)) {
    return;
  }

  // Cache-first strategy for static assets
  if (request.url.includes('/assets/')) {
    event.respondWith(
      caches.match(request).then((response) => {
        return response || fetch(request).then((networkResponse) => {
          return caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, networkResponse.clone());
            return networkResponse;
          });
        });
      }).catch(() => {
        return new Response('Offline - asset not available', { status: 503 });
      })
    );
    return;
  }

  // Network-first strategy for API requests
  if (request.url.includes('/api/') || request.url.includes('supabase.co')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Don't cache failed responses
          if (!response || response.status !== 200) {
            return response;
          }

          // Clone the response
          const responseToCache = response.clone();

          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });

          return response;
        })
        .catch(() => {
          // Fallback to cache on network failure
          return caches.match(request).then((response) => {
            return response || new Response('Offline - no cached data available', { 
              status: 503,
              headers: { 'Content-Type': 'application/json' }
            });
          });
        })
    );
    return;
  }

  // Default: cache-first for everything else
  event.respondWith(
    caches.match(request).then((response) => {
      return response || fetch(request);
    })
  );
});

// Background Sync event - sync offline data when connection restored
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync event:', event.tag);

  if (event.tag === 'sync-offline-data') {
    event.waitUntil(
      syncOfflineData()
        .then(() => {
          console.log('[SW] Background sync completed successfully');
          return self.registration.showNotification('Данные синхронизированы', {
            body: 'Все офлайн данные успешно отправлены на сервер',
            icon: '/favicon.ico',
            badge: '/favicon.ico',
          });
        })
        .catch((error) => {
          console.error('[SW] Background sync failed:', error);
        })
    );
  }
});

// Sync offline data function
async function syncOfflineData() {
  try {
    // Open IndexedDB to get pending data
    const db = await openIndexedDB();
    const pendingSessions = await getPendingSessions(db);
    
    console.log(`[SW] Syncing ${pendingSessions.length} pending sessions`);

    for (const session of pendingSessions) {
      try {
        const response = await fetch('/api/offline/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: session.id }),
        });

        if (response.ok) {
          await markSessionAsSynced(db, session.id);
        }
      } catch (error) {
        console.error(`[SW] Failed to sync session ${session.id}:`, error);
      }
    }

    return true;
  } catch (error) {
    console.error('[SW] Sync error:', error);
    throw error;
  }
}

// IndexedDB helpers
function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('KioskOfflineDB', 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getPendingSessions(db) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['sessions'], 'readonly');
    const store = transaction.objectStore('sessions');
    const request = store.getAll();

    request.onsuccess = () => {
      const sessions = request.result.filter(s => s.syncStatus === 'pending' || s.syncStatus === 'failed');
      resolve(sessions);
    };
    request.onerror = () => reject(request.error);
  });
}

function markSessionAsSynced(db, sessionId) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['sessions'], 'readwrite');
    const store = transaction.objectStore('sessions');
    const request = store.get(sessionId);

    request.onsuccess = () => {
      const session = request.result;
      if (session) {
        session.syncStatus = 'synced';
        session.syncedAt = new Date();
        store.put(session);
      }
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

// Message event - handle messages from main thread
self.addEventListener('message', (event) => {
  console.log('[SW] Message received:', event.data);

  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data.type === 'SYNC_NOW') {
    syncOfflineData()
      .then(() => {
        event.ports[0].postMessage({ success: true });
      })
      .catch((error) => {
        event.ports[0].postMessage({ success: false, error: error.message });
      });
  }
});

console.log('[SW] Service Worker loaded');
