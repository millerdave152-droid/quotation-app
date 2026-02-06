/**
 * useExpiringQuotes Hook
 * Fetches and manages expiring quotes with auto-polling
 */

import { useState, useEffect, useCallback, useRef } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const DEFAULT_OPTIONS = {
  daysAhead: 7,
  pollInterval: 5 * 60 * 1000, // 5 minutes
  maxQuotes: 10,
  autoRefresh: true,
};

/**
 * Hook for managing expiring quotes data with polling
 * @param {object} options - Configuration options
 * @returns {object} Expiring quotes state and actions
 */
export function useExpiringQuotes(options = {}) {
  const {
    salesRepId = null,
    daysAhead = DEFAULT_OPTIONS.daysAhead,
    pollInterval = DEFAULT_OPTIONS.pollInterval,
    maxQuotes = DEFAULT_OPTIONS.maxQuotes,
    autoRefresh = DEFAULT_OPTIONS.autoRefresh,
  } = options;

  const [quotes, setQuotes] = useState([]);
  const [stats, setStats] = useState({
    expiringToday: 0,
    expiringIn3Days: 0,
    expiringIn7Days: 0,
    totalAtRiskValue: 0,
    totalAtRiskCents: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const pollIntervalRef = useRef(null);
  const abortControllerRef = useRef(null);

  /**
   * Fetch expiring quotes from API
   */
  const fetchQuotes = useCallback(async (showLoading = true) => {
    // Cancel any pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    if (showLoading) {
      setLoading(true);
    }

    try {
      const params = new URLSearchParams({
        days: daysAhead.toString(),
        limit: maxQuotes.toString(),
        sortBy: 'priority',
      });

      if (salesRepId) {
        params.append('repId', salesRepId.toString());
      }

      const response = await fetch(
        `${API_BASE}/pos/quotes/expiring?${params}`,
        {
          signal: abortControllerRef.current.signal,
          headers: {
            Authorization: `Bearer ${localStorage.getItem('pos_token')}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch expiring quotes');
      }

      const data = await response.json();

      if (data.success !== false) {
        setQuotes(data.quotes || []);
        setStats(data.stats || {
          expiringToday: 0,
          expiringIn3Days: 0,
          expiringIn7Days: 0,
          totalAtRiskValue: 0,
        });
        setLastUpdated(new Date());
        setError(null);
      } else {
        throw new Error(data.error || 'Unknown error');
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('[useExpiringQuotes] Error:', err);
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }, [daysAhead, maxQuotes, salesRepId]);

  /**
   * Log a follow-up for a quote
   */
  const logFollowUp = useCallback(async (quoteId, followUpData) => {
    try {
      const response = await fetch(
        `${API_BASE}/pos/quotes/${quoteId}/followed-up`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('pos_token')}`,
          },
          body: JSON.stringify(followUpData),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to log follow-up');
      }

      const result = await response.json();

      // Update local state to reflect the follow-up
      setQuotes(prev =>
        prev.map(q =>
          q.quoteId === quoteId
            ? {
                ...q,
                lastContactedAt: new Date().toISOString(),
                lastContactOutcome: followUpData.outcome,
                followUpCount: (q.followUpCount || 0) + 1,
                needsFollowUp: false,
              }
            : q
        )
      );

      return result;
    } catch (err) {
      console.error('[useExpiringQuotes] Follow-up error:', err);
      throw err;
    }
  }, []);

  /**
   * Refresh data manually
   */
  const refresh = useCallback(() => {
    return fetchQuotes(true);
  }, [fetchQuotes]);

  /**
   * Silent refresh (no loading state)
   */
  const silentRefresh = useCallback(() => {
    return fetchQuotes(false);
  }, [fetchQuotes]);

  // Initial fetch
  useEffect(() => {
    fetchQuotes(true);
  }, [fetchQuotes]);

  // Set up polling
  useEffect(() => {
    if (autoRefresh && pollInterval > 0) {
      pollIntervalRef.current = setInterval(() => {
        fetchQuotes(false); // Silent refresh
      }, pollInterval);

      return () => {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
        }
      };
    }
  }, [autoRefresh, pollInterval, fetchQuotes]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  // Derived state
  const hasQuotes = quotes.length > 0;
  const hasUrgentQuotes = stats.expiringToday > 0;
  const isEmpty = !loading && quotes.length === 0;

  // Get quotes by urgency
  const urgentQuotes = quotes.filter(q => q.daysUntilExpiry <= 1);
  const soonQuotes = quotes.filter(q => q.daysUntilExpiry > 1 && q.daysUntilExpiry <= 3);
  const upcomingQuotes = quotes.filter(q => q.daysUntilExpiry > 3);

  return {
    // Data
    quotes,
    stats,
    urgentQuotes,
    soonQuotes,
    upcomingQuotes,

    // State
    loading,
    error,
    lastUpdated,
    hasQuotes,
    hasUrgentQuotes,
    isEmpty,

    // Actions
    refresh,
    silentRefresh,
    logFollowUp,
  };
}

export default useExpiringQuotes;
