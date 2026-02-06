/**
 * TeleTime POS - Batch Email Hook
 * Manages batch receipt email operations
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import api from '../api/axios';

/**
 * Hook for batch email operations
 */
export function useBatchEmail() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [unsentReceipts, setUnsentReceipts] = useState([]);
  const [currentBatch, setCurrentBatch] = useState(null);
  const [batchStatus, setBatchStatus] = useState(null);

  // Ref to track if component is mounted (prevents state updates after unmount)
  const isMountedRef = useRef(true);
  // Ref to store poll cancellation function
  const cancelPollRef = useRef(null);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      // Cancel any ongoing polling
      if (cancelPollRef.current) {
        cancelPollRef.current();
      }
    };
  }, []);

  /**
   * Get unsent receipts for a shift
   */
  const getUnsentForShift = useCallback(async (shiftId) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await api.get(`/batch-email/unsent?shiftId=${shiftId}`);
      setUnsentReceipts(response.data || []);
      return response.data || [];
    } catch (err) {
      setError(err.message || 'Failed to fetch unsent receipts');
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Get unsent receipts for a date range
   */
  const getUnsentByDateRange = useCallback(async (startDate, endDate) => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.append('startDate', startDate.toISOString());
      params.append('endDate', endDate.toISOString());

      const response = await api.get(`/batch-email/unsent?${params}`);
      setUnsentReceipts(response.data || []);
      return response.data || [];
    } catch (err) {
      setError(err.message || 'Failed to fetch unsent receipts');
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Get unsent receipts for today
   */
  const getUnsentForToday = useCallback(async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    return getUnsentByDateRange(today, endOfDay);
  }, [getUnsentByDateRange]);

  /**
   * Get unsent receipts for a specific date (YYYY-MM-DD format)
   */
  const getUnsentForDate = useCallback(async (dateString) => {
    const date = new Date(dateString + 'T00:00:00');
    date.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    return getUnsentByDateRange(date, endOfDay);
  }, [getUnsentByDateRange]);

  /**
   * Create batch for shift receipts
   */
  const createShiftBatch = useCallback(async (shiftId) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await api.post('/batch-email/batches/shift', { shiftId });

      if (response.data?.batch) {
        setCurrentBatch(response.data.batch);
      }

      return response;
    } catch (err) {
      setError(err.message || 'Failed to create batch');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Create batch for selected transactions
   */
  const createManualBatch = useCallback(async (transactionIds) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await api.post('/batch-email/batches/manual', { transactionIds });

      if (response.data?.batch) {
        setCurrentBatch(response.data.batch);
      }

      return response;
    } catch (err) {
      setError(err.message || 'Failed to create batch');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Create retry batch for failed emails
   */
  const createRetryBatch = useCallback(async (originalBatchId = null) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await api.post('/batch-email/batches/retry', {
        batchId: originalBatchId,
      });

      if (response.data?.batch) {
        setCurrentBatch(response.data.batch);
      }

      return response;
    } catch (err) {
      setError(err.message || 'Failed to create retry batch');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Process a batch (send emails)
   */
  const processBatch = useCallback(async (batchId, processAsync = true) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await api.post(
        `/batch-email/batches/${batchId}/process?async=${processAsync}`
      );
      return response;
    } catch (err) {
      setError(err.message || 'Failed to process batch');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Cancel a batch
   */
  const cancelBatch = useCallback(async (batchId) => {
    try {
      await api.post(`/batch-email/batches/${batchId}/cancel`);
      setCurrentBatch(null);
    } catch (err) {
      setError(err.message || 'Failed to cancel batch');
      throw err;
    }
  }, []);

  /**
   * Get batch status
   */
  const getBatchStatus = useCallback(async (batchId) => {
    try {
      const response = await api.get(`/batch-email/batches/${batchId}`);
      setBatchStatus(response.data);
      return response.data;
    } catch (err) {
      setError(err.message || 'Failed to get batch status');
      throw err;
    }
  }, []);

  /**
   * Poll batch status until complete
   * FIXED: Now properly handles cancellation on unmount to prevent memory leaks
   */
  const pollBatchStatus = useCallback(async (batchId, onUpdate, intervalMs = 2000) => {
    let cancelled = false;

    // Store cancellation function
    cancelPollRef.current = () => {
      cancelled = true;
    };

    const poll = async () => {
      try {
        // Check if cancelled or unmounted
        if (cancelled || !isMountedRef.current) {
          return null;
        }

        const status = await getBatchStatus(batchId);

        // Check again after async operation
        if (cancelled || !isMountedRef.current) {
          return null;
        }

        onUpdate?.(status);

        if (status.status === 'completed' || status.status === 'cancelled') {
          cancelPollRef.current = null;
          return status;
        }

        // Continue polling with cancellation check
        await new Promise((resolve, reject) => {
          const timeoutId = setTimeout(resolve, intervalMs);
          // Allow cancellation during wait
          const checkCancelled = setInterval(() => {
            if (cancelled || !isMountedRef.current) {
              clearTimeout(timeoutId);
              clearInterval(checkCancelled);
              resolve();
            }
          }, 100);
        });

        if (cancelled || !isMountedRef.current) {
          return null;
        }

        return poll();
      } catch (err) {
        if (cancelled || !isMountedRef.current) {
          return null;
        }
        throw err;
      }
    };

    return poll();
  }, [getBatchStatus]);

  /**
   * Check if a transaction has been emailed
   */
  const checkIfEmailed = useCallback(async (transactionId) => {
    try {
      const response = await api.get(`/batch-email/check/${transactionId}`);
      return response.data?.emailed || false;
    } catch (err) {
      return false;
    }
  }, []);

  /**
   * Get recent batches
   */
  const getRecentBatches = useCallback(async (options = {}) => {
    try {
      const params = new URLSearchParams();
      if (options.status) params.append('status', options.status);
      if (options.limit) params.append('limit', options.limit);

      const response = await api.get(`/batch-email/batches?${params}`);
      return response.data || [];
    } catch (err) {
      setError(err.message || 'Failed to get batches');
      return [];
    }
  }, []);

  /**
   * Reset state
   */
  const reset = useCallback(() => {
    setUnsentReceipts([]);
    setCurrentBatch(null);
    setBatchStatus(null);
    setError(null);
  }, []);

  return {
    // State
    isLoading,
    error,
    unsentReceipts,
    currentBatch,
    batchStatus,

    // Actions
    getUnsentForShift,
    getUnsentByDateRange,
    getUnsentForToday,
    getUnsentForDate,
    createShiftBatch,
    createManualBatch,
    createRetryBatch,
    processBatch,
    cancelBatch,
    getBatchStatus,
    pollBatchStatus,
    checkIfEmailed,
    getRecentBatches,
    reset,
  };
}

export default useBatchEmail;
