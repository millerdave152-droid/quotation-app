/**
 * Self-contained integration test that starts its own server on port 3099.
 * Run: node test-approval-routes-self.js
 */
const http = require('http');
const TEST_PORT = 3093;
const BASE = `http://localhost:${TEST_PORT}/api`;
let TOKEN = '';

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE + path);
    const opts = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        ...(TOKEN ? { Authorization: 'Bearer ' + TOKEN } : {}),
      },
    };
    const r = http.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    r.on('error', reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

(async () => {
  // Start server on test port
  process.env.PORT = TEST_PORT;
  const app = require('./server');

  // Wait for the server to be ready
  await new Promise(resolve => setTimeout(resolve, 3000));

  let passed = 0;
  let failed = 0;
  function check(label, condition) {
    if (condition) { console.log(`  PASS: ${label}`); passed++; }
    else { console.log(`  FAIL: ${label}`); failed++; }
  }

  try {
    // Login
    const login = await req('POST', '/auth/login', { email: 'admin@yourcompany.com', password: 'TestPass123!' });
    if (!login.body.success) { console.error('Login failed:', JSON.stringify(login.body)); process.exit(1); }
    TOKEN = login.body.data.accessToken;
    console.log('Logged in\n');

    const pool = require('./db');
    const { rows: [product] } = await pool.query('SELECT id, price, cost FROM products WHERE price > 0 AND cost > 0 LIMIT 1');
    const pid = product.id;
    const origPrice = parseFloat(product.price);

    // 1. Tier 1 auto-approve
    console.log('1. Tier 1 auto-approve');
    const r1 = await req('POST', '/pos-approvals/request', { cartId: 901, cartItemId: 9001, productId: pid, requestedPrice: origPrice * 0.95 });
    if (r1.status !== 200) console.log('  DEBUG r1:', JSON.stringify(r1.body).substring(0, 300));
    check('status 200', r1.status === 200);
    check('autoApproved', r1.body.data?.autoApproved === true);

    // 2. Tier 2 pending
    console.log('\n2. Tier 2 pending');
    const r2 = await req('POST', '/pos-approvals/request', { cartId: 902, cartItemId: 9002, productId: pid, requestedPrice: origPrice * 0.85 });
    const reqId = r2.body.data?.id;
    check('status 201', r2.status === 201);
    check('pending', r2.body.data?.status === 'pending');
    check('tier 2', r2.body.data?.tier === 2);

    // 3. Status poll
    console.log('\n3. Status poll');
    const r3 = await req('GET', `/pos-approvals/${reqId}/status`);
    check('status 200', r3.status === 200);
    check('pending', r3.body.data?.status === 'pending');

    // 4. Pending queue
    console.log('\n4. Pending queue');
    const r4 = await req('GET', '/pos-approvals/pending');
    check('status 200', r4.status === 200);
    check('is array', Array.isArray(r4.body.data));

    // 5. Counter offer
    console.log('\n5. Counter offer');
    const r5 = await req('POST', `/pos-approvals/${reqId}/counter`, { counterPrice: origPrice * 0.90 });
    check('status 200', r5.status === 200);
    const coId = r5.body.data?.id;
    check('has offer id', !!coId);

    // 6. Decline counter
    console.log('\n6. Decline counter');
    const r6 = await req('POST', `/pos-approvals/${reqId}/decline-counter`, { counterOfferId: coId });
    check('back to pending', r6.body.data?.status === 'pending');

    // 7. Approve
    console.log('\n7. Approve');
    const r7 = await req('POST', `/pos-approvals/${reqId}/approve`, { method: 'pin' });
    check('approved', r7.body.data?.status === 'approved');
    check('has token', !!r7.body.data?.approval_token);

    // 8. Consume token
    console.log('\n8. Consume token');
    const r8 = await req('POST', '/pos-approvals/consume-token', { token: r7.body.data.approval_token, cartId: 902, cartItemId: 9002 });
    check('has price', typeof r8.body.data?.approvedPrice === 'number');
    const r8b = await req('POST', '/pos-approvals/consume-token', { token: r7.body.data.approval_token, cartId: 902, cartItemId: 9002 });
    check('double blocked', r8b.status >= 400);

    // 9. Deny
    console.log('\n9. Deny');
    const r9a = await req('POST', '/pos-approvals/request', { cartId: 903, cartItemId: 9003, productId: pid, requestedPrice: origPrice * 0.85 });
    const r9 = await req('POST', `/pos-approvals/${r9a.body.data.id}/deny`, { reasonCode: 'margin', reasonNote: 'test' });
    check('denied', r9.body.data?.status === 'denied');

    // 10. Cancel
    console.log('\n10. Cancel');
    const r10a = await req('POST', '/pos-approvals/request', { cartId: 904, cartItemId: 9004, productId: pid, requestedPrice: origPrice * 0.85 });
    const r10 = await req('POST', `/pos-approvals/${r10a.body.data.id}/cancel`);
    check('cancelled', r10.body.data?.status === 'cancelled');

    // 11. Accept counter
    console.log('\n11. Accept counter');
    const r11a = await req('POST', '/pos-approvals/request', { cartId: 905, cartItemId: 9005, productId: pid, requestedPrice: origPrice * 0.85 });
    const r11b = await req('POST', `/pos-approvals/${r11a.body.data.id}/counter`, { counterPrice: origPrice * 0.88 });
    const r11 = await req('POST', `/pos-approvals/${r11a.body.data.id}/accept-counter`, { counterOfferId: r11b.body.data.id });
    check('approved via counter', r11.body.data?.status === 'approved');

    // 12. Product history
    console.log('\n12. Product history');
    const r12 = await req('GET', `/pos-approvals/${reqId}/product-history`);
    check('is array', Array.isArray(r12.body.data));

    // 13. Analytics
    console.log('\n13. Analytics');
    const r13 = await req('GET', '/pos-approvals/analytics');
    check('has summary', !!r13.body.data?.summary);
    check('total > 0', r13.body.data?.summary?.total_requests > 0);
    check('has byTier', Array.isArray(r13.body.data?.byTier));

    // 14. Audit log
    console.log('\n14. Audit log');
    const r14 = await req('GET', '/pos-approvals/audit-log?page=1&limit=5');
    check('has pagination', !!r14.body.pagination);
    check('has data', Array.isArray(r14.body.data));

    // 15. Tier settings update
    console.log('\n15. Tier settings');
    const r15 = await req('PUT', '/pos-approvals/settings/tiers', {
      tiers: [{ tier: 1, name: 'Salesperson Discretion', min_discount_percent: 0, max_discount_percent: 10, required_role: 'salesperson', timeout_seconds: 0, requires_reason_code: false, allows_below_cost: false }],
    });
    check('updated', r15.body.data?.length === 1);

    // 16. Available managers
    console.log('\n16. Available managers');
    await pool.query("INSERT INTO manager_availability (user_id, status, last_heartbeat) VALUES (1, 'online', NOW()) ON CONFLICT (user_id) DO UPDATE SET status = 'online', last_heartbeat = NOW()");
    const r16 = await req('GET', '/pos-approvals/managers/available?tier=2');
    check('is array', Array.isArray(r16.body.data));

    // Cleanup
    await pool.query('DELETE FROM approval_counter_offers WHERE approval_request_id IN (SELECT id FROM approval_requests WHERE cart_id BETWEEN 901 AND 905)');
    await pool.query('DELETE FROM approval_requests WHERE cart_id BETWEEN 901 AND 905');
    await pool.query('DELETE FROM manager_availability WHERE user_id = 1');

    console.log(`\n${'='.repeat(40)}`);
    console.log(`  ${passed} passed, ${failed} failed`);
    console.log(`${'='.repeat(40)}`);

    process.exit(failed > 0 ? 1 : 0);
  } catch(e) {
    console.error('FATAL:', e.message);
    console.error(e.stack);
    process.exit(1);
  }
})();
