/**
 * Offline Sync Manager
 * Handles online/offline detection and automatic syncing
 */

import { useEffect, useCallback, useRef } from 'react';
import { useUnifiedStore } from './unifiedStore';
import { idbOperations } from './idbStorage';
import { draftApi, getDeviceId, generateDraftKey } from './draftApi';

// ============================================================================
// CONFIGURATION
// ============================================================================

const SYNC_CONFIG = {
  autoSaveInterval: 30000, // Auto-save every 30 seconds
  syncRetryDelay: 5000, // Retry sync after 5 seconds on failure
  maxRetries: 3,
  debounceDelay: 2000, // Debounce changes before saving
};

// ============================================================================
// SYNC MANAGER CLASS
// ============================================================================

class SyncManager {
  constructor() {
    this.isOnline = navigator.onLine;
    this.syncInProgress = false;
    this.syncQueue = [];
    this.listeners = new Set();
    this.autoSaveTimer = null;
    this.debounceTimer = null;

    // Bind event handlers
    this.handleOnline = this.handleOnline.bind(this);
    this.handleOffline = this.handleOffline.bind(this);

    // Listen for online/offline events
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline);
      window.addEventListener('offline', this.handleOffline);
    }
  }

  // Event handlers
  handleOnline() {
    this.isOnline = true;
    this.notifyListeners('online');
    this.processPendingOperations();
  }

  handleOffline() {
    this.isOnline = false;
    this.notifyListeners('offline');
  }

  // Listener management
  addListener(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notifyListeners(event, data) {
    this.listeners.forEach((listener) => {
      try {
        listener(event, data);
      } catch (error) {
        console.error('[SyncManager] Listener error:', error);
      }
    });
  }

  // Queue an operation for sync
  async queueOperation(operation) {
    const op = {
      ...operation,
      id: `op-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString(),
      retryCount: 0,
    };

    // Save to IndexedDB
    await idbOperations.savePendingOperation(op);
    this.syncQueue.push(op);

    // Try to process immediately if online
    if (this.isOnline && !this.syncInProgress) {
      this.processPendingOperations();
    }

    return op.id;
  }

  // Process pending operations
  async processPendingOperations() {
    if (this.syncInProgress || !this.isOnline) {
      return;
    }

    this.syncInProgress = true;
    this.notifyListeners('syncStart');

    try {
      // Get all pending operations from IndexedDB
      const operations = await idbOperations.getPendingOperations();

      if (operations.length === 0) {
        this.syncInProgress = false;
        this.notifyListeners('syncComplete', { count: 0 });
        return;
      }


      // Batch sync with server
      const deviceId = getDeviceId();
      const results = await draftApi.batchSync(operations, deviceId);

      // Process results
      let successCount = 0;
      let failCount = 0;

      for (const result of results.results) {
        if (result.success) {
          successCount++;
          await idbOperations.removePendingOperation(result.id);
        } else {
          failCount++;
          // Increment retry count
          const op = operations.find((o) => o.id === result.id);
          if (op && op.retryCount >= SYNC_CONFIG.maxRetries) {
            // Max retries reached, remove from queue
            await idbOperations.removePendingOperation(result.id);
            this.notifyListeners('syncError', {
              operationId: result.id,
              error: result.message,
              permanent: true,
            });
          }
        }
      }

      this.notifyListeners('syncComplete', { successCount, failCount });

      // If there were failures and we're still online, retry after delay
      if (failCount > 0 && this.isOnline) {
        setTimeout(() => {
          this.syncInProgress = false;
          this.processPendingOperations();
        }, SYNC_CONFIG.syncRetryDelay);
      } else {
        this.syncInProgress = false;
      }
    } catch (error) {
      console.error('[SyncManager] Sync error:', error);
      this.syncInProgress = false;
      this.notifyListeners('syncError', { error: error.message });

      // Retry after delay if still online
      if (this.isOnline) {
        setTimeout(() => {
          this.processPendingOperations();
        }, SYNC_CONFIG.syncRetryDelay);
      }
    }
  }

  // Save draft with offline support
  async saveDraft(draftData, immediate = false) {
    const deviceId = getDeviceId();
    const operation = {
      type: 'save_draft',
      payload: {
        ...draftData,
        deviceId,
      },
    };

    // Always save locally first
    const localDraftId = `local-${Date.now()}`;
    await idbOperations.saveDraft(localDraftId, draftData);
    await idbOperations.updateDraftIndex(localDraftId, 'add');

    if (this.isOnline && immediate) {
      // Try to save to server immediately
      try {
        const serverDraft = await draftApi.saveDraft(operation.payload);
        // Update local with server ID
        await idbOperations.deleteDraft(localDraftId);
        await idbOperations.updateDraftIndex(localDraftId, 'remove');
        await idbOperations.saveDraft(serverDraft.id, { ...draftData, serverId: serverDraft.id });
        await idbOperations.updateDraftIndex(serverDraft.id, 'add');
        return serverDraft;
      } catch (error) {
        console.error('[SyncManager] Immediate save failed, queuing:', error);
        await this.queueOperation(operation);
        return { id: localDraftId, local: true };
      }
    } else {
      // Queue for later sync
      await this.queueOperation(operation);
      return { id: localDraftId, local: true };
    }
  }

  // Load draft with fallback to local
  async loadDraft(draftKey) {
    // Try server first if online
    if (this.isOnline) {
      try {
        const serverDraft = await draftApi.getDraftByKey(draftKey);
        if (serverDraft) {
          // Update local cache
          await idbOperations.saveDraft(serverDraft.id, serverDraft.data);
          return serverDraft;
        }
      } catch (error) {
        console.warn('[SyncManager] Server load failed, trying local:', error);
      }
    }

    // Fallback to local drafts
    const localDrafts = await idbOperations.getAllDrafts();
    return localDrafts.find((d) => d.draftKey === draftKey) || null;
  }

  // Start auto-save timer
  startAutoSave(getSnapshot, draftType, userId) {
    this.stopAutoSave();

    this.autoSaveTimer = setInterval(async () => {
      const snapshot = getSnapshot();
      if (snapshot && snapshot.items && snapshot.items.length > 0) {
        const draftKey = generateDraftKey(draftType, userId);
        await this.saveDraft({
          draftType,
          draftKey,
          data: snapshot,
          itemCount: snapshot.items.length,
          totalCents: snapshot.totalCents || 0,
          customerName: snapshot.customer?.name,
        });
      }
    }, SYNC_CONFIG.autoSaveInterval);
  }

  stopAutoSave() {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  // Debounced save on changes
  debouncedSave(getSnapshot, draftType, userId) {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(async () => {
      const snapshot = getSnapshot();
      if (snapshot && snapshot.items && snapshot.items.length > 0) {
        const draftKey = generateDraftKey(draftType, userId);
        await this.saveDraft({
          draftType,
          draftKey,
          data: snapshot,
          itemCount: snapshot.items.length,
          totalCents: snapshot.totalCents || 0,
          customerName: snapshot.customer?.name,
        });
      }
    }, SYNC_CONFIG.debounceDelay);
  }

  // Cleanup
  destroy() {
    this.stopAutoSave();
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline);
      window.removeEventListener('offline', this.handleOffline);
    }
    this.listeners.clear();
  }
}

// Singleton instance
let syncManager = null;

export const getSyncManager = () => {
  if (!syncManager) {
    syncManager = new SyncManager();
  }
  return syncManager;
};

// ============================================================================
// REACT HOOK
// ============================================================================

/**
 * React hook for offline sync functionality
 * Integrates with the unified store
 */
export const useOfflineSync = (options = {}) => {
  const {
    draftType = 'pos',
    userId,
    autoSave = true,
    onSyncComplete,
    onSyncError,
    onOnline,
    onOffline,
  } = options;

  const isOnlineState = useUnifiedStore((state) => state.isOnline);
  const syncStatus = useUnifiedStore((state) => state.syncStatus);
  const isDirty = useUnifiedStore((state) => state.isDirty);
  const lastSavedAt = useUnifiedStore((state) => state.lastSavedAt);
  const customer = useUnifiedStore((state) => state.customer);
  const setOnline = useUnifiedStore((state) => state.setOnline);
  const markSynced = useUnifiedStore((state) => state.markSynced);
  const setSyncError = useUnifiedStore((state) => state.setSyncError);
  const markDirty = useUnifiedStore((state) => state.markDirty);
  const markSaved = useUnifiedStore((state) => state.markSaved);
  const getDraftSnapshot = useUnifiedStore((state) => state.getDraftSnapshot);
  const getItemCount = useUnifiedStore((state) => state.getItemCount);
  const getTotal = useUnifiedStore((state) => state.getTotal);
  const restoreFromDraft = useUnifiedStore((state) => state.restoreFromDraft);
  const managerRef = useRef(null);
  const unsubscribeRef = useRef(null);

  // Initialize sync manager
  useEffect(() => {
    managerRef.current = getSyncManager();
    const manager = managerRef.current;

    // Set up listeners
    const handleEvent = (event, data) => {
      switch (event) {
        case 'online':
          setOnline(true);
          onOnline?.();
          break;
        case 'offline':
          setOnline(false);
          onOffline?.();
          break;
        case 'syncComplete':
          markSynced();
          onSyncComplete?.(data);
          break;
        case 'syncError':
          setSyncError(data.error);
          onSyncError?.(data);
          break;
      }
    };

    unsubscribeRef.current = manager.addListener(handleEvent);

    // Set initial online state
    setOnline(navigator.onLine);

    // Start auto-save if enabled
    if (autoSave) {
      manager.startAutoSave(
        () => getDraftSnapshot(),
        draftType,
        userId
      );
    }

    return () => {
      unsubscribeRef.current?.();
      manager.stopAutoSave();
    };
  }, [draftType, userId, autoSave, getDraftSnapshot, markSynced, onOffline, onOnline, onSyncComplete, onSyncError, setOnline, setSyncError]);

  // Subscribe to store changes for debounced save
  useEffect(() => {
    if (!autoSave) return;

    const manager = managerRef.current;
    if (!manager) return;

    const unsubscribe = useUnifiedStore.subscribe(
      (state) => state.items,
      () => {
        markDirty();
        manager.debouncedSave(
          () => getDraftSnapshot(),
          draftType,
          userId
        );
      }
    );

    return unsubscribe;
  }, [draftType, userId, autoSave, getDraftSnapshot, markDirty]);

  // Manual save function
  const saveDraft = useCallback(async (immediate = false) => {
    const manager = managerRef.current;
    if (!manager) return null;

    const snapshot = getDraftSnapshot();
    const draftKey = generateDraftKey(draftType, userId);

    const result = await manager.saveDraft({
      draftType,
      draftKey,
      data: snapshot,
      itemCount: getItemCount(),
      totalCents: getTotal(),
      customerName: customer?.name,
    }, immediate);

    markSaved();
    return result;
  }, [customer?.name, draftType, getDraftSnapshot, getItemCount, getTotal, markSaved, userId]);

  // Load draft function
  const loadDraft = useCallback(async (draftKey) => {
    const manager = managerRef.current;
    if (!manager) return null;

    const draft = await manager.loadDraft(draftKey || generateDraftKey(draftType, userId));
    if (draft && draft.data) {
      restoreFromDraft(draft.data);
      return draft;
    }
    return null;
  }, [draftType, restoreFromDraft, userId]);

  // Force sync function
  const forceSync = useCallback(async () => {
    const manager = managerRef.current;
    if (!manager) return;

    await manager.processPendingOperations();
  }, []);

  // Get pending operations count
  const getPendingCount = useCallback(async () => {
    const operations = await idbOperations.getPendingOperations();
    return operations.length;
  }, []);

  return {
    // State
    isOnline: isOnlineState,
    syncStatus,
    isDirty,
    lastSavedAt,

    // Actions
    saveDraft,
    loadDraft,
    forceSync,
    getPendingCount,
  };
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Check if we're currently online
 */
export const isOnline = () => {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
};

/**
 * Wait for online status
 */
export const waitForOnline = (timeout = 30000) => {
  return new Promise((resolve, reject) => {
    if (navigator.onLine) {
      resolve();
      return;
    }

    const timeoutId = setTimeout(() => {
      window.removeEventListener('online', handleOnline);
      reject(new Error('Timeout waiting for online status'));
    }, timeout);

    const handleOnline = () => {
      clearTimeout(timeoutId);
      window.removeEventListener('online', handleOnline);
      resolve();
    };

    window.addEventListener('online', handleOnline);
  });
};
