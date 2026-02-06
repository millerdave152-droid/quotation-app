/**
 * Unified State Provider
 * Wraps the application with state management and offline sync
 */

import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useUnifiedStore } from './unifiedStore';
import { useOfflineSync, getSyncManager } from './offlineSync';
import { getDeviceId, generateDraftKey } from './draftApi';

// ============================================================================
// CONTEXT
// ============================================================================

const UnifiedStateContext = createContext(null);

/**
 * Provider component for unified state management
 * Sets up offline sync, auto-save, and provides context to children
 */
export const UnifiedStateProvider = ({
  children,
  mode = 'pos', // 'pos' or 'quote'
  userId = null,
  autoSave = true,
  onSyncComplete,
  onSyncError,
  onOnline,
  onOffline,
}) => {
  const [initialized, setInitialized] = useState(false);
  const store = useUnifiedStore();
  const deviceIdRef = useRef(getDeviceId());

  // Initialize offline sync
  const offlineSync = useOfflineSync({
    draftType: mode,
    userId,
    autoSave,
    onSyncComplete,
    onSyncError,
    onOnline,
    onOffline,
  });

  // Initialize on mount
  useEffect(() => {
    const init = async () => {
      // Try to restore existing draft for this device/user
      const draftKey = generateDraftKey(mode, userId);
      try {
        const draft = await offlineSync.loadDraft(draftKey);
        if (draft) {
          console.log('[UnifiedStateProvider] Restored draft from storage');
        }
      } catch (error) {
        console.warn('[UnifiedStateProvider] Failed to restore draft:', error);
      }

      setInitialized(true);
    };

    init();
  }, [mode, userId]);

  // Context value
  const contextValue = {
    mode,
    userId,
    deviceId: deviceIdRef.current,
    initialized,
    ...offlineSync,
  };

  return (
    <UnifiedStateContext.Provider value={contextValue}>
      {children}
    </UnifiedStateContext.Provider>
  );
};

/**
 * Hook to access unified state context
 */
export const useUnifiedStateContext = () => {
  const context = useContext(UnifiedStateContext);
  if (!context) {
    throw new Error('useUnifiedStateContext must be used within UnifiedStateProvider');
  }
  return context;
};

// ============================================================================
// SYNC STATUS COMPONENTS
// ============================================================================

/**
 * Online/Offline indicator component
 */
export const OnlineIndicator = ({ className = '' }) => {
  const store = useUnifiedStore();
  const isOnline = store.isOnline;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div
        className={`w-2.5 h-2.5 rounded-full ${
          isOnline ? 'bg-green-500' : 'bg-red-500'
        }`}
      />
      <span className={`text-sm ${isOnline ? 'text-green-700' : 'text-red-700'}`}>
        {isOnline ? 'Online' : 'Offline'}
      </span>
    </div>
  );
};

/**
 * Sync status badge component
 */
export const SyncStatusBadge = ({ className = '', showLabel = true }) => {
  const store = useUnifiedStore();
  const { syncStatus, isDirty, lastSavedAt } = store;

  const getStatusConfig = () => {
    if (!store.isOnline) {
      return {
        color: 'bg-yellow-100 text-yellow-800 border-yellow-200',
        icon: '⚠️',
        label: 'Offline - Changes saved locally',
      };
    }

    switch (syncStatus) {
      case 'synced':
        if (isDirty) {
          return {
            color: 'bg-blue-100 text-blue-800 border-blue-200',
            icon: '💾',
            label: 'Unsaved changes',
          };
        }
        return {
          color: 'bg-green-100 text-green-800 border-green-200',
          icon: '✓',
          label: 'All changes saved',
        };
      case 'pending':
        return {
          color: 'bg-yellow-100 text-yellow-800 border-yellow-200',
          icon: '🔄',
          label: 'Syncing...',
        };
      case 'error':
        return {
          color: 'bg-red-100 text-red-800 border-red-200',
          icon: '✗',
          label: 'Sync failed',
        };
      default:
        return {
          color: 'bg-gray-100 text-gray-800 border-gray-200',
          icon: '○',
          label: 'Unknown',
        };
    }
  };

  const config = getStatusConfig();

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${config.color} ${className}`}
      title={lastSavedAt ? `Last saved: ${new Date(lastSavedAt).toLocaleString()}` : ''}
    >
      <span>{config.icon}</span>
      {showLabel && <span>{config.label}</span>}
    </div>
  );
};

/**
 * Full sync status panel with controls
 */
export const SyncStatusPanel = ({ className = '' }) => {
  const store = useUnifiedStore();
  const context = useUnifiedStateContext();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const updatePendingCount = async () => {
      const count = await context.getPendingCount();
      setPendingCount(count);
    };

    updatePendingCount();
    const interval = setInterval(updatePendingCount, 5000);
    return () => clearInterval(interval);
  }, [context]);

  const handleForceSync = async () => {
    await context.forceSync();
  };

  const handleSaveNow = async () => {
    await context.saveDraft(true);
  };

  return (
    <div className={`bg-white rounded-lg border border-gray-200 p-4 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-900">Sync Status</h3>
        <OnlineIndicator />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Status</span>
          <SyncStatusBadge />
        </div>

        {store.lastSavedAt && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Last saved</span>
            <span className="text-sm text-gray-900">
              {new Date(store.lastSavedAt).toLocaleTimeString()}
            </span>
          </div>
        )}

        {pendingCount > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Pending operations</span>
            <span className="text-sm font-medium text-yellow-600">{pendingCount}</span>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button
            onClick={handleSaveNow}
            disabled={!store.isDirty}
            className="flex-1 px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 rounded-md hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Save Now
          </button>
          <button
            onClick={handleForceSync}
            disabled={!store.isOnline || pendingCount === 0}
            className="flex-1 px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-50 rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Force Sync
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// OFFLINE BANNER
// ============================================================================

/**
 * Banner shown when offline
 */
export const OfflineBanner = ({ className = '' }) => {
  const store = useUnifiedStore();

  if (store.isOnline) return null;

  return (
    <div className={`bg-yellow-50 border-b border-yellow-200 px-4 py-2 ${className}`}>
      <div className="flex items-center justify-center gap-2">
        <svg
          className="w-5 h-5 text-yellow-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <span className="text-sm font-medium text-yellow-800">
          You're offline. Changes will be saved locally and synced when you reconnect.
        </span>
      </div>
    </div>
  );
};

// ============================================================================
// DRAFT RECOVERY MODAL
// ============================================================================

/**
 * Modal to recover from a saved draft
 */
export const DraftRecoveryModal = ({
  isOpen,
  onRecover,
  onDiscard,
  draft,
}) => {
  if (!isOpen || !draft) return null;

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          Recover Unsaved Work?
        </h2>
        <p className="text-sm text-gray-600 mb-4">
          We found an unsaved {draft.draftType} from your last session.
        </p>

        <div className="bg-gray-50 rounded-lg p-3 mb-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Items</span>
            <span className="font-medium">{draft.itemCount || 0}</span>
          </div>
          {draft.customerName && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Customer</span>
              <span className="font-medium">{draft.customerName}</span>
            </div>
          )}
          {draft.totalCents > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Total</span>
              <span className="font-medium">
                ${(draft.totalCents / 100).toFixed(2)}
              </span>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Last saved</span>
            <span className="font-medium">{formatDate(draft.savedAt)}</span>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onDiscard}
            className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
          >
            Start Fresh
          </button>
          <button
            onClick={() => onRecover(draft)}
            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
          >
            Recover
          </button>
        </div>
      </div>
    </div>
  );
};

export default UnifiedStateProvider;
