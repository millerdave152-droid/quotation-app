/**
 * TeleTime POS - Escalation Polling Hook
 * Polls the user's own escalation requests and detects status changes
 * for toast notifications.
 *
 * When isManager=true, also polls GET /discount-escalations/pending to
 * provide a managerPendingCount of escalations awaiting their approval.
 *
 * Approved+unused escalations are surfaced on EVERY poll (not just first),
 * so the toast appears regardless of when the user opens the POS relative
 * to the manager's approval. Dismissed escalation IDs are tracked in a
 * ref to prevent the toast from re-appearing.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getMyEscalations, getPendingEscalations } from '../api/discountAuthority';

const POLL_INTERVAL = 10000; // 10 seconds

export function useEscalationPolling(enabled = false, isManager = false) {
  const [escalations, setEscalations] = useState([]);
  const [newlyResolved, setNewlyResolved] = useState([]);
  const [managerPendingCount, setManagerPendingCount] = useState(0);
  const previousStatusRef = useRef(new Map());
  const dismissedRef = useRef(new Set());
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
      const resolved = [];

      for (const esc of data) {
        const status = (esc.status || '').toLowerCase();
        const prevStatus = prev.get(esc.id);

        // Approved + unused: surface on EVERY poll so the toast shows
        // regardless of when the user opened POS relative to approval.
        if (status === 'approved' && !esc.used_in_transaction_id) {
          resolved.push(esc);
        }
        // Denied/expired: only surface on status transition (pending→denied/expired)
        // OR if reviewed in the last 5 minutes (for page-refresh scenario)
        else if (status === 'denied' || status === 'expired') {
          if (prevStatus === 'pending') {
            resolved.push(esc);
          } else if (!prevStatus && esc.reviewed_at) {
            // First time seeing this escalation (no previous status tracked) —
            // show toast if recently reviewed
            const reviewedAt = new Date(esc.reviewed_at);
            const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
            if (reviewedAt > fiveMinAgo) {
              resolved.push(esc);
            }
          }
        }
      }

      if (resolved.length > 0) {
        setNewlyResolved((existing) => {
          const existingIds = new Set(existing.map(e => e.id));
          const fresh = resolved.filter(r =>
            !existingIds.has(r.id) && !dismissedRef.current.has(r.id)
          );
          return fresh.length > 0 ? [...existing, ...fresh] : existing;
        });
      }

      // Update the status map for next poll
      const nextMap = new Map();
      for (const esc of data) {
        nextMap.set(esc.id, (esc.status || '').toLowerCase());
      }
      previousStatusRef.current = nextMap;
    } catch (err) {
      console.warn('[useEscalationPolling] Fetch failed:', err.message);
    }

    // Manager: also fetch pending escalations awaiting their review
    if (isManager) {
      try {
        const pendingRes = await getPendingEscalations();
        const pendingData = Array.isArray(pendingRes?.data)
          ? pendingRes.data
          : Array.isArray(pendingRes)
            ? pendingRes
            : Array.isArray(pendingRes?.data?.data)
              ? pendingRes.data.data
              : [];
        setManagerPendingCount(pendingData.length);
      } catch (err) {
        console.warn('[useEscalationPolling] Manager pending fetch failed:', err.message);
      }
    }
  }, [isManager]);

  // Start/stop polling based on enabled flag
  useEffect(() => {
    if (!enabled) {
      clearInterval(pollRef.current);
      return;
    }

    // Reset dismissed set and previous status when polling restarts
    dismissedRef.current = new Set();
    previousStatusRef.current = new Map();

    // Initial fetch
    fetchAndDetectChanges();

    pollRef.current = setInterval(fetchAndDetectChanges, POLL_INTERVAL);
    return () => clearInterval(pollRef.current);
  }, [enabled, fetchAndDetectChanges]);

  const clearResolved = useCallback((id) => {
    dismissedRef.current.add(id);
    setNewlyResolved((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const refresh = useCallback(() => {
    fetchAndDetectChanges();
  }, [fetchAndDetectChanges]);

  const pendingCount = escalations.filter((e) => e.status === 'pending').length;

  return {
    escalations,
    pendingCount,
    managerPendingCount,
    newlyResolved,
    clearResolved,
    refresh,
  };
}
