/**
 * TeleTime POS - Batch Email Context
 * App-wide state for batch email progress tracking
 * Allows emails to send in background while user continues working
 */

import { createContext, useContext, useState, useCallback, useRef } from 'react';
import api from '../api/axios';
import BatchEmailProgress from '../components/Email/BatchEmailProgress';
import BatchEmailResults from '../components/Email/BatchEmailResults';

const BatchEmailContext = createContext(null);

/**
 * Hook to access batch email context
 */
export function useBatchEmailContext() {
  const context = useContext(BatchEmailContext);
  if (!context) {
    throw new Error('useBatchEmailContext must be used within BatchEmailProvider');
  }
  return context;
}

/**
 * Batch Email Provider
 * Wraps app to provide batch email functionality
 */
export function BatchEmailProvider({ children }) {
  // Active batch state
  const [activeBatch, setActiveBatch] = useState(null);
  const [batchStatus, setBatchStatus] = useState(null);
  const [batchItems, setBatchItems] = useState([]);

  // Results modal state
  const [showResults, setShowResults] = useState(false);

  // Polling ref
  const pollingRef = useRef(null);

  /**
   * Start sending a batch (non-blocking)
   */
  const startBatch = useCallback(async (batchId) => {
    // Clear any existing polling
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }

    setActiveBatch(batchId);
    setBatchStatus({ status: 'processing', progress: 0, sent_count: 0, failed_count: 0 });

    try {
      // Start processing (async)
      await api.post(`/batch-email/batches/${batchId}/process?async=true`);

      // Start polling for status
      const poll = async () => {
        try {
          const response = await api.get(`/batch-email/batches/${batchId}`);
          const status = response.data;

          setBatchStatus(status);

          // Get items for results
          if (status.status === 'completed' || status.status === 'cancelled') {
            const itemsResponse = await api.get(`/batch-email/batches/${batchId}/items`);
            setBatchItems(itemsResponse.data || []);

            // Stop polling
            if (pollingRef.current) {
              clearInterval(pollingRef.current);
              pollingRef.current = null;
            }
          }
        } catch (err) {
          console.error('[BatchEmailContext] Polling error:', err);
        }
      };

      // Initial poll
      await poll();

      // Continue polling every 2 seconds
      pollingRef.current = setInterval(poll, 2000);
    } catch (err) {
      console.error('[BatchEmailContext] Start batch error:', err);
      setActiveBatch(null);
      setBatchStatus(null);
    }
  }, []);

  /**
   * Create and start a shift batch
   */
  const sendShiftReceipts = useCallback(async (shiftId) => {
    try {
      const response = await api.post('/batch-email/batches/shift', { shiftId });

      if (response.data?.batch) {
        await startBatch(response.data.batch.id);
        return { success: true, batch: response.data.batch };
      }

      return { success: true, message: response.message || 'No emails to send' };
    } catch (err) {
      console.error('[BatchEmailContext] Send shift receipts error:', err);
      return { success: false, error: err.message };
    }
  }, [startBatch]);

  /**
   * Create and start a manual batch
   */
  const sendSelectedReceipts = useCallback(async (transactionIds) => {
    try {
      const response = await api.post('/batch-email/batches/manual', { transactionIds });

      if (response.data?.batch) {
        await startBatch(response.data.batch.id);
        return { success: true, batch: response.data.batch };
      }

      return { success: true, message: response.message || 'No emails to send' };
    } catch (err) {
      console.error('[BatchEmailContext] Send selected receipts error:', err);
      return { success: false, error: err.message };
    }
  }, [startBatch]);

  /**
   * Retry failed emails
   */
  const retryFailed = useCallback(async (batchId = null) => {
    try {
      const response = await api.post('/batch-email/batches/retry', {
        batchId: batchId || activeBatch,
      });

      if (response.data?.batch) {
        setShowResults(false);
        await startBatch(response.data.batch.id);
        return { success: true, batch: response.data.batch };
      }

      return { success: true, message: response.message || 'No failed emails to retry' };
    } catch (err) {
      console.error('[BatchEmailContext] Retry failed error:', err);
      return { success: false, error: err.message };
    }
  }, [activeBatch, startBatch]);

  /**
   * View detailed results
   */
  const viewResults = useCallback(() => {
    setShowResults(true);
  }, []);

  /**
   * Dismiss progress indicator
   */
  const dismiss = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setActiveBatch(null);
    setBatchStatus(null);
    setBatchItems([]);
    setShowResults(false);
  }, []);

  /**
   * Check if currently processing
   */
  const isProcessing = batchStatus?.status === 'processing';

  const value = {
    // State
    activeBatch,
    batchStatus,
    batchItems,
    isProcessing,

    // Actions
    startBatch,
    sendShiftReceipts,
    sendSelectedReceipts,
    retryFailed,
    viewResults,
    dismiss,
  };

  return (
    <BatchEmailContext.Provider value={value}>
      {children}

      {/* Floating Progress Indicator */}
      {activeBatch && batchStatus && (
        <BatchEmailProgress
          batchId={activeBatch}
          status={batchStatus}
          onViewResults={viewResults}
          onRetry={() => retryFailed()}
          onDismiss={dismiss}
          position="bottom-right"
        />
      )}

      {/* Results Modal */}
      <BatchEmailResults
        isOpen={showResults}
        onClose={() => setShowResults(false)}
        batchStatus={batchStatus}
        items={batchItems}
        onRetryFailed={() => retryFailed()}
      />
    </BatchEmailContext.Provider>
  );
}

export default BatchEmailContext;
