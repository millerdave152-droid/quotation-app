/**
 * TeleTime POS - Escalation Polling Hook
 * Polls the user's own escalation requests and detects status changes
 * (pending → approved/denied/expired) for toast notifications.
 *
 * On the first fetch after mount, any approved+unused escalation is treated
 * as newly resolved so the toast fires even if the user navigated away and
 * came back (or refreshed the page) while the manager approved.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getMyEscalations } from '../api/discountAuthority';

const POLL_INTERVAL = 10000; // 10 seconds

export function useEscalationPolling(enabled = false) {
  const [escalations, setEscalations] = useState([]);
  const [newlyResolved, setNewlyResolved] = useState([]);
  const previousStatusRef = useRef(new Map());
  const isFirstFetchRef = useRef(true);
  const pollRef = useRef(null);
  const pollCountRef = useRef(0);

  const fetchAndDetectChanges = useCallback(async () => {
    try {
      pollCountRef.current += 1;
      const res = await getMyEscalations();
      // Axios interceptor returns response.data directly. Support both shapes:
      // - { success: true, data: [...] }
      // - { data: [...] }
      // - [...]
      const data = Array.isArray(res?.data)
        ? res.data
        : Array.isArray(res)
          ? res
          : Array.isArray(res?.data?.data)
            ? res.data.data
            : [];
      setEscalations(data);

      const prev = previousStatusRef.current;
      const isFirstFetch = isFirstFetchRef.current;
      const resolved = [];

      for (const esc of data) {
        const status = (esc.status || '').toLowerCase();
        const prevStatus = prev.get(esc.id);

        if (isFirstFetch) {
          // First fetch after mount: surface any approved+unused or
          // recently denied/expired escalations so the user sees the toast
          // even if they navigated away and came back
          if (status === 'approved' && !esc.used_in_transaction_id) {
            resolved.push(esc);
          } else if (status === 'denied' || status === 'expired') {
            // Only show denied/expired toasts if resolved within the last 5 minutes
            // (otherwise they'd see stale denials every time they open POS)
            if (esc.reviewed_at) {
              const reviewedAt = new Date(esc.reviewed_at);
              const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
              if (reviewedAt > fiveMinAgo) {
                resolved.push(esc);
              }
            }
          }
        } else {
          // Subsequent polls: detect status transitions from pending
          if (prevStatus === 'pending' && (status === 'approved' || status === 'denied' || status === 'expired')) {
            resolved.push(esc);
          }
        }
      }

      if (resolved.length > 0) {
        setNewlyResolved((existing) => {
          // Avoid duplicates
          const existingIds = new Set(existing.map(e => e.id));
          const fresh = resolved.filter(r => !existingIds.has(r.id));
          return fresh.length > 0 ? [...existing, ...fresh] : existing;
        });
      }

      // Update the status map for next poll
      const nextMap = new Map();
      for (const esc of data) {
        nextMap.set(esc.id, (esc.status || '').toLowerCase());
      }
      previousStatusRef.current = nextMap;
      isFirstFetchRef.current = false;

      if (typeof window !== 'undefined' && localStorage.getItem('pos_debug_escalations') === '1') {
        const approved = data.filter(d => (d.status || '').toLowerCase() === 'approved');
        const pending = data.filter(d => (d.status || '').toLowerCase() === 'pending');
        const denied = data.filter(d => (d.status || '').toLowerCase() === 'denied');
        const expired = data.filter(d => (d.status || '').toLowerCase() === 'expired');
        const debugPayload = {
          pollCount: pollCountRef.current,
          enabled,
          isFirstFetch,
          total: data.length,
          pending: pending.length,
          approved: approved.length,
          denied: denied.length,
          expired: expired.length,
          newlyResolvedCount: resolved.length,
          lastIds: data.slice(0, 3).map(d => ({ id: d.id, status: d.status, product_id: d.product_id, reviewed_at: d.reviewed_at })),
        };
        window.__posEscalationDebug = debugPayload;
        console.log('[EscalationDebug]', debugPayload);
      }
    } catch (err) {
      console.warn('[useEscalationPolling] Fetch failed:', err.message);
    }
  }, []);

  // Start/stop polling based on enabled flag
  useEffect(() => {
    if (!enabled) {
      clearInterval(pollRef.current);
      return;
    }

    // Reset first-fetch flag when polling restarts (e.g. shift opened)
    isFirstFetchRef.current = true;

    // Initial fetch
    fetchAndDetectChanges();

    pollRef.current = setInterval(fetchAndDetectChanges, POLL_INTERVAL);
    return () => clearInterval(pollRef.current);
  }, [enabled, fetchAndDetectChanges]);

  const clearResolved = useCallback((id) => {
    setNewlyResolved((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const refresh = useCallback(() => {
    fetchAndDetectChanges();
  }, [fetchAndDetectChanges]);

  const pendingCount = escalations.filter((e) => e.status === 'pending').length;

  return {
    escalations,
    pendingCount,
    newlyResolved,
    clearResolved,
    refresh,
  };
}
