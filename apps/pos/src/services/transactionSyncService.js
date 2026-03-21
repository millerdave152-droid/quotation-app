/**
 * TeleTime POS - Transaction Sync Service
 * Manages offline transaction queue: save, replay, and cleanup
 */

import { v4 as uuidv4 } from 'uuid';
import db from '../db/offlineDb';
import api from '../api/axios';

/**
 * Save a transaction to the offline pending queue
 * @param {object} transactionData - Full transaction payload
 * @returns {object} { clientTransactionId, createdAt }
 */
export async function saveOfflineTransaction(transactionData) {
  const clientTransactionId = uuidv4();
  const createdAt = new Date().toISOString();

  await db.pending_transactions.put({
    clientTransactionId,
    createdAt,
    status: 'pending',
    data: transactionData,
    attempts: 0,
    lastError: null,
  });


  return { clientTransactionId, createdAt };
}

/**
 * Replay all pending transactions to the server
 * @returns {object} { synced: number, failed: number }
 */
export async function replayPendingTransactions() {
  const pending = await db.pending_transactions
    .where('status')
    .anyOf(['pending', 'failed'])
    .toArray();

  if (pending.length === 0) return { synced: 0, failed: 0 };

  let synced = 0;
  let failed = 0;

  for (const txn of pending) {
    try {
      // Mark as syncing
      await db.pending_transactions.update(txn.clientTransactionId, {
        status: 'syncing',
      });

      // POST with clientTransactionId for idempotency
      const payload = {
        ...txn.data,
        clientTransactionId: txn.clientTransactionId,
      };

      const response = await api.post('/transactions', payload);
      const result = response.data || response;

      if (result.success !== false) {
        await db.pending_transactions.update(txn.clientTransactionId, {
          status: 'synced',
          syncedAt: new Date().toISOString(),
          serverTransactionId: result.transactionId || result.transaction_id || null,
        });
        synced++;
      } else {
        throw new Error(result.error || 'Server returned failure');
      }
    } catch (err) {
      failed++;
      const attempts = (txn.attempts || 0) + 1;
      await db.pending_transactions.update(txn.clientTransactionId, {
        status: 'failed',
        attempts,
        lastError: err.message,
      });
      console.warn('[TransactionSync] Failed:', txn.clientTransactionId, err.message);
    }
  }

  return { synced, failed };
}

/**
 * Get count of pending (unsync'd) transactions
 */
export async function getPendingTransactionCount() {
  return db.pending_transactions
    .where('status')
    .anyOf(['pending', 'syncing', 'failed'])
    .count();
}

/**
 * Delete synced transactions to free space
 */
export async function clearSyncedTransactions() {
  await db.pending_transactions.where('status').equals('synced').delete();
}

/**
 * Get all pending transactions (for display)
 */
export async function getPendingTransactions() {
  return db.pending_transactions
    .where('status')
    .anyOf(['pending', 'syncing', 'failed'])
    .toArray();
}
