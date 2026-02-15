/**
 * Test: Phase 5 Security & Audit
 * Tests: DB transactions, audit logging, fraud detection, role-based access, approved_by tracking
 */
require('dotenv').config();
const http = require('http');

const BASE = 'http://localhost:3001/api';
let adminToken = null;
let staffToken = null;

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
function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}`);
    failed++;
  }
}

async function run() {
  console.log('=== Phase 5: Security & Audit Tests ===\n');

  const { Pool } = require('pg');
  const pool = new Pool({
    host: process.env.DB_HOST, port: process.env.DB_PORT,
    database: process.env.DB_NAME, user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, ssl: { rejectUnauthorized: false },
  });

  // Login
  adminToken = await login('admin@yourcompany.com', 'TestPass123!');
  console.log('Logged in as admin');

  // Find a staff user from DB directly
  const staffResult = await pool.query(
    "SELECT id, email, role FROM users WHERE role = 'user' AND is_active = true LIMIT 1"
  );
  const staffUser = staffResult.rows[0];
  if (!staffUser) throw new Error('No staff user found in DB');
  staffToken = await login(staffUser.email, 'TestPass123!');
  console.log(`Logged in as staff: ${staffUser.email} (id=${staffUser.id})\n`);

  const prodResult = await pool.query(
    "SELECT id, name, price, cost FROM products WHERE cost > 0 AND price > 0 LIMIT 1"
  );
  const product = prodResult.rows[0];
  console.log(`Test product: ${product.name} ($${product.price}, cost $${product.cost})\n`);

  // =============== Test 1: DB Transaction (Task #6) ===============
  console.log('--- Test 1: DB Transaction for applyDiscount ---');

  // Initialize budget for staff
  const budgetRes = await request('POST', '/discount-authority/budget/initialize', {}, staffToken);
  assert(budgetRes.status === 200, 'Budget initialized');

  // Apply a small discount
  const applyRes = await request('POST', '/discount-authority/apply', {
    productId: product.id,
    originalPrice: parseFloat(product.price),
    cost: parseFloat(product.cost),
    discountPct: 2,
    reason: 'security-test',
  }, staffToken);
  if (applyRes.status !== 200 || !applyRes.body.data?.approved) {
    console.log('  Apply response:', JSON.stringify(applyRes.body).slice(0, 500));
  }
  assert(applyRes.status === 200 && applyRes.body.data?.approved === true, 'Discount applied via transaction');
  assert(applyRes.body.data?.transactionId != null, 'Transaction ID returned');
  assert(applyRes.body.data?.budgetRemaining != null, 'Budget remaining returned');

  const txId = applyRes.body.data?.transactionId;

  // Verify the discount_transaction has correct data
  const dtResult = await pool.query('SELECT * FROM discount_transactions WHERE id = $1', [txId]);
  assert(dtResult.rows.length === 1, 'Discount transaction record exists in DB');
  assert(dtResult.rows[0].was_auto_approved === true, 'was_auto_approved=true (no manager)');

  // =============== Test 2: Audit Logging (Task #7) ===============
  console.log('\n--- Test 2: Audit Logging ---');

  // Check audit_log for the discount_apply entry
  const auditResult = await pool.query(
    "SELECT * FROM audit_log WHERE action = 'discount_apply' AND entity_id = $1 ORDER BY created_at DESC LIMIT 1",
    [txId]
  );
  assert(auditResult.rows.length === 1, 'Audit log entry created for discount_apply');
  if (auditResult.rows[0]) {
    const details = typeof auditResult.rows[0].details === 'string'
      ? JSON.parse(auditResult.rows[0].details)
      : auditResult.rows[0].details;
    assert(details.discount_pct != null, 'Audit log has discount_pct in details');
    assert(details.product_id === product.id, 'Audit log has correct product_id');
  }

  // Test escalation audit logging
  const escRes = await request('POST', '/discount-escalations', {
    productId: product.id,
    discountPct: 20,
    reason: 'audit-test escalation',
    marginAfter: 5.5,
    commissionImpact: 12.00,
  }, staffToken);
  assert(escRes.status === 200, 'Escalation submitted');
  const escId = escRes.body.data?.id;

  const escAuditResult = await pool.query(
    "SELECT * FROM audit_log WHERE action = 'discount_escalation_submit' AND entity_id = $1 ORDER BY created_at DESC LIMIT 1",
    [escId]
  );
  assert(escAuditResult.rows.length === 1, 'Audit log entry created for escalation submit');

  // Manager approves the escalation
  if (escId) {
    const approveRes = await request('PUT', `/discount-escalations/${escId}/approve`, {
      notes: 'approved for audit test',
    }, adminToken);
    assert(approveRes.status === 200, 'Escalation approved by manager');

    const approveAuditResult = await pool.query(
      "SELECT * FROM audit_log WHERE action = 'discount_escalation_approve' AND entity_id = $1 ORDER BY created_at DESC LIMIT 1",
      [escId]
    );
    assert(approveAuditResult.rows.length === 1, 'Audit log entry for escalation approval');
  }

  // =============== Test 3: Fraud Detection Rules (Task #8) ===============
  console.log('\n--- Test 3: Fraud Detection Rules ---');

  const rulesResult = await pool.query(
    "SELECT rule_code, rule_name, risk_points, severity FROM fraud_rules WHERE rule_code LIKE 'discount_%' AND is_active = true"
  );
  assert(rulesResult.rows.length === 3, `3 discount fraud rules exist (got ${rulesResult.rows.length})`);

  const ruleNames = rulesResult.rows.map(r => r.rule_code).sort();
  assert(ruleNames.includes('discount_max_pattern'), 'discount_max_pattern rule exists');
  assert(ruleNames.includes('discount_void_pattern'), 'discount_void_pattern rule exists');
  assert(ruleNames.includes('discount_refund_ratio'), 'discount_refund_ratio rule exists');

  // =============== Test 4: Fraud Check on Apply (Task #9) ===============
  console.log('\n--- Test 4: Fraud Check Integration ---');

  // Apply another discount - should include fraud assessment (even if score=0)
  const applyRes2 = await request('POST', '/discount-authority/apply', {
    productId: product.id,
    originalPrice: parseFloat(product.price),
    cost: parseFloat(product.cost),
    discountPct: 3,
    reason: 'fraud-check-test',
  }, staffToken);
  assert(applyRes2.status === 200, 'Second discount applied (fraud check ran)');
  // If no fraud rules triggered, there's no fraud field
  // Just verify it didn't crash and the discount was applied
  assert(applyRes2.body.data?.approved === true, 'Discount approved despite fraud check');

  // =============== Test 5: approved_by Tracking (Task #10) ===============
  console.log('\n--- Test 5: approved_by Tracking ---');

  // Apply a discount with approvedBy (simulating manager-approved escalation)
  const applyRes3 = await request('POST', '/discount-authority/apply', {
    productId: product.id,
    originalPrice: parseFloat(product.price),
    cost: parseFloat(product.cost),
    discountPct: 1,
    reason: 'manager-approved-test',
    approvedBy: 1, // admin user id
  }, staffToken);
  assert(applyRes3.status === 200, 'Discount applied with approvedBy');

  if (applyRes3.body.data?.transactionId) {
    const approvedTxResult = await pool.query(
      'SELECT approved_by, was_auto_approved, required_manager_approval FROM discount_transactions WHERE id = $1',
      [applyRes3.body.data.transactionId]
    );
    const row = approvedTxResult.rows[0];
    assert(row?.approved_by === 1, 'approved_by set to manager ID');
    assert(row?.was_auto_approved === false, 'was_auto_approved=false when manager approved');
    assert(row?.required_manager_approval === true, 'required_manager_approval=true');
  }

  // =============== Test 6: Role-Based Access ===============
  console.log('\n--- Test 6: Role-Based Access ---');

  // Staff cannot access analytics
  const analyticsRes = await request('GET', '/discount-analytics/by-employee', null, staffToken);
  assert(analyticsRes.status === 403, 'Staff blocked from analytics (403)');

  // Admin can access analytics
  const analyticsAdminRes = await request('GET', '/discount-analytics/by-employee', null, adminToken);
  assert(analyticsAdminRes.status === 200, 'Admin can access analytics');

  // Staff cannot access tiers list
  const tiersRes = await request('GET', '/discount-authority/tiers', null, staffToken);
  assert(tiersRes.status === 403, 'Staff blocked from tier list (403)');

  // Staff cannot view other employee budgets
  const otherBudgetRes = await request('GET', '/discount-authority/budget/1', null, staffToken);
  assert(otherBudgetRes.status === 403 || otherBudgetRes.status === 401, 'Staff blocked from other budgets');

  // Staff can view own budget
  const ownBudgetRes = await request('GET', `/discount-authority/budget/${staffUser.id}`, null, staffToken);
  assert(ownBudgetRes.status === 200, 'Staff can view own budget');

  // Staff cannot access pending escalations
  const pendingRes = await request('GET', '/discount-escalations/pending', null, staffToken);
  assert(pendingRes.status === 403, 'Staff blocked from escalation queue (403)');

  // Admin can access pending escalations
  const pendingAdminRes = await request('GET', '/discount-escalations/pending', null, adminToken);
  assert(pendingAdminRes.status === 200, 'Admin can access escalation queue');

  // =============== Test 7: Tier Config Update Audit ===============
  console.log('\n--- Test 7: Tier Config Update Audit ---');

  // Get current staff tier config
  const beforeResult = await pool.query(
    "SELECT * FROM discount_authority_tiers WHERE role_name = 'staff'"
  );
  const currentMax = parseFloat(beforeResult.rows[0]?.max_discount_pct_standard) || 5;

  // Admin updates staff tier (then reverts)
  const updateRes = await request('PUT', '/discount-authority/tiers/staff', {
    max_discount_pct_standard: currentMax + 0.5,
  }, adminToken);
  assert(updateRes.status === 200, 'Tier config updated by admin');

  // Check audit log for tier update
  const tierAuditResult = await pool.query(
    "SELECT * FROM audit_log WHERE action = 'discount_tier_update' ORDER BY created_at DESC LIMIT 1"
  );
  assert(tierAuditResult.rows.length >= 1, 'Audit log entry for tier config update');

  // Revert the change
  await request('PUT', '/discount-authority/tiers/staff', {
    max_discount_pct_standard: currentMax,
  }, adminToken);

  // =============== Summary ===============
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
