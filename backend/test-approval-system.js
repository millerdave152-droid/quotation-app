#!/usr/bin/env node
/**
 * Comprehensive Approval System Test Suite
 *
 * Tests: schema, tiers, request lifecycle, counter-offers, tokens,
 *        audit trail, timeouts, role authorization, API routes.
 */

const pool = require('./db');
const ApprovalService = require('./services/ApprovalService');
const { generateAccessToken } = require('./utils/jwt');

const approvalService = new ApprovalService(pool);
const BASE_URL = 'http://localhost:3001/api/pos-approvals';

// ─── Test harness ─────────────────────────────────────────────────

let passed = 0, failed = 0, skipped = 0;
const failures = [];

function log(label, status, detail) {
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⏭️';
  console.log(`${icon} ${label}${detail ? ' — ' + detail : ''}`);
  if (status === 'PASS') passed++;
  else if (status === 'FAIL') { failed++; failures.push({ label, detail }); }
  else skipped++;
}

function assert(cond, label, detail) {
  log(label, cond ? 'PASS' : 'FAIL', detail);
  return cond;
}

async function api(method, path, token, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (token) opts.headers['Authorization'] = 'Bearer ' + token;
  if (body) opts.body = JSON.stringify(body);
  try {
    const resp = await fetch(BASE_URL + path, opts);
    const data = await resp.json().catch(function() { return {}; });
    return { status: resp.status, data: data };
  } catch (err) {
    return { status: 0, data: { error: err.message } };
  }
}

// ═══════════════════════════════════════════════════════════════════

async function runTests() {
  console.log('═══════════════════════════════════════════════');
  console.log('  APPROVAL SYSTEM — COMPREHENSIVE TEST SUITE');
  console.log('═══════════════════════════════════════════════\n');

  // ─── SETUP ────────────────────────────────────────────────────

  console.log('--- SETUP ---\n');

  // Save original roles
  const origRows = (await pool.query(
    "SELECT id, role FROM users WHERE id IN (1, 3, 4, 5)"
  )).rows;
  const originalRoles = {};
  origRows.forEach(function(u) { originalRoles[u.id] = u.role; });

  // Set test roles
  await pool.query("UPDATE users SET role = 'salesperson' WHERE id = 5");
  await pool.query("UPDATE users SET role = 'senior_manager' WHERE id = 3");
  // id 4 = manager, id 1 = admin (already correct)

  const salesperson = { id: 5, email: 'sales@test.com', role: 'salesperson' };
  const mgr = { id: 4, email: 'manager@test.com', role: 'manager' };
  const seniorMgr = { id: 3, email: 'newuser@example.com', role: 'senior_manager' };
  const admin = { id: 1, email: 'admin@yourcompany.com', role: 'admin' };

  const spToken = generateAccessToken(salesperson);
  const mgrToken = generateAccessToken(mgr);
  const smToken = generateAccessToken(seniorMgr);
  const adminToken = generateAccessToken(admin);

  // Find product with high margin so all tiers are testable (need >50% margin for Tier 3 above-cost)
  const prodRow = (await pool.query(
    "SELECT id, name, price, cost FROM products WHERE price > 100 AND cost > 0 AND cost < price * 0.45 ORDER BY price DESC LIMIT 1"
  )).rows[0];
  if (!prodRow) { console.error('No suitable product'); process.exit(1); }
  const PID = prodRow.id;
  const ORIG = parseFloat(prodRow.price);
  const COST = parseFloat(prodRow.cost);
  console.log('  Product #' + PID + ': price=$' + ORIG + ' cost=$' + COST);
  console.log('  Users: salesperson=5, manager=4, senior_manager=3, admin=1\n');

  // Ensure manager_pins row for manager (daily limit checks)
  // Unique constraint is on (user_id, is_active), not just user_id
  for (var pinUser of [mgr.id, seniorMgr.id, admin.id]) {
    var existing = await pool.query("SELECT id FROM manager_pins WHERE user_id = $1 AND is_active = true", [pinUser]);
    if (existing.rows.length === 0) {
      await pool.query(
        "INSERT INTO manager_pins (user_id, pin_hash, max_daily_overrides, is_active) VALUES ($1, 'test', 999, true)",
        [pinUser]
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // TEST 1: DATABASE SCHEMA
  // ═══════════════════════════════════════════════════════════════

  console.log('--- TEST 1: DATABASE SCHEMA ---\n');

  var tables = ['approval_requests', 'approval_counter_offers', 'manager_availability', 'approval_tier_settings'];
  for (var ti = 0; ti < tables.length; ti++) {
    var table = tables[ti];
    var tc = await pool.query(
      "SELECT COUNT(*) as cnt FROM information_schema.tables WHERE table_name = $1", [table]
    );
    assert(parseInt(tc.rows[0].cnt) > 0, 'Table "' + table + '" exists');
  }

  // Check approval_requests columns
  var arCols = (await pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'approval_requests'"
  )).rows.map(function(r) { return r.column_name; });
  var reqCols = ['id', 'salesperson_id', 'manager_id', 'product_id', 'original_price',
    'requested_price', 'approved_price', 'tier', 'status', 'approval_token',
    'token_used', 'token_expires_at', 'method', 'cost_at_time', 'margin_percent',
    'reason_code', 'reason_note', 'responded_at', 'response_time_ms'];
  for (var ci = 0; ci < reqCols.length; ci++) {
    assert(arCols.indexOf(reqCols[ci]) >= 0, 'approval_requests.' + reqCols[ci] + ' exists');
  }

  // Check tier settings
  var tiers = (await pool.query("SELECT * FROM approval_tier_settings ORDER BY tier")).rows;
  assert(tiers.length >= 4, 'Tier settings seeded (' + tiers.length + ' tiers)');

  if (tiers.length >= 4) {
    assert(parseFloat(tiers[0].max_discount_percent) === 10, 'Tier 1 ends at 10%');
    assert(tiers[0].required_role === 'salesperson', 'Tier 1 requires salesperson');
    assert(parseFloat(tiers[1].max_discount_percent) === 25, 'Tier 2 ends at 25%');
    assert(tiers[1].required_role === 'manager', 'Tier 2 requires manager');
    assert(parseFloat(tiers[2].max_discount_percent) === 50, 'Tier 3 ends at 50%');
    assert(tiers[2].required_role === 'senior_manager', 'Tier 3 requires senior_manager');
    assert(tiers[3].allows_below_cost === true, 'Tier 4 allows below cost');
    assert(tiers[3].required_role === 'admin', 'Tier 4 requires admin');
  }

  // Check enum types
  var enums = (await pool.query(
    "SELECT typname FROM pg_type WHERE typname IN ('approval_request_status', 'approval_method', 'counter_offer_status')"
  )).rows;
  assert(enums.length >= 3, 'Enum types created', enums.map(function(r){return r.typname}).join(', '));

  // ═══════════════════════════════════════════════════════════════
  // TEST 2: TIER DETERMINATION
  // ═══════════════════════════════════════════════════════════════

  console.log('\n--- TEST 2: TIER DETERMINATION ---\n');

  // 5% discount → Tier 1 (auto-approve)
  var price5 = Math.round(ORIG * 0.95 * 100) / 100;
  var r1 = await approvalService.createRequest({
    salespersonId: salesperson.id, productId: PID, requestedPrice: price5
  });
  assert(r1.tier === 1, 'Tier 1: 5% discount', 'tier=' + r1.tier);
  assert(r1.status === 'approved', 'Tier 1: auto-approved', 'status=' + r1.status);
  assert(r1.autoApproved === true, 'Tier 1: autoApproved flag set');

  // 15% discount → Tier 2
  var price15 = Math.round(ORIG * 0.85 * 100) / 100;
  var r2 = await approvalService.createRequest({
    salespersonId: salesperson.id, productId: PID, requestedPrice: price15
  });
  assert(r2.tier === 2, 'Tier 2: 15% discount', 'tier=' + r2.tier);
  assert(r2.status === 'pending', 'Tier 2: pending');

  // 30% discount → Tier 3
  var price30 = Math.round(ORIG * 0.70 * 100) / 100;
  var r3 = await approvalService.createRequest({
    salespersonId: salesperson.id, productId: PID, requestedPrice: price30
  });
  assert(r3.tier === 3, 'Tier 3: 30% discount', 'tier=' + r3.tier);
  assert(r3.status === 'pending', 'Tier 3: pending');

  // Below cost → Tier 4
  var priceBelowCost = Math.round(COST * 0.40 * 100) / 100;
  var r4 = await approvalService.createRequest({
    salespersonId: salesperson.id, productId: PID, requestedPrice: priceBelowCost
  });
  assert(r4.tier === 4, 'Tier 4: below cost', 'tier=' + r4.tier + ', price=$' + priceBelowCost + ' < cost=$' + COST);
  assert(r4.status === 'pending', 'Tier 4: pending');

  // ═══════════════════════════════════════════════════════════════
  // TEST 3: TOKEN GENERATION & CONSUMPTION
  // ═══════════════════════════════════════════════════════════════

  console.log('\n--- TEST 3: TOKEN GENERATION & CONSUMPTION ---\n');

  // Tier 1 auto-approved already has a token
  assert(r1.approval_token && r1.approval_token.length === 64, 'Token is 64-char hex', 'len=' + (r1.approval_token || '').length);
  assert(r1.token_used === false, 'Token initially unused');

  // Consume the tier 1 token
  var consumed = await approvalService.consumeToken({ token: r1.approval_token });
  assert(consumed.requestId === r1.id, 'Token consumed: correct requestId');
  assert(consumed.productId === PID, 'Token consumed: correct productId');
  assert(Math.abs(consumed.approvedPrice - price5) < 0.02, 'Token consumed: correct price', '$' + consumed.approvedPrice);

  // Double consumption should fail
  var dblErr = null;
  try { await approvalService.consumeToken({ token: r1.approval_token }); } catch(e) { dblErr = e.message; }
  assert(dblErr && dblErr.indexOf('Invalid') >= 0, 'Double consumption blocked', dblErr);

  // Fake token should fail
  var fakeErr = null;
  try { await approvalService.consumeToken({ token: 'a'.repeat(64) }); } catch(e) { fakeErr = e.message; }
  assert(fakeErr, 'Fake token rejected', fakeErr);

  // ═══════════════════════════════════════════════════════════════
  // TEST 4: ROLE AUTHORIZATION
  // ═══════════════════════════════════════════════════════════════

  console.log('\n--- TEST 4: ROLE AUTHORIZATION ---\n');

  // Manager CANNOT approve Tier 3
  var authErr3 = null;
  try {
    await approvalService.approveRequest({ requestId: r3.id, managerId: mgr.id, method: 'remote' });
  } catch(e) { authErr3 = e.message; }
  assert(authErr3 && authErr3.indexOf('authority') >= 0, 'Manager blocked from Tier 3', authErr3);

  // Manager CANNOT approve Tier 4
  var authErr4 = null;
  try {
    await approvalService.approveRequest({ requestId: r4.id, managerId: mgr.id, method: 'remote' });
  } catch(e) { authErr4 = e.message; }
  assert(authErr4 && authErr4.indexOf('authority') >= 0, 'Manager blocked from Tier 4', authErr4);

  // Manager CAN approve Tier 2
  var approve2 = await approvalService.approveRequest({ requestId: r2.id, managerId: mgr.id, method: 'remote' });
  assert(approve2.status === 'approved', 'Manager approved Tier 2');
  assert(!!approve2.approval_token, 'Tier 2 token generated');

  // Senior manager CAN approve Tier 3
  var approve3 = await approvalService.approveRequest({ requestId: r3.id, managerId: seniorMgr.id, method: 'remote' });
  assert(approve3.status === 'approved', 'Sr Manager approved Tier 3');
  assert(!!approve3.approval_token, 'Tier 3 token generated');

  // Admin CAN approve Tier 4
  var approve4 = await approvalService.approveRequest({ requestId: r4.id, managerId: admin.id, method: 'remote' });
  assert(approve4.status === 'approved', 'Admin approved Tier 4');
  assert(!!approve4.approval_token, 'Tier 4 token generated');

  // ═══════════════════════════════════════════════════════════════
  // TEST 5: COUNTER-OFFER FLOW
  // ═══════════════════════════════════════════════════════════════

  console.log('\n--- TEST 5: COUNTER-OFFER FLOW ---\n');

  // Create a Tier 2 request
  var price20 = Math.round(ORIG * 0.80 * 100) / 100;
  var reqCO = await approvalService.createRequest({
    salespersonId: salesperson.id, productId: PID, requestedPrice: price20
  });
  assert(reqCO.status === 'pending', 'Counter test: created pending request');

  // Manager counter-offers at 10% discount
  var counterPrice = Math.round(ORIG * 0.90 * 100) / 100;
  var co = await approvalService.createCounterOffer({
    requestId: reqCO.id, managerId: mgr.id, counterPrice: counterPrice
  });
  assert(co.offered_by === 'manager', 'Counter-offer from manager');
  assert(parseFloat(co.price) === counterPrice, 'Counter price correct', '$' + co.price);
  var coId = co.id;

  // Verify parent request is now 'countered'
  var coParent = (await pool.query("SELECT status FROM approval_requests WHERE id = $1", [reqCO.id])).rows[0];
  assert(coParent.status === 'countered', 'Parent request status = countered');

  // Counter-offer record stored correctly
  var coRow = (await pool.query("SELECT * FROM approval_counter_offers WHERE id = $1", [coId])).rows[0];
  assert(coRow.status === 'pending', 'Counter-offer status = pending');
  assert(coRow.approval_request_id === reqCO.id, 'Counter-offer linked to request');

  // Salesperson accepts counter-offer
  var accepted = await approvalService.acceptCounterOffer({
    counterOfferId: coId, salespersonId: salesperson.id
  });
  assert(accepted.status === 'approved', 'Accept counter: approved');
  assert(!!accepted.approval_token, 'Accept counter: token generated');
  assert(Math.abs(parseFloat(accepted.approved_price) - counterPrice) < 0.02,
    'Accept counter: approved at counter price', '$' + accepted.approved_price);

  // Verify counter-offer record marked accepted
  var coAfter = (await pool.query("SELECT status FROM approval_counter_offers WHERE id = $1", [coId])).rows[0];
  assert(coAfter.status === 'accepted', 'Counter-offer record = accepted');

  // Test DECLINE flow
  var reqCO2 = await approvalService.createRequest({
    salespersonId: salesperson.id, productId: PID, requestedPrice: price20
  });
  var co2 = await approvalService.createCounterOffer({
    requestId: reqCO2.id, managerId: mgr.id, counterPrice: counterPrice
  });

  var declined = await approvalService.declineCounterOffer({
    counterOfferId: co2.id, salespersonId: salesperson.id
  });
  assert(declined.status === 'pending', 'Decline counter: back to pending');

  var co2After = (await pool.query("SELECT status FROM approval_counter_offers WHERE id = $1", [co2.id])).rows[0];
  assert(co2After.status === 'declined', 'Declined counter-offer record = declined');

  // Cleanup
  await pool.query("UPDATE approval_requests SET status = 'cancelled' WHERE id = $1", [reqCO2.id]);

  // ═══════════════════════════════════════════════════════════════
  // TEST 6: DENIAL FLOW
  // ═══════════════════════════════════════════════════════════════

  console.log('\n--- TEST 6: DENIAL FLOW ---\n');

  var reqDeny = await approvalService.createRequest({
    salespersonId: salesperson.id, productId: PID, requestedPrice: price15
  });
  var denied = await approvalService.denyRequest({
    requestId: reqDeny.id, managerId: mgr.id, reasonCode: 'PRICE_TOO_LOW', reasonNote: 'Test denial'
  });
  assert(denied.status === 'denied', 'Deny: status = denied');
  assert(!denied.approval_token, 'Deny: no token generated');
  assert(denied.reason_code === 'PRICE_TOO_LOW', 'Deny: reason_code stored');
  assert(denied.reason_note === 'Test denial', 'Deny: reason_note stored');

  // ═══════════════════════════════════════════════════════════════
  // TEST 7: AUDIT TRAIL
  // ═══════════════════════════════════════════════════════════════

  console.log('\n--- TEST 7: AUDIT TRAIL ---\n');

  // Check approved request (tier 2)
  var auditRow = (await pool.query("SELECT * FROM approval_requests WHERE id = $1", [r2.id])).rows[0];
  assert(auditRow.salesperson_id === salesperson.id, 'Audit: salesperson_id');
  assert(auditRow.manager_id === mgr.id, 'Audit: manager_id');
  assert(auditRow.product_id === PID, 'Audit: product_id');
  assert(parseFloat(auditRow.original_price) === ORIG, 'Audit: original_price');
  assert(auditRow.status === 'approved', 'Audit: status = approved');
  assert(auditRow.tier === 2, 'Audit: tier = 2');
  assert(auditRow.method === 'remote', 'Audit: method = remote');
  assert(auditRow.responded_at !== null, 'Audit: responded_at set');
  assert(auditRow.created_at !== null, 'Audit: created_at set');
  assert(parseInt(auditRow.response_time_ms) >= 0, 'Audit: response_time_ms recorded', auditRow.response_time_ms + 'ms');
  assert(parseFloat(auditRow.cost_at_time) === COST, 'Audit: cost_at_time recorded');
  assert(parseFloat(auditRow.margin_percent) > 0, 'Audit: margin_percent recorded', auditRow.margin_percent + '%');

  // Check denied request
  var denyAudit = (await pool.query("SELECT * FROM approval_requests WHERE id = $1", [reqDeny.id])).rows[0];
  assert(denyAudit.reason_code === 'PRICE_TOO_LOW', 'Audit: denial reason_code');
  assert(denyAudit.reason_note === 'Test denial', 'Audit: denial reason_note');
  assert(denyAudit.responded_at !== null, 'Audit: denial responded_at set');

  // ═══════════════════════════════════════════════════════════════
  // TEST 8: TIMEOUT HANDLING
  // ═══════════════════════════════════════════════════════════════

  console.log('\n--- TEST 8: TIMEOUT HANDLING ---\n');

  // Create a Tier 2 request (timeout_seconds=180 from tier settings)
  var reqTO = await approvalService.createRequest({
    salespersonId: salesperson.id, productId: PID, requestedPrice: price15
  });
  assert(reqTO.timeoutSeconds === 180, 'Timeout: tier 2 timeout = 180s', 'timeout=' + reqTO.timeoutSeconds);

  // Simulate timeout by backdating created_at past the timeout
  await pool.query(
    "UPDATE approval_requests SET created_at = NOW() - INTERVAL '10 minutes' WHERE id = $1",
    [reqTO.id]
  );

  // Tier 2 timeout is 180s = 3 minutes, so 10 minutes ago is well past timeout
  // Run the timeout sweep SQL (same logic as WebSocketService)
  var tierTimeouts = {};
  var tierRows = (await pool.query("SELECT tier, timeout_seconds FROM approval_tier_settings WHERE timeout_seconds > 0")).rows;
  tierRows.forEach(function(t) { tierTimeouts[t.tier] = t.timeout_seconds; });

  var sweepResult = await pool.query(
    "UPDATE approval_requests SET status = 'timed_out' WHERE status = 'pending' AND id = $1 AND created_at + INTERVAL '180 seconds' < NOW() RETURNING id",
    [reqTO.id]
  );
  var wasSwept = sweepResult.rows.length > 0;
  assert(wasSwept, 'Timeout: sweep caught expired request');

  // Verify status
  var toRow = (await pool.query("SELECT status, approval_token FROM approval_requests WHERE id = $1", [reqTO.id])).rows[0];
  assert(toRow.status === 'timed_out', 'Timeout: status = timed_out');
  assert(!toRow.approval_token, 'Timeout: no token for timed-out request');

  // Tier 1 and Tier 4 have timeout_seconds=0 (no timeout)
  assert(tiers[0].timeout_seconds === 0, 'Tier 1: no timeout (0)');
  assert(tiers[3].timeout_seconds === 0, 'Tier 4: no timeout (0)');

  // ═══════════════════════════════════════════════════════════════
  // TEST 9: CANCEL FLOW
  // ═══════════════════════════════════════════════════════════════

  console.log('\n--- TEST 9: CANCEL FLOW ---\n');

  var reqCancel = await approvalService.createRequest({
    salespersonId: salesperson.id, productId: PID, requestedPrice: price15
  });
  var cancelled = await approvalService.cancelRequest({
    requestId: reqCancel.id, salespersonId: salesperson.id
  });
  assert(cancelled.status === 'cancelled', 'Cancel: status = cancelled');

  // Cannot cancel someone else's request
  var cancelOther = null;
  var reqOther = await approvalService.createRequest({
    salespersonId: salesperson.id, productId: PID, requestedPrice: price15
  });
  try {
    await approvalService.cancelRequest({ requestId: reqOther.id, salespersonId: mgr.id });
  } catch(e) { cancelOther = e.message; }
  assert(cancelOther, 'Cannot cancel others\' request', cancelOther);
  // Cleanup
  await pool.query("UPDATE approval_requests SET status = 'cancelled' WHERE id = $1", [reqOther.id]);

  // ═══════════════════════════════════════════════════════════════
  // TEST 10: API ENDPOINTS
  // ═══════════════════════════════════════════════════════════════

  console.log('\n--- TEST 10: API ENDPOINTS ---\n');

  var serverRunning = false;
  try {
    var healthResp = await fetch('http://localhost:3001/api/health');
    serverRunning = healthResp.status === 200;
  } catch(e) {}

  if (!serverRunning) {
    log('API tests: server not running on :3001', 'SKIP', 'Start server to test HTTP routes');
  } else {
    // GET /settings/tiers (admin)
    var t1 = await api('GET', '/settings/tiers', adminToken);
    assert(t1.status === 200, 'API: GET /settings/tiers', 'status=' + t1.status);

    // POST /request (salesperson)
    var t2 = await api('POST', '/request', spToken, { productId: PID, requestedPrice: price15 });
    assert(t2.status === 200 || t2.status === 201, 'API: POST /request', 'status=' + t2.status);
    var apiReqId = t2.data.request ? t2.data.request.id : t2.data.id;

    if (apiReqId) {
      // GET /:id/status
      var t3 = await api('GET', '/' + apiReqId + '/status', spToken);
      assert(t3.status === 200, 'API: GET /:id/status', 'status=' + t3.status);

      // GET /pending (manager)
      var t4 = await api('GET', '/pending', mgrToken);
      assert(t4.status === 200, 'API: GET /pending', 'status=' + t4.status);

      // GET /managers/available
      var t5 = await api('GET', '/managers/available?tier=2', spToken);
      assert(t5.status === 200, 'API: GET /managers/available', 'status=' + t5.status);

      // POST /:id/approve (manager)
      var t6 = await api('POST', '/' + apiReqId + '/approve', mgrToken, { method: 'remote' });
      assert(t6.status === 200, 'API: POST /:id/approve', 'status=' + t6.status);

      // POST /consume-token
      var apiToken = t6.data.request ? t6.data.request.approval_token : t6.data.approval_token;
      if (apiToken) {
        var t7 = await api('POST', '/consume-token', spToken, { token: apiToken });
        assert(t7.status === 200, 'API: POST /consume-token', 'status=' + t7.status);
      } else {
        log('API: POST /consume-token', 'SKIP', 'no token in approve response');
      }

      // POST /request → deny
      var t8a = await api('POST', '/request', spToken, { productId: PID, requestedPrice: price15 });
      var denyApiId = t8a.data.request ? t8a.data.request.id : t8a.data.id;
      if (denyApiId) {
        var t8b = await api('POST', '/' + denyApiId + '/deny', mgrToken, { reasonCode: 'TEST', reasonNote: 'API deny' });
        assert(t8b.status === 200, 'API: POST /:id/deny', 'status=' + t8b.status);
      }

      // POST /request → counter → accept
      var t9a = await api('POST', '/request', spToken, { productId: PID, requestedPrice: price20 });
      var counterApiId = t9a.data.request ? t9a.data.request.id : t9a.data.id;
      if (counterApiId) {
        var t9b = await api('POST', '/' + counterApiId + '/counter', mgrToken, { counterPrice: counterPrice });
        assert(t9b.status === 200, 'API: POST /:id/counter', 'status=' + t9b.status);
        var coid = t9b.data.counterOffer ? t9b.data.counterOffer.id : (t9b.data.counter_offer_id || t9b.data.id);
        if (coid) {
          var t9c = await api('POST', '/' + counterApiId + '/accept-counter', spToken, { counterOfferId: coid });
          assert(t9c.status === 200, 'API: POST /:id/accept-counter', 'status=' + t9c.status);
        }
      }

      // POST /:id/cancel
      var t10a = await api('POST', '/request', spToken, { productId: PID, requestedPrice: price15 });
      var cancelApiId = t10a.data.request ? t10a.data.request.id : t10a.data.id;
      if (cancelApiId) {
        var t10b = await api('POST', '/' + cancelApiId + '/cancel', spToken);
        assert(t10b.status === 200, 'API: POST /:id/cancel', 'status=' + t10b.status);
      }
    }

    // GET /analytics (admin only)
    var t11 = await api('GET', '/analytics', adminToken);
    assert(t11.status === 200, 'API: GET /analytics (admin)', 'status=' + t11.status);

    // GET /audit-log (admin only)
    var t12 = await api('GET', '/audit-log', adminToken);
    assert(t12.status === 200, 'API: GET /audit-log (admin)', 'status=' + t12.status);

    // Salesperson cannot access admin routes
    var t13 = await api('GET', '/analytics', spToken);
    assert(t13.status === 403 || t13.status === 401, 'API: Salesperson blocked from /analytics', 'status=' + t13.status);

    // Unauthenticated access blocked
    var t14 = await api('GET', '/pending', null);
    assert(t14.status === 401 || t14.status === 403, 'API: No-auth blocked', 'status=' + t14.status);

    // Manager can't approve Tier 3 via API
    var t15a = await api('POST', '/request', spToken, { productId: PID, requestedPrice: price30 });
    var t3ApiId = t15a.data.request ? t15a.data.request.id : t15a.data.id;
    if (t3ApiId) {
      var t15b = await api('POST', '/' + t3ApiId + '/approve', mgrToken, { method: 'remote' });
      assert(t15b.status >= 400, 'API: Manager blocked from Tier 3', 'status=' + t15b.status);
      // Cleanup
      await pool.query("UPDATE approval_requests SET status = 'cancelled' WHERE id = $1", [t3ApiId]);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // TEST 11: WEBSOCKET CONNECTIVITY
  // ═══════════════════════════════════════════════════════════════

  console.log('\n--- TEST 11: WEBSOCKET ---\n');

  if (!serverRunning) {
    log('WebSocket tests: server not running', 'SKIP');
  } else {
    try {
      var WebSocket = require('ws');
      var wsConnected = false;
      var wsEvent = null;

      await new Promise(function(resolve, reject) {
        var ws = new WebSocket('ws://localhost:3001/ws?token=' + mgrToken);
        var timeout = setTimeout(function() { ws.close(); reject(new Error('timeout')); }, 5000);

        ws.on('open', function() { wsConnected = true; });
        ws.on('message', function(data) {
          try {
            var parsed = JSON.parse(data.toString());
            if (parsed.event === 'connected') {
              wsEvent = parsed;
              clearTimeout(timeout);
              ws.close();
              resolve();
            }
          } catch(e) {}
        });
        ws.on('error', function(err) { clearTimeout(timeout); reject(err); });
        ws.on('close', function() { clearTimeout(timeout); resolve(); });
      });

      assert(wsConnected, 'WebSocket: connection opened');
      assert(wsEvent && wsEvent.event === 'connected', 'WebSocket: received "connected" event');
    } catch(err) {
      log('WebSocket test', 'FAIL', err.message);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // CLEANUP
  // ═══════════════════════════════════════════════════════════════

  console.log('\n--- CLEANUP ---\n');

  var cleaned = await pool.query(
    "DELETE FROM approval_requests WHERE salesperson_id = $1 AND product_id = $2 RETURNING id",
    [salesperson.id, PID]
  );
  console.log('  Cleaned ' + cleaned.rows.length + ' test approval requests');

  // Restore original roles
  for (var uid in originalRoles) {
    await pool.query("UPDATE users SET role = $1 WHERE id = $2", [originalRoles[uid], parseInt(uid)]);
  }
  console.log('  Restored original user roles');

  // ═══════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════

  console.log('\n═══════════════════════════════════════════════');
  console.log('  RESULTS: ' + passed + ' passed, ' + failed + ' failed, ' + skipped + ' skipped');
  console.log('═══════════════════════════════════════════════\n');

  if (failed > 0) {
    console.log('FAILURES:');
    failures.forEach(function(f) { console.log('  ❌ ' + f.label + ': ' + f.detail); });
    console.log('');
  }

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(function(err) {
  console.error('\nFATAL ERROR:', err.message, err.stack);
  process.exit(1);
});
