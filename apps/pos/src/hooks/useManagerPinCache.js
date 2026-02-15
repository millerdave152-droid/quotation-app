/**
 * TeleTime POS - Manager PIN Cache Hook
 *
 * Fetches and caches PIN hashes in IndexedDB for offline verification.
 * Uses bcryptjs for browser-side hash comparison.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { get, set, del } from 'idb-keyval';
import bcrypt from 'bcryptjs';
import api from '../api/axios';

const IDB_KEY = 'manager-pin-cache';
const REFRESH_INTERVAL = 60 * 60 * 1000; // 60 minutes

// Approval level hierarchy (higher index = more authority)
const LEVEL_HIERARCHY = ['shift_lead', 'manager', 'area_manager', 'admin'];

function levelRank(level) {
  const idx = LEVEL_HIERARCHY.indexOf(level);
  return idx >= 0 ? idx : -1;
}

export function useManagerPinCache() {
  const [isLoaded, setIsLoaded] = useState(false);
  const cacheRef = useRef(null);
  const refreshTimerRef = useRef(null);
  const mountedRef = useRef(true);

  // Fetch from server and store in IDB
  const fetchAndCache = useCallback(async () => {
    try {
      const res = await api.get('/manager-overrides/pin-cache');
      const data = res?.data || res;
      if (data && Array.isArray(data)) {
        const cacheEntry = { pins: data, fetchedAt: Date.now() };
        await set(IDB_KEY, cacheEntry);
        if (mountedRef.current) {
          cacheRef.current = cacheEntry;
          setIsLoaded(true);
        }
      }
    } catch (err) {
      console.warn('[PinCache] Failed to fetch from server:', err.message);
      // Try loading from IDB fallback
      try {
        const cached = await get(IDB_KEY);
        if (cached && mountedRef.current) {
          cacheRef.current = cached;
          setIsLoaded(true);
        }
      } catch {
        // IDB also failed
      }
    }
  }, []);

  // Load cache on mount
  useEffect(() => {
    mountedRef.current = true;

    async function init() {
      // First try IDB for immediate availability
      try {
        const cached = await get(IDB_KEY);
        if (cached && mountedRef.current) {
          cacheRef.current = cached;
          setIsLoaded(true);
        }
      } catch {
        // IDB not available
      }

      // Then fetch fresh data from server
      await fetchAndCache();

      // Set up periodic refresh
      refreshTimerRef.current = setInterval(() => {
        if (mountedRef.current) fetchAndCache();
      }, REFRESH_INTERVAL);
    }

    init();

    return () => {
      mountedRef.current = false;
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, [fetchAndCache]);

  /**
   * Verify a PIN offline against cached hashes.
   * @param {string} pin - The entered PIN
   * @param {string} requiredLevel - Minimum approval level needed
   * @returns {{ valid: boolean, userId?: number, managerName?: string, approvalLevel?: string, error?: string }}
   */
  const verifyPinOffline = useCallback(async (pin, requiredLevel = 'manager') => {
    const cache = cacheRef.current;
    if (!cache || !cache.pins || cache.pins.length === 0) {
      return { valid: false, error: 'No cached PIN data available' };
    }

    const requiredRank = levelRank(requiredLevel);

    for (const entry of cache.pins) {
      // Check if this manager's level is sufficient
      const entryRank = levelRank(entry.approvalLevel);
      if (entryRank < requiredRank) continue;

      try {
        const match = await bcrypt.compare(pin, entry.pinHash);
        if (match) {
          return {
            valid: true,
            userId: entry.userId,
            managerName: entry.managerName,
            approvalLevel: entry.approvalLevel,
          };
        }
      } catch {
        // bcrypt error on this entry, try next
      }
    }

    return { valid: false, error: 'Invalid PIN or insufficient approval level' };
  }, []);

  /**
   * Clear the cached PIN data (e.g., on logout)
   */
  const clearCache = useCallback(async () => {
    cacheRef.current = null;
    setIsLoaded(false);
    try {
      await del(IDB_KEY);
    } catch {
      // IDB cleanup failed, not critical
    }
  }, []);

  return {
    verifyPinOffline,
    clearCache,
    isLoaded,
  };
}
