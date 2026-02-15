/**
 * TeleTime POS - Connection Status Hook
 *
 * Persistent WebSocket connection for global online/offline detection.
 * Does NOT handle approval events — purely a status beacon.
 */

import { useState, useEffect, useRef, useCallback } from 'react';

const MAX_BACKOFF = 30_000;
const INITIAL_BACKOFF = 1_000;

export function useConnectionStatus() {
  const [status, setStatus] = useState('connected'); // 'connected' | 'reconnecting' | 'disconnected'
  const wsRef = useRef(null);
  const backoffRef = useRef(INITIAL_BACKOFF);
  const reconnectTimerRef = useRef(null);
  const intentionalCloseRef = useRef(false);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    const token = localStorage.getItem('pos_token');
    if (!token || !mountedRef.current) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const url = `${protocol}//${host}/ws?token=${encodeURIComponent(token)}`;

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) return;
        backoffRef.current = INITIAL_BACKOFF;
        setStatus('connected');
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        wsRef.current = null;

        if (intentionalCloseRef.current) return;

        setStatus('reconnecting');
        // Exponential backoff reconnect
        reconnectTimerRef.current = setTimeout(() => {
          if (mountedRef.current && !intentionalCloseRef.current) {
            backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF);
            connect();
          }
        }, backoffRef.current);
      };

      ws.onerror = () => {
        // onclose will fire after onerror
      };

      // Respond to pings to keep alive (server sends ping, we just need to stay connected)
      ws.onmessage = () => {
        // No-op: we don't handle messages, just maintain the connection
      };
    } catch {
      if (mountedRef.current) {
        setStatus('disconnected');
      }
    }
  }, []);

  // Listen to browser online/offline events for immediate detection
  useEffect(() => {
    const handleOffline = () => {
      if (mountedRef.current) setStatus('disconnected');
    };
    const handleOnline = () => {
      if (mountedRef.current) {
        setStatus('reconnecting');
        // Try to reconnect immediately
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          connect();
        }
      }
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [connect]);

  // Connect on mount, clean up on unmount
  useEffect(() => {
    mountedRef.current = true;
    intentionalCloseRef.current = false;
    connect();

    return () => {
      mountedRef.current = false;
      intentionalCloseRef.current = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  return {
    status,
    isOnline: status === 'connected',
    isOffline: status === 'disconnected',
  };
}
