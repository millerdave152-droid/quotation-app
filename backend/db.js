/**
 * Database Connection Pool - Tenant-Aware Wrapper
 *
 * Two pools:
 *   rawPool   - connects as DB_ADMIN_USER (dbadmin/rds_superuser), bypasses RLS.
 *               Used for: auth lookups, background jobs, migrations, startup init.
 *   appPool   - connects as DB_USER (app_user), subject to RLS.
 *               Used for: all request-scoped queries via the tenant-aware wrapper.
 *
 * The tenant-aware wrapper (default export) uses AsyncLocalStorage to inject
 * `SET app.current_tenant` on every query within a request context, routing
 * through appPool (RLS-enforced). Outside of request context (no tenant set),
 * it falls back to rawPool (bypasses RLS) for backward compatibility.
 *
 * Exports:
 *   module.exports          - tenant-aware pool (drop-in replacement)
 *   module.exports.rawPool  - admin pg Pool (bypasses RLS)
 *   module.exports.tenantContext - AsyncLocalStorage instance
 */

const { Pool } = require('pg');
const { AsyncLocalStorage } = require('async_hooks');
require('dotenv').config();

// ── Shared AsyncLocalStorage for tenant context ──
const tenantContext = new AsyncLocalStorage();

// ── SSL config resolver (consolidated from config/database.js) ──
function resolveSslConfig() {
  const sslMode = (process.env.DB_SSL_MODE || '').toLowerCase();
  const sslFlag = (process.env.DB_SSL || '').toLowerCase();

  if (sslMode === 'disable' || sslFlag === 'false' || sslFlag === '0') {
    return false;
  }

  // SECURITY: Production on EC2 uses verified SSL. Local dev with production
  // .env needs self-signed cert support when DB_SSL_REJECT_UNAUTHORIZED=false.
  if (process.env.NODE_ENV === 'production' && (process.env.DB_SSL_REJECT_UNAUTHORIZED || '').toLowerCase() !== 'false') {
    return { rejectUnauthorized: true };
  }

  // Dev/test: honor the env var for local development with self-signed certs
  if (sslMode === 'require' || sslFlag === 'true' || sslFlag === '1') {
    const rejectUnauthorized = (process.env.DB_SSL_REJECT_UNAUTHORIZED || '').toLowerCase() !== 'false';
    return { rejectUnauthorized };
  }

  // Default for non-production: allow self-signed certs
  return { rejectUnauthorized: false };
}

// ── Shared pool config ──
const sharedConfig = {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  ssl: resolveSslConfig(),
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT) || 30000,
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECT_TIMEOUT) || 5000,
  acquireTimeoutMillis: parseInt(process.env.DB_ACQUIRE_TIMEOUT) || 30000,
  statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT) || 30000,
};

// ── Raw admin Pool (dbadmin / rds_superuser — bypasses RLS) ──
const rawPool = new Pool({
  ...sharedConfig,
  user: process.env.DB_ADMIN_USER || 'dbadmin',
  password: process.env.DB_ADMIN_PASSWORD || process.env.DB_PASSWORD,
  max: 5,    // Small pool — only auth/background/migrations
  min: 1,
  application_name: 'quotation-app-admin',
});

// ── App Pool (app_user — subject to RLS) ──
const appPool = new Pool({
  ...sharedConfig,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: parseInt(process.env.DB_POOL_MAX) || 20,
  min: parseInt(process.env.DB_POOL_MIN) || 2,
  application_name: 'quotation-app',
});

// Log pool errors
rawPool.on('error', (err) => {
  console.error('Unexpected admin pool error:', err.message);
});
appPool.on('error', (err) => {
  console.error('Unexpected app pool error:', err.message);
});

// Debug logging
if (process.env.DB_DEBUG === 'true') {
  appPool.on('connect', () => console.log('[DB AppPool] New connection established'));
  appPool.on('acquire', () => console.log('[DB AppPool] Connection acquired'));
  appPool.on('release', () => console.log('[DB AppPool] Connection released'));
  appPool.on('remove', () => console.log('[DB AppPool] Connection removed'));
}

// ── Helper: get tenant ID from AsyncLocalStorage ──
function getCurrentTenantId() {
  const store = tenantContext.getStore();
  return store ? store.tenantId : null;
}

// ── Tenant-Aware Pool Wrapper ──
// Routes through appPool (RLS-enforced) when tenant context is active,
// falls back to rawPool (bypasses RLS) when not.

const tenantPool = {
  /**
   * query() - When tenant context is active: acquires appPool connection,
   * sets tenant, runs query, resets, releases. Otherwise: uses rawPool.
   */
  async query(text, params) {
    const tenantId = getCurrentTenantId();

    if (!tenantId) {
      // No tenant context — use admin pool (bypasses RLS)
      return rawPool.query(text, params);
    }

    const client = await appPool.connect();
    try {
      await client.query("SELECT set_config('app.current_tenant', $1, false)", [tenantId]);
      const result = await client.query(text, params);
      return result;
    } finally {
      try {
        await client.query('RESET app.current_tenant');
      } catch (_) { /* ignore reset errors on broken connections */ }
      client.release();
    }
  },

  /**
   * connect() - Returns a tenant-aware client wrapper.
   * Uses appPool when tenant context is active, rawPool otherwise.
   */
  async connect() {
    const tenantId = getCurrentTenantId();
    const pool = tenantId ? appPool : rawPool;
    const client = await pool.connect();

    if (tenantId) {
      await client.query("SELECT set_config('app.current_tenant', $1, false)", [tenantId]);
    }

    // Wrap release to reset tenant setting
    const originalRelease = client.release.bind(client);
    let released = false;
    client.release = async (err) => {
      if (released) return;
      released = true;
      if (tenantId) {
        try {
          await client.query('RESET app.current_tenant');
        } catch (_) { /* ignore */ }
      }
      return originalRelease(err);
    };

    return client;
  },

  /**
   * end() - shuts down both pools.
   */
  async end() {
    await Promise.all([rawPool.end(), appPool.end()]);
  },

  /**
   * on() - proxy event listeners to the app pool.
   */
  on(event, listener) {
    return appPool.on(event, listener);
  },

  // Expose internals for compatibility
  get totalCount() { return appPool.totalCount; },
  get idleCount() { return appPool.idleCount; },
  get waitingCount() { return appPool.waitingCount; },
};

// Attach additional exports
tenantPool.rawPool = rawPool;
tenantPool.appPool = appPool;
tenantPool.tenantContext = tenantContext;

module.exports = tenantPool;
