/**
 * TeleTime POS - Dexie Offline Database
 * Structured IndexedDB with schema and indexes for offline-first POS
 */

import Dexie from 'dexie';

const db = new Dexie('TeleTimePOS');

db.version(1).stores({
  products: 'id, sku, barcode, categoryId, [categoryId+name]',
  customers: 'id, name, phone, email',
  pending_transactions: 'clientTransactionId, createdAt, status',
});

export default db;
