import { openDB } from 'idb';

const DB_NAME = 'driver-app';
const DB_VERSION = 1;

const dbPromise = openDB(DB_NAME, DB_VERSION, {
  upgrade(database) {
    // General key-value store (auth, settings)
    if (!database.objectStoreNames.contains('meta')) {
      database.createObjectStore('meta');
    }

    // Assigned deliveries cache
    if (!database.objectStoreNames.contains('deliveries')) {
      const store = database.createObjectStore('deliveries', { keyPath: 'id' });
      store.createIndex('status', 'status');
      store.createIndex('date', 'scheduled_date');
    }

    // Queued actions (status updates, photos, signatures) for offline sync
    if (!database.objectStoreNames.contains('syncQueue')) {
      const store = database.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
      store.createIndex('createdAt', 'createdAt');
    }

    // Captured photos stored as blobs
    if (!database.objectStoreNames.contains('photos')) {
      database.createObjectStore('photos', { keyPath: 'id' });
    }
  },
});

// Convenience wrappers
export const db = {
  async get(store, key) {
    return (await dbPromise).get(store, key);
  },
  async getAll(store) {
    return (await dbPromise).getAll(store);
  },
  async getAllFromIndex(store, index, query) {
    return (await dbPromise).getAllFromIndex(store, index, query);
  },
  async put(store, value, key) {
    return (await dbPromise).put(store, value, key);
  },
  async delete(store, key) {
    return (await dbPromise).delete(store, key);
  },
  async clear(store) {
    return (await dbPromise).clear(store);
  },
  async count(store) {
    return (await dbPromise).count(store);
  },
};
