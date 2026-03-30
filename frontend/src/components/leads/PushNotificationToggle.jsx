/**
 * PushNotificationToggle — Push notification opt-in component
 * Handles all 5 browser states: unsupported, denied, default, granted+unsubscribed, granted+subscribed
 * Includes iOS Add-to-Home-Screen guidance
 */

import React, { useState, useEffect, useCallback } from 'react';
import { authFetch } from '../../services/authFetch';

const API_URL = process.env.REACT_APP_API_URL || '';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent);
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;

function PushNotificationToggle({ compact = false }) {
  // unsupported | denied | default | granted_unsubscribed | subscribed
  const [state, setState] = useState('default');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setState('unsupported');
      return;
    }

    if (Notification.permission === 'denied') {
      setState('denied');
      return;
    }

    if (Notification.permission === 'granted') {
      navigator.serviceWorker.ready.then(reg => {
        reg.pushManager.getSubscription().then(sub => {
          setState(sub ? 'subscribed' : 'granted_unsubscribed');
        });
      }).catch(() => setState('granted_unsubscribed'));
    } else {
      setState('default');
    }
  }, []);

  const handleEnable = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Request permission
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState('denied');
        setLoading(false);
        return;
      }

      // 2. Register service worker
      const registration = await navigator.serviceWorker.register('/service-worker.js');
      await navigator.serviceWorker.ready;

      // 3. Fetch VAPID public key
      const vapidRes = await fetch(`${API_URL}/api/push/vapid-public-key`);
      const { publicKey } = await vapidRes.json();

      // 4. Subscribe
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });

      // 5. Send subscription to backend
      const token = localStorage.getItem('auth_token');
      await authFetch(`${API_URL}/api/push/subscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          userAgent: navigator.userAgent
        })
      });

      setState('subscribed');
    } catch (err) {
      console.error('Push subscription failed:', err);
      if (Notification.permission === 'denied') {
        setState('denied');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDisable = useCallback(async () => {
    setLoading(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();

        const token = localStorage.getItem('auth_token');
        await authFetch(`${API_URL}/api/push/unsubscribe`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` })
          },
          body: JSON.stringify({ endpoint })
        });
      }

      // Update preference
      const token = localStorage.getItem('auth_token');
      await authFetch(`${API_URL}/api/users/me/notifications`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` })
        },
        body: JSON.stringify({ push_notifications_enabled: false })
      });

      setState('granted_unsubscribed');
    } catch (err) {
      console.error('Push unsubscribe failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // iOS detection banner
  const showIOSHint = isIOS() && !isStandalone() && state === 'default';

  if (state === 'unsupported') {
    return (
      <div style={styles.container(compact)}>
        <div style={styles.label}>Push Notifications</div>
        <div style={styles.muted}>Not supported on this browser</div>
      </div>
    );
  }

  if (state === 'denied') {
    return (
      <div style={styles.container(compact)}>
        <div style={styles.label}>Push Notifications</div>
        <div style={{ fontSize: '13px', color: '#EF4444' }}>
          Notifications blocked. Enable in browser settings.
        </div>
      </div>
    );
  }

  if (state === 'subscribed') {
    return (
      <div style={styles.container(compact)}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={styles.label}>Push Notifications</div>
            <div style={{ fontSize: '12px', color: '#059669' }}>Active on this device</div>
          </div>
          <button
            onClick={handleDisable}
            disabled={loading}
            style={{
              padding: '6px 14px', background: '#f3f4f6', border: '1px solid #d1d5db',
              borderRadius: '6px', fontSize: '13px', cursor: 'pointer', color: '#6b7280'
            }}
          >
            {loading ? 'Disabling...' : 'Disable'}
          </button>
        </div>
      </div>
    );
  }

  // default or granted_unsubscribed
  return (
    <div style={styles.container(compact)}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={styles.label}>Push Notifications</div>
          <div style={styles.muted}>Get real-time alerts on your phone or desktop</div>
        </div>
        <button
          onClick={handleEnable}
          disabled={loading}
          style={{
            padding: '8px 16px', background: '#C8614A', border: 'none',
            borderRadius: '8px', fontSize: '13px', fontWeight: '600',
            cursor: loading ? 'wait' : 'pointer', color: '#fff',
            opacity: loading ? 0.7 : 1
          }}
        >
          {loading ? 'Enabling...' : 'Enable'}
        </button>
      </div>
      {showIOSHint && (
        <div style={{
          marginTop: '10px', padding: '8px 12px', background: '#FEF3C7',
          border: '1px solid #FDE68A', borderRadius: '6px',
          fontSize: '12px', color: '#92400E'
        }}>
          On iPhone, tap <strong>Share</strong> → <strong>Add to Home Screen</strong> first, then enable notifications.
        </div>
      )}
    </div>
  );
}

const styles = {
  container: (compact) => ({
    padding: compact ? '12px' : '16px',
    background: '#fff',
    border: '1px solid #e5e7eb',
    borderRadius: '10px',
    ...(compact ? {} : { marginBottom: '12px' })
  }),
  label: {
    fontSize: '14px', fontWeight: '600', color: '#111827', marginBottom: '2px'
  },
  muted: {
    fontSize: '12px', color: '#9ca3af'
  }
};

export default PushNotificationToggle;
