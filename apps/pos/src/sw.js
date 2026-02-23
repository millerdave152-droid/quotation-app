/**
 * TeleTime POS - Service Worker
 * Workbox-powered: precache static assets, StaleWhileRevalidate for API data,
 * push notifications for approval requests.
 */

import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { StaleWhileRevalidate, NetworkOnly } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

// ============================================================================
// PRECACHE — static assets injected by vite-plugin-pwa at build time
// ============================================================================
precacheAndRoute(self.__WB_MANIFEST);

// ============================================================================
// RUNTIME CACHING — API routes
// ============================================================================

// Products, customers, categories: StaleWhileRevalidate
// Serve from cache immediately, update cache in background
registerRoute(
  ({ url }) =>
    url.pathname.startsWith('/api/products') ||
    url.pathname.startsWith('/api/customers') ||
    url.pathname === '/api/categories',
  new StaleWhileRevalidate({
    cacheName: 'api-data',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 200,
        maxAgeSeconds: 24 * 60 * 60, // 1 day
      }),
    ],
  })
);

// All mutation requests: NetworkOnly (never cache POSTs, PUTs, etc.)
registerRoute(
  ({ request }) => ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method),
  new NetworkOnly()
);

// ============================================================================
// PUSH NOTIFICATIONS — merged from approval-sw.js
// ============================================================================

const NOTIFICATION_TIMEOUT_MS = 30_000;

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'TeleTime POS', body: event.data.text() };
  }

  const title = payload.title || 'Price Override Request';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/pos-icon.svg',
    badge: payload.badge || '/pos-icon.svg',
    tag: payload.tag || 'approval-notification',
    renotify: true,
    requireInteraction: true,
    data: {
      url: payload.url || '/?approvals=open',
      ...(payload.data || {}),
    },
  };

  event.waitUntil(
    self.registration.showNotification(title, options).then(() => {
      setTimeout(() => {
        self.registration.getNotifications({ tag: options.tag }).then((notifications) => {
          notifications.forEach((n) => n.close());
        });
      }, NOTIFICATION_TIMEOUT_MS);
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          client.postMessage({ type: 'APPROVAL_NOTIFICATION_CLICK', url: targetUrl });
          return;
        }
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});

// ============================================================================
// LIFECYCLE — claim clients immediately on activate
// ============================================================================

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
