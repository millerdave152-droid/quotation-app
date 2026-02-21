require('dotenv').config();
var jwt = require('./utils/jwt');
var token = jwt.generateAccessToken({ id: 1, email: 'admin@yourcompany.com', role: 'admin' });
var BASE = 'http://localhost:3001';

var passed = 0, failed = 0;
function test(cond, label, detail) {
  console.log((cond ? '\u2705' : '\u274C') + ' ' + label + (detail ? ' \u2014 ' + detail : ''));
  if (cond) passed++; else failed++;
}

async function api(method, path, body) {
  var opts = { method: method, headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  var r = await fetch(BASE + path, opts);
  var data = await r.json().catch(function() { return { _raw: 'non-json' }; });
  return { status: r.status, data: data };
}

(async function() {
  console.log('=== POS & CORE ROUTES TEST ===\n');

  // ──── POS TRANSACTIONS ────
  console.log('--- POS Transactions ---');
  var r;
  r = await api('GET', '/api/pos/transactions?limit=5');
  test(r.status === 200, 'GET /api/pos/transactions', r.status);

  r = await api('GET', '/api/pos/transactions/stats');
  test(r.status === 200, 'GET /api/pos/transactions/stats', r.status);

  // ──── POS RETURNS ────
  console.log('\n--- POS Returns ---');
  r = await api('GET', '/api/pos/returns?limit=5');
  test(r.status === 200, 'GET /api/pos/returns', r.status);

  // ──── POS REGISTER ────
  console.log('\n--- POS Register ---');
  r = await api('GET', '/api/pos/register/status');
  test(r.status === 200 || r.status === 404, 'GET /api/pos/register/status', r.status);

  // ──── POS CASH DRAWER ────
  console.log('\n--- POS Cash Drawer ---');
  r = await api('GET', '/api/pos/cash-drawer/status');
  test(r.status === 200 || r.status === 404, 'GET /api/pos/cash-drawer/status', r.status);

  // ──── POS PAYMENTS ────
  console.log('\n--- POS Payments ---');
  r = await api('GET', '/api/pos/payments/methods');
  test(r.status === 200, 'GET /api/pos/payments/methods', r.status);

  // ──── STORE CREDITS ────
  console.log('\n--- Store Credits ---');
  r = await api('GET', '/api/store-credits?limit=5');
  test(r.status === 200, 'GET /api/store-credits', r.status);

  // ──── GIFT CARDS ────
  console.log('\n--- Gift Cards ---');
  r = await api('GET', '/api/gift-cards?limit=5');
  test(r.status === 200, 'GET /api/gift-cards', r.status);

  // ──── LAYAWAY ────
  console.log('\n--- Layaway ---');
  r = await api('GET', '/api/layaway?limit=5');
  test(r.status === 200, 'GET /api/layaway', r.status);

  // ──── EMPLOYEE TIME CLOCK ────
  console.log('\n--- Time Clock ---');
  r = await api('GET', '/api/time-clock/current');
  test(r.status === 200 || r.status === 404, 'GET /api/time-clock/current', r.status);

  // ──── PRODUCTS ────
  console.log('\n--- Products ---');
  r = await api('GET', '/api/products?limit=5');
  test(r.status === 200, 'GET /api/products', r.status);

  r = await api('GET', '/api/products/1');
  test(r.status === 200 || r.status === 404, 'GET /api/products/1', r.status);

  r = await api('GET', '/api/categories');
  test(r.status === 200, 'GET /api/categories', r.status);

  // ──── CUSTOMERS ────
  console.log('\n--- Customers ---');
  r = await api('GET', '/api/customers?limit=5');
  test(r.status === 200, 'GET /api/customers', r.status);

  // ──── QUOTATIONS ────
  console.log('\n--- Quotations ---');
  r = await api('GET', '/api/quotations?limit=5');
  test(r.status === 200, 'GET /api/quotations', r.status);

  // ──── ORDERS ────
  console.log('\n--- Orders ---');
  r = await api('GET', '/api/orders?limit=5');
  test(r.status === 200, 'GET /api/orders', r.status);

  // ──── INVOICES ────
  console.log('\n--- Invoices ---');
  r = await api('GET', '/api/invoices?limit=5');
  test(r.status === 200, 'GET /api/invoices', r.status);

  // ──── INVENTORY ────
  console.log('\n--- Inventory ---');
  r = await api('GET', '/api/inventory?limit=5');
  test(r.status === 200, 'GET /api/inventory', r.status);

  // ──── USERS / AUTH ────
  console.log('\n--- Users ---');
  r = await api('GET', '/api/users');
  test(r.status === 200, 'GET /api/users', r.status);

  // ──── LEADS ────
  console.log('\n--- Leads ---');
  r = await api('GET', '/api/leads?limit=5');
  test(r.status === 200, 'GET /api/leads', r.status);

  // ──── TASKS ────
  console.log('\n--- Tasks ---');
  r = await api('GET', '/api/tasks?limit=5');
  test(r.status === 200, 'GET /api/tasks', r.status);

  // ──── NOTIFICATIONS ────
  console.log('\n--- Notifications ---');
  r = await api('GET', '/api/notifications');
  test(r.status === 200, 'GET /api/notifications', r.status);

  // ──── DELIVERY ────
  console.log('\n--- Delivery ---');
  r = await api('GET', '/api/delivery?limit=5');
  test(r.status === 200, 'GET /api/delivery', r.status);

  // ──── PRICING ────
  console.log('\n--- Pricing ---');
  r = await api('GET', '/api/pricing/rules');
  test(r.status === 200, 'GET /api/pricing/rules', r.status);

  // ──── REPORTS ────
  console.log('\n--- Reports ---');
  r = await api('GET', '/api/reports');
  test(r.status === 200, 'GET /api/reports', r.status);

  // ──── ANALYTICS ────
  console.log('\n--- Analytics ---');
  r = await api('GET', '/api/analytics/dashboard');
  test(r.status === 200, 'GET /api/analytics/dashboard', r.status);

  // ──── DISCOUNT AUTHORITY ────
  console.log('\n--- Discount Authority ---');
  r = await api('GET', '/api/discount-authority/user-authority');
  test(r.status === 200, 'GET /api/discount-authority/user-authority', r.status);

  // ──── DISCOUNT ANALYTICS ────
  console.log('\n--- Discount Analytics ---');
  r = await api('GET', '/api/discount-analytics/summary?period=30d');
  test(r.status === 200, 'GET /api/discount-analytics/summary', r.status);

  // ──── ESCALATIONS ────
  console.log('\n--- Escalations ---');
  r = await api('GET', '/api/escalations/pending');
  test(r.status === 200, 'GET /api/escalations/pending', r.status);

  // ──── APPROVAL ROUTES ────
  console.log('\n--- Approvals ---');
  r = await api('GET', '/api/approvals/pending');
  test(r.status === 200, 'GET /api/approvals/pending', r.status);

  // ──── FRAUD ────
  console.log('\n--- Fraud ---');
  r = await api('GET', '/api/fraud/alerts?limit=5');
  test(r.status === 200, 'GET /api/fraud/alerts', r.status);

  r = await api('GET', '/api/fraud/rules');
  test(r.status === 200, 'GET /api/fraud/rules', r.status);

  // ──── MANAGER OVERRIDE ────
  console.log('\n--- Manager Override ---');
  r = await api('GET', '/api/manager-overrides/history?limit=5');
  test(r.status === 200, 'GET /api/manager-overrides/history', r.status);

  // ──── COMMISSIONS ────
  console.log('\n--- Commissions ---');
  r = await api('GET', '/api/commissions/summary');
  test(r.status === 200, 'GET /api/commissions/summary', r.status);

  // ──── POS PROMOTIONS ────
  console.log('\n--- POS Promotions ---');
  r = await api('GET', '/api/pos/promotions/active');
  test(r.status === 200, 'GET /api/pos/promotions/active', r.status);

  // ──── LOCATIONS ────
  console.log('\n--- Locations ---');
  r = await api('GET', '/api/locations');
  test(r.status === 200, 'GET /api/locations', r.status);

  // ──── DATA QUALITY ────
  console.log('\n--- Data Quality ---');
  r = await api('GET', '/api/data-quality/score');
  test(r.status === 200, 'GET /api/data-quality/score', r.status);

  // ──── WEBHOOKS ────
  console.log('\n--- Webhooks ---');
  r = await api('GET', '/api/webhooks');
  test(r.status === 200, 'GET /api/webhooks', r.status);

  // ──── CLV ────
  console.log('\n--- CLV ---');
  r = await api('GET', '/api/admin/clv/overview');
  test(r.status === 200, 'GET /api/admin/clv/overview', r.status);

  // ──── CHURN ALERTS ────
  console.log('\n--- Churn Alerts ---');
  r = await api('GET', '/api/churn-alerts/summary');
  test(r.status === 200, 'GET /api/churn-alerts/summary', r.status);

  console.log('\n========================================');
  console.log('RESULTS: ' + passed + ' passed, ' + failed + ' failed');
  console.log('========================================\n');
  process.exit(failed > 0 ? 1 : 0);
})().catch(function(err) {
  console.error('FATAL:', err.message);
  process.exit(1);
});
