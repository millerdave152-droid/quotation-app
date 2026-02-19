// NOTE: Must run with --runInBand. Shares live DB tables
// with other Skulytics integration tests. Use:
// npm run test:skulytics

'use strict';

/**
 * Skulytics Sync Pipeline — Integration Tests
 *
 * Uses a real PostgreSQL database. Runs the Skulytics migration SQL
 * before the suite and drops the tables after. Mocks only the HTTP
 * client (SkulyticsApiClient) so no real API calls are made.
 *
 * Run:
 *   npx jest __tests__/integration/skulyticsSync.test.js --no-coverage
 */

const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');
const { SkulyticsSyncService } = require('../../services/skulytics/SkulyticsSyncService');
const { SkulyticsRateLimitError, SkulyticsApiError } = require('../../services/skulytics/SkulyticsApiClient');
const { buildQuoteSnapshot } = require('../../services/skulytics/SkulyticsSnapshotService');

// ── Test DB pool ────────────────────────────────────────────

let testPool;

// ── Migration helpers ───────────────────────────────────────

const MIGRATIONS_DIR = path.resolve(__dirname, '../../migrations/skulytics');

const UP_FILES = [
  '00_skulytics_extensions.sql',
  '10_global_skulytics_products.sql',
  '40_skulytics_sync_runs.sql',       // must come before tables that FK to sync_runs
];

const DOWN_FILES = [
  '40_skulytics_sync_runs.down.sql',
  '10_global_skulytics_products.down.sql',
  '00_skulytics_extensions.down.sql',
];

async function runMigrationFile(pool, filename) {
  const filePath = path.join(MIGRATIONS_DIR, filename);
  const sql = fs.readFileSync(filePath, 'utf8');
  await pool.query(sql);
}

// ── Mock product factory ────────────────────────────────────

function makeRawProduct(index, overrides = {}) {
  return {
    id: `SKU-TEST-${String(index).padStart(3, '0')}`,
    sku: `TEST-${String(index).padStart(3, '0')}`,
    brand: 'TestBrand',
    name: `Test Product ${index}`,
    pricing: { msrp: 100 + index, currency: 'CAD' },
    specifications: { weight: `${index}kg` },
    discontinued: false,
    ...overrides,
  };
}

function makeProductPage(startIndex, count, nextCursor = null) {
  const products = [];
  for (let i = startIndex; i < startIndex + count; i++) {
    products.push(makeRawProduct(i));
  }
  return {
    products,
    nextCursor,
    hasMore: nextCursor !== null,
    rateLimitRemaining: 100,
    rateLimitResetMs: 0,
  };
}

// ── Mock API client class ───────────────────────────────────

class MockApiClient {
  constructor() {
    this.getProductsCalls = [];
    this._pages = [];         // array of page responses or Error instances
    this._callIndex = 0;
  }

  /** Configure pages to return in order. Each entry is a page response or an Error. */
  setPages(pages) {
    this._pages = pages;
    this._callIndex = 0;
  }

  async getProducts(params) {
    this.getProductsCalls.push(params);
    const idx = this._callIndex++;
    if (idx >= this._pages.length) {
      return { products: [], nextCursor: null, hasMore: false, rateLimitRemaining: 100, rateLimitResetMs: 0 };
    }
    const page = this._pages[idx];
    if (page instanceof Error) throw page;
    return page;
  }

  async getProductBySku(sku) {
    return { product: null, rateLimitRemaining: 100, rateLimitResetMs: 0 };
  }
}

// ── Suite ───────────────────────────────────────────────────

describe('Skulytics Sync Pipeline (integration)', () => {
  let mockApi;
  let mockNotifier;

  // ── Global setup / teardown ─────────────────────────────

  beforeAll(async () => {
    testPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // Fall back to individual env vars used by the project
      host: process.env.DATABASE_URL ? undefined : process.env.DB_HOST,
      port: process.env.DATABASE_URL ? undefined : (parseInt(process.env.DB_PORT) || 5432),
      user: process.env.DATABASE_URL ? undefined : process.env.DB_USER,
      password: process.env.DATABASE_URL ? undefined : process.env.DB_PASSWORD,
      database: process.env.DATABASE_URL ? undefined : process.env.DB_NAME,
      ssl: { rejectUnauthorized: false },
      max: 5,
      statement_timeout: 30000,
    });

    // Verify connection
    await testPool.query('SELECT 1');

    // Run UP migrations (only the ones needed for sync pipeline)
    for (const file of UP_FILES) {
      await runMigrationFile(testPool, file);
    }
  }, 30000);

  afterAll(async () => {
    // Run DOWN migrations in reverse
    for (const file of DOWN_FILES) {
      try {
        await runMigrationFile(testPool, file);
      } catch (err) {
        console.warn(`[teardown] ${file}: ${err.message}`);
      }
    }
    await testPool.end();
  }, 30000);

  // ── Per-test cleanup ────────────────────────────────────

  beforeEach(async () => {
    // Truncate in FK-safe order
    await testPool.query(`
      TRUNCATE skulytics_sync_sku_log CASCADE;
      TRUNCATE skulytics_sync_runs CASCADE;
      TRUNCATE global_skulytics_products CASCADE;
    `);

    mockApi = new MockApiClient();
    mockNotifier = { sendAdminAlert: jest.fn() };
  });

  // ── Helper to build service ─────────────────────────────

  function buildService() {
    return new SkulyticsSyncService({
      pool: testPool,
      apiClient: mockApi,
      notificationService: mockNotifier,
    });
  }

  // ── Assertion helpers ───────────────────────────────────

  async function getProductCount() {
    const { rows } = await testPool.query('SELECT COUNT(*)::int AS count FROM global_skulytics_products');
    return rows[0].count;
  }

  async function getSyncRun(runId) {
    const { rows } = await testPool.query('SELECT * FROM skulytics_sync_runs WHERE id = $1', [runId]);
    return rows[0];
  }

  async function getAllProducts() {
    const { rows } = await testPool.query('SELECT * FROM global_skulytics_products ORDER BY sku');
    return rows;
  }

  // ════════════════════════════════════════════════════════
  // TEST 1: Full sync happy path
  // ════════════════════════════════════════════════════════

  test('1. Full sync happy path — 3 pages of 10 products', async () => {
    mockApi.setPages([
      makeProductPage(1, 10, 'cursor-page-2'),
      makeProductPage(11, 10, 'cursor-page-3'),
      makeProductPage(21, 10, null),            // last page, no more
    ]);

    const service = buildService();
    const result = await service.runIncrementalSync('test');

    // Verify sync result
    expect(result.status).toBe('completed');
    expect(result.processed).toBe(30);
    expect(result.created).toBe(30);
    expect(result.failed).toBe(0);

    // Verify DB state
    const count = await getProductCount();
    expect(count).toBe(30);

    // Verify sync run record
    const run = await getSyncRun(result.runId);
    expect(run.status).toBe('completed');
    expect(run.processed).toBe(30);
    expect(run.failed).toBe(0);
    expect(run.completed_at).not.toBeNull();

    // Verify all products are not stale (just synced)
    const products = await getAllProducts();
    const staleProducts = products.filter(p => p.is_stale);
    expect(staleProducts).toHaveLength(0);
  }, 30000);

  // ════════════════════════════════════════════════════════
  // TEST 2: Cursor resume on mid-sync crash
  // ════════════════════════════════════════════════════════

  test('2. Cursor resume — page 2 fails, second run resumes from cursor', async () => {
    // First run: page 1 succeeds, page 2 throws non-retryable API error
    mockApi.setPages([
      makeProductPage(1, 10, 'cursor-page-2'),
      new SkulyticsApiError('Bad Request from Skulytics', 400, null),
    ]);

    const service1 = buildService();
    const result1 = await service1.runIncrementalSync('test-run-1');

    // First run should be 'failed' — page 1 was committed but page 2 blew up
    expect(result1.status).toBe('failed');
    expect(result1.processed).toBe(10);

    // Verify cursor was persisted after page 1
    const run1 = await getSyncRun(result1.runId);
    expect(run1.api_cursor).toBe('cursor-page-2');

    // 10 products in DB from first batch
    expect(await getProductCount()).toBe(10);

    // Manually mark run1 as 'completed' so cursor resume works
    // (in real usage, partial runs with cursor would need retry logic
    //  or the operator would fix the issue and re-run)
    await testPool.query(
      `UPDATE skulytics_sync_runs SET status = 'completed' WHERE id = $1`,
      [result1.runId]
    );

    // Second run: should start from 'cursor-page-2', get remaining 20
    const mockApi2 = new MockApiClient();
    mockApi2.setPages([
      makeProductPage(11, 10, 'cursor-page-3'),
      makeProductPage(21, 10, null),
    ]);

    const service2 = new SkulyticsSyncService({
      pool: testPool,
      apiClient: mockApi2,
      notificationService: mockNotifier,
    });
    const result2 = await service2.runIncrementalSync('test-run-2');

    expect(result2.status).toBe('completed');
    expect(result2.processed).toBe(20);

    // Verify second run started from persisted cursor
    expect(mockApi2.getProductsCalls[0].cursor).toBe('cursor-page-2');

    // Total: 10 + 20 = 30 products
    expect(await getProductCount()).toBe(30);
  }, 30000);

  // ════════════════════════════════════════════════════════
  // TEST 3: Idempotent upsert
  // ════════════════════════════════════════════════════════

  test('3. Idempotent upsert — second sync does not duplicate rows', async () => {
    const products = makeProductPage(1, 10, null);

    // First sync
    mockApi.setPages([products]);
    const service = buildService();
    const result1 = await service.runIncrementalSync('test-idempotent-1');

    expect(result1.status).toBe('completed');
    expect(result1.created).toBe(10);
    expect(await getProductCount()).toBe(10);

    // Capture updated_at from first sync
    const productsAfterFirst = await getAllProducts();
    const firstUpdatedAts = productsAfterFirst.map(p => p.updated_at.toISOString());

    // Small delay to ensure updated_at can differ
    await new Promise(r => setTimeout(r, 50));

    // Second sync with identical data
    const mockApi2 = new MockApiClient();
    mockApi2.setPages([products]);
    const service2 = new SkulyticsSyncService({
      pool: testPool,
      apiClient: mockApi2,
      notificationService: mockNotifier,
    });
    const result2 = await service2.runIncrementalSync('test-idempotent-2');

    expect(result2.status).toBe('completed');
    expect(result2.processed).toBe(10);
    // All went through ON CONFLICT UPDATE path
    expect(result2.updated).toBe(10);
    expect(result2.created).toBe(0);

    // Count stays at 10 — no duplicates
    expect(await getProductCount()).toBe(10);

    // updated_at should have changed (trigger fires on update)
    const productsAfterSecond = await getAllProducts();
    const secondUpdatedAts = productsAfterSecond.map(p => p.updated_at.toISOString());

    // At least some should differ (trigger sets updated_at = NOW())
    const anyChanged = secondUpdatedAts.some((ts, i) => ts !== firstUpdatedAts[i]);
    expect(anyChanged).toBe(true);
  }, 30000);

  // ════════════════════════════════════════════════════════
  // TEST 4: Discontinued product handling
  // ════════════════════════════════════════════════════════

  test('4. Discontinued product — active → discontinued sets is_discontinued and discontinued_at', async () => {
    // First sync: product is active
    const activeProduct = makeRawProduct(1, { discontinued: false });
    mockApi.setPages([{
      products: [activeProduct],
      nextCursor: null,
      hasMore: false,
      rateLimitRemaining: 100,
      rateLimitResetMs: 0,
    }]);

    const service = buildService();
    await service.runIncrementalSync('test-disc-1');

    // Verify active state
    let products = await getAllProducts();
    expect(products).toHaveLength(1);
    expect(products[0].is_discontinued).toBe(false);
    expect(products[0].discontinued_at).toBeNull();

    // Second sync: same product, now discontinued
    const discontinuedProduct = makeRawProduct(1, { discontinued: true });
    const mockApi2 = new MockApiClient();
    mockApi2.setPages([{
      products: [discontinuedProduct],
      nextCursor: null,
      hasMore: false,
      rateLimitRemaining: 100,
      rateLimitResetMs: 0,
    }]);

    const service2 = new SkulyticsSyncService({
      pool: testPool,
      apiClient: mockApi2,
      notificationService: mockNotifier,
    });
    await service2.runIncrementalSync('test-disc-2');

    // Verify discontinued state
    products = await getAllProducts();
    expect(products).toHaveLength(1);
    expect(products[0].is_discontinued).toBe(true);
    expect(products[0].discontinued_at).not.toBeNull();
    expect(new Date(products[0].discontinued_at).getTime()).toBeGreaterThan(0);
  }, 30000);

  // ════════════════════════════════════════════════════════
  // TEST 5: Rate limit backoff
  // ════════════════════════════════════════════════════════

  test('5. Rate limit backoff — retries after SkulyticsRateLimitError, completes', async () => {
    // First call: rate limit error (retryAfterMs=100 so test is fast)
    // Second call: succeeds with products
    // Third call (retry of the same page): note the service retries internally
    const rateLimitError = new SkulyticsRateLimitError(100);
    const successPage = makeProductPage(1, 10, null);

    // The retry logic is inside _fetchPageWithRetry, which will call getProducts
    // multiple times for the same page. So we need:
    //   call 0: throw rate limit
    //   call 1: return success page
    mockApi.setPages([
      rateLimitError,   // first attempt → 429
      successPage,      // retry → success
    ]);

    const service = buildService();
    const result = await service.runIncrementalSync('test-ratelimit');

    expect(result.status).toBe('completed');
    expect(result.processed).toBe(10);
    expect(result.rateLimitHits).toBeGreaterThanOrEqual(1);

    // Verify sync run recorded the rate limit hits
    const run = await getSyncRun(result.runId);
    expect(run.rate_limit_hits).toBeGreaterThanOrEqual(1);
  }, 30000);

  // ════════════════════════════════════════════════════════
  // TEST 6: Snapshot immutability
  // ════════════════════════════════════════════════════════

  test('6. Snapshot immutability — Object.freeze prevents mutation', () => {
    const mockGlobalProduct = {
      skulytics_id: 'SKU-FREEZE-001',
      api_schema_version: 'v1',
      sku: 'FREEZE-001',
      upc: '999888777666',
      brand: 'FrozenBrand',
      model_number: 'FB-100',
      model_name: 'Frozen Product 100',
      category_slug: 'test-category',
      msrp: 599.99,
      currency: 'CAD',
      weight_kg: 25.0,
      width_cm: 60.0,
      height_cm: 90.0,
      depth_cm: 70.0,
      variant_group_id: null,
      variant_type: null,
      variant_value: null,
      last_synced_at: '2026-02-17T04:00:00.000Z',
      specs: { voltage: '120V' },
      images: [{ url: 'https://img.test.com/1.jpg', type: 'primary', sort_order: 0 }],
      warranty: { years: 2 },
      buyback_value: 75.0,
    };

    const snapshot = buildQuoteSnapshot(mockGlobalProduct);

    // Object is frozen
    expect(Object.isFrozen(snapshot)).toBe(true);

    // Attempting to mutate throws TypeError in strict mode
    expect(() => { snapshot.brand = 'HACKED'; }).toThrow(TypeError);

    // snapshot_taken_at is valid ISO string
    expect(snapshot.snapshot_taken_at).toBeDefined();
    const parsed = new Date(snapshot.snapshot_taken_at);
    expect(parsed.toISOString()).toBe(snapshot.snapshot_taken_at);

    // Verify key fields came through
    expect(snapshot.skulytics_id).toBe('SKU-FREEZE-001');
    expect(snapshot.brand).toBe('FrozenBrand');
    expect(snapshot.msrp_at_quote).toBe(599.99);
    expect(snapshot.skulytics_snapshot_version).toBe('v1');
  });
});
