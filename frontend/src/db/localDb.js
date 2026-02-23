/**
 * Local Dexie Database for Quote Draft Persistence
 * Separate DB name (QuoteAppDrafts) to avoid conflict with existing QuoteAppDB in service worker
 */

import Dexie from 'dexie';

const db = new Dexie('QuoteAppDrafts');

db.version(1).stores({
  quote_drafts: 'id, tenant_id, user_id, server_quote_id, status, updated_at',
});

export default db;
