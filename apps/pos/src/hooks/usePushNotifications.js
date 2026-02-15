/**
 * TeleTime POS - Push Notifications Hook
 *
 * Manages service worker registration, push subscription,
 * and synchronization with the backend.
 *
 * Usage:
 *   const { isSupported, permission, subscribe, unsubscribe } = usePushNotifications();
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../api/axios';

const SW_PATH = '/approval-sw.js';

/**
 * Convert a base64-encoded VAPID public key to a Uint8Array for PushManager.
 */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function usePushNotifications() {
  const [permission, setPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  );
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const registrationRef = useRef(null);

  const isSupported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;

  // Register the service worker on mount
  useEffect(() => {
    if (!isSupported) return;

    navigator.serviceWorker
      .register(SW_PATH)
      .then((reg) => {
        registrationRef.current = reg;
        // Check if already subscribed
        return reg.pushManager.getSubscription();
      })
      .then((sub) => {
        setIsSubscribed(!!sub);
      })
      .catch((err) => {
        console.warn('[Push] SW registration failed:', err.message);
      });
  }, [isSupported]);

  // Listen for notification click messages from SW
  useEffect(() => {
    if (!isSupported) return;

    const handler = (event) => {
      if (event.data?.type === 'APPROVAL_NOTIFICATION_CLICK') {
        // Navigate to approvals view — a simple approach
        const url = event.data.url;
        if (url && window.location.pathname + window.location.search !== url) {
          window.location.href = url;
        }
      }
    };

    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, [isSupported]);

  /**
   * Request notification permission, register push subscription,
   * and send the subscription to the backend.
   */
  const subscribe = useCallback(async () => {
    if (!isSupported) return false;
    setLoading(true);

    try {
      // 1. Request permission
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== 'granted') {
        setLoading(false);
        return false;
      }

      // 2. Get VAPID public key from backend
      const vapidRes = await api.get('/push/vapid-public-key');
      const publicKey = vapidRes?.data?.publicKey || vapidRes?.publicKey;
      if (!publicKey) {
        console.warn('[Push] No VAPID public key — push not configured on server');
        setLoading(false);
        return false;
      }

      // 3. Ensure SW is ready
      const reg = registrationRef.current || await navigator.serviceWorker.ready;
      registrationRef.current = reg;

      // 4. Subscribe to push
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      // 5. Send subscription to backend
      await api.post('/push/subscribe', subscription.toJSON());

      setIsSubscribed(true);
      return true;
    } catch (err) {
      console.error('[Push] Subscribe failed:', err);
      return false;
    } finally {
      setLoading(false);
    }
  }, [isSupported]);

  /**
   * Unsubscribe from push notifications.
   */
  const unsubscribe = useCallback(async () => {
    if (!isSupported) return;
    setLoading(true);

    try {
      const reg = registrationRef.current || await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        // Tell the backend first
        await api.post('/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {});
        await sub.unsubscribe();
      }
      setIsSubscribed(false);
    } catch (err) {
      console.error('[Push] Unsubscribe failed:', err);
    } finally {
      setLoading(false);
    }
  }, [isSupported]);

  return {
    isSupported,
    permission,
    isSubscribed,
    loading,
    subscribe,
    unsubscribe,
  };
}
