/**
 * TeleTime POS - Transaction Counts Hook
 * Fetches and manages transaction status counts with filter support
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../api/axios';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

/**
 * Default counts structure
 */
const DEFAULT_COUNTS = {
  all: 0,
  pending: 0,
  completed: 0,
  voided: 0,
  refunded: 0,
};

// NOTE: Fixed stale closure issue - countsRef ensures we always get the latest counts value

/**
 * Hook for fetching transaction counts based on filters
 * Counts respect all filters EXCEPT status (so you see what's in each status)
 *
 * @param {object} filters - Filter parameters
 * @param {string} filters.dateRange - Date range preset
 * @param {string} filters.startDate - Custom start date
 * @param {string} filters.endDate - Custom end date
 * @param {number} filters.salesRepId - Filter by sales rep
 * @param {string} filters.search - Search query
 * @param {number} filters.shiftId - Filter by shift
 * @param {number} filters.customerId - Filter by customer
 * @param {boolean} enabled - Whether to fetch counts (default: true)
 * @returns {object} Counts state and helpers
 */
export function useTransactionCounts(filters = {}, enabled = true) {
  const [counts, setCounts] = useState(DEFAULT_COUNTS);
  const [previousCounts, setPreviousCounts] = useState(DEFAULT_COUNTS);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const abortControllerRef = useRef(null);

  // Ref to avoid stale closure - always have access to current counts
  const countsRef = useRef(counts);
  countsRef.current = counts;

  /**
   * Fetch counts from API
   */
  const fetchCounts = useCallback(async () => {
    if (!enabled) return;

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setIsLoading(true);
    setError(null);

    try {
      const queryParams = new URLSearchParams();

      // Add filters (excluding status - we want counts for ALL statuses)
      if (filters.dateRange) queryParams.append('dateRange', filters.dateRange);
      if (filters.startDate) queryParams.append('startDate', filters.startDate);
      if (filters.endDate) queryParams.append('endDate', filters.endDate);
      if (filters.salesRepId) queryParams.append('salesRepId', filters.salesRepId);
      if (filters.search) queryParams.append('search', filters.search);
      if (filters.shiftId) queryParams.append('shiftId', filters.shiftId);
      if (filters.customerId) queryParams.append('customerId', filters.customerId);

      // Only fetch counts, minimal data
      queryParams.append('limit', '1');
      queryParams.append('includeCounts', 'true');

      const response = await api.get(`/transactions?${queryParams}`, {
        signal: abortControllerRef.current.signal,
      });

      if (response.counts) {
        // Use ref to get the LATEST counts value, avoiding stale closure
        setPreviousCounts(countsRef.current);
        setCounts(response.counts);
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error('[useTransactionCounts] Fetch error:', err);
      setError(err.message || 'Failed to load counts');
    } finally {
      setIsLoading(false);
    }
  }, [
    enabled,
    filters.dateRange,
    filters.startDate,
    filters.endDate,
    filters.salesRepId,
    filters.search,
    filters.shiftId,
    filters.customerId,
    // NOTE: counts intentionally excluded - we use countsRef to avoid stale closure
  ]);

  // Fetch on mount and when filters change
  useEffect(() => {
    fetchCounts();

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [fetchCounts]);

  /**
   * Manually refresh counts
   */
  const refresh = useCallback(() => {
    fetchCounts();
  }, [fetchCounts]);

  /**
   * Check if a status has zero transactions
   */
  const isEmpty = useCallback((status) => {
    if (status === null || status === 'all') {
      return counts.all === 0;
    }
    return counts[status] === 0;
  }, [counts]);

  /**
   * Get count for a specific status
   */
  const getCount = useCallback((status) => {
    if (status === null || status === 'all') {
      return counts.all;
    }
    return counts[status] ?? 0;
  }, [counts]);

  /**
   * Get previous count for animation
   */
  const getPreviousCount = useCallback((status) => {
    if (status === null || status === 'all') {
      return previousCounts.all;
    }
    return previousCounts[status] ?? 0;
  }, [previousCounts]);

  return {
    counts,
    previousCounts,
    isLoading,
    error,
    refresh,
    isEmpty,
    getCount,
    getPreviousCount,
  };
}

export default useTransactionCounts;
