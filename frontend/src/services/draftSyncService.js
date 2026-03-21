/**
 * Draft Sync Service
 * Singleton that handles syncing pending_sync drafts to the server
 * Follows the POS app's SyncManager pattern from apps/pos/src/store/offlineSync.js
 */

import db from '../db/localDb';
import { authFetch } from './authFetch';

const API_URL = process.env.REACT_APP_API_URL || '';
const MAX_RETRIES = 3;

class DraftSyncService {
  constructor() {
    this.syncing = false;
    this.listeners = new Set();

    this.handleOnline = this.handleOnline.bind(this);
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline);
    }
  }

  handleOnline() {
    this.syncPendingDrafts();
  }

  addListener(cb) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  notify(event, data) {
    this.listeners.forEach(fn => {
      try { fn(event, data); } catch (_) { /* ignore */ }
    });
  }

  /**
   * Sync all pending_sync drafts to the server
   */
  async syncPendingDrafts() {
    if (this.syncing || !navigator.onLine) return;
    this.syncing = true;
    this.notify('syncStart');

    try {
      const pending = await db.quote_drafts.where('status').equals('pending_sync').toArray();
      if (pending.length === 0) {
        this.syncing = false;
        this.notify('syncComplete', { count: 0 });
        return;
      }

      let successCount = 0;
      let failCount = 0;

      for (const draft of pending) {
        let retries = 0;
        let succeeded = false;

        while (retries < MAX_RETRIES && !succeeded) {
          try {
            const token = localStorage.getItem('auth_token');
            const res = await authFetch(`${API_URL}/api/quotes`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Idempotency-Key': draft.id,
                ...(token && { Authorization: `Bearer ${token}` }),
              },
              body: JSON.stringify({
                ...draft.snapshot.quoteData,
                client_draft_id: draft.id,
              }),
            });

            if (res.ok || res.status === 409) {
              // Success or duplicate — remove local draft
              await db.quote_drafts.delete(draft.id);
              successCount++;
              succeeded = true;
            } else {
              retries++;
            }
          } catch (_) {
            retries++;
          }
        }

        if (!succeeded) {
          failCount++;
        }
      }

      this.notify('syncComplete', { successCount, failCount });
    } catch (err) {
      console.error('[DraftSync] syncPendingDrafts error:', err);
      this.notify('syncError', { error: err.message });
    } finally {
      this.syncing = false;
    }
  }

  /**
   * Push a single draft to the server for cross-device availability
   */
  async pushDraftToServer(draftId) {
    if (!navigator.onLine) return;

    try {
      const draft = await db.quote_drafts.get(draftId);
      if (!draft) return;

      const serverQuoteId = draft.server_quote_id || 'new';
      const token = localStorage.getItem('auth_token');

      await authFetch(`${API_URL}/api/v1/quotes/${serverQuoteId}/draft`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({
          client_draft_id: draft.id,
          snapshot: draft.snapshot,
        }),
      });
    } catch (err) {
      console.error('[DraftSync] pushDraftToServer error:', err);
    }
  }

  /**
   * Register background sync if available
   */
  async registerBackgroundSync() {
    try {
      const reg = await navigator.serviceWorker?.ready;
      if (reg?.sync) {
        await reg.sync.register('sync-quotes');
      }
    } catch (_) {
      // Background sync not supported — rely on online event
    }
  }

  destroy() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline);
    }
    this.listeners.clear();
  }
}

// Singleton
let instance = null;

export const getDraftSyncService = () => {
  if (!instance) {
    instance = new DraftSyncService();
  }
  return instance;
};

export default getDraftSyncService;
