/**
 * Frontend Page & API Integration Tester
 *
 * Tests:
 * 1. Frontend pages load (returns HTML, not 404)
 * 2. API calls the frontend makes actually work
 * 3. Auth flow works end-to-end
 */

const http = require('http');

const FRONTEND = 'http://localhost:3000';
const API = 'http://localhost:3001';
let TOKEN = '';

function request(base, method, path, body = null, headers = {}) {
  return new Promise((resolve) => {
    const url = new URL(path, base);
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      timeout: 10000,
    };
    const r = http.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, body: data, headers: res.headers }));
    });
    r.on('error', (e) => resolve({ status: 0, body: e.message, headers: {} }));
    r.on('timeout', () => { r.destroy(); resolve({ status: 0, body: 'TIMEOUT', headers: {} }); });
    if (body) r.write(typeof body === 'string' ? body : JSON.stringify(body));
    r.end();
  });
}

function api(method, path, body = null) {
  return request(API, method, path, body, { Authorization: `Bearer ${TOKEN}` });
}

function page(path) {
  // Must send Accept: text/html so CRA dev server serves index.html
  // instead of proxying to the backend (which returns 404 for non-API routes)
  return request(FRONTEND, 'GET', path, null, {
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  });
}

const results = { pass: 0, fail: 0, errors: [] };

async function testPage(path, label) {
  const res = await page(path);
  // React SPA returns 200 for all routes (client-side routing)
  const ok = res.status === 200 && res.body.includes('<!DOCTYPE html') || res.body.includes('<div id="root"');
  const icon = ok ? '✅' : '❌';
  console.log(`${icon} [${res.status}] PAGE ${path} — ${label}`);
  if (ok) { results.pass++; } else {
    results.fail++;
    results.errors.push({ type: 'PAGE', path, label, status: res.status, body: res.body.substring(0, 150) });
  }
  return res;
}

async function testApi(method, path, body, expect, label) {
  const res = await api(method, path, body);
  let parsed;
  try { parsed = JSON.parse(res.body); } catch { parsed = res.body; }
  const acceptable = Array.isArray(expect) ? expect : [expect];
  const ok = acceptable.includes(res.status);
  const icon = ok ? '✅' : '❌';
  console.log(`${icon} [${res.status}] API ${method} ${path} — ${label}`);
  if (ok) { results.pass++; } else {
    results.fail++;
    const bodyStr = typeof parsed === 'string' ? parsed.substring(0, 150) : JSON.stringify(parsed).substring(0, 150);
    results.errors.push({ type: 'API', method, path, label, expected: acceptable, got: res.status, body: bodyStr });
  }
  return { status: res.status, body: parsed };
}

async function run() {
  console.log('='.repeat(65));
  console.log('  FRONTEND PAGES & API INTEGRATION TESTS');
  console.log('='.repeat(65));

  // ========== LOGIN ==========
  console.log('\n--- Auth Flow ---');
  const loginRes = await request(API, 'POST', '/api/auth/login',
    { email: 'admin@yourcompany.com', password: 'TestPass123!' });
  let parsed;
  try { parsed = JSON.parse(loginRes.body); } catch { parsed = {}; }
  TOKEN = parsed?.data?.accessToken || parsed?.token || '';
  if (TOKEN) {
    console.log('✅ Login successful, token obtained');
    results.pass++;
  } else {
    console.log('❌ Login failed');
    results.fail++;
    results.errors.push({ type: 'AUTH', path: '/api/auth/login', label: 'Login', status: loginRes.status });
    return;
  }

  // ========== FRONTEND PAGES (from App.js route definitions) ==========
  console.log('\n--- Core Pages ---');
  await testPage('/', 'Home (redirects to /quotes)');
  await testPage('/login', 'Login page');
  await testPage('/dashboard', 'Dashboard');
  await testPage('/quotes', 'Quotations list');
  await testPage('/quotes/new', 'New quotation');
  await testPage('/customers', 'Customers list');
  await testPage('/products', 'Products list');
  await testPage('/invoices', 'Invoices list');
  await testPage('/leads', 'Leads list');
  await testPage('/search', 'Search results');
  await testPage('/quick-search', 'Quick search');

  console.log('\n--- Admin Pages ---');
  await testPage('/admin/users', 'User management');
  await testPage('/admin/nomenclature', 'Nomenclature');
  await testPage('/admin/deliveries', 'Deliveries admin');
  await testPage('/admin/recommendations', 'Recommendations admin');
  await testPage('/admin/fraud', 'Fraud dashboard');
  await testPage('/admin/client-errors', 'Client error tracking');
  await testPage('/admin/discount-analytics', 'Discount analytics');
  await testPage('/admin/skulytics/import', 'Skulytics import');
  await testPage('/admin/skulytics/health', 'Skulytics health');

  console.log('\n--- Feature Pages ---');
  await testPage('/inventory', 'Inventory');
  await testPage('/marketplace', 'Marketplace');
  await testPage('/analytics', 'Analytics');
  await testPage('/clv-dashboard', 'CLV Dashboard');
  await testPage('/purchasing-intelligence', 'Purchasing intelligence');
  await testPage('/pipeline-analytics', 'Pipeline analytics');
  await testPage('/leaderboard', 'Sales leaderboard');
  await testPage('/report-builder', 'Report builder');
  await testPage('/executive-dashboard', 'Executive dashboard');
  await testPage('/training-center', 'Training center');
  await testPage('/reports', 'Reports');
  await testPage('/bulk-ops', 'Bulk operations');
  await testPage('/pricing', 'Advanced pricing');
  await testPage('/manufacturer-promotions', 'Manufacturer promotions');
  await testPage('/product-visualization', 'Product visualization');
  await testPage('/quote-expiry', 'Quote expiry manager');

  // ========== API CALLS THE FRONTEND MAKES ==========
  console.log('\n--- Dashboard API calls ---');
  await testApi('GET', '/api/auth/me', null, [200], 'Current user');
  await testApi('GET', '/api/customers?page=1&limit=10', null, [200], 'Customers page');
  await testApi('GET', '/api/products?page=1&limit=10', null, [200], 'Products page');
  await testApi('GET', '/api/quotations?page=1&limit=10', null, [200], 'Quotations page');
  await testApi('GET', '/api/orders?page=1&limit=10', null, [200], 'Orders page');
  await testApi('GET', '/api/invoices?page=1&limit=10', null, [200], 'Invoices page');
  await testApi('GET', '/api/leads?page=1&limit=10', null, [200], 'Leads page');
  await testApi('GET', '/api/users', null, [200], 'Users list');

  console.log('\n--- Inventory API calls ---');
  await testApi('GET', '/api/inventory?page=1&limit=10', null, [200], 'Inventory list');
  await testApi('GET', '/api/inventory/transfers?page=1&limit=10', null, [200], 'Transfers list');
  await testApi('GET', '/api/locations', null, [200], 'Locations');

  console.log('\n--- Analytics & Reports API calls ---');
  await testApi('GET', '/api/insights/summary', null, [200], 'Insights summary');
  await testApi('GET', '/api/reports/templates', null, [200], 'Report templates');
  await testApi('GET', '/api/scheduled-reports', null, [200], 'Scheduled reports');
  await testApi('GET', '/api/reports/ar-aging', null, [200], 'AR aging');
  await testApi('GET', '/api/reports/tax-summary', null, [200], 'Tax summary');

  console.log('\n--- POS API calls ---');
  await testApi('GET', '/api/transactions?page=1&limit=10', null, [200], 'Transactions');
  await testApi('GET', '/api/returns?page=1&limit=10', null, [200], 'Returns');
  await testApi('GET', '/api/registers', null, [200], 'Registers');
  await testApi('GET', '/api/layaways?page=1&limit=10', null, [200], 'Layaways');

  console.log('\n--- Fraud & Audit API calls ---');
  await testApi('GET', '/api/fraud/alerts', null, [200], 'Fraud alerts');
  await testApi('GET', '/api/fraud/rules', null, [200], 'Fraud rules');
  await testApi('GET', '/api/chargebacks', null, [200], 'Chargebacks');

  console.log('\n--- New Feature API calls ---');
  await testApi('GET', '/api/discount-authority/my-tier', null, [200], 'My discount tier');
  await testApi('GET', '/api/discount-authority/tiers', null, [200], 'All tiers');
  await testApi('GET', '/api/discount-escalations/pending', null, [200], 'Pending escalations');
  await testApi('GET', '/api/discount-analytics/summary', null, [200], 'Discount analytics');
  await testApi('GET', '/api/pos-approvals/pending', null, [200], 'Pending approvals');
  await testApi('GET', '/api/pos-approvals/analytics', null, [200], 'Approval analytics');
  await testApi('GET', '/api/pos-approvals/settings/tiers', null, [200], 'Approval tiers');
  await testApi('GET', '/api/pos-approvals/audit-log', null, [200], 'Approval audit log');
  await testApi('GET', '/api/pos-approvals/delegations/active', null, [200], 'Active delegations');

  console.log('\n--- CLV & Churn API calls ---');
  await testApi('GET', '/api/clv/job-status', null, [200], 'CLV job status');
  await testApi('GET', '/api/clv/job-history', null, [200], 'CLV job history');
  await testApi('GET', '/api/clv/trends', null, [200], 'CLV trends');
  await testApi('GET', '/api/churn-alerts', null, [200], 'Churn alerts');

  console.log('\n--- Client Error Tracking API calls ---');
  await testApi('GET', '/api/errors/client', null, [200], 'Client error groups');
  await testApi('GET', '/api/errors/client/stats', null, [200], 'Client error stats');

  console.log('\n--- Skulytics API calls ---');
  await testApi('GET', '/api/admin/skulytics/health', null, [200], 'Skulytics health');
  await testApi('GET', '/api/admin/skulytics/catalogue', null, [200], 'Skulytics catalogue');
  await testApi('GET', '/api/admin/skulytics/catalogue/stats', null, [200], 'Skulytics stats');
  await testApi('GET', '/api/admin/skulytics/sync/status', null, [200], 'Skulytics sync status');
  await testApi('GET', '/api/admin/skulytics/sync/history', null, [200], 'Skulytics sync history');

  console.log('\n--- Purchasing Intelligence API calls ---');
  await testApi('GET', '/api/purchasing-intelligence/dashboard', null, [200], 'PI dashboard');

  console.log('\n--- Misc API calls ---');
  await testApi('GET', '/api/hub-promotions', null, [200], 'Hub promotions');
  await testApi('GET', '/api/bundles', null, [200], 'Bundles');
  await testApi('GET', '/api/rebates', null, [200], 'Rebates');
  await testApi('GET', '/api/warranty/products', null, [200], 'Warranty products');
  await testApi('GET', '/api/tax/rates', null, [200], 'Tax rates');
  await testApi('GET', '/api/lookup/provinces', null, [200], 'Provinces');
  await testApi('GET', '/api/categories', null, [200], 'Categories');
  await testApi('GET', '/api/notification-templates', null, [200], 'Notification templates');
  await testApi('GET', '/api/notifications', null, [200], 'Notifications');
  await testApi('GET', '/api/webhooks', null, [200], 'Webhooks');
  await testApi('GET', '/api/drafts', null, [200], 'Drafts');
  await testApi('GET', '/api/quick-search?q=samsung', null, [200], 'Quick search');
  await testApi('GET', '/api/admin/approval-rules', null, [200], 'Approval rules');
  await testApi('GET', '/api/rbac/roles', null, [200], 'RBAC roles');
  await testApi('GET', '/api/hub-returns', null, [200], 'Hub returns');
  await testApi('GET', '/api/products/discontinued', null, [200], 'Discontinued products');
  await testApi('GET', '/api/payment-terms', null, [200], 'Payment terms');
  await testApi('GET', '/api/dispatch/routes', null, [200], 'Dispatch routes');
  await testApi('GET', '/api/dispatch/drivers', null, [200], 'Drivers');
  await testApi('GET', '/api/pos-promotions', null, [200], 'POS promotions');
  await testApi('GET', '/api/promotions/manufacturer', null, [200], 'Manufacturer promotions');

  // ============================================================
  console.log('\n' + '='.repeat(65));
  console.log(`  RESULTS: ${results.pass} passed, ${results.fail} failed out of ${results.pass + results.fail}`);
  console.log('='.repeat(65));

  if (results.errors.length > 0) {
    console.log('\n--- FAILURES ---');
    results.errors.forEach((e) => {
      if (e.type === 'PAGE') {
        console.log(`\n  ❌ PAGE ${e.path} — ${e.label} [${e.status}]`);
        console.log(`     Body: ${e.body}`);
      } else {
        console.log(`\n  ❌ API ${e.method} ${e.path} — ${e.label}`);
        console.log(`     Expected: ${(e.expected||[]).join('|')} | Got: ${e.got}`);
        console.log(`     Body: ${e.body}`);
      }
    });
  }
  console.log('\nDone.');
}

run().catch(console.error);
