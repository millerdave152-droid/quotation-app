/**
 * Test: Discount on high-margin products gets auto-approved
 * Verifies that discounts within tier limits on products with healthy margins
 * are approved without requiring escalation.
 */
require('dotenv').config();
const http = require('http');

const BASE = 'http://localhost:3001/api';

function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + path);
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (token) opts.headers['Authorization'] = `Bearer ${token}`;

    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function login(email, password) {
  const res = await request('POST', '/auth/login', { email, password });
  const token = res.body?.data?.accessToken || res.body?.accessToken || res.body?.token;
  if (res.status !== 200 || !token) {
    throw new Error(`Login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return token;
}

let passed = 0;
let failed = 0;
function assert(condition, label, detail) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}`);
    if (detail) console.log(`     ${detail}`);
    failed++;
  }
}

async function run() {
  console.log('=== Test: High-Margin Discount Auto-Approval ===\n');

  const { Pool } = require('pg');
  const pool = new Pool({
    host: process.env.DB_HOST, port: process.env.DB_PORT,
    database: process.env.DB_NAME, user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, ssl: { rejectUnauthorized: false },
  });

  // --- Setup: Find a high-margin product ---
  console.log('--- Setup: Finding test products ---');

  // Product with margin >= 30% (high-margin per tier config)
  const highMarginResult = await pool.query(`
    SELECT id, name, price, cost, cost_cents, msrp_cents,
           CASE WHEN price > 0 THEN price
                WHEN msrp_cents > 0 THEN msrp_cents / 100.0
                ELSE 0 END AS effective_price,
           CASE WHEN cost > 0 THEN cost
                WHEN cost_cents > 0 THEN cost_cents / 100.0
                ELSE 0 END AS effective_cost
    FROM products
    WHERE (price > 0 OR msrp_cents > 0)
      AND (cost > 0 OR cost_cents > 0)
    ORDER BY id
    LIMIT 200
  `);

  // Find a product with >= 35% margin (comfortably high)
  let highMarginProduct = null;
  let standardMarginProduct = null;

  for (const p of highMarginResult.rows) {
    const price = parseFloat(p.effective_price);
    const cost = parseFloat(p.effective_cost);
    if (price <= 0 || cost <= 0 || cost >= price) continue;
    const margin = ((price - cost) / price) * 100;

    if (margin >= 35 && !highMarginProduct) {
      highMarginProduct = { ...p, effectivePrice: price, effectiveCost: cost, margin: margin.toFixed(1) };
    }
    if (margin >= 20 && margin < 30 && !standardMarginProduct) {
      standardMarginProduct = { ...p, effectivePrice: price, effectiveCost: cost, margin: margin.toFixed(1) };
    }
    if (highMarginProduct && standardMarginProduct) break;
  }

  assert(!!highMarginProduct, `Found high-margin product (>= 35%)`,
    highMarginProduct ? `${highMarginProduct.name} — $${highMarginProduct.effectivePrice}, cost $${highMarginProduct.effectiveCost}, margin ${highMarginProduct.margin}%` : 'None found');
  assert(!!standardMarginProduct, `Found standard-margin product (20-30%)`,
    standardMarginProduct ? `${standardMarginProduct.name} — $${standardMarginProduct.effectivePrice}, cost $${standardMarginProduct.effectiveCost}, margin ${standardMarginProduct.margin}%` : 'None found');

  if (!highMarginProduct || !standardMarginProduct) {
    console.log('\n⚠️  Cannot continue without test products');
    await pool.end();
    process.exit(1);
  }

  console.log(`\n  High-margin: "${highMarginProduct.name.substring(0, 50)}" ($${highMarginProduct.effectivePrice}, margin ${highMarginProduct.margin}%)`);
  console.log(`  Standard:    "${standardMarginProduct.name.substring(0, 50)}" ($${standardMarginProduct.effectivePrice}, margin ${standardMarginProduct.margin}%)\n`);

  // --- Login ---
  console.log('--- Login ---');
  const staffResult = await pool.query(
    "SELECT id, email, role FROM users WHERE role = 'user' AND is_active = true LIMIT 1"
  );
  const staffUser = staffResult.rows[0];
  if (!staffUser) throw new Error('No staff user found');
  const staffToken = await login(staffUser.email, 'TestPass123!');
  console.log(`  Logged in as: ${staffUser.email} (role=${staffUser.role})\n`);

  // Initialize budget
  await request('POST', '/discount-authority/budget/initialize', {}, staffToken);

  // --- Get tier config for reference ---
  const tierRes = await request('GET', '/discount-authority/my-tier', null, staffToken);
  assert(tierRes.status === 200, 'Fetched tier config');
  const tier = tierRes.body?.data?.tier;
  const budget = tierRes.body?.data?.budget;
  if (tier) {
    console.log(`  Tier: standard max=${tier.max_discount_pct_standard}%, high-margin max=${tier.max_discount_pct_high_margin}%`);
    console.log(`  High-margin threshold=${tier.high_margin_threshold}%, approval below margin=${tier.requires_approval_below_margin}%`);
    console.log(`  Min margin floor=${tier.min_margin_floor_pct}%\n`);
  }

  // ============================================================
  // TEST 1: High-margin product — small discount — should APPROVE
  // ============================================================
  console.log('--- Test 1: High-margin product, 3% discount → should approve ---');

  const validate1 = await request('POST', '/discount-authority/validate', {
    product_id: highMarginProduct.id,
    proposed_discount_pct: 3,
  }, staffToken);

  console.log(`  Validate response: allowed=${validate1.body?.allowed}, reason="${validate1.body?.reason}"`);
  if (validate1.body?.calculations) {
    const c = validate1.body.calculations;
    console.log(`  Calculations: price=$${c.original_price}, cost=$${c.product_cost}, margin_before=${c.margin_before_discount_pct}%, margin_after=${c.margin_after_discount_pct}%`);
  }

  assert(validate1.status === 200, 'Validate returned 200');
  assert(validate1.body?.allowed === true, 'Discount ALLOWED (3% on high-margin)',
    validate1.body?.allowed === false ? `Rejected: ${validate1.body?.reason}` : '');

  // Apply it
  const apply1 = await request('POST', '/discount-authority/apply', {
    productId: highMarginProduct.id,
    originalPrice: highMarginProduct.effectivePrice,
    cost: highMarginProduct.effectiveCost,
    discountPct: 3,
    reason: 'test-high-margin-approval',
  }, staffToken);

  console.log(`  Apply response: approved=${apply1.body?.data?.approved}, txId=${apply1.body?.data?.transactionId}`);

  assert(apply1.status === 200, 'Apply returned 200');
  assert(apply1.body?.data?.approved === true, 'Discount APPLIED successfully');
  assert(apply1.body?.data?.transactionId != null, 'Transaction ID returned');

  // ============================================================
  // TEST 2: Standard-margin product — small discount — should APPROVE
  // ============================================================
  console.log('\n--- Test 2: Standard-margin product, 2% discount → should approve ---');

  const validate2 = await request('POST', '/discount-authority/validate', {
    product_id: standardMarginProduct.id,
    proposed_discount_pct: 2,
  }, staffToken);

  console.log(`  Validate response: allowed=${validate2.body?.allowed}, reason="${validate2.body?.reason}"`);
  if (validate2.body?.calculations) {
    const c = validate2.body.calculations;
    console.log(`  Calculations: price=$${c.original_price}, cost=$${c.product_cost}, margin_before=${c.margin_before_discount_pct}%, margin_after=${c.margin_after_discount_pct}%`);
  }

  assert(validate2.status === 200, 'Validate returned 200');
  assert(validate2.body?.allowed === true, 'Discount ALLOWED (2% on standard-margin)',
    validate2.body?.allowed === false ? `Rejected: ${validate2.body?.reason}` : '');

  const apply2 = await request('POST', '/discount-authority/apply', {
    productId: standardMarginProduct.id,
    originalPrice: standardMarginProduct.effectivePrice,
    cost: standardMarginProduct.effectiveCost,
    discountPct: 2,
    reason: 'test-standard-margin-approval',
  }, staffToken);

  assert(apply2.status === 200, 'Apply returned 200');
  assert(apply2.body?.data?.approved === true, 'Discount APPLIED successfully');

  // ============================================================
  // TEST 3: High-margin product at max tier limit — should APPROVE
  // ============================================================
  const highMax = parseFloat(tier?.max_discount_pct_high_margin) || 10;
  console.log(`\n--- Test 3: High-margin product, ${highMax}% (tier max) → should approve ---`);

  const validate3 = await request('POST', '/discount-authority/validate', {
    product_id: highMarginProduct.id,
    proposed_discount_pct: highMax,
  }, staffToken);

  console.log(`  Validate response: allowed=${validate3.body?.allowed}, reason="${validate3.body?.reason}"`);
  if (validate3.body?.calculations) {
    const c = validate3.body.calculations;
    console.log(`  Margin after ${highMax}%: ${c.margin_after_discount_pct}%`);
  }

  assert(validate3.body?.allowed === true, `Discount ALLOWED at tier max (${highMax}%)`,
    validate3.body?.allowed === false ? `Rejected: ${validate3.body?.reason}` : '');

  // ============================================================
  // TEST 4: Exceeding tier limit — should REJECT with escalation
  // ============================================================
  const overLimit = highMax + 1;
  console.log(`\n--- Test 4: High-margin product, ${overLimit}% (over limit) → should reject ---`);

  const validate4 = await request('POST', '/discount-authority/validate', {
    product_id: highMarginProduct.id,
    proposed_discount_pct: overLimit,
  }, staffToken);

  console.log(`  Validate response: allowed=${validate4.body?.allowed}, reason="${validate4.body?.reason}"`);

  assert(validate4.body?.allowed === false, `Discount REJECTED at ${overLimit}%`);
  assert(validate4.body?.escalation_required === true, 'Escalation required flag set');

  // ============================================================
  // TEST 5: Verify auto-approved transaction has correct DB record
  // ============================================================
  console.log('\n--- Test 5: Verify DB records ---');

  if (apply1.body?.data?.transactionId) {
    const txResult = await pool.query(
      'SELECT * FROM discount_transactions WHERE id = $1', [apply1.body.data.transactionId]
    );
    const tx = txResult.rows[0];
    assert(!!tx, 'Transaction record exists in DB');
    assert(tx?.was_auto_approved === true, 'was_auto_approved = true');
    assert(tx?.approved_by === null, 'approved_by = null (auto-approved, no manager)');
    assert(parseFloat(tx?.discount_pct) === 3, 'discount_pct = 3');
    assert(tx?.approval_reason === 'test-high-margin-approval', 'approval_reason matches');
  }

  // Check audit log
  const auditResult = await pool.query(
    "SELECT * FROM audit_log WHERE action = 'discount_apply' AND entity_id = $1 ORDER BY created_at DESC LIMIT 1",
    [apply1.body?.data?.transactionId]
  );
  assert(auditResult.rows.length >= 1, 'Audit log entry created for approved discount');

  // ============================================================
  // Summary
  // ============================================================
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
  console.log(`${'='.repeat(50)}`);

  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Test error:', err.message);
  process.exit(1);
});
