const http = require('http');

const BASE = 'http://localhost:3001';
let TOKEN = '';
let MANAGER_TOKEN = '';

function req(method, path, body = null, token = TOKEN) {
  return new Promise((resolve) => {
    const url = new URL(path, BASE);
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json' },
      timeout: 8000,
    };
    if (token) opts.headers['Authorization'] = `Bearer ${token}`;

    const r = http.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(data); } catch { parsed = data; }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    r.on('error', (e) => resolve({ status: 0, body: e.message }));
    r.on('timeout', () => { r.destroy(); resolve({ status: 0, body: 'TIMEOUT' }); });
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

async function login() {
  const res = await req('POST', '/api/auth/login', {
    email: 'admin@yourcompany.com',
    password: 'TestPass123!',
  }, null);
  const tok = res.body.token || (res.body.data && res.body.data.accessToken) || res.body.accessToken;
  if (res.status === 200 && tok) {
    TOKEN = tok;
    console.log('✅ Admin login OK\n');
    return true;
  }
  console.log('❌ Login FAILED:', res.status, res.body);
  return false;
}

const results = { pass: 0, fail: 0, errors: [] };

async function test(method, path, body, expectStatus, label, token) {
  const res = await req(method, path, body, token || TOKEN);
  // Accept: expected status, or 200, 201, 204, 400 (validation), 404 (no data), 403 (permission)
  const acceptable = Array.isArray(expectStatus) ? expectStatus : [expectStatus];
  const ok = acceptable.includes(res.status);
  const icon = ok ? '✅' : '❌';
  const line = `${icon} [${res.status}] ${method} ${path} — ${label}`;
  console.log(line);
  if (ok) {
    results.pass++;
  } else {
    results.fail++;
    results.errors.push({ method, path, label, expected: acceptable, got: res.status, body: typeof res.body === 'string' ? res.body.substring(0, 200) : JSON.stringify(res.body).substring(0, 200) });
  }
  return res;
}

async function run() {
  console.log('='.repeat(60));
  console.log('  NEW ENDPOINTS TEST SUITE');
  console.log('='.repeat(60) + '\n');

  if (!(await login())) return;

  // =============================================
  // 1. CLV Admin (/api/clv)
  // =============================================
  console.log('\n--- CLV Admin (/api/clv) ---');
  await test('GET', '/api/clv/job-status', null, [200, 404], 'Get CLV job status');
  await test('GET', '/api/clv/job-history', null, [200], 'Get CLV job history');
  await test('GET', '/api/clv/trends', null, [200], 'Get CLV trends');
  await test('POST', '/api/clv/run-customer/1', null, [200, 201, 404], 'Run CLV for customer 1');
  await test('GET', '/api/clv/history/1', null, [200, 404], 'Get CLV history for customer 1');
  await test('POST', '/api/clv/run-job', null, [200, 201, 202], 'Trigger CLV batch job');

  // =============================================
  // 2. Client Errors (/api/errors)
  // =============================================
  console.log('\n--- Client Error Tracking (/api/errors) ---');
  await test('POST', '/api/errors/client-report', {
    errors: [{
      fingerprint: 'test-fp-' + Date.now(),
      errorType: 'js_error',
      message: 'Test error from endpoint test',
      stackTrace: 'Error: test\n  at test-new-endpoints.js:1:1',
      url: '/test-page',
      severity: 'low',
    }],
    meta: { appVersion: '1.0.0-test' },
  }, [200, 201, 202], 'Report client error');
  await test('GET', '/api/errors/client', null, [200], 'List client errors');
  await test('GET', '/api/errors/client/stats', null, [200], 'Client error stats');
  await test('GET', '/api/errors/client/1', null, [200, 404], 'Get single client error');
  await test('PATCH', '/api/errors/client/1/status', { status: 'acknowledged' }, [200, 404], 'Update error status');
  await test('POST', '/api/errors/client/bulk-status', { groupIds: [1], status: 'resolved' }, [200, 404], 'Bulk update error status');

  // =============================================
  // 3. Discount Authority (/api/discount-authority)
  // =============================================
  console.log('\n--- Discount Authority (/api/discount-authority) ---');
  await test('GET', '/api/discount-authority/my-tier', null, [200, 404], 'Get my discount tier');
  await test('GET', '/api/discount-authority/tiers', null, [200], 'List all discount tiers');
  await test('POST', '/api/discount-authority/validate', {
    product_id: 1,
    original_price: 100,
    requested_price: 90,
    discount_percent: 10,
  }, [200, 400], 'Validate discount');
  await test('POST', '/api/discount-authority/apply', {
    product_id: 1,
    original_price: 100,
    requested_price: 90,
    discount_percent: 10,
    reason: 'Test discount',
  }, [200, 201, 400, 403], 'Apply discount');
  await test('GET', '/api/discount-authority/budget/1', null, [200, 404], 'Get employee budget');
  await test('POST', '/api/discount-authority/budget/initialize', null, [200, 201], 'Initialize budgets');
  await test('PUT', '/api/discount-authority/tiers/sales_rep', {
    max_discount_percent: 10,
    max_single_discount: 500,
    daily_discount_budget: 2000,
  }, [200, 400, 403], 'Update tier settings');

  // =============================================
  // 4. Discount Escalations (/api/discount-escalations)
  // =============================================
  console.log('\n--- Discount Escalations (/api/discount-escalations) ---');
  await test('GET', '/api/discount-escalations/pending', null, [200], 'List pending escalations');
  await test('GET', '/api/discount-escalations/mine', null, [200], 'List my escalations');
  await test('POST', '/api/discount-escalations', {
    product_id: 1,
    original_price: 100,
    requested_price: 80,
    discount_percent: 20,
    reason: 'Customer loyalty test',
  }, [200, 201, 400], 'Create escalation');

  // =============================================
  // 5. Discount Analytics (/api/discount-analytics)
  // =============================================
  console.log('\n--- Discount Analytics (/api/discount-analytics) ---');
  await test('GET', '/api/discount-analytics/summary', null, [200], 'Discount summary');
  await test('GET', '/api/discount-analytics/by-employee', null, [200], 'Discounts by employee');
  await test('GET', '/api/discount-analytics/by-product', null, [200], 'Discounts by product');
  await test('GET', '/api/discount-analytics/commission-impact', null, [200], 'Commission impact');

  // =============================================
  // 6. POS Approvals (/api/pos-approvals)
  // =============================================
  console.log('\n--- POS Approvals (/api/pos-approvals) ---');
  await test('GET', '/api/pos-approvals/pending', null, [200], 'List pending approvals');
  await test('GET', '/api/pos-approvals/managers/available?tier=2', null, [200], 'List available managers');
  await test('GET', '/api/pos-approvals/analytics', null, [200], 'Approval analytics');
  await test('GET', '/api/pos-approvals/settings/tiers', null, [200], 'Get approval tier settings');
  await test('GET', '/api/pos-approvals/audit-log', null, [200], 'Approval audit log');
  await test('GET', '/api/pos-approvals/delegations/active', null, [200], 'Active delegations');
  await test('GET', '/api/pos-approvals/delegations/eligible', null, [200], 'Eligible delegates');
  await test('POST', '/api/pos-approvals/request', {
    product_id: 1,
    original_price: 999.99,
    requested_price: 799.99,
    reason: 'Price match test',
  }, [200, 201, 400], 'Create approval request');

  // Test approval flow with the created request
  const reqRes = await req('GET', '/api/pos-approvals/pending');
  if (reqRes.status === 200 && reqRes.body.data && reqRes.body.data.length > 0) {
    const approvalId = reqRes.body.data[0].id;
    await test('GET', `/api/pos-approvals/${approvalId}/status`, null, [200], `Get approval ${approvalId} status`);
    await test('GET', `/api/pos-approvals/${approvalId}/product-history`, null, [200, 404], `Product history for approval ${approvalId}`);
    await test('GET', `/api/pos-approvals/${approvalId}/intelligence`, null, [200, 404], `Intelligence for approval ${approvalId}`);
    await test('POST', `/api/pos-approvals/${approvalId}/approve`, { notes: 'Test approved' }, [200, 400, 403], `Approve request ${approvalId}`);
  } else {
    console.log('  ⚠️  No pending approvals to test approve/deny/counter flows');
  }

  await test('POST', '/api/pos-approvals/batch-request', {
    items: [
      { productId: 1009, requestedPrice: 800 },
      { productId: 1010, requestedPrice: 600 },
    ],
  }, [200, 201, 400], 'Batch approval request');

  await test('POST', '/api/pos-approvals/sync-offline', {
    requests: [],
  }, [200, 400], 'Sync offline approvals');

  await test('PUT', '/api/pos-approvals/settings/tiers', {
    tiers: [
      { role: 'sales_rep', max_discount_percent: 5 },
      { role: 'manager', max_discount_percent: 15 },
    ],
  }, [200, 400, 403], 'Update approval tiers');

  await test('POST', '/api/pos-approvals/consume-token', {
    approval_id: 1,
  }, [200, 400, 404], 'Consume approval token');

  // =============================================
  // 7. Quote Acceptance (/api/quote-accept)
  // =============================================
  console.log('\n--- Quote Acceptance (/api/quote-accept) ---');
  await test('GET', '/api/quote-accept/test-invalid-token', null, [400, 404, 422], 'Get quote by invalid token');
  await test('POST', '/api/quote-accept/test-invalid-token', { accepted: true }, [400, 404, 422], 'Accept quote with invalid token');

  // =============================================
  // 8. Admin Skulytics (/api/admin/skulytics)
  // =============================================
  console.log('\n--- Admin Skulytics (/api/admin/skulytics) ---');
  await test('GET', '/api/admin/skulytics/health', null, [200], 'Skulytics health');
  await test('GET', '/api/admin/skulytics/sync/status', null, [200], 'Skulytics sync status');
  await test('GET', '/api/admin/skulytics/sync/history', null, [200], 'Skulytics sync history');
  await test('GET', '/api/admin/skulytics/catalogue', null, [200], 'Skulytics catalogue list');
  await test('GET', '/api/admin/skulytics/catalogue/stats', null, [200], 'Skulytics catalogue stats');
  await test('GET', '/api/admin/skulytics/catalogue/1', null, [200, 404], 'Skulytics catalogue item 1');
  await test('POST', '/api/admin/skulytics/refresh/TEST-SKU', null, [200, 404, 400], 'Refresh SKU');
  await test('POST', '/api/admin/skulytics/match/auto', null, [200, 201], 'Auto-match Skulytics');
  await test('POST', '/api/admin/skulytics/match/confirm', {
    skulytics_id: 1,
    product_id: 1,
  }, [200, 400, 404], 'Confirm Skulytics match');
  await test('POST', '/api/admin/skulytics/match/reject', {
    skulytics_id: 1,
  }, [200, 400, 404], 'Reject Skulytics match');
  await test('POST', '/api/admin/skulytics/import', {
    skulytics_ids: [1],
  }, [200, 201, 400], 'Import from Skulytics');
  await test('POST', '/api/admin/skulytics/sync/trigger', null, [200, 202], 'Trigger Skulytics sync');

  // =============================================
  // SUMMARY
  // =============================================
  console.log('\n' + '='.repeat(60));
  console.log(`  RESULTS: ${results.pass} passed, ${results.fail} failed`);
  console.log('='.repeat(60));

  if (results.errors.length > 0) {
    console.log('\n--- FAILURES ---');
    results.errors.forEach((e) => {
      console.log(`\n  ❌ ${e.method} ${e.path} — ${e.label}`);
      console.log(`     Expected: ${e.expected.join('|')} | Got: ${e.got}`);
      console.log(`     Body: ${e.body}`);
    });
  }

  console.log('\nDone.');
}

run().catch(console.error);
