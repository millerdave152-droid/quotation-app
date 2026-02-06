/**
 * IndexedDB Storage Adapter for Zustand
 * Provides persistent storage that works offline
 */

import { get, set, del } from 'idb-keyval';

/**
 * Create an IndexedDB storage adapter for Zustand persist middleware
 * Falls back to localStorage if IndexedDB is not available
 */
export const createIDBStorage = () => {
  // Check if IndexedDB is available
  const isIDBAvailable = typeof indexedDB !== 'undefined';

  if (!isIDBAvailable) {
    console.warn('IndexedDB not available, falling back to localStorage');
    return {
      getItem: (name) => {
        const value = localStorage.getItem(name);
        return value ? JSON.parse(value) : null;
      },
      setItem: (name, value) => {
        localStorage.setItem(name, JSON.stringify(value));
      },
      removeItem: (name) => {
        localStorage.removeItem(name);
      },
    };
  }

  return {
    getItem: async (name) => {
      try {
        const value = await get(name);
        return value ?? null;
      } catch (error) {
        console.error('IDB getItem error:', error);
        // Fallback to localStorage
        const fallback = localStorage.getItem(name);
        return fallback ? JSON.parse(fallback) : null;
      }
    },

    setItem: async (name, value) => {
      try {
        await set(name, value);
        // Also save to localStorage as backup
        try {
          localStorage.setItem(name, JSON.stringify(value));
        } catch (e) {
          // localStorage might be full, that's okay
        }
      } catch (error) {
        console.error('IDB setItem error:', error);
        // Fallback to localStorage
        localStorage.setItem(name, JSON.stringify(value));
      }
    },

    removeItem: async (name) => {
      try {
        await del(name);
        localStorage.removeItem(name);
      } catch (error) {
        console.error('IDB removeItem error:', error);
        localStorage.removeItem(name);
      }
    },
  };
};

/**
 * Direct IDB operations for larger data (like draft history)
 */
export const idbOperations = {
  /**
   * Save a draft to IndexedDB
   */
  saveDraft: async (draftId, data) => {
    const key = `draft-${draftId}`;
    try {
      await set(key, {
        ...data,
        savedAt: new Date().toISOString(),
      });
      return true;
    } catch (error) {
      console.error('Failed to save draft to IDB:', error);
      return false;
    }
  },

  /**
   * Load a draft from IndexedDB
   */
  loadDraft: async (draftId) => {
    const key = `draft-${draftId}`;
    try {
      return await get(key);
    } catch (error) {
      console.error('Failed to load draft from IDB:', error);
      return null;
    }
  },

  /**
   * Delete a draft from IndexedDB
   */
  deleteDraft: async (draftId) => {
    const key = `draft-${draftId}`;
    try {
      await del(key);
      return true;
    } catch (error) {
      console.error('Failed to delete draft from IDB:', error);
      return false;
    }
  },

  /**
   * Get all drafts (for listing)
   */
  getAllDrafts: async () => {
    // idb-keyval doesn't have a built-in list function
    // We'll store a draft index separately
    try {
      const index = await get('draft-index') || [];
      const drafts = await Promise.all(
        index.map(async (id) => {
          const draft = await get(`draft-${id}`);
          return draft ? { id, ...draft } : null;
        })
      );
      return drafts.filter(Boolean);
    } catch (error) {
      console.error('Failed to get all drafts:', error);
      return [];
    }
  },

  /**
   * Update draft index
   */
  updateDraftIndex: async (draftId, action = 'add') => {
    try {
      const index = await get('draft-index') || [];
      if (action === 'add' && !index.includes(draftId)) {
        index.push(draftId);
      } else if (action === 'remove') {
        const idx = index.indexOf(draftId);
        if (idx > -1) index.splice(idx, 1);
      }
      await set('draft-index', index);
    } catch (error) {
      console.error('Failed to update draft index:', error);
    }
  },

  /**
   * Save pending operation for offline sync
   */
  savePendingOperation: async (operation) => {
    const key = 'pending-operations';
    try {
      const operations = await get(key) || [];
      operations.push({
        ...operation,
        id: `op-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        createdAt: new Date().toISOString(),
      });
      await set(key, operations);
      return true;
    } catch (error) {
      console.error('Failed to save pending operation:', error);
      return false;
    }
  },

  /**
   * Get all pending operations
   */
  getPendingOperations: async () => {
    try {
      return await get('pending-operations') || [];
    } catch (error) {
      console.error('Failed to get pending operations:', error);
      return [];
    }
  },

  /**
   * Clear pending operations
   */
  clearPendingOperations: async () => {
    try {
      await set('pending-operations', []);
      return true;
    } catch (error) {
      console.error('Failed to clear pending operations:', error);
      return false;
    }
  },

  /**
   * Remove specific pending operation
   */
  removePendingOperation: async (operationId) => {
    try {
      const operations = await get('pending-operations') || [];
      const filtered = operations.filter(op => op.id !== operationId);
      await set('pending-operations', filtered);
      return true;
    } catch (error) {
      console.error('Failed to remove pending operation:', error);
      return false;
    }
  },
};
