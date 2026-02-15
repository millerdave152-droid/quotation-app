/**
 * TeleTime POS - Approval Push Service Worker
 *
 * Handles incoming push events and shows browser notifications for
 * price-override approval requests. Works even when the app tab is
 * backgrounded or the phone screen is locked.
 */

// Auto-close timeout (ms)
const NOTIFICATION_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// PUSH EVENT — display a notification
// ---------------------------------------------------------------------------
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
    requireInteraction: true, // Keep visible until user interacts
    data: {
      url: payload.url || '/?approvals=open',
      ...(payload.data || {}),
    },
  };

  event.waitUntil(
    self.registration.showNotification(title, options).then(() => {
      // Schedule auto-close after 30 seconds
      setTimeout(() => {
        self.registration.getNotifications({ tag: options.tag }).then((notifications) => {
          notifications.forEach((n) => n.close());
        });
      }, NOTIFICATION_TIMEOUT_MS);
    })
  );
});

// ---------------------------------------------------------------------------
// NOTIFICATION CLICK — focus or open the app
// ---------------------------------------------------------------------------
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If the app is already open in a tab, focus it
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          // Navigate to approvals if not already there
          client.postMessage({ type: 'APPROVAL_NOTIFICATION_CLICK', url: targetUrl });
          return;
        }
      }
      // Otherwise open a new tab
      return self.clients.openWindow(targetUrl);
    })
  );
});

// ---------------------------------------------------------------------------
// ACTIVATE — claim clients immediately
// ---------------------------------------------------------------------------
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
