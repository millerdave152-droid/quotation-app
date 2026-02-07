import { db } from '../lib/db';
import api from '../api/client';

/**
 * Queue an action for sync. If online, attempts immediately.
 * If offline or fails, stays in queue for background sync.
 */
export async function queueAction(action) {
  const entry = {
    ...action,
    createdAt: new Date().toISOString(),
    attempts: 0,
  };

  if (navigator.onLine) {
    try {
      await executeAction(entry);
      return { synced: true };
    } catch {
      // Fall through to queue
    }
  }

  await db.put('syncQueue', entry);
  return { synced: false, queued: true };
}

/**
 * Process all pending items in the sync queue.
 * Called when coming back online or periodically.
 */
export async function processSyncQueue() {
  const items = await db.getAll('syncQueue');
  if (!items.length) return 0;

  let synced = 0;
  for (const item of items) {
    try {
      await executeAction(item);
      await db.delete('syncQueue', item.id);
      synced++;
    } catch {
      // Increment attempt count, skip for now
      item.attempts = (item.attempts || 0) + 1;
      await db.put('syncQueue', item);
    }
  }
  return synced;
}

async function executeAction(action) {
  switch (action.type) {
    case 'status_update':
      return api.patch(`/api/dispatch/deliveries/${action.deliveryId}/status`, {
        status: action.status,
        notes: action.notes,
        latitude: action.latitude,
        longitude: action.longitude,
        timestamp: action.createdAt,
      });

    case 'photo_upload': {
      const photo = await db.get('photos', action.photoId);
      if (!photo) return;
      const form = new FormData();
      form.append('photo', photo.blob, photo.filename);
      form.append('delivery_id', action.deliveryId);
      form.append('type', action.photoType);
      return api.upload(`/api/dispatch/deliveries/${action.deliveryId}/photos`, form);
    }

    case 'signature':
      return api.post(`/api/dispatch/deliveries/${action.deliveryId}/signature`, {
        signature_data: action.signatureData,
        signer_name: action.signerName,
      });

    case 'location_ping':
      return api.post('/api/dispatch/drivers/location', {
        latitude: action.latitude,
        longitude: action.longitude,
        timestamp: action.createdAt,
      });

    default:
      console.warn('Unknown sync action type:', action.type);
  }
}

// Auto-sync when coming back online
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    processSyncQueue();
  });
}
