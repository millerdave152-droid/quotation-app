/**
 * TeleTime POS - Offline Approval Queue
 *
 * IDB-backed queue for offline PIN approvals.
 * Entries are synced to the server when connectivity is restored.
 */

import { get, set, del } from 'idb-keyval';
import api from '../api/axios';

const IDB_KEY = 'offline-approval-queue';

/**
 * Add an offline approval entry to the queue.
 */
export async function addOfflineApproval(entry) {
  const queue = (await get(IDB_KEY)) || [];
  queue.push({
    ...entry,
    synced: false,
    syncAttempts: 0,
    serverRequestId: null,
  });
  await set(IDB_KEY, queue);
}

/**
 * Get all unsynced entries from the queue.
 */
export async function getUnsynced() {
  const queue = (await get(IDB_KEY)) || [];
  return queue.filter((e) => !e.synced);
}

/**
 * Mark a specific entry as synced.
 */
export async function markSynced(clientRequestId, serverRequestId) {
  const queue = (await get(IDB_KEY)) || [];
  const updated = queue.map((e) =>
    e.clientRequestId === clientRequestId
      ? { ...e, synced: true, serverRequestId }
      : e
  );
  await set(IDB_KEY, updated);
}

/**
 * Batch sync all unsynced entries to the server.
 * @returns {{ synced: number, failed: number }}
 */
export async function syncToServer() {
  const unsynced = await getUnsynced();
  if (unsynced.length === 0) return { synced: 0, failed: 0 };

  try {
    const payload = unsynced.map((e) => ({
      clientRequestId: e.clientRequestId,
      productId: e.productId,
      requestedPrice: e.requestedPrice,
      managerId: e.managerId,
      managerName: e.managerName,
      approvalLevel: e.approvalLevel,
      offlineApprovedAt: e.offlineApprovedAt,
      deviceId: e.deviceId,
      reason: e.reason,
    }));

    const res = await api.post('/pos-approvals/sync-offline', { approvals: payload });
    const data = res?.data || res;
    const results = data?.results || [];

    let synced = 0;
    let failed = 0;

    for (const result of results) {
      if (result.success) {
        await markSynced(result.clientRequestId, result.requestId);
        synced++;
      } else {
        // Increment attempt count
        const queue = (await get(IDB_KEY)) || [];
        const updated = queue.map((e) =>
          e.clientRequestId === result.clientRequestId
            ? { ...e, syncAttempts: (e.syncAttempts || 0) + 1 }
            : e
        );
        await set(IDB_KEY, updated);
        failed++;
      }
    }

    console.log(`[OfflineQueue] Synced ${synced}, failed ${failed}`);
    return { synced, failed };
  } catch (err) {
    console.warn('[OfflineQueue] Sync failed:', err.message);
    return { synced: 0, failed: unsynced.length };
  }
}

/**
 * Clear the entire queue (e.g., on logout).
 */
export async function clearAll() {
  await del(IDB_KEY);
}
