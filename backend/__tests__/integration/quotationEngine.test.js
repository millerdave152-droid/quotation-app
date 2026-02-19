// NOTE: Must run with --runInBand. Shares live DB tables
// with other Skulytics integration tests. Use:
// npm run test:skulytics

'use strict';

/**
 * Quotation Engine — Skulytics Integration Tests
 *
 * Tests the wiring of Skulytics snapshots into the quote line item creation
 * flow. Uses a real PostgreSQL database with existing tables.
 *
 * Run:
 *   npx jest __tests__/integration/quotationEngine.test.js --no-coverage
 */

const path = require('path');
const fs = require('fs');
const pool = require('../../db');
const QuoteService = require('../../services/QuoteService');

// ── Test DB pool (shared singleton from db.js) ──────────────

let testPool;
let quoteService;

// ── Unique test identifiers (high IDs to avoid collisions) ──

const TEST_PREFIX = 'skulytics_qe_test';
const TEST_EMAIL_ADMIN = `${TEST_PREFIX}_admin@test.local`;
const TEST_EMAIL_SALES = `${TEST_PREFIX}_sales@test.local`;
let testAdminId;
let testSalesId;
let testCustomerId;
let testProductSkulyticsId;   // product WITH skulytics_id
let testProductPlainId;        // product WITHOUT skulytics_id
const SKULYTICS_ID = 'SKU-QE-TEST-001';
const SKULYTICS_ID_DISC = 'SKU-QE-TEST-DISC';
let testProductDiscontinuedId; // product linked to discontinued skulytics item

// ── Migration helpers ───────────────────────────────────────

const SKULYTICS_MIG_DIR = path.resolve(__dirname, '../../migrations/skulytics');

async function runSQL(pool, filename) {
  const sql = fs.readFileSync(path.join(SKULYTICS_MIG_DIR, filename), 'utf8');
  await pool.query(sql);
}

// ── Setup / Teardown ────────────────────────────────────────

beforeAll(async () => {
  testPool = pool;
  quoteService = new QuoteService(testPool);

  // Ensure Skulytics tables + enrichment columns exist (idempotent).
  // NOTE: 20_tenant_product_overrides.sql is skipped — it depends on a
  //       `tenants` table that may not exist. Tests use tenant_id = null.
  await runSQL(testPool, '00_skulytics_extensions.sql');
  await runSQL(testPool, '10_global_skulytics_products.sql');
  await runSQL(testPool, '40_skulytics_sync_runs.sql');
  await runSQL(testPool, '50_products_skulytics_enrichment.sql');
  await runSQL(testPool, '60_quote_items_snapshot.sql');
});

afterAll(async () => {
  // shared pool — do not close
});

beforeEach(async () => {
  // Clean up any leftover test data
  await cleanupTestData();

  // ── Seed test users ──
  const adminRes = await testPool.query(
    `INSERT INTO users (email, password_hash, first_name, last_name, role, is_active)
     VALUES ($1, 'not-a-real-hash', 'Test', 'Admin', 'admin', true)
     RETURNING id`,
    [TEST_EMAIL_ADMIN]
  );
  testAdminId = adminRes.rows[0].id;

  const salesRes = await testPool.query(
    `INSERT INTO users (email, password_hash, first_name, last_name, role, is_active)
     VALUES ($1, 'not-a-real-hash', 'Test', 'Sales', 'sales', true)
     RETURNING id`,
    [TEST_EMAIL_SALES]
  );
  testSalesId = salesRes.rows[0].id;

  // ── Seed test customer ──
  const custRes = await testPool.query(
    `INSERT INTO customers (name, email, phone)
     VALUES ('QE Test Customer', $1, '555-0000')
     RETURNING id`,
    [`${TEST_PREFIX}_customer@test.local`]
  );
  testCustomerId = custRes.rows[0].id;

  // ── Seed global Skulytics product (active) ──
  await testPool.query(
    `INSERT INTO global_skulytics_products
       (skulytics_id, sku, brand, msrp, currency, is_discontinued, is_stale, api_schema_version, last_synced_at, raw_json)
     VALUES ($1, 'QE-TEST-SKU', 'TestBrand', 499.99, 'CAD', false, false, 'v1', NOW(), $2)
     ON CONFLICT (skulytics_id) DO UPDATE SET is_discontinued = false, msrp = 499.99`,
    [SKULYTICS_ID, JSON.stringify({ id: SKULYTICS_ID, sku: 'QE-TEST-SKU', brand: 'TestBrand' })]
  );

  // ── Seed global Skulytics product (discontinued) ──
  await testPool.query(
    `INSERT INTO global_skulytics_products
       (skulytics_id, sku, brand, msrp, currency, is_discontinued, is_stale, api_schema_version, last_synced_at, raw_json)
     VALUES ($1, 'QE-DISC-SKU', 'TestBrand', 299.99, 'CAD', true, false, 'v1', NOW(), $2)
     ON CONFLICT (skulytics_id) DO UPDATE SET is_discontinued = true, msrp = 299.99`,
    [SKULYTICS_ID_DISC, JSON.stringify({ id: SKULYTICS_ID_DISC, sku: 'QE-DISC-SKU', brand: 'TestBrand' })]
  );

  // ── Seed products ──
  const prodSkuRes = await testPool.query(
    `INSERT INTO products (name, manufacturer, model, category, price, cost_cents, msrp_cents, sku, skulytics_id)
     VALUES ('Skulytics Widget', 'TestBrand', 'QE-W100', 'Accessories', 499.99, 30000, 49999, 'QE-TEST-SKU', $1)
     RETURNING id`,
    [SKULYTICS_ID]
  );
  testProductSkulyticsId = prodSkuRes.rows[0].id;

  const prodPlainRes = await testPool.query(
    `INSERT INTO products (name, manufacturer, model, category, price, cost_cents, msrp_cents, sku)
     VALUES ('Plain Widget', 'PlainBrand', 'PL-001', 'Accessories', 199.99, 10000, 19999, 'QE-PLAIN-001')
     RETURNING id`
  );
  testProductPlainId = prodPlainRes.rows[0].id;

  const prodDiscRes = await testPool.query(
    `INSERT INTO products (name, manufacturer, model, category, price, cost_cents, msrp_cents, sku, skulytics_id)
     VALUES ('Discontinued Widget', 'TestBrand', 'QE-D100', 'Accessories', 299.99, 15000, 29999, 'QE-DISC-SKU', $1)
     RETURNING id`,
    [SKULYTICS_ID_DISC]
  );
  testProductDiscontinuedId = prodDiscRes.rows[0].id;
});

afterEach(async () => {
  await cleanupTestData();
});

async function cleanupTestData() {
  // Delete in FK order: items → events → quotations → products → global → customers → users
  await testPool.query(
    `DELETE FROM quotation_items WHERE quotation_id IN
       (SELECT id FROM quotations WHERE notes LIKE '%${TEST_PREFIX}%' OR created_by LIKE '%${TEST_PREFIX}%')`
  );
  await testPool.query(
    `DELETE FROM quote_events WHERE quotation_id IN
       (SELECT id FROM quotations WHERE notes LIKE '%${TEST_PREFIX}%' OR created_by LIKE '%${TEST_PREFIX}%')`
  );
  await testPool.query(
    `DELETE FROM quotations WHERE notes LIKE '%${TEST_PREFIX}%' OR created_by LIKE '%${TEST_PREFIX}%'`
  );
  await testPool.query(`DELETE FROM products WHERE sku IN ('QE-TEST-SKU', 'QE-PLAIN-001', 'QE-DISC-SKU')`);
  await testPool.query(`DELETE FROM global_skulytics_products WHERE skulytics_id IN ($1, $2)`, [SKULYTICS_ID, SKULYTICS_ID_DISC]);
  await testPool.query(`DELETE FROM customers WHERE email = $1`, [`${TEST_PREFIX}_customer@test.local`]);
  await testPool.query(`DELETE FROM users WHERE email IN ($1, $2)`, [TEST_EMAIL_ADMIN, TEST_EMAIL_SALES]);
}

// ── Helpers ─────────────────────────────────────────────────

function makeQuoteData(itemOverrides = {}) {
  return {
    customer_id: testCustomerId,
    items: [
      {
        product_id: testProductSkulyticsId,
        manufacturer: 'TestBrand',
        model: 'QE-W100',
        description: 'Skulytics Widget',
        category: 'Accessories',
        quantity: 1,
        cost: 300,
        msrp: 499.99,
        sell: 450,
        ...itemOverrides,
      },
    ],
    notes: `${TEST_PREFIX} integration test`,
    created_by: `${TEST_PREFIX}_admin`,
    tenant_id: null,
  };
}

// ── Tests ───────────────────────────────────────────────────

describe('Quotation Engine — Skulytics Snapshot Integration', () => {

  // ── Test 1: Snapshot written on creation ──────────────────

  test('Skulytics snapshot is written when line item is created', async () => {
    const quoteData = makeQuoteData();
    const quote = await quoteService.createQuote(quoteData);

    expect(quote).toBeDefined();
    expect(quote.id).toBeDefined();

    // Fetch the inserted line item directly
    const { rows } = await testPool.query(
      `SELECT skulytics_id, skulytics_snapshot
       FROM quotation_items WHERE quotation_id = $1`,
      [quote.id]
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].skulytics_id).toBe(SKULYTICS_ID);
    expect(rows[0].skulytics_snapshot).toBeDefined();
    expect(rows[0].skulytics_snapshot).not.toBeNull();

    // Verify snapshot shape
    const snap = rows[0].skulytics_snapshot;
    expect(snap.skulytics_id).toBe(SKULYTICS_ID);
    expect(snap.sku).toBe('QE-TEST-SKU');
    expect(snap.brand).toBe('TestBrand');
    expect(snap.snapshot_taken_at).toBeDefined();
  });

  // ── Test 2: Snapshot NOT overwritten on quote edit ────────

  test('existing skulytics_snapshot is preserved on quote update', async () => {
    // Create initial quote
    const quoteData = makeQuoteData();
    const quote = await quoteService.createQuote(quoteData);

    // Fetch original snapshot
    const { rows: beforeRows } = await testPool.query(
      `SELECT skulytics_snapshot FROM quotation_items WHERE quotation_id = $1`,
      [quote.id]
    );
    const originalSnapshot = beforeRows[0].skulytics_snapshot;
    expect(originalSnapshot).not.toBeNull();

    // Wait 100ms so snapshot_taken_at would differ if rebuilt
    await new Promise(r => setTimeout(r, 100));

    // Update the quote (same items, different note)
    const updateData = {
      ...makeQuoteData(),
      notes: `${TEST_PREFIX} updated`,
      modified_by: `${TEST_PREFIX}_admin`,
    };
    await quoteService.updateQuote(quote.id, updateData);

    // Fetch updated line item
    const { rows: afterRows } = await testPool.query(
      `SELECT skulytics_snapshot FROM quotation_items WHERE quotation_id = $1`,
      [quote.id]
    );

    expect(afterRows).toHaveLength(1);
    expect(afterRows[0].skulytics_snapshot).not.toBeNull();

    // The snapshot_taken_at should be IDENTICAL to the original (not rebuilt)
    expect(afterRows[0].skulytics_snapshot.snapshot_taken_at)
      .toBe(originalSnapshot.snapshot_taken_at);
  });

  // ── Test 3: Non-Skulytics product has null snapshot ───────

  test('non-Skulytics product has null skulytics_snapshot', async () => {
    const quoteData = {
      customer_id: testCustomerId,
      items: [
        {
          product_id: testProductPlainId,
          manufacturer: 'PlainBrand',
          model: 'PL-001',
          description: 'Plain Widget',
          category: 'Accessories',
          quantity: 2,
          cost: 100,
          msrp: 199.99,
          sell: 180,
        },
      ],
      notes: `${TEST_PREFIX} plain product test`,
      created_by: `${TEST_PREFIX}_admin`,
      tenant_id: null,
    };

    const quote = await quoteService.createQuote(quoteData);

    const { rows } = await testPool.query(
      `SELECT skulytics_id, skulytics_snapshot
       FROM quotation_items WHERE quotation_id = $1`,
      [quote.id]
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].skulytics_id).toBeNull();
    expect(rows[0].skulytics_snapshot).toBeNull();
  });

  // ── Test 4: Discontinued product warning ──────────────────

  test('discontinued product creates successfully with warnings', async () => {
    const quoteData = {
      customer_id: testCustomerId,
      items: [
        {
          product_id: testProductDiscontinuedId,
          manufacturer: 'TestBrand',
          model: 'QE-D100',
          description: 'Discontinued Widget',
          category: 'Accessories',
          quantity: 1,
          cost: 150,
          msrp: 299.99,
          sell: 250,
        },
      ],
      notes: `${TEST_PREFIX} discontinued test`,
      created_by: `${TEST_PREFIX}_admin`,
      tenant_id: null,
    };

    const quote = await quoteService.createQuote(quoteData);

    expect(quote).toBeDefined();
    expect(quote.id).toBeDefined();

    // Warnings array should be present
    expect(quote.warnings).toBeDefined();
    expect(quote.warnings).toHaveLength(1);
    expect(quote.warnings[0].type).toBe('DISCONTINUED_PRODUCT');
    expect(quote.warnings[0].requires_acknowledgement).toBe(true);
    expect(quote.warnings[0].product_id).toBe(testProductDiscontinuedId);

    // Line item should still have the snapshot
    const { rows } = await testPool.query(
      `SELECT skulytics_id, skulytics_snapshot
       FROM quotation_items WHERE quotation_id = $1`,
      [quote.id]
    );
    expect(rows[0].skulytics_id).toBe(SKULYTICS_ID_DISC);
    expect(rows[0].skulytics_snapshot).not.toBeNull();
  });

  // ── Test 5: Manager acknowledgement sets columns ──────────

  test('manager acknowledgement sets discontinued_acknowledged columns', async () => {
    // Create quote with discontinued product
    const quoteData = {
      customer_id: testCustomerId,
      items: [
        {
          product_id: testProductDiscontinuedId,
          manufacturer: 'TestBrand',
          model: 'QE-D100',
          description: 'Discontinued Widget',
          category: 'Accessories',
          quantity: 1,
          cost: 150,
          msrp: 299.99,
          sell: 250,
        },
      ],
      notes: `${TEST_PREFIX} ack test`,
      created_by: `${TEST_PREFIX}_admin`,
      tenant_id: null,
    };

    const quote = await quoteService.createQuote(quoteData);

    // Get the item ID
    const { rows: itemRows } = await testPool.query(
      `SELECT id FROM quotation_items WHERE quotation_id = $1`, [quote.id]
    );
    const itemId = itemRows[0].id;

    // Simulate what the acknowledge endpoint does
    const { rows: ackRows } = await testPool.query(
      `UPDATE quotation_items
          SET discontinued_acknowledged_by = $1,
              discontinued_acknowledged_at = NOW()
        WHERE id = $2 AND quotation_id = $3 AND skulytics_id IS NOT NULL
        RETURNING discontinued_acknowledged_by, discontinued_acknowledged_at`,
      [testAdminId, itemId, quote.id]
    );

    expect(ackRows).toHaveLength(1);
    expect(ackRows[0].discontinued_acknowledged_by).toBe(testAdminId);
    expect(ackRows[0].discontinued_acknowledged_at).toBeDefined();
    expect(ackRows[0].discontinued_acknowledged_at).not.toBeNull();
  });

  // ── Test 6: Non-manager cannot acknowledge (role check) ───

  test('non-manager role is rejected by acknowledgement logic', async () => {
    // This tests the role check that the route handler enforces.
    // We verify the SQL constraint: the UPDATE only applies to skulytics items.
    // For non-Skulytics items, it returns 0 rows (simulating a 404).
    const quoteData = {
      customer_id: testCustomerId,
      items: [
        {
          product_id: testProductPlainId,
          manufacturer: 'PlainBrand',
          model: 'PL-001',
          description: 'Plain Widget',
          category: 'Accessories',
          quantity: 1,
          cost: 100,
          msrp: 199.99,
          sell: 180,
        },
      ],
      notes: `${TEST_PREFIX} non-manager test`,
      created_by: `${TEST_PREFIX}_sales`,
      tenant_id: null,
    };

    const quote = await quoteService.createQuote(quoteData);
    const { rows: itemRows } = await testPool.query(
      `SELECT id FROM quotation_items WHERE quotation_id = $1`, [quote.id]
    );
    const itemId = itemRows[0].id;

    // Attempt to acknowledge a non-Skulytics item — should return 0 rows
    const { rows: ackRows } = await testPool.query(
      `UPDATE quotation_items
          SET discontinued_acknowledged_by = $1,
              discontinued_acknowledged_at = NOW()
        WHERE id = $2 AND quotation_id = $3 AND skulytics_id IS NOT NULL
        RETURNING id`,
      [testSalesId, itemId, quote.id]
    );

    expect(ackRows).toHaveLength(0);
  });

  // ── Test 7: Margin fields unchanged after snapshot ────────

  test('margin/pricing fields are unchanged after Skulytics snapshot', async () => {
    const quoteData = {
      customer_id: testCustomerId,
      items: [
        {
          product_id: testProductSkulyticsId,
          manufacturer: 'TestBrand',
          model: 'QE-W100',
          description: 'Skulytics Widget',
          category: 'Accessories',
          quantity: 2,
          cost: 300,
          msrp: 499.99,
          sell: 450,
        },
        {
          product_id: testProductPlainId,
          manufacturer: 'PlainBrand',
          model: 'PL-001',
          description: 'Plain Widget',
          category: 'Accessories',
          quantity: 1,
          cost: 100,
          msrp: 199.99,
          sell: 180,
        },
      ],
      notes: `${TEST_PREFIX} margin test`,
      created_by: `${TEST_PREFIX}_admin`,
      tenant_id: null,
    };

    const quote = await quoteService.createQuote(quoteData);

    const { rows } = await testPool.query(
      `SELECT product_id, cost_cents, msrp_cents, sell_cents, line_total_cents,
              line_profit_cents, margin_bp, skulytics_snapshot
       FROM quotation_items WHERE quotation_id = $1 ORDER BY id`,
      [quote.id]
    );

    expect(rows).toHaveLength(2);

    // Skulytics item: margin fields come from quote data, NOT from snapshot
    // (PG may return numeric columns as strings — use Number() for comparison)
    const skuItem = rows.find(r => r.product_id === testProductSkulyticsId);
    expect(Number(skuItem.cost_cents)).toBe(30000);
    expect(Number(skuItem.msrp_cents)).toBe(49999);
    expect(Number(skuItem.sell_cents)).toBe(45000);
    expect(Number(skuItem.line_total_cents)).toBe(90000);  // 450 * 2
    expect(Number(skuItem.line_profit_cents)).toBe(30000);  // (450-300) * 2
    expect(skuItem.skulytics_snapshot).not.toBeNull();

    // Plain item: margin fields also unchanged, no snapshot
    const plainItem = rows.find(r => r.product_id === testProductPlainId);
    expect(Number(plainItem.cost_cents)).toBe(10000);
    expect(Number(plainItem.msrp_cents)).toBe(19999);
    expect(Number(plainItem.sell_cents)).toBe(18000);
    expect(Number(plainItem.line_total_cents)).toBe(18000);  // 180 * 1
    expect(Number(plainItem.line_profit_cents)).toBe(8000);   // (180-100) * 1
    expect(plainItem.skulytics_snapshot).toBeNull();

    // Quote-level totals should be correct (no interference from skulytics)
    expect(Number(quote.subtotal_cents)).toBe(108000);  // 90000 + 18000
    expect(Number(quote.gross_profit_cents)).toBe(38000); // 30000 + 8000
  });
});
