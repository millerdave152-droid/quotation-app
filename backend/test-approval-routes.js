/**
 * Integration test for approval routes.
 * Requires the backend server to be running on port 3001.
 * Run: node test-approval-routes.js
 */
const http = require('http');

const BASE = 'http://localhost:3001/api';
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
  let passed = 0;
  let failed = 0;

  function check(label, condition, detail) {
    if (condition) {
      console.log(`  PASS: ${label}`);
      passed++;
    } else {
      console.log(`  FAIL: ${label} — ${detail || ''}`);
      failed++;
    }
  }

  try {
    // Login as admin
    const login = await req('POST', '/auth/login', { email: 'admin@yourcompany.com', password: 'TestPass123!' });
    if (!login.body.success) { console.error('Login failed:', login.body); process.exit(1); }
    TOKEN = login.body.data.accessToken;
    console.log('Logged in as admin\n');

    // Find a product
    const pool = require('./db');
    const { rows: [product] } = await pool.query('SELECT id, price, cost FROM products WHERE price > 0 AND cost > 0 LIMIT 1');
    const pid = product.id;
    const origPrice = parseFloat(product.price);
    console.log(`Test product: ${pid} price=$${origPrice}\n`);

    // 1. Create request (Tier 1 auto-approve)
    console.log('1. POST /approvals/request (Tier 1 — auto-approve)');
    const r1 = await req('POST', '/approvals/request', {
      cartId: 901, cartItemId: 9001, productId: pid, requestedPrice: origPrice * 0.95,
    });
    check('returns 200', r1.status === 200);
    check('autoApproved = true', r1.body.data?.autoApproved === true);
    check('tier = 1', r1.body.data?.tier === 1);

    // 2. Create request (Tier 2 pending)
    console.log('\n2. POST /approvals/request (Tier 2 — pending)');
    const r2 = await req('POST', '/approvals/request', {
      cartId: 902, cartItemId: 9002, productId: pid, requestedPrice: origPrice * 0.85,
    });
    const reqId = r2.body.data?.id;
    check('returns 201', r2.status === 201);
    check('autoApproved = false', r2.body.data?.autoApproved === false);
    check('tier = 2', r2.body.data?.tier === 2);
    check('status = pending', r2.body.data?.status === 'pending');

    // 3. GET status
    console.log('\n3. GET /approvals/:id/status');
    const r3 = await req('GET', `/approvals/${reqId}/status`);
    check('returns 200', r3.status === 200);
    check('status = pending', r3.body.data?.status === 'pending');
    check('has tierName', !!r3.body.data?.tierName);

    // 4. GET pending
    console.log('\n4. GET /approvals/pending');
    const r4 = await req('GET', '/approvals/pending');
    check('returns 200', r4.status === 200);
    check('returns array', Array.isArray(r4.body.data));
    check('has our request', r4.body.data?.some(r => r.id === reqId));

    // 5. POST counter
    console.log('\n5. POST /approvals/:id/counter');
    const r5 = await req('POST', `/approvals/${reqId}/counter`, { counterPrice: origPrice * 0.90 });
    const coId = r5.body.data?.id;
    check('returns 200', r5.status === 200);
    check('has counter offer id', !!coId);

    // 6. POST decline-counter
    console.log('\n6. POST /approvals/:id/decline-counter');
    const r6 = await req('POST', `/approvals/${reqId}/decline-counter`, { counterOfferId: coId });
    check('returns 200', r6.status === 200);
    check('status back to pending', r6.body.data?.status === 'pending');

    // 7. POST approve
    console.log('\n7. POST /approvals/:id/approve');
    const r7 = await req('POST', `/approvals/${reqId}/approve`, { method: 'remote' });
    const token = r7.body.data?.approval_token;
    check('returns 200', r7.status === 200);
    check('status = approved', r7.body.data?.status === 'approved');
    check('has token', !!token);
    check('has response_time_ms', r7.body.data?.response_time_ms > 0);

    // 8. POST consume-token
    console.log('\n8. POST /approvals/consume-token');
    const r8 = await req('POST', '/approvals/consume-token', { token, cartId: 902, cartItemId: 9002 });
    check('returns 200', r8.status === 200);
    check('has approvedPrice', typeof r8.body.data?.approvedPrice === 'number');

    // 8b. Double-consume fails
    const r8b = await req('POST', '/approvals/consume-token', { token, cartId: 902, cartItemId: 9002 });
    check('double-consume blocked', r8b.status >= 400);

    // 9. Deny flow
    console.log('\n9. POST deny');
    const r9a = await req('POST', '/approvals/request', {
      cartId: 903, cartItemId: 9003, productId: pid, requestedPrice: origPrice * 0.85,
    });
    const r9 = await req('POST', `/approvals/${r9a.body.data.id}/deny`, {
      reasonCode: 'margin_too_low', reasonNote: 'Test denial',
    });
    check('returns 200', r9.status === 200);
    check('status = denied', r9.body.data?.status === 'denied');
    check('has reason_code', r9.body.data?.reason_code === 'margin_too_low');

    // 10. Cancel flow
    console.log('\n10. POST cancel');
    const r10a = await req('POST', '/approvals/request', {
      cartId: 904, cartItemId: 9004, productId: pid, requestedPrice: origPrice * 0.85,
    });
    const r10 = await req('POST', `/approvals/${r10a.body.data.id}/cancel`);
    check('returns 200', r10.status === 200);
    check('status = cancelled', r10.body.data?.status === 'cancelled');

    // 11. Accept counter-offer flow
    console.log('\n11. Accept counter-offer');
    const r11a = await req('POST', '/approvals/request', {
      cartId: 905, cartItemId: 9005, productId: pid, requestedPrice: origPrice * 0.85,
    });
    const r11b = await req('POST', `/approvals/${r11a.body.data.id}/counter`, { counterPrice: origPrice * 0.88 });
    const r11 = await req('POST', `/approvals/${r11a.body.data.id}/accept-counter`, { counterOfferId: r11b.body.data.id });
    check('returns 200', r11.status === 200);
    check('status = approved', r11.body.data?.status === 'approved');

    // 12. GET product-history
    console.log('\n12. GET product-history');
    const r12 = await req('GET', `/approvals/${reqId}/product-history`);
    check('returns 200', r12.status === 200);
    check('returns array', Array.isArray(r12.body.data));

    // 13. GET analytics
    console.log('\n13. GET analytics');
    const r13 = await req('GET', '/approvals/analytics');
    check('returns 200', r13.status === 200);
    check('has summary', !!r13.body.data?.summary);
    check('has byTier', Array.isArray(r13.body.data?.byTier));
    check('total > 0', r13.body.data?.summary?.total_requests > 0);

    // 14. GET audit-log
    console.log('\n14. GET audit-log');
    const r14 = await req('GET', '/approvals/audit-log?page=1&limit=5');
    check('returns 200', r14.status === 200);
    check('has pagination', !!r14.body.pagination);
    check('has data array', Array.isArray(r14.body.data));

    // 15. PUT settings/tiers
    console.log('\n15. PUT settings/tiers');
    const r15 = await req('PUT', '/approvals/settings/tiers', {
      tiers: [
        { tier: 1, name: 'Salesperson Discretion', min_discount_percent: 0, max_discount_percent: 10, required_role: 'salesperson', timeout_seconds: 0, requires_reason_code: false, allows_below_cost: false },
      ],
    });
    check('returns 200', r15.status === 200);
    check('updated 1 tier', r15.body.data?.length === 1);

    // 16. GET managers/available
    console.log('\n16. GET managers/available');
    await pool.query("INSERT INTO manager_availability (user_id, status, last_heartbeat) VALUES (1, 'online', NOW()) ON CONFLICT (user_id) DO UPDATE SET status = 'online', last_heartbeat = NOW()");
    const r16 = await req('GET', '/approvals/managers/available?tier=2');
    check('returns 200', r16.status === 200);
    check('returns array', Array.isArray(r16.body.data));

    // Cleanup
    await pool.query('DELETE FROM approval_counter_offers WHERE approval_request_id IN (SELECT id FROM approval_requests WHERE cart_id BETWEEN 901 AND 905)');
    await pool.query('DELETE FROM approval_requests WHERE cart_id BETWEEN 901 AND 905');
    await pool.query('DELETE FROM manager_availability WHERE user_id = 1');

    console.log(`\n========================================`);
    console.log(`  ${passed} passed, ${failed} failed`);
    console.log(`========================================`);

    pool.end();
    process.exit(failed > 0 ? 1 : 0);
  } catch(e) {
    console.error('FATAL:', e.message);
    console.error(e.stack);
    process.exit(1);
  }
})();
