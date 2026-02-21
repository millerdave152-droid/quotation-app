require('dotenv').config();
var jwt = require('./utils/jwt');
var token = jwt.generateAccessToken({ id: 1, email: 'admin@yourcompany.com', role: 'admin' });
var BASE = 'http://localhost:3001';

var passed = 0, failed = 0;
var failures = [];
function test(cond, label, detail) {
  console.log((cond ? '\u2705' : '\u274C') + ' ' + label + (detail ? ' \u2014 ' + detail : ''));
  if (cond) passed++; else { failed++; failures.push(label + ' (' + detail + ')'); }
}

async function api(method, path, body) {
  var opts = { method: method, headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  var r = await fetch(BASE + path, opts);
  var data = await r.json().catch(function() { return { _raw: 'non-json' }; });
  return { status: r.status, data: data };
}

(async function() {
  console.log('=== FULL APP ROUTE TEST ===\n');
  var r;

  // ──── CORE ────
  console.log('--- Core Business ---');
  r = await api('GET', '/api/products?limit=3');
  test(r.status === 200, 'Products', r.status);

  r = await api('GET', '/api/categories');
  test(r.status === 200, 'Categories', r.status);

  r = await api('GET', '/api/customers?limit=3');
  test(r.status === 200, 'Customers', r.status);

  r = await api('GET', '/api/quotations?limit=3');
  test(r.status === 200, 'Quotations', r.status);

  r = await api('GET', '/api/orders?limit=3');
  test(r.status === 200, 'Orders', r.status);

  r = await api('GET', '/api/invoices?limit=3');
  test(r.status === 200, 'Invoices', r.status);

  r = await api('GET', '/api/inventory?limit=3');
  test(r.status === 200, 'Inventory', r.status);

  r = await api('GET', '/api/users');
  test(r.status === 200, 'Users', r.status);

  r = await api('GET', '/api/leads?limit=3');
  test(r.status === 200, 'Leads', r.status);

  r = await api('GET', '/api/tasks?limit=3');
  test(r.status === 200, 'Tasks', r.status + (r.status >= 400 ? ' ' + JSON.stringify(r.data).slice(0,150) : ''));

  r = await api('GET', '/api/notifications');
  test(r.status === 200, 'Notifications', r.status);

  r = await api('GET', '/api/locations');
  test(r.status === 200, 'Locations', r.status);

  r = await api('GET', '/api/webhooks');
  test(r.status === 200, 'Webhooks', r.status);

  r = await api('GET', '/api/reports');
  test(r.status === 200, 'Reports', r.status);

  // ──── POS ────
  console.log('\n--- POS ---');
  r = await api('GET', '/api/transactions?limit=3');
  test(r.status === 200, 'Transactions', r.status + (r.status >= 400 ? ' ' + JSON.stringify(r.data).slice(0,150) : ''));

  r = await api('GET', '/api/returns?limit=3');
  test(r.status === 200, 'Returns', r.status + (r.status >= 400 ? ' ' + JSON.stringify(r.data).slice(0,150) : ''));

  r = await api('GET', '/api/store-credits?limit=3');
  test(r.status === 200, 'Store Credits', r.status + (r.status >= 400 ? ' ' + JSON.stringify(r.data).slice(0,150) : ''));

  r = await api('GET', '/api/gift-cards?limit=3');
  test(r.status === 200, 'Gift Cards', r.status + (r.status >= 400 ? ' ' + JSON.stringify(r.data).slice(0,150) : ''));

  r = await api('GET', '/api/layaways?limit=3');
  test(r.status === 200, 'Layaways', r.status + (r.status >= 400 ? ' ' + JSON.stringify(r.data).slice(0,150) : ''));

  r = await api('GET', '/api/pos-payments/methods');
  test(r.status === 200, 'POS Payments methods', r.status + (r.status >= 400 ? ' ' + JSON.stringify(r.data).slice(0,150) : ''));

  r = await api('GET', '/api/pos-promotions/active');
  test(r.status === 200, 'POS Promotions active', r.status + (r.status >= 400 ? ' ' + JSON.stringify(r.data).slice(0,150) : ''));

  r = await api('GET', '/api/cash-drawer/status');
  test(r.status === 200 || r.status === 404, 'Cash Drawer status', r.status);

  r = await api('GET', '/api/timeclock/status');
  test(r.status === 200 || r.status === 404, 'Time Clock status', r.status);

  // ──── ANALYTICS & REPORTING ────
  console.log('\n--- Analytics ---');
  r = await api('GET', '/api/analytics/sales?period=30d');
  test(r.status === 200, 'Analytics sales', r.status + (r.status >= 400 ? ' ' + JSON.stringify(r.data).slice(0,150) : ''));

  r = await api('GET', '/api/discount-analytics/summary?period=30d');
  test(r.status === 200, 'Discount Analytics', r.status);

  // ──── PRICING & DISCOUNTS ────
  console.log('\n--- Pricing & Discounts ---');
  r = await api('GET', '/api/discount-authority/tiers');
  test(r.status === 200, 'Discount Authority tiers', r.status + (r.status >= 400 ? ' ' + JSON.stringify(r.data).slice(0,150) : ''));

  r = await api('GET', '/api/discount-escalations/pending');
  test(r.status === 200, 'Discount Escalations pending', r.status + (r.status >= 400 ? ' ' + JSON.stringify(r.data).slice(0,150) : ''));

  // ──── APPROVALS ────
  console.log('\n--- Approvals ---');
  r = await api('GET', '/api/approvals/pending');
  test(r.status === 200, 'Approvals pending', r.status + (r.status >= 400 ? ' ' + JSON.stringify(r.data).slice(0,150) : ''));

  // ──── FRAUD ────
  console.log('\n--- Fraud ---');
  r = await api('GET', '/api/fraud/alerts?limit=3');
  test(r.status === 200, 'Fraud alerts', r.status);

  r = await api('GET', '/api/fraud/rules');
  test(r.status === 200, 'Fraud rules', r.status);

  // ──── MANAGER OVERRIDE ────
  console.log('\n--- Manager Override ---');
  r = await api('GET', '/api/manager-overrides/history?limit=3');
  test(r.status === 200, 'Manager Override history', r.status);

  // ──── COMMISSIONS ────
  console.log('\n--- Commissions ---');
  r = await api('GET', '/api/commissions/summary');
  test(r.status === 200, 'Commissions summary', r.status);

  // ──── DELIVERY ────
  console.log('\n--- Delivery ---');
  r = await api('GET', '/api/delivery/upcoming');
  test(r.status === 200, 'Delivery upcoming', r.status + (r.status >= 400 ? ' ' + JSON.stringify(r.data).slice(0,150) : ''));

  // ──── DATA QUALITY ────
  console.log('\n--- Data Quality ---');
  r = await api('GET', '/api/data-quality/overview');
  test(r.status === 200, 'Data Quality overview', r.status + (r.status >= 400 ? ' ' + JSON.stringify(r.data).slice(0,150) : ''));

  // ──── CLV ────
  console.log('\n--- CLV ---');
  r = await api('GET', '/api/clv/overview');
  test(r.status === 200, 'CLV overview', r.status + (r.status >= 400 ? ' ' + JSON.stringify(r.data).slice(0,150) : ''));

  // ──── CHURN ALERTS ────
  console.log('\n--- Churn Alerts ---');
  r = await api('GET', '/api/churn-alerts/dashboard');
  test(r.status === 200, 'Churn alerts dashboard', r.status + (r.status >= 400 ? ' ' + JSON.stringify(r.data).slice(0,150) : ''));

  // ──── MARKETPLACE (top-level) ────
  console.log('\n--- Marketplace (quick check) ---');
  r = await api('GET', '/api/marketplace/channels');
  test(r.status === 200, 'Marketplace channels', r.status);

  r = await api('GET', '/api/marketplace/orders');
  test(r.status === 200, 'Marketplace orders', r.status);

  r = await api('GET', '/api/marketplace/returns');
  test(r.status === 200, 'Marketplace returns', r.status);

  r = await api('GET', '/api/marketplace/settings');
  test(r.status === 200, 'Marketplace settings', r.status);

  console.log('\n========================================');
  console.log('RESULTS: ' + passed + ' passed, ' + failed + ' failed');
  if (failures.length > 0) {
    console.log('\nFAILURES:');
    failures.forEach(function(f) { console.log('  - ' + f); });
  }
  console.log('========================================\n');
  process.exit(failed > 0 ? 1 : 0);
})().catch(function(err) {
  console.error('FATAL:', err.message);
  process.exit(1);
});
