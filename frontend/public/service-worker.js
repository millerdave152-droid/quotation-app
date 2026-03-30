/* eslint-disable no-restricted-globals */

// Service Worker for Quotation Management System PWA
const CACHE_NAME = 'quote-app-v1';
const DATA_CACHE_NAME = 'quote-app-data-v1';

// Assets to cache on install
const FILES_TO_CACHE = [
  '/',
  '/index.html',
  '/static/css/main.chunk.css',
  '/static/js/main.chunk.js',
  '/static/js/bundle.js',
  '/manifest.json',
  '/logo192.png',
  '/logo512.png',
  '/favicon.ico'
];

// Install event - cache assets
self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] Install');

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[ServiceWorker] Caching app shell');
      return cache.addAll(FILES_TO_CACHE);
    })
  );

  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] Activate');

  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME && key !== DATA_CACHE_NAME) {
            console.log('[ServiceWorker] Removing old cache', key);
            return caches.delete(key);
          }
        })
      );
    })
  );

  self.clients.claim();
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  // Skip cross-origin requests
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  // API requests - network first, then cache
  if (event.request.url.includes('/api/')) {
    event.respondWith(
      caches.open(DATA_CACHE_NAME).then((cache) => {
        return fetch(event.request)
          .then((response) => {
            // If successful, update cache
            if (response.status === 200) {
              cache.put(event.request.url, response.clone());
            }
            return response;
          })
          .catch(() => {
            // Network failed, try cache
            return cache.match(event.request);
          });
      })
    );
    return;
  }

  // App shell - cache first, then network
  event.respondWith(
    caches.match(event.request).then((response) => {
      if (response) {
        return response;
      }

      return fetch(event.request).then((response) => {
        // Don't cache if not successful
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }

        // Clone the response
        const responseToCache = response.clone();

        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return response;
      });
    })
  );
});

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  console.log('[ServiceWorker] Background sync', event.tag);

  if (event.tag === 'sync-quotes') {
    event.waitUntil(syncQuotes());
  }
});

// Push notification handler
self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json();
  const title = data.title || 'TeleTime Update';
  const options = {
    body: data.body || 'You have a new update',
    icon: data.icon || '/logo192.png',
    badge: data.badge || '/logo192.png',
    vibrate: [200, 100, 200],
    tag: data.tag || 'teletime-update',
    data: data.data || { url: '/' },
    requireInteraction: data.requireInteraction || false,
    actions: [
      { action: 'view', title: 'View' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Notification click handler — opens data.url or /leads
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const url = event.notification.data?.url || '/leads';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(url) && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(url);
        }
      })
  );
});

// Helper function to sync quotes when back online
async function syncQuotes() {
  try {
    // 1. Process legacy pending actions from QuoteAppDB
    const db = await openDatabase();
    const pendingActions = await getPendingActions(db);

    for (const action of pendingActions) {
      try {
        await fetch(action.url, {
          method: action.method,
          headers: action.headers,
          body: JSON.stringify(action.body)
        });
        await removePendingAction(db, action.id);
      } catch (error) {
        console.error('Failed to sync action:', error);
      }
    }

    // 2. Process pending_sync drafts from Dexie's QuoteAppDrafts DB
    try {
      const draftsDb = await openDraftsDatabase();
      const pendingDrafts = await getPendingSyncDrafts(draftsDb);

      for (const draft of pendingDrafts) {
        try {
          const quoteData = draft.snapshot?.quoteData;
          if (!quoteData) continue;

          // Read auth token from localStorage (available in SW via clients)
          const tokenKey = 'auth_token';
          let token = null;
          try {
            const allClients = await self.clients.matchAll();
            if (allClients.length > 0) {
              // Use postMessage to request token, but simpler: store it in cache
              // For now, try reading from the draft's stored headers
            }
          } catch (_) {}

          const res = await fetch('/api/quotes', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Idempotency-Key': draft.id,
            },
            body: JSON.stringify({
              ...quoteData,
              client_draft_id: draft.id,
            }),
          });

          if (res.ok || res.status === 409) {
            await deleteDraftFromDexie(draftsDb, draft.id);
          }
        } catch (error) {
          console.error('Failed to sync draft:', error);
        }
      }
    } catch (error) {
      // QuoteAppDrafts DB may not exist yet — that's fine
      console.log('[ServiceWorker] No Dexie drafts to sync:', error.message);
    }
  } catch (error) {
    console.error('Background sync failed:', error);
  }
}

// Open Dexie's QuoteAppDrafts database using raw IndexedDB
function openDraftsDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('QuoteAppDrafts');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function getPendingSyncDrafts(db) {
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(['quote_drafts'], 'readonly');
      const store = tx.objectStore('quote_drafts');
      const index = store.index('status');
      const request = index.getAll('pending_sync');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    } catch (error) {
      reject(error);
    }
  });
}

function deleteDraftFromDexie(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['quote_drafts'], 'readwrite');
    const store = tx.objectStore('quote_drafts');
    const request = store.delete(id);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

// IndexedDB helpers
function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('QuoteAppDB', 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('pendingActions')) {
        db.createObjectStore('pendingActions', { keyPath: 'id', autoIncrement: true });
      }
    };
  });
}

function getPendingActions(db) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['pendingActions'], 'readonly');
    const store = transaction.objectStore('pendingActions');
    const request = store.getAll();

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function removePendingAction(db, id) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['pendingActions'], 'readwrite');
    const store = transaction.objectStore('pendingActions');
    const request = store.delete(id);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

// Message handler for communication with main app
self.addEventListener('message', (event) => {
  console.log('[ServiceWorker] Message received:', event.data);

  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'CACHE_URLS') {
    event.waitUntil(
      caches.open(CACHE_NAME).then((cache) => {
        return cache.addAll(event.data.urls);
      })
    );
  }
});
