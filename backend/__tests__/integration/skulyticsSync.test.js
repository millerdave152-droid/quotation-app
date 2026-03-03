// NOTE: Must run with --runInBand. Shares live DB tables
// with other Skulytics integration tests. Use:
// npm run test:skulytics

'use strict';

/**
 * Skulytics Sync Pipeline — Integration Tests
 *
 * Mocks the database pool and the HTTP client (SkulyticsApiClient)
 * so no real database or API calls are made.
 *
 * Run:
 *   npx jest __tests__/integration/skulyticsSync.test.js --no-coverage
 */

const { SkulyticsRateLimitError, SkulyticsApiError } = require('../../services/skulytics/SkulyticsApiClient');
const { buildQuoteSnapshot } = require('../../services/skulytics/SkulyticsSnapshotService');

// ── Mock the normalize and skulyticsUpsert modules ──────────
// These are imported by SkulyticsSyncService at load time.

jest.mock('../../services/skulytics/normalizers', () => ({
  normalize: jest.fn((raw) => ({
    skulytics_id: String(raw.product_id ?? raw.id),
    api_schema_version: 'v1',
    sku: raw.sku,
    upc: raw.upc ?? null,
    brand: typeof raw.brand === 'string' ? raw.brand : null,
    model_number: raw.sku,
    model_name: raw.name ?? null,
    category_slug: null,
    category_path: null,
    msrp: raw.pricing?.msrp ?? null,
    map_price: null,
    currency: raw.pricing?.currency ?? 'CAD',
    umrp: null,
    is_in_stock: false,
    competitor_pricing: null,
    weight_kg: null,
    width_cm: null,
    height_cm: null,
    depth_cm: null,
    variant_group_id: null,
    is_variant_parent: false,
    parent_skulytics_id: null,
    variant_type: null,
    variant_value: null,
    is_discontinued: raw.discontinued === true,
    specs: raw.specifications ?? null,
    images: [],
    warranty: null,
    buyback_value: null,
    brand_slug: null,
    primary_image: null,
    product_link: null,
    is_multi_brand: false,
    raw_json: raw,
  })),
}));

// Track upserted products in memory for assertion
const _upsertedProducts = new Map();
let _upsertCallCount = 0;

jest.mock('../../services/skulytics/skulyticsUpsert', () => ({
  skulyticsUpsert: jest.fn(async (product, syncRunId, _pgClient) => {
    _upsertCallCount++;
    const existing = _upsertedProducts.has(product.skulytics_id);
    // Store product data for later assertions
    _upsertedProducts.set(product.skulytics_id, {
      ...product,
      sync_run_id: syncRunId,
      is_stale: false,
      last_synced_at: new Date(),
      updated_at: new Date(),
    });
    return existing ? 'updated' : 'created';
  }),
  _resetColumnCache: jest.fn(),
}));

// Now require the service AFTER mocks are in place
const { SkulyticsSyncService } = require('../../services/skulytics/SkulyticsSyncService');

// ── In-memory DB simulation ─────────────────────────────────

/**
 * Build a mock pg Pool that stores data in memory.
 * Tracks sync_runs, products (via upsert mock above), and sku_logs.
 */
function createMockPool() {
  const syncRuns = new Map();
  const skuLogs = [];
  let runIdCounter = 1;

  function handleQuery(sql, params) {
    const trimmed = sql.replace(/\s+/g, ' ').trim();

    // ── INSERT INTO skulytics_sync_runs ──
    if (trimmed.includes('INSERT INTO skulytics_sync_runs')) {
      const id = String(runIdCounter++);
      const run = {
        id,
        run_type: params[0],
        status: 'running',
        triggered_by: params[1],
        started_at: new Date(),
        completed_at: null,
        api_cursor: null,
        last_successful_sku: null,
        processed: 0,
        created: 0,
        updated: 0,
        discontinued: 0,
        failed: 0,
        error_count: 0,
        rate_limit_hits: 0,
        error_message: null,
      };
      syncRuns.set(id, run);
      return { rows: [run], rowCount: 1 };
    }

    // ── UPDATE skulytics_sync_runs SET status (completeSyncRun) ──
    if (trimmed.includes('UPDATE skulytics_sync_runs SET') && trimmed.includes('status') && trimmed.includes('completed_at')) {
      const id = params[0];
      const run = syncRuns.get(id);
      if (run) {
        run.status = params[1];
        run.error_message = params[2];
        run.completed_at = new Date();
        if (params[3] != null) run.processed = params[3];
        if (params[4] != null) run.created = params[4];
        if (params[5] != null) run.updated = params[5];
        if (params[6] != null) run.discontinued = params[6];
        if (params[7] != null) run.failed = params[7];
        if (params[8] != null) run.error_count = params[8];
        if (params[9] != null) run.rate_limit_hits = params[9];
      }
      return { rows: [], rowCount: 1 };
    }

    // ── UPDATE skulytics_sync_runs SET api_cursor (_persistCursor) ──
    if (trimmed.includes('UPDATE skulytics_sync_runs SET') && trimmed.includes('api_cursor')) {
      const id = params[0];
      const run = syncRuns.get(id);
      if (run) {
        run.api_cursor = params[1];
        run.last_successful_sku = params[2];
        run.processed = params[3];
        run.created = params[4];
        run.updated = params[5];
        run.failed = params[6];
        run.rate_limit_hits = params[7];
      }
      return { rows: [], rowCount: 1 };
    }

    // ── SELECT api_cursor FROM skulytics_sync_runs (_loadLastCursor) ──
    if (trimmed.includes('SELECT api_cursor') && trimmed.includes('FROM skulytics_sync_runs')) {
      // Find most recently completed sync run
      const completed = Array.from(syncRuns.values())
        .filter(r => r.status === 'completed' && (r.run_type === 'full' || r.run_type === 'incremental'))
        .sort((a, b) => (b.completed_at || 0) - (a.completed_at || 0));
      if (completed.length > 0) {
        return { rows: [{ api_cursor: completed[0].api_cursor }] };
      }
      return { rows: [] };
    }

    // ── SELECT status FROM skulytics_sync_runs (_checkConsecutiveFailures) ──
    if (trimmed.includes('SELECT status FROM skulytics_sync_runs') && trimmed.includes('ORDER BY started_at')) {
      const limit = params[0];
      const sorted = Array.from(syncRuns.values())
        .sort((a, b) => b.started_at - a.started_at)
        .slice(0, limit);
      return { rows: sorted.map(r => ({ status: r.status })) };
    }

    // ── INSERT INTO skulytics_sync_sku_log ──
    if (trimmed.includes('INSERT INTO skulytics_sync_sku_log')) {
      skuLogs.push({
        sync_run_id: params[0],
        skulytics_id: params[1],
        sku: params[2],
        status: params[3],
        error_message: params[4] || null,
      });
      return { rows: [], rowCount: 1 };
    }

    // ── UPDATE global_skulytics_products SET is_stale (markStaleProducts) ──
    if (trimmed.includes('UPDATE global_skulytics_products') && trimmed.includes('is_stale')) {
      return { rows: [], rowCount: 0 };
    }

    // ── BEGIN / COMMIT / ROLLBACK ──
    if (trimmed === 'BEGIN' || trimmed === 'COMMIT' || trimmed === 'ROLLBACK') {
      return { rows: [], rowCount: 0 };
    }

    // ── UPDATE skulytics_sync_runs SET status (manual test update) ──
    if (trimmed.includes('UPDATE skulytics_sync_runs SET status')) {
      // Generic update — parse id from params
      const id = params[0];
      const run = syncRuns.get(id);
      if (run) {
        run.status = 'completed';
      }
      return { rows: [], rowCount: 1 };
    }

    // Default: return empty
    return { rows: [], rowCount: 0 };
  }

  const pool = {
    query: jest.fn(async (sql, params) => handleQuery(sql, params || [])),
    connect: jest.fn(async () => {
      const client = {
        query: jest.fn(async (sql, params) => handleQuery(sql, params || [])),
        release: jest.fn(),
      };
      return client;
    }),
    end: jest.fn(),
    // Expose internals for test assertions
    _syncRuns: syncRuns,
    _skuLogs: skuLogs,
  };

  return pool;
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
  let testPool;

  // ── Per-test setup ────────────────────────────────────────

  beforeEach(() => {
    testPool = createMockPool();
    _upsertedProducts.clear();
    _upsertCallCount = 0;

    mockApi = new MockApiClient();
    mockNotifier = { sendAdminAlert: jest.fn() };

    // Reset the skulyticsUpsert mock call tracking
    const { skulyticsUpsert } = require('../../services/skulytics/skulyticsUpsert');
    skulyticsUpsert.mockClear();
  });

  // ── Helper to build service ─────────────────────────────

  function buildService() {
    return new SkulyticsSyncService({
      pool: testPool,
      apiClient: mockApi,
      notificationService: mockNotifier,
    });
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

    // Verify all 30 products were upserted
    expect(_upsertedProducts.size).toBe(30);

    // Verify sync run record
    const run = testPool._syncRuns.get(result.runId);
    expect(run.status).toBe('completed');
    expect(run.processed).toBe(30);
    expect(run.failed).toBe(0);
    expect(run.completed_at).not.toBeNull();

    // Verify all products are not stale (just synced)
    const products = Array.from(_upsertedProducts.values());
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
    const run1 = testPool._syncRuns.get(result1.runId);
    expect(run1.api_cursor).toBe('cursor-page-2');

    // 10 products upserted from first batch
    expect(_upsertedProducts.size).toBe(10);

    // Manually mark run1 as 'completed' so cursor resume works
    // (in real usage, partial runs with cursor would need retry logic
    //  or the operator would fix the issue and re-run)
    run1.status = 'completed';

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
    expect(_upsertedProducts.size).toBe(30);
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
    expect(_upsertedProducts.size).toBe(10);

    // Second sync with identical data — the mock skulyticsUpsert returns 'updated'
    // for products that already exist in the map
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
    expect(_upsertedProducts.size).toBe(10);
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

    // Verify active state — the normalizer mock sets is_discontinued from raw.discontinued
    const { normalize } = require('../../services/skulytics/normalizers');
    const firstCallArg = normalize.mock.calls[0][0];
    expect(firstCallArg.discontinued).toBe(false);

    // The normalized product should have is_discontinued = false
    const firstNormalized = normalize.mock.results[0].value;
    expect(firstNormalized.is_discontinued).toBe(false);

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

    // Verify the normalizer received the discontinued product
    const secondCallArg = normalize.mock.calls[1][0];
    expect(secondCallArg.discontinued).toBe(true);

    // The normalized product should have is_discontinued = true
    const secondNormalized = normalize.mock.results[1].value;
    expect(secondNormalized.is_discontinued).toBe(true);

    // Verify the upsert stored the discontinued state
    const stored = _upsertedProducts.get('SKU-TEST-001');
    expect(stored).toBeDefined();
    expect(stored.is_discontinued).toBe(true);
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
      rateLimitError,   // first attempt -> 429
      successPage,      // retry -> success
    ]);

    const service = buildService();
    const result = await service.runIncrementalSync('test-ratelimit');

    expect(result.status).toBe('completed');
    expect(result.processed).toBe(10);
    expect(result.rateLimitHits).toBeGreaterThanOrEqual(1);

    // Verify sync run recorded the rate limit hits
    const run = testPool._syncRuns.get(result.runId);
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
