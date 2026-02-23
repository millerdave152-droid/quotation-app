/**
 * TeleTime POS - useOfflineTransaction Hook
 * React hook bridging transactionSyncService to UI components
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getPendingTransactionCount,
  replayPendingTransactions,
  clearSyncedTransactions,
} from '../services/transactionSyncService';
import { getSyncManager } from '../store/offlineSync';

export function useOfflineTransaction() {
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const syncingRef = useRef(false);

  // Refresh the pending count from Dexie
  const refreshPendingCount = useCallback(async () => {
    try {
      const count = await getPendingTransactionCount();
      setPendingCount(count);
    } catch (err) {
      console.warn('[useOfflineTransaction] Count refresh failed:', err.message);
    }
  }, []);

  // Replay pending transactions
  const syncPending = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setIsSyncing(true);

    try {
      const result = await replayPendingTransactions();
      console.log('[useOfflineTransaction] Sync result:', result);

      // Clean up synced entries
      await clearSyncedTransactions();

      // Refresh count
      await refreshPendingCount();
    } catch (err) {
      console.warn('[useOfflineTransaction] Sync failed:', err.message);
    } finally {
      syncingRef.current = false;
      setIsSyncing(false);
    }
  }, [refreshPendingCount]);

  // On mount: refresh count
  useEffect(() => {
    refreshPendingCount();
  }, [refreshPendingCount]);

  // Listen for online events from SyncManager to auto-replay
  useEffect(() => {
    const manager = getSyncManager();
    const unsubscribe = manager.addListener((event) => {
      if (event === 'online') {
        // Small delay to let connection stabilize
        setTimeout(() => {
          syncPending();
        }, 2000);
      }
    });

    return unsubscribe;
  }, [syncPending]);

  // Get current online status
  const isOnline = getSyncManager().isOnline;

  return {
    pendingCount,
    isSyncing,
    isOnline,
    refreshPendingCount,
    syncPending,
  };
}

export default useOfflineTransaction;
