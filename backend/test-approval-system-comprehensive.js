#!/usr/bin/env node
/**
 * Comprehensive Approval System Test Suite
 *
 * Tests:
 *  1. Database schema verification
 *  2. API endpoint testing (CRUD, approve, deny, counter)
 *  3. Tier determination accuracy
 *  4. Counter-offer flow end-to-end
 *  5. Token generation & consumption
 *  6. Audit trail completeness
 *  7. Timeout handling
 *  8. Role authorization enforcement
 *  9. Delegation system
 *
 * Usage: node test-approval-system-comprehensive.js
 */

const http = require('http');
const pool = require('./db');

// ============================================================================
// CONFIG
// ============================================================================
const BASE = 'http://localhost:3001/api';
let ADMIN_TOKEN = null;
let MANAGER_TOKEN = null;
let SALESPERSON_TOKEN = null;
let ADMIN_USER = null;
let MANAGER_USER = null;
let SALESPERSON_USER = null;

const results = { passed: 0, failed: 0, skipped: 0, errors: [] };

// ============================================================================
// HTTP HELPER
// ============================================================================
function request(method, path, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path.startsWith('http') ? path : `${BASE}${path}`);
    const options = {
      hostname: url.hostname,
      port: url.port || 3001,
      path: url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000,
    };
    if (token) options.headers['Authorization'] = `Bearer ${token}`;

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(data); } catch { parsed = data; }
        resolve({ status: res.statusCode, data: parsed, headers: res.headers });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// ============================================================================
// TEST HELPERS
// ============================================================================
function test(name, passed, details = '') {
  if (passed) {
    results.passed++;
    console.log(`  ✅ ${name}`);
  } else {
    results.failed++;
    const msg = `${name}${details ? ': ' + details : ''}`;
    results.errors.push(msg);
    console.log(`  ❌ ${name}${details ? ' — ' + details : ''}`);
  }
}

function skip(name, reason) {
  results.skipped++;
  console.log(`  ⏭️  ${name} — SKIPPED: ${reason}`);
}

function section(title) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  ${title}`);
  console.log('='.repeat(70));
}

// ============================================================================
// 0. CHECK SERVER IS RUNNING
// ============================================================================
async function checkServer() {
  section('0. SERVER CONNECTIVITY');
  try {
    const res = await request('GET', '/auth/me');
    // 401 is fine - means the server is up
    test('Backend server is reachable on port 3001', res.status !== undefined);
    return true;
  } catch (err) {
    test('Backend server is reachable on port 3001', false, err.message);
    return false;
  }
}

// ============================================================================
// 1. DATABASE SCHEMA VERIFICATION
// ============================================================================
async function testDatabaseSchema() {
  section('1. DATABASE SCHEMA VERIFICATION');

  // Check approval_requests table
  const { rows: arCols } = await pool.query(
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_name = 'approval_requests' ORDER BY ordinal_position`
  );
  const arColNames = arCols.map(c => c.column_name);
  test('approval_requests table exists', arCols.length > 0);
  test('approval_requests has id column', arColNames.includes('id'));
  test('approval_requests has status column', arColNames.includes('status'));
  test('approval_requests has tier column', arColNames.includes('tier'));
  test('approval_requests has salesperson_id', arColNames.includes('salesperson_id'));
  test('approval_requests has manager_id', arColNames.includes('manager_id'));
  test('approval_requests has original_price', arColNames.includes('original_price'));
  test('approval_requests has requested_price', arColNames.includes('requested_price'));
  test('approval_requests has approved_price', arColNames.includes('approved_price'));
  test('approval_requests has approval_token', arColNames.includes('approval_token'));
  test('approval_requests has token_used', arColNames.includes('token_used'));
  test('approval_requests has cost_at_time', arColNames.includes('cost_at_time'));
  test('approval_requests has margin_amount', arColNames.includes('margin_amount'));
  test('approval_requests has margin_percent', arColNames.includes('margin_percent'));
  test('approval_requests has response_time_ms', arColNames.includes('response_time_ms'));
  test('approval_requests has method column', arColNames.includes('method'));
  test('approval_requests has request_type', arColNames.includes('request_type'));
  test('approval_requests has parent_request_id', arColNames.includes('parent_request_id'));
  test('approval_requests has delegation_id', arColNames.includes('delegation_id'));

  // Check approval_tier_settings table
  const { rows: tiers } = await pool.query(
    `SELECT * FROM approval_tier_settings ORDER BY tier`
  );
  test('approval_tier_settings has 4 tiers', tiers.length === 4, `found ${tiers.length}`);
  if (tiers.length >= 4) {
    test('Tier 1 is salesperson role', tiers[0].required_role === 'salesperson');
    test('Tier 2 is manager role', tiers[1].required_role === 'manager');
    test('Tier 3 is senior_manager role', tiers[2].required_role === 'senior_manager');
    test('Tier 4 is admin role', tiers[3].required_role === 'admin');
    test('Tier 1 covers 0-10%', parseFloat(tiers[0].min_discount_percent) === 0 && parseFloat(tiers[0].max_discount_percent) === 10);
    test('Tier 2 covers 10.01-25%', parseFloat(tiers[1].max_discount_percent) === 25);
    test('Tier 3 covers 25.01-50%', parseFloat(tiers[2].max_discount_percent) === 50);
    test('Tier 4 covers 50.01-100%', parseFloat(tiers[3].max_discount_percent) === 100);
    test('Tier 4 allows below cost', tiers[3].allows_below_cost === true);
  }

  // Check approval_counter_offers table
  const { rows: coCols } = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'approval_counter_offers' ORDER BY ordinal_position`
  );
  test('approval_counter_offers table exists', coCols.length > 0);

  // Check manager_availability table
  const { rows: maCols } = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'manager_availability' ORDER BY ordinal_position`
  );
  test('manager_availability table exists', maCols.length > 0);

  // Check manager_pins table
  const { rows: mpCols } = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'manager_pins' ORDER BY ordinal_position`
  );
  test('manager_pins table exists', mpCols.length > 0);

  // Check manager_delegations table
  const { rows: mdCols } = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = 'manager_delegations' ORDER BY ordinal_position`
  );
  const mdColNames = mdCols.map(c => c.column_name);
  test('manager_delegations table exists', mdCols.length > 0);
  if (mdCols.length > 0) {
    test('manager_delegations has delegator_id', mdColNames.includes('delegator_id'));
    test('manager_delegations has delegate_id', mdColNames.includes('delegate_id'));
    test('manager_delegations has max_tier', mdColNames.includes('max_tier'));
    test('manager_delegations has starts_at', mdColNames.includes('starts_at'));
    test('manager_delegations has expires_at', mdColNames.includes('expires_at'));
    test('manager_delegations has active', mdColNames.includes('active'));
    test('manager_delegations has reason', mdColNames.includes('reason'));
    test('manager_delegations has revoked_at', mdColNames.includes('revoked_at'));
  }

  // Check indexes on manager_delegations
  const { rows: mdIdx } = await pool.query(
    `SELECT indexname FROM pg_indexes WHERE tablename = 'manager_delegations'`
  );
  const idxNames = mdIdx.map(r => r.indexname);
  test('manager_delegations has active index', idxNames.some(n => n.includes('active')));
  test('manager_delegations has delegator index', idxNames.some(n => n.includes('delegator')));
  test('manager_delegations has expiry index', idxNames.some(n => n.includes('expiry')));

  // Check constraints on manager_delegations
  const { rows: mdConst } = await pool.query(
    `SELECT constraint_name FROM information_schema.table_constraints
     WHERE table_name = 'manager_delegations' AND constraint_type = 'CHECK'`
  );
  const constNames = mdConst.map(r => r.constraint_name);
  test('manager_delegations has chk_different_users', constNames.some(n => n.includes('different_users')));
  test('manager_delegations has chk_valid_tier', constNames.some(n => n.includes('valid_tier')));
  test('manager_delegations has chk_valid_dates', constNames.some(n => n.includes('valid_dates')));
}

// ============================================================================
// HELPER: LOGIN
// ============================================================================
async function login(email, password) {
  const res = await request('POST', '/auth/login', { email, password });
  if (res.status === 200 && res.data?.accessToken) {
    return { token: res.data.accessToken, user: res.data.user };
  }
  // Try alternate response shapes
  if (res.data?.data?.accessToken) {
    return { token: res.data.data.accessToken, user: res.data.data.user };
  }
  if (res.data?.token) {
    return { token: res.data.token, user: res.data.user };
  }
  throw new Error(`Login failed for ${email}: ${res.status} ${JSON.stringify(res.data).substring(0, 200)}`);
}

// ============================================================================
// 2. AUTHENTICATION & USER SETUP
// ============================================================================
async function setupUsers() {
  section('2. AUTHENTICATION & USER SETUP');

  // Find users with different roles
  const { rows: users } = await pool.query(
    `SELECT id, email, first_name, last_name, role FROM users
     WHERE is_active = TRUE
     ORDER BY
       CASE role
         WHEN 'admin' THEN 1
         WHEN 'senior_manager' THEN 2
         WHEN 'manager' THEN 3
         WHEN 'salesperson' THEN 4
         ELSE 5
       END
     LIMIT 20`
  );

  const admin = users.find(u => u.role === 'admin');
  const manager = users.find(u => u.role === 'manager');
  const salesperson = users.find(u => u.role === 'salesperson');

  test('Found admin user in DB', !!admin, admin ? admin.email : 'none found');
  test('Found manager user in DB', !!manager, manager ? manager.email : 'none found');
  test('Found salesperson user in DB', !!salesperson, salesperson ? salesperson.email : 'none found');

  if (!admin || !manager || !salesperson) {
    console.log('\n  Available users:');
    users.forEach(u => console.log(`    ${u.role}: ${u.email} (id=${u.id})`));
    throw new Error('Need admin, manager, and salesperson users to continue');
  }

  // Login as each
  try {
    const adminLogin = await login(admin.email, 'TestPass123!');
    ADMIN_TOKEN = adminLogin.token;
    ADMIN_USER = { ...admin, ...adminLogin.user };
    test('Admin login successful', true);
  } catch (e) {
    test('Admin login successful', false, e.message);
    throw e;
  }

  try {
    const mgrLogin = await login(manager.email, 'TestPass123!');
    MANAGER_TOKEN = mgrLogin.token;
    MANAGER_USER = { ...manager, ...mgrLogin.user };
    test('Manager login successful', true);
  } catch (e) {
    test('Manager login successful', false, e.message);
    throw e;
  }

  try {
    const spLogin = await login(salesperson.email, 'TestPass123!');
    SALESPERSON_TOKEN = spLogin.token;
    SALESPERSON_USER = { ...salesperson, ...spLogin.user };
    test('Salesperson login successful', true);
  } catch (e) {
    test('Salesperson login successful', false, e.message);
    throw e;
  }

  // Set up manager_availability for the manager so they show as online
  await pool.query(
    `INSERT INTO manager_availability (user_id, status, last_heartbeat, pending_request_count, active_device_count, last_updated)
     VALUES ($1, 'online', NOW(), 0, 1, NOW())
     ON CONFLICT (user_id) DO UPDATE SET status = 'online', last_heartbeat = NOW(), active_device_count = 1, last_updated = NOW()`,
    [manager.id]
  );
  await pool.query(
    `INSERT INTO manager_availability (user_id, status, last_heartbeat, pending_request_count, active_device_count, last_updated)
     VALUES ($1, 'online', NOW(), 0, 1, NOW())
     ON CONFLICT (user_id) DO UPDATE SET status = 'online', last_heartbeat = NOW(), active_device_count = 1, last_updated = NOW()`,
    [admin.id]
  );
  test('Manager availability set to online', true);

  // Reset daily override counters so tests aren't blocked by limits from prior runs
  await pool.query(
    `UPDATE manager_pins SET override_count_today = 0 WHERE user_id IN ($1, $2)`,
    [manager.id, admin.id]
  );
  test('Daily override counters reset for test run', true);
}

// ============================================================================
// 3. FIND A TEST PRODUCT
// ============================================================================
let TEST_PRODUCT = null;

async function findTestProduct() {
  section('3. TEST PRODUCT LOOKUP');
  const { rows } = await pool.query(
    `SELECT id, name, sku, price, cost FROM products
     WHERE price > 0 AND cost > 0 AND price > cost
     ORDER BY id LIMIT 1`
  );
  if (rows.length === 0) {
    throw new Error('No products with price > cost found');
  }
  TEST_PRODUCT = rows[0];
  console.log(`  Using product: "${TEST_PRODUCT.name}" (id=${TEST_PRODUCT.id}, price=$${TEST_PRODUCT.price}, cost=$${TEST_PRODUCT.cost})`);
  test('Found test product with valid price/cost', true);
}

// ============================================================================
// 4. TIER DETERMINATION
// ============================================================================
async function testTierDetermination() {
  section('4. TIER DETERMINATION');

  const price = parseFloat(TEST_PRODUCT.price);
  const cost = parseFloat(TEST_PRODUCT.cost);

  // Tier 1: 5% discount -> auto-approved
  const tier1Price = +(price * 0.95).toFixed(2);
  const res1 = await request('POST', '/pos-approvals/request', {
    productId: TEST_PRODUCT.id,
    requestedPrice: tier1Price,
  }, SALESPERSON_TOKEN);
  test('Tier 1 (5% off) auto-approved',
    res1.status === 200 && res1.data?.data?.autoApproved === true,
    `status=${res1.status}, autoApproved=${res1.data?.data?.autoApproved}, tier=${res1.data?.data?.tier}`
  );
  test('Tier 1 assigns tier=1', res1.data?.data?.tier === 1, `got tier=${res1.data?.data?.tier}`);

  // Tier 2: 15% discount -> pending, manager
  const tier2Price = +(price * 0.85).toFixed(2);
  const res2 = await request('POST', '/pos-approvals/request', {
    productId: TEST_PRODUCT.id,
    requestedPrice: tier2Price,
    managerId: MANAGER_USER.id,
  }, SALESPERSON_TOKEN);
  test('Tier 2 (15% off) creates pending request',
    res2.status === 201 && res2.data?.data?.status === 'pending',
    `status=${res2.status}, reqStatus=${res2.data?.data?.status}`
  );
  test('Tier 2 assigns tier=2', res2.data?.data?.tier === 2, `got tier=${res2.data?.data?.tier}`);

  // Clean up: cancel the pending request
  if (res2.data?.data?.id) {
    await request('POST', `/pos-approvals/${res2.data.data.id}/cancel`, {}, SALESPERSON_TOKEN);
  }

  // Tier 3: 30% discount -> pending, senior_manager
  const tier3Price = +(price * 0.70).toFixed(2);
  const res3 = await request('POST', '/pos-approvals/request', {
    productId: TEST_PRODUCT.id,
    requestedPrice: tier3Price,
    managerId: ADMIN_USER.id, // admin can approve any tier
  }, SALESPERSON_TOKEN);
  test('Tier 3 (30% off) creates pending request',
    res3.status === 201 && res3.data?.data?.status === 'pending',
    `status=${res3.status}, reqStatus=${res3.data?.data?.status}`
  );
  test('Tier 3 assigns tier=3', res3.data?.data?.tier === 3, `got tier=${res3.data?.data?.tier}`);

  if (res3.data?.data?.id) {
    await request('POST', `/pos-approvals/${res3.data.data.id}/cancel`, {}, SALESPERSON_TOKEN);
  }

  // Tier 4: below cost (or >50% off) -> pending, admin
  const tier4Price = +(price * 0.40).toFixed(2); // 60% off
  const res4 = await request('POST', '/pos-approvals/request', {
    productId: TEST_PRODUCT.id,
    requestedPrice: tier4Price,
    managerId: ADMIN_USER.id,
  }, SALESPERSON_TOKEN);
  test('Tier 4 (60% off) creates pending request',
    res4.status === 201 && res4.data?.data?.status === 'pending',
    `status=${res4.status}, reqStatus=${res4.data?.data?.status}`
  );
  test('Tier 4 assigns tier=4', res4.data?.data?.tier === 4, `got tier=${res4.data?.data?.tier}`);

  if (res4.data?.data?.id) {
    await request('POST', `/pos-approvals/${res4.data.data.id}/cancel`, {}, SALESPERSON_TOKEN);
  }
}

// ============================================================================
// 5. APPROVE / DENY FLOW
// ============================================================================
async function testApproveAndDeny() {
  section('5. APPROVE / DENY FLOW');

  const price = parseFloat(TEST_PRODUCT.price);

  // --- APPROVE ---
  const tier2Price = +(price * 0.85).toFixed(2);
  const createRes = await request('POST', '/pos-approvals/request', {
    productId: TEST_PRODUCT.id,
    requestedPrice: tier2Price,
    managerId: MANAGER_USER.id,
  }, SALESPERSON_TOKEN);
  test('Create Tier 2 request for approval test', createRes.status === 201);
  const requestId = createRes.data?.data?.id;

  if (!requestId) {
    skip('Approve request', 'No request created');
    return;
  }

  // Check status polling
  const statusRes = await request('GET', `/pos-approvals/${requestId}/status`, null, SALESPERSON_TOKEN);
  test('Status poll returns pending',
    statusRes.data?.data?.status === 'pending',
    `got ${statusRes.data?.data?.status}`
  );

  // Manager approves
  const approveRes = await request('POST', `/pos-approvals/${requestId}/approve`, {
    method: 'remote',
  }, MANAGER_TOKEN);
  test('Manager can approve Tier 2 request',
    approveRes.status === 200 && approveRes.data?.data?.status === 'approved',
    `status=${approveRes.status}, reqStatus=${approveRes.data?.data?.status}, error=${JSON.stringify(approveRes.data?.error || approveRes.data?.message || '').substring(0, 200)}`
  );
  test('Approved price matches requested price',
    parseFloat(approveRes.data?.data?.approved_price) === tier2Price,
    `approved=${approveRes.data?.data?.approved_price}, expected=${tier2Price}`
  );
  test('Approval token is generated',
    approveRes.data?.data?.approval_token && approveRes.data?.data?.approval_token.length > 0
  );
  test('Response time is recorded',
    approveRes.data?.data?.response_time_ms >= 0,
    `got ${approveRes.data?.data?.response_time_ms}ms`
  );

  // --- DENY ---
  const createRes2 = await request('POST', '/pos-approvals/request', {
    productId: TEST_PRODUCT.id,
    requestedPrice: tier2Price,
    managerId: MANAGER_USER.id,
  }, SALESPERSON_TOKEN);
  test('Create Tier 2 request for deny test', createRes2.status === 201);
  const requestId2 = createRes2.data?.data?.id;

  if (requestId2) {
    const denyRes = await request('POST', `/pos-approvals/${requestId2}/deny`, {
      reasonCode: 'margin_too_low',
      reasonNote: 'Test denial - margin insufficient',
    }, MANAGER_TOKEN);
    test('Manager can deny request',
      denyRes.status === 200 && denyRes.data?.data?.status === 'denied',
      `status=${denyRes.status}, reqStatus=${denyRes.data?.data?.status}`
    );
    test('Deny reason code is recorded',
      denyRes.data?.data?.reason_code === 'margin_too_low'
    );
    test('Deny reason note is recorded',
      denyRes.data?.data?.reason_note === 'Test denial - margin insufficient'
    );
  }

  return approveRes.data?.data; // Return approved request for token test
}

// ============================================================================
// 6. COUNTER-OFFER FLOW
// ============================================================================
async function testCounterOfferFlow() {
  section('6. COUNTER-OFFER FLOW');

  const price = parseFloat(TEST_PRODUCT.price);
  const tier2Price = +(price * 0.85).toFixed(2);
  const counterPrice = +(price * 0.90).toFixed(2); // Manager offers 10% off instead

  // Create request
  const createRes = await request('POST', '/pos-approvals/request', {
    productId: TEST_PRODUCT.id,
    requestedPrice: tier2Price,
    managerId: MANAGER_USER.id,
  }, SALESPERSON_TOKEN);
  test('Create request for counter-offer test', createRes.status === 201);
  const requestId = createRes.data?.data?.id;

  if (!requestId) {
    skip('Counter-offer flow', 'No request created');
    return;
  }

  // Manager makes counter-offer
  const counterRes = await request('POST', `/pos-approvals/${requestId}/counter`, {
    counterPrice,
  }, MANAGER_TOKEN);
  test('Manager creates counter-offer',
    counterRes.status === 200 && counterRes.data?.data?.id,
    `status=${counterRes.status}`
  );
  const counterOfferId = counterRes.data?.data?.id;

  // Verify request status changed to 'countered'
  const statusRes = await request('GET', `/pos-approvals/${requestId}/status`, null, SALESPERSON_TOKEN);
  test('Request status is now countered',
    statusRes.data?.data?.status === 'countered',
    `got ${statusRes.data?.data?.status}`
  );
  test('Counter-offer appears in status response',
    statusRes.data?.data?.counterOffers?.length > 0,
    `counterOffers count: ${statusRes.data?.data?.counterOffers?.length}`
  );

  // Salesperson accepts counter-offer
  if (counterOfferId) {
    const acceptRes = await request('POST', `/pos-approvals/${requestId}/accept-counter`, {
      counterOfferId,
    }, SALESPERSON_TOKEN);
    test('Salesperson accepts counter-offer',
      acceptRes.status === 200 && acceptRes.data?.data?.status === 'approved',
      `status=${acceptRes.status}, reqStatus=${acceptRes.data?.data?.status}`
    );
    test('Approved price matches counter price',
      parseFloat(acceptRes.data?.data?.approved_price) === counterPrice,
      `approved=${acceptRes.data?.data?.approved_price}, expected=${counterPrice}`
    );
    return acceptRes.data?.data;
  }
}

// ============================================================================
// 6b. COUNTER-OFFER DECLINE FLOW
// ============================================================================
async function testCounterOfferDecline() {
  section('6b. COUNTER-OFFER DECLINE FLOW');

  const price = parseFloat(TEST_PRODUCT.price);
  const tier2Price = +(price * 0.85).toFixed(2);
  const counterPrice = +(price * 0.92).toFixed(2);

  const createRes = await request('POST', '/pos-approvals/request', {
    productId: TEST_PRODUCT.id,
    requestedPrice: tier2Price,
    managerId: MANAGER_USER.id,
  }, SALESPERSON_TOKEN);
  const requestId = createRes.data?.data?.id;
  if (!requestId) { skip('Counter decline', 'No request'); return; }

  const counterRes = await request('POST', `/pos-approvals/${requestId}/counter`, {
    counterPrice,
  }, MANAGER_TOKEN);
  const counterOfferId = counterRes.data?.data?.id;

  if (counterOfferId) {
    const declineRes = await request('POST', `/pos-approvals/${requestId}/decline-counter`, {
      counterOfferId,
    }, SALESPERSON_TOKEN);
    test('Salesperson declines counter-offer',
      declineRes.status === 200 && declineRes.data?.data?.status === 'pending',
      `reqStatus=${declineRes.data?.data?.status}`
    );

    // Clean up
    await request('POST', `/pos-approvals/${requestId}/cancel`, {}, SALESPERSON_TOKEN);
  }
}

// ============================================================================
// 7. TOKEN GENERATION & CONSUMPTION
// ============================================================================
async function testTokenConsumption(approvedRequest) {
  section('7. TOKEN GENERATION & CONSUMPTION');

  if (!approvedRequest?.approval_token) {
    // Create a fresh approved request
    const price = parseFloat(TEST_PRODUCT.price);
    const tier2Price = +(price * 0.85).toFixed(2);
    const createRes = await request('POST', '/pos-approvals/request', {
      productId: TEST_PRODUCT.id,
      requestedPrice: tier2Price,
      managerId: MANAGER_USER.id,
    }, SALESPERSON_TOKEN);
    const requestId = createRes.data?.data?.id;
    if (!requestId) { skip('Token consumption', 'No request'); return; }

    const approveRes = await request('POST', `/pos-approvals/${requestId}/approve`, {
      method: 'remote',
    }, MANAGER_TOKEN);
    approvedRequest = approveRes.data?.data;
  }

  const token = approvedRequest?.approval_token;
  if (!token) {
    skip('Token consumption', 'No approval token available');
    return;
  }

  test('Approval token is 64 hex chars', token.length === 64 && /^[0-9a-f]+$/.test(token));
  test('Token marked as not used', approvedRequest.token_used === false);
  test('Token has expiration', !!approvedRequest.token_expires_at);

  // Consume the token
  const consumeRes = await request('POST', '/pos-approvals/consume-token', {
    token,
  }, SALESPERSON_TOKEN);
  test('Token consumption succeeds',
    consumeRes.status === 200 && consumeRes.data?.data?.approvedPrice,
    `status=${consumeRes.status}`
  );
  test('Consumed token returns correct approved price',
    consumeRes.data?.data?.approvedPrice === parseFloat(approvedRequest.approved_price),
    `got ${consumeRes.data?.data?.approvedPrice}, expected ${approvedRequest.approved_price}`
  );

  // Try consuming again - should fail
  const consumeRes2 = await request('POST', '/pos-approvals/consume-token', {
    token,
  }, SALESPERSON_TOKEN);
  test('Double consumption fails',
    consumeRes2.status === 400 || consumeRes2.data?.success === false,
    `status=${consumeRes2.status}`
  );

  // Try with invalid token
  const consumeRes3 = await request('POST', '/pos-approvals/consume-token', {
    token: 'a'.repeat(64),
  }, SALESPERSON_TOKEN);
  test('Invalid token is rejected',
    consumeRes3.status === 400 || consumeRes3.data?.success === false
  );
}

// ============================================================================
// 8. AUDIT TRAIL
// ============================================================================
async function testAuditTrail() {
  section('8. AUDIT TRAIL');

  // Fetch recent approval requests from the audit log
  const auditRes = await request('GET', '/pos-approvals/audit-log?limit=5', null, ADMIN_TOKEN);
  test('Audit log endpoint returns data',
    auditRes.status === 200 && Array.isArray(auditRes.data?.data),
    `status=${auditRes.status}`
  );

  if (auditRes.data?.data?.length > 0) {
    const entry = auditRes.data.data[0];
    test('Audit entry has product_name', !!entry.product_name);
    test('Audit entry has salesperson_name', !!entry.salesperson_name);
    test('Audit entry has tier_name', !!entry.tier_name);
    test('Audit entry has status', !!entry.status);
    test('Audit entry has original_price', entry.original_price !== undefined);
    test('Audit entry has requested_price', entry.requested_price !== undefined);
    test('Audit entry has cost_at_time', entry.cost_at_time !== undefined);
    test('Audit entry has margin_amount', entry.margin_amount !== undefined);
    test('Audit entry has margin_percent', entry.margin_percent !== undefined);
    test('Audit entry has created_at', !!entry.created_at);

    if (entry.status === 'approved' || entry.status === 'denied') {
      test('Resolved entry has responded_at', !!entry.responded_at);
      test('Resolved entry has response_time_ms', entry.response_time_ms !== null);
    }
  }

  // Test pagination
  test('Audit log has pagination',
    auditRes.data?.pagination?.page !== undefined &&
    auditRes.data?.pagination?.total !== undefined,
    `page=${auditRes.data?.pagination?.page}, total=${auditRes.data?.pagination?.total}`
  );

  // Test analytics endpoint
  const analyticsRes = await request('GET', '/pos-approvals/analytics', null, ADMIN_TOKEN);
  test('Analytics endpoint returns data',
    analyticsRes.status === 200 && analyticsRes.data?.data?.summary,
    `status=${analyticsRes.status}`
  );

  if (analyticsRes.data?.data) {
    const a = analyticsRes.data.data;
    test('Analytics has summary', !!a.summary);
    test('Analytics has previousPeriod', !!a.previousPeriod);
    test('Analytics has byTier', Array.isArray(a.byTier));
    test('Analytics has dailyTimeSeries', Array.isArray(a.dailyTimeSeries));
    test('Analytics has bySalesperson', Array.isArray(a.bySalesperson));
    test('Analytics has byManager', Array.isArray(a.byManager));
  }
}

// ============================================================================
// 9. ROLE AUTHORIZATION
// ============================================================================
async function testRoleAuthorization() {
  section('9. ROLE AUTHORIZATION');

  const price = parseFloat(TEST_PRODUCT.price);

  // Test: Regular manager CANNOT approve Tier 3 (requires senior_manager)
  const tier3Price = +(price * 0.70).toFixed(2);
  const createRes = await request('POST', '/pos-approvals/request', {
    productId: TEST_PRODUCT.id,
    requestedPrice: tier3Price,
    managerId: MANAGER_USER.id,
  }, SALESPERSON_TOKEN);
  const tier3Id = createRes.data?.data?.id;

  if (tier3Id) {
    const approveRes = await request('POST', `/pos-approvals/${tier3Id}/approve`, {
      method: 'remote',
    }, MANAGER_TOKEN);
    test('Manager CANNOT approve Tier 3 (requires senior_manager)',
      approveRes.status === 500 || approveRes.data?.success === false ||
      (approveRes.data?.error && approveRes.data.error.includes('Insufficient')),
      `status=${approveRes.status}, error=${approveRes.data?.error || approveRes.data?.message || ''}`
    );

    // Admin CAN approve Tier 3
    const adminApproveRes = await request('POST', `/pos-approvals/${tier3Id}/approve`, {
      method: 'remote',
    }, ADMIN_TOKEN);
    test('Admin CAN approve Tier 3',
      adminApproveRes.status === 200 && adminApproveRes.data?.data?.status === 'approved',
      `status=${adminApproveRes.status}, reqStatus=${adminApproveRes.data?.data?.status}`
    );
  }

  // Test: Regular manager CANNOT approve Tier 4 (requires admin)
  const tier4Price = +(price * 0.40).toFixed(2);
  const createRes4 = await request('POST', '/pos-approvals/request', {
    productId: TEST_PRODUCT.id,
    requestedPrice: tier4Price,
    managerId: ADMIN_USER.id,
  }, SALESPERSON_TOKEN);
  const tier4Id = createRes4.data?.data?.id;

  if (tier4Id) {
    const approveRes = await request('POST', `/pos-approvals/${tier4Id}/approve`, {
      method: 'remote',
    }, MANAGER_TOKEN);
    test('Manager CANNOT approve Tier 4 (requires admin)',
      approveRes.status === 500 || approveRes.data?.success === false ||
      (approveRes.data?.error && approveRes.data.error.includes('Insufficient')),
      `status=${approveRes.status}`
    );

    // Clean up
    await request('POST', `/pos-approvals/${tier4Id}/cancel`, {}, SALESPERSON_TOKEN);
  }

  // Test: Salesperson cannot access pending queue
  const pendingRes = await request('GET', '/pos-approvals/pending', null, SALESPERSON_TOKEN);
  test('Salesperson CANNOT access pending queue',
    pendingRes.status === 403,
    `status=${pendingRes.status}`
  );

  // Test: Manager CAN access pending queue
  const mgrPendingRes = await request('GET', '/pos-approvals/pending', null, MANAGER_TOKEN);
  test('Manager CAN access pending queue',
    mgrPendingRes.status === 200,
    `status=${mgrPendingRes.status}`
  );

  // Test: Salesperson cannot access analytics
  const spAnalytics = await request('GET', '/pos-approvals/analytics', null, SALESPERSON_TOKEN);
  test('Salesperson CANNOT access analytics',
    spAnalytics.status === 403,
    `status=${spAnalytics.status}`
  );

  // Test: Salesperson cannot access tier settings
  const spTiers = await request('GET', '/pos-approvals/settings/tiers', null, SALESPERSON_TOKEN);
  test('Salesperson CANNOT access tier settings',
    spTiers.status === 403,
    `status=${spTiers.status}`
  );
}

// ============================================================================
// 10. BATCH APPROVAL
// ============================================================================
async function testBatchApproval() {
  section('10. BATCH APPROVAL');

  const price = parseFloat(TEST_PRODUCT.price);

  // Find a second product
  const { rows: prods } = await pool.query(
    `SELECT id, name, sku, price, cost FROM products
     WHERE price > 0 AND cost > 0 AND price > cost AND id != $1
     ORDER BY id LIMIT 1`,
    [TEST_PRODUCT.id]
  );

  if (prods.length === 0) {
    skip('Batch approval', 'Need 2 products');
    return;
  }

  const product2 = prods[0];
  const price2 = parseFloat(product2.price);

  // Create batch request
  const batchRes = await request('POST', '/pos-approvals/batch-request', {
    managerId: MANAGER_USER.id,
    items: [
      { productId: TEST_PRODUCT.id, requestedPrice: +(price * 0.88).toFixed(2) },
      { productId: product2.id, requestedPrice: +(price2 * 0.87).toFixed(2) },
    ],
  }, SALESPERSON_TOKEN);
  test('Batch request created',
    batchRes.status === 201 && batchRes.data?.data?.parent,
    `status=${batchRes.status}`
  );

  const parentId = batchRes.data?.data?.parent?.id;
  if (!parentId) {
    skip('Batch approve', 'No batch parent');
    return;
  }

  test('Batch has correct number of children',
    batchRes.data?.data?.children?.length === 2,
    `got ${batchRes.data?.data?.children?.length}`
  );
  test('Batch parent is type=batch', batchRes.data?.data?.parent?.request_type === 'batch');

  // Get batch details
  const detailRes = await request('GET', `/pos-approvals/batch/${parentId}`, null, SALESPERSON_TOKEN);
  test('Batch details returns parent + children',
    detailRes.status === 200 && detailRes.data?.data?.children?.length === 2,
    `status=${detailRes.status}`
  );

  // Manager approves batch
  const approveRes = await request('POST', `/pos-approvals/batch/${parentId}/approve`, {
    method: 'remote',
  }, MANAGER_TOKEN);
  test('Manager approves batch',
    approveRes.status === 200 && approveRes.data?.data?.parent?.status === 'approved',
    `status=${approveRes.status}, parentStatus=${approveRes.data?.data?.parent?.status}`
  );
  test('All children approved',
    approveRes.data?.data?.children?.every(c => c.status === 'approved'),
    `statuses: ${approveRes.data?.data?.children?.map(c => c.status).join(', ')}`
  );

  // Consume batch tokens
  const consumeRes = await request('POST', `/pos-approvals/batch/${parentId}/consume-tokens`, {}, SALESPERSON_TOKEN);
  test('Batch token consumption succeeds',
    consumeRes.status === 200 && Array.isArray(consumeRes.data?.data),
    `status=${consumeRes.status}`
  );
  test('All batch tokens consumed',
    consumeRes.data?.data?.length === 2,
    `consumed: ${consumeRes.data?.data?.length}`
  );
}

// ============================================================================
// 11. BATCH DENY
// ============================================================================
async function testBatchDeny() {
  section('11. BATCH DENY');

  const price = parseFloat(TEST_PRODUCT.price);

  const { rows: prods } = await pool.query(
    `SELECT id, price FROM products WHERE price > 0 AND cost > 0 AND price > cost AND id != $1 ORDER BY id LIMIT 1`,
    [TEST_PRODUCT.id]
  );
  if (prods.length === 0) { skip('Batch deny', 'Need 2 products'); return; }

  const batchRes = await request('POST', '/pos-approvals/batch-request', {
    managerId: MANAGER_USER.id,
    items: [
      { productId: TEST_PRODUCT.id, requestedPrice: +(price * 0.88).toFixed(2) },
      { productId: prods[0].id, requestedPrice: +(parseFloat(prods[0].price) * 0.87).toFixed(2) },
    ],
  }, SALESPERSON_TOKEN);
  const parentId = batchRes.data?.data?.parent?.id;
  if (!parentId) { skip('Batch deny', 'No parent'); return; }

  const denyRes = await request('POST', `/pos-approvals/batch/${parentId}/deny`, {
    reasonCode: 'test_deny',
    reasonNote: 'Testing batch denial',
  }, MANAGER_TOKEN);
  test('Manager denies batch',
    denyRes.status === 200 && denyRes.data?.data?.status === 'denied',
    `status=${denyRes.status}, reqStatus=${denyRes.data?.data?.status}`
  );
}

// ============================================================================
// 12. MANAGER AVAILABILITY & SELECTION
// ============================================================================
async function testManagerAvailability() {
  section('12. MANAGER AVAILABILITY');

  const res = await request('GET', '/pos-approvals/managers/available?tier=2', null, SALESPERSON_TOKEN);
  test('Available managers endpoint returns data',
    res.status === 200 && Array.isArray(res.data?.data),
    `status=${res.status}`
  );

  if (res.data?.data?.length > 0) {
    const mgr = res.data.data[0];
    test('Manager entry has required fields',
      mgr.id && mgr.name && mgr.role && mgr.availability
    );
    test('Manager has availability status', ['online', 'away'].includes(mgr.availability));
  } else {
    skip('Manager fields check', 'No managers returned');
  }
}

// ============================================================================
// 13. CANCELLATION
// ============================================================================
async function testCancellation() {
  section('13. CANCELLATION');

  const price = parseFloat(TEST_PRODUCT.price);
  const tier2Price = +(price * 0.85).toFixed(2);

  const createRes = await request('POST', '/pos-approvals/request', {
    productId: TEST_PRODUCT.id,
    requestedPrice: tier2Price,
    managerId: MANAGER_USER.id,
  }, SALESPERSON_TOKEN);
  const requestId = createRes.data?.data?.id;
  if (!requestId) { skip('Cancellation', 'No request'); return; }

  // Salesperson cancels
  const cancelRes = await request('POST', `/pos-approvals/${requestId}/cancel`, {}, SALESPERSON_TOKEN);
  test('Salesperson can cancel own request',
    cancelRes.status === 200 && cancelRes.data?.data?.status === 'cancelled',
    `status=${cancelRes.status}, reqStatus=${cancelRes.data?.data?.status}`
  );

  // Cannot cancel again
  const cancelRes2 = await request('POST', `/pos-approvals/${requestId}/cancel`, {}, SALESPERSON_TOKEN);
  test('Cannot cancel already-cancelled request',
    cancelRes2.status === 500 || cancelRes2.data?.success === false
  );
}

// ============================================================================
// 14. PRODUCT OVERRIDE HISTORY
// ============================================================================
async function testProductHistory() {
  section('14. PRODUCT OVERRIDE HISTORY');

  // First create an approved request to ensure history exists
  const price = parseFloat(TEST_PRODUCT.price);
  const tier2Price = +(price * 0.85).toFixed(2);
  const createRes = await request('POST', '/pos-approvals/request', {
    productId: TEST_PRODUCT.id,
    requestedPrice: tier2Price,
    managerId: MANAGER_USER.id,
  }, SALESPERSON_TOKEN);
  const requestId = createRes.data?.data?.id;
  if (requestId) {
    await request('POST', `/pos-approvals/${requestId}/approve`, { method: 'remote' }, MANAGER_TOKEN);
  }

  // Get history
  const histRes = await request('GET', `/pos-approvals/${requestId}/product-history`, null, MANAGER_TOKEN);
  test('Product history endpoint returns data',
    histRes.status === 200 && Array.isArray(histRes.data?.data),
    `status=${histRes.status}`
  );
}

// ============================================================================
// 15. INTELLIGENCE ENDPOINT
// ============================================================================
async function testIntelligence() {
  section('15. PRICING INTELLIGENCE');

  const price = parseFloat(TEST_PRODUCT.price);
  const tier2Price = +(price * 0.85).toFixed(2);

  const createRes = await request('POST', '/pos-approvals/request', {
    productId: TEST_PRODUCT.id,
    requestedPrice: tier2Price,
    managerId: MANAGER_USER.id,
  }, SALESPERSON_TOKEN);
  const requestId = createRes.data?.data?.id;
  if (!requestId) { skip('Intelligence', 'No request'); return; }

  const intRes = await request('GET', `/pos-approvals/${requestId}/intelligence`, null, MANAGER_TOKEN);
  test('Intelligence endpoint returns data',
    intRes.status === 200 && intRes.data?.data,
    `status=${intRes.status}`
  );

  if (intRes.data?.data) {
    const d = intRes.data.data;
    test('Intelligence has floorPrice', d.floorPrice?.price !== undefined);
    test('Intelligence has priceHistory', !!d.priceHistory);
    test('Intelligence has quickMath', !!d.quickMath);
    test('quickMath.marginAtRequested is number', typeof d.quickMath?.marginAtRequested === 'number');
  }

  // Clean up
  await request('POST', `/pos-approvals/${requestId}/cancel`, {}, SALESPERSON_TOKEN);
}

// ============================================================================
// 16. DELEGATION SYSTEM
// ============================================================================
async function testDelegationSystem() {
  section('16. DELEGATION SYSTEM');

  // Test: Create delegation from manager to salesperson
  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(); // 2 hours from now
  const createDel = await request('POST', '/pos-approvals/delegations', {
    delegateId: SALESPERSON_USER.id,
    maxTier: 2,
    expiresAt,
    reason: 'Lunch break test',
  }, MANAGER_TOKEN);
  test('Manager creates delegation to salesperson',
    createDel.status === 201 && createDel.data?.data?.id,
    `status=${createDel.status}, error=${createDel.data?.error || ''}`
  );
  const delegationId = createDel.data?.data?.id;

  // Test: Salesperson cannot create delegation (not manager+)
  const spCreateDel = await request('POST', '/pos-approvals/delegations', {
    delegateId: MANAGER_USER.id,
    maxTier: 2,
    expiresAt,
  }, SALESPERSON_TOKEN);
  test('Salesperson CANNOT create delegation',
    spCreateDel.status === 403,
    `status=${spCreateDel.status}`
  );

  // Test: Get active delegations
  const activeDel = await request('GET', '/pos-approvals/delegations/active', null, MANAGER_TOKEN);
  test('Get active delegations returns outgoing',
    activeDel.status === 200 &&
    activeDel.data?.data?.delegatedTo?.length > 0,
    `status=${activeDel.status}, outgoing=${activeDel.data?.data?.delegatedTo?.length}`
  );

  // Salesperson sees incoming delegation
  const spActiveDel = await request('GET', '/pos-approvals/delegations/active', null, SALESPERSON_TOKEN);
  test('Salesperson sees incoming delegation',
    spActiveDel.status === 200 &&
    spActiveDel.data?.data?.receivedFrom?.length > 0,
    `status=${spActiveDel.status}, incoming=${spActiveDel.data?.data?.receivedFrom?.length}`
  );

  // Test: Get eligible delegates
  const eligibleRes = await request('GET', '/pos-approvals/delegations/eligible', null, MANAGER_TOKEN);
  test('Eligible delegates endpoint returns users',
    eligibleRes.status === 200 && Array.isArray(eligibleRes.data?.data),
    `status=${eligibleRes.status}, count=${eligibleRes.data?.data?.length}`
  );

  // Test: Delegated salesperson appears in available managers
  // First ensure salesperson has manager_availability
  await pool.query(
    `INSERT INTO manager_availability (user_id, status, last_heartbeat, pending_request_count, active_device_count, last_updated)
     VALUES ($1, 'online', NOW(), 0, 1, NOW())
     ON CONFLICT (user_id) DO UPDATE SET status = 'online', last_heartbeat = NOW(), active_device_count = 1, last_updated = NOW()`,
    [SALESPERSON_USER.id]
  );

  const availRes = await request('GET', '/pos-approvals/managers/available?tier=2', null, SALESPERSON_TOKEN);
  const delegatedMgr = availRes.data?.data?.find(m => m.id === SALESPERSON_USER.id);
  test('Delegated salesperson appears in available managers',
    !!delegatedMgr,
    delegatedMgr ? `found with isDelegated=${delegatedMgr.isDelegated}` : 'not found'
  );
  if (delegatedMgr) {
    test('Delegated manager has isDelegated=true', delegatedMgr.isDelegated === true);
    test('Delegated manager has delegatorName', !!delegatedMgr.delegatorName);
  }

  // Test: Delegated salesperson can access pending queue
  const spPendingRes = await request('GET', '/pos-approvals/pending', null, SALESPERSON_TOKEN);
  test('Delegated salesperson CAN access pending queue',
    spPendingRes.status === 200,
    `status=${spPendingRes.status}`
  );

  // Test: Delegated salesperson can approve a Tier 2 request
  const price = parseFloat(TEST_PRODUCT.price);
  const tier2Price = +(price * 0.85).toFixed(2);
  const createReq = await request('POST', '/pos-approvals/request', {
    productId: TEST_PRODUCT.id,
    requestedPrice: tier2Price,
    managerId: SALESPERSON_USER.id, // Assign to the delegate
  }, ADMIN_TOKEN); // Use admin to create (different from salesperson)

  // Hmm, actually the salesperson creating and approving would be the same user
  // Let's use admin as the requester for this test
  const tier2ReqId = createReq.data?.data?.id;

  if (tier2ReqId && !createReq.data?.data?.autoApproved) {
    const delegateApproveRes = await request('POST', `/pos-approvals/${tier2ReqId}/approve`, {
      method: 'remote',
    }, SALESPERSON_TOKEN);
    test('Delegated salesperson can approve Tier 2',
      delegateApproveRes.status === 200 && delegateApproveRes.data?.data?.status === 'approved',
      `status=${delegateApproveRes.status}, reqStatus=${delegateApproveRes.data?.data?.status}, error=${delegateApproveRes.data?.error || delegateApproveRes.data?.message || ''}`
    );

    // Check delegation_id is recorded
    if (delegateApproveRes.data?.data?.delegation_id) {
      test('Delegation ID recorded on approval', true);
    } else {
      // Check in DB directly
      const { rows } = await pool.query(
        `SELECT delegation_id FROM approval_requests WHERE id = $1`,
        [tier2ReqId]
      );
      test('Delegation ID recorded on approval',
        rows[0]?.delegation_id != null,
        `delegation_id=${rows[0]?.delegation_id}`
      );
    }
  } else {
    skip('Delegate approve test', 'Request was auto-approved or not created');
  }

  // Test: Revoke delegation
  if (delegationId) {
    const revokeRes = await request('DELETE', `/pos-approvals/delegations/${delegationId}`, null, MANAGER_TOKEN);
    test('Manager revokes delegation',
      revokeRes.status === 200,
      `status=${revokeRes.status}`
    );

    // Verify delegation is now inactive
    const afterRevoke = await request('GET', '/pos-approvals/delegations/active', null, MANAGER_TOKEN);
    const stillActive = afterRevoke.data?.data?.delegatedTo?.find(d => d.id === delegationId);
    test('Revoked delegation no longer appears in active list', !stillActive);

    // Salesperson should no longer appear in available managers as delegate
    const availRes2 = await request('GET', '/pos-approvals/managers/available?tier=2', null, SALESPERSON_TOKEN);
    const stillDelegated = availRes2.data?.data?.find(m => m.id === SALESPERSON_USER.id && m.isDelegated);
    test('Revoked delegate removed from available managers', !stillDelegated);
  }

  // Test: Cannot self-delegate
  const selfDel = await request('POST', '/pos-approvals/delegations', {
    delegateId: MANAGER_USER.id,
    maxTier: 2,
    expiresAt,
  }, MANAGER_TOKEN);
  test('Cannot delegate to self',
    selfDel.status === 500 || selfDel.data?.success === false,
    `status=${selfDel.status}`
  );
}

// ============================================================================
// 17. TIMEOUT HANDLING
// ============================================================================
async function testTimeoutHandling() {
  section('17. TIMEOUT HANDLING (DB-level)');

  // We can't wait for the actual timeout sweep, but we can verify
  // the query logic by manually creating an old pending request and running the query

  const price = parseFloat(TEST_PRODUCT.price);
  const tier2Price = +(price * 0.85).toFixed(2);

  // Create a request and manually backdate it
  const createRes = await request('POST', '/pos-approvals/request', {
    productId: TEST_PRODUCT.id,
    requestedPrice: tier2Price,
    managerId: MANAGER_USER.id,
  }, SALESPERSON_TOKEN);
  const requestId = createRes.data?.data?.id;
  if (!requestId) { skip('Timeout test', 'No request'); return; }

  // Manually backdate to trigger timeout (tier 2 = 180s timeout)
  await pool.query(
    `UPDATE approval_requests SET created_at = NOW() - INTERVAL '10 minutes' WHERE id = $1`,
    [requestId]
  );

  // Run the timeout query directly
  const { rows: timedOut } = await pool.query(
    `SELECT ar.id
     FROM approval_requests ar
     JOIN approval_tier_settings ats ON ats.tier = ar.tier
     WHERE ar.status = 'pending'
       AND ats.timeout_seconds > 0
       AND ar.created_at + (ats.timeout_seconds || ' seconds')::interval < NOW()
       AND ar.id = $1`,
    [requestId]
  );
  test('Backdated request detected by timeout query',
    timedOut.length === 1,
    `found ${timedOut.length}`
  );

  // Actually time it out
  await pool.query(
    `UPDATE approval_requests SET status = 'timed_out', responded_at = NOW() WHERE id = $1`,
    [requestId]
  );

  // Verify it's timed out
  const { rows: [req] } = await pool.query(
    `SELECT status FROM approval_requests WHERE id = $1`, [requestId]
  );
  test('Request status is timed_out after manual timeout', req?.status === 'timed_out');
}

// ============================================================================
// 18. EDGE CASES
// ============================================================================
async function testEdgeCases() {
  section('18. EDGE CASES');

  // Negative price
  const res1 = await request('POST', '/pos-approvals/request', {
    productId: TEST_PRODUCT.id,
    requestedPrice: -10,
  }, SALESPERSON_TOKEN);
  test('Negative price is rejected',
    res1.status === 500 || res1.data?.success === false
  );

  // Price above original
  const price = parseFloat(TEST_PRODUCT.price);
  const res2 = await request('POST', '/pos-approvals/request', {
    productId: TEST_PRODUCT.id,
    requestedPrice: price + 100,
  }, SALESPERSON_TOKEN);
  test('Price above original is rejected',
    res2.status === 500 || res2.data?.success === false
  );

  // Missing required fields
  const res3 = await request('POST', '/pos-approvals/request', {}, SALESPERSON_TOKEN);
  test('Missing productId/requestedPrice is rejected',
    res3.status === 400 || res3.data?.success === false
  );

  // Approve non-existent request
  const res4 = await request('POST', '/pos-approvals/999999/approve', { method: 'remote' }, MANAGER_TOKEN);
  test('Approving non-existent request fails',
    res4.status === 500 || res4.data?.success === false
  );

  // Double approve
  const tier2Price = +(price * 0.85).toFixed(2);
  const createRes = await request('POST', '/pos-approvals/request', {
    productId: TEST_PRODUCT.id,
    requestedPrice: tier2Price,
    managerId: MANAGER_USER.id,
  }, SALESPERSON_TOKEN);
  const reqId = createRes.data?.data?.id;
  if (reqId) {
    await request('POST', `/pos-approvals/${reqId}/approve`, { method: 'remote' }, MANAGER_TOKEN);
    const res5 = await request('POST', `/pos-approvals/${reqId}/approve`, { method: 'remote' }, MANAGER_TOKEN);
    test('Double-approve fails',
      res5.status === 500 || res5.data?.success === false
    );
  }

  // Unauthenticated access
  const res6 = await request('GET', '/pos-approvals/pending');
  test('Unauthenticated request is rejected',
    res6.status === 401 || res6.status === 403,
    `status=${res6.status}`
  );
}

// ============================================================================
// 19. DELEGATION DB CONSTRAINTS
// ============================================================================
async function testDelegationConstraints() {
  section('19. DELEGATION DB CONSTRAINTS');

  // chk_different_users: delegate != delegator
  try {
    await pool.query(
      `INSERT INTO manager_delegations (delegator_id, delegate_id, max_tier, expires_at)
       VALUES ($1, $1, 2, NOW() + INTERVAL '1 hour')`,
      [MANAGER_USER.id]
    );
    test('DB rejects self-delegation', false, 'INSERT should have failed');
  } catch (e) {
    test('DB rejects self-delegation (chk_different_users)', e.message.includes('chk_different_users'));
  }

  // chk_valid_tier: tier must be 1-4
  try {
    await pool.query(
      `INSERT INTO manager_delegations (delegator_id, delegate_id, max_tier, expires_at)
       VALUES ($1, $2, 5, NOW() + INTERVAL '1 hour')`,
      [MANAGER_USER.id, SALESPERSON_USER.id]
    );
    test('DB rejects tier > 4', false, 'INSERT should have failed');
    // Clean up
    await pool.query(`DELETE FROM manager_delegations WHERE max_tier = 5`);
  } catch (e) {
    test('DB rejects tier > 4 (chk_valid_tier)', e.message.includes('chk_valid_tier'));
  }

  // chk_valid_dates: expires_at must be after starts_at
  try {
    await pool.query(
      `INSERT INTO manager_delegations (delegator_id, delegate_id, max_tier, starts_at, expires_at)
       VALUES ($1, $2, 2, NOW(), NOW() - INTERVAL '1 hour')`,
      [MANAGER_USER.id, SALESPERSON_USER.id]
    );
    test('DB rejects expires_at before starts_at', false, 'INSERT should have failed');
  } catch (e) {
    test('DB rejects expires_at before starts_at (chk_valid_dates)', e.message.includes('chk_valid_dates'));
  }
}

// ============================================================================
// MAIN
// ============================================================================
async function main() {
  console.log('\n' + '█'.repeat(70));
  console.log('  COMPREHENSIVE APPROVAL SYSTEM TEST SUITE');
  console.log('  ' + new Date().toISOString());
  console.log('█'.repeat(70));

  try {
    const serverUp = await checkServer();
    if (!serverUp) {
      console.log('\n⚠️  Backend server is not running. Start it with: node backend/server.js');
      console.log('    Then re-run this test.\n');
      await pool.end();
      process.exit(1);
    }

    await testDatabaseSchema();
    await setupUsers();
    await findTestProduct();
    await testTierDetermination();
    const approvedReq = await testApproveAndDeny();
    const counterApproved = await testCounterOfferFlow();
    await testCounterOfferDecline();
    await testTokenConsumption(counterApproved || approvedReq);
    await testAuditTrail();
    await testRoleAuthorization();
    await testBatchApproval();
    await testBatchDeny();
    await testManagerAvailability();
    await testCancellation();
    await testProductHistory();
    await testIntelligence();
    await testDelegationSystem();
    await testTimeoutHandling();
    await testEdgeCases();
    await testDelegationConstraints();

  } catch (err) {
    console.error(`\n💥 FATAL ERROR: ${err.message}`);
    console.error(err.stack);
    results.errors.push(`FATAL: ${err.message}`);
  }

  // ============================================================================
  // SUMMARY
  // ============================================================================
  console.log('\n' + '█'.repeat(70));
  console.log('  TEST RESULTS SUMMARY');
  console.log('█'.repeat(70));
  console.log(`  ✅ Passed:  ${results.passed}`);
  console.log(`  ❌ Failed:  ${results.failed}`);
  console.log(`  ⏭️  Skipped: ${results.skipped}`);
  console.log(`  📊 Total:   ${results.passed + results.failed + results.skipped}`);

  if (results.errors.length > 0) {
    console.log(`\n  FAILURES:`);
    results.errors.forEach((e, i) => console.log(`  ${i + 1}. ${e}`));
  }

  const pct = results.passed + results.failed > 0
    ? ((results.passed / (results.passed + results.failed)) * 100).toFixed(1)
    : '0.0';
  console.log(`\n  Pass rate: ${pct}%`);
  console.log('█'.repeat(70) + '\n');

  await pool.end();
  process.exit(results.failed > 0 ? 1 : 0);
}

main();
