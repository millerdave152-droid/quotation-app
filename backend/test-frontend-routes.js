require('dotenv').config();
var jwt = require('./utils/jwt');
var token = jwt.generateAccessToken({ id: 1, email: 'admin@yourcompany.com', role: 'admin' });
var BASE = 'http://localhost:3001/api/marketplace';

var passed = 0, failed = 0;
function assert(cond, label, detail) {
  console.log((cond ? '\u2705' : '\u274C') + ' ' + label + (detail ? ' \u2014 ' + detail : ''));
  if (cond) passed++; else failed++;
}

async function api(method, path, body) {
  var opts = { method: method, headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  var r = await fetch(BASE + path, opts);
  var data = await r.json().catch(function() { return {}; });
  return { status: r.status, data: data };
}

(async function() {
  console.log('=== FRONTEND-FACING MARKETPLACE ROUTES TEST ===');
  console.log('Testing all routes actually called by MarketplaceManager.jsx\n');

  // ──── TAB 1: Dashboard ────
  console.log('--- TAB 1: Dashboard ---');
  var r;
  r = await api('GET', '/dashboard-analytics');
  assert(r.status === 200, 'GET /dashboard-analytics', r.status);

  r = await api('GET', '/channels/dashboard');
  assert(r.status === 200, 'GET /channels/dashboard', r.status);

  r = await api('GET', '/forecasting/stockout-alerts');
  assert(r.status === 200, 'GET /forecasting/stockout-alerts', r.status);

  r = await api('GET', '/notifications');
  assert(r.status === 200, 'GET /notifications', r.status);

  // ──── TAB 2: Orders ────
  console.log('\n--- TAB 2: Orders ---');
  r = await api('GET', '/orders');
  assert(r.status === 200, 'GET /orders', r.status);

  r = await api('GET', '/orders/unified/stats');
  assert(r.status === 200, 'GET /orders/unified/stats', r.status);

  // ──── TAB 3: Offers ────
  console.log('\n--- TAB 3: Offers ---');
  r = await api('GET', '/offers/recent-imports');
  assert(r.status === 200, 'GET /offers/recent-imports', r.status);

  r = await api('GET', '/offers/products');
  assert(r.status === 200, 'GET /offers/products', r.status);

  r = await api('GET', '/bundles');
  assert(r.status === 200, 'GET /bundles', r.status);

  // ──── TAB 4: Inventory ────
  console.log('\n--- TAB 4: Inventory ---');
  r = await api('GET', '/inventory-health');
  assert(r.status === 200, 'GET /inventory-health', r.status);

  r = await api('GET', '/forecasting/reorder-suggestions');
  assert(r.status === 200, 'GET /forecasting/reorder-suggestions', r.status);

  r = await api('GET', '/forecasting/overstock');
  assert(r.status === 200, 'GET /forecasting/overstock', r.status);

  // ──── TAB 5: Channels ────
  console.log('\n--- TAB 5: Channels ---');
  r = await api('GET', '/channels');
  assert(r.status === 200, 'GET /channels', r.status);

  r = await api('GET', '/listings/health/1');
  assert(r.status === 200, 'GET /listings/health/:channelId', r.status);

  // ──── TAB 6: Pricing ────
  console.log('\n--- TAB 6: Pricing ---');
  r = await api('GET', '/pricing/rules');
  assert(r.status === 200, 'GET /pricing/rules', r.status);

  r = await api('GET', '/pricing/pending');
  assert(r.status === 200, 'GET /pricing/pending', r.status);

  r = await api('GET', '/pricing/log?limit=50');
  assert(r.status === 200, 'GET /pricing/log', r.status);

  // ──── TAB 7: Returns ────
  console.log('\n--- TAB 7: Returns ---');
  r = await api('GET', '/returns');
  assert(r.status === 200, 'GET /returns', r.status);

  r = await api('GET', '/returns/stats');
  assert(r.status === 200, 'GET /returns/stats', r.status);

  r = await api('GET', '/returns/rules');
  assert(r.status === 200, 'GET /returns/rules', r.status);

  r = await api('GET', '/returns/analytics');
  assert(r.status === 200, 'GET /returns/analytics', r.status);

  // ──── TAB 8: Messages ────
  console.log('\n--- TAB 8: Messages ---');
  r = await api('GET', '/messages/inbox');
  assert(r.status === 200, 'GET /messages/inbox', r.status);

  r = await api('GET', '/messages/stats');
  assert(r.status === 200, 'GET /messages/stats', r.status);

  r = await api('GET', '/messages/templates');
  assert(r.status === 200, 'GET /messages/templates', r.status);

  // ──── TAB 9: Analytics ────
  console.log('\n--- TAB 9: Analytics ---');
  r = await api('GET', '/analytics/kpi');
  assert(r.status === 200, 'GET /analytics/kpi', r.status);

  r = await api('GET', '/analytics/revenue?period=30');
  assert(r.status === 200, 'GET /analytics/revenue', r.status);

  r = await api('GET', '/analytics/products?days=30');
  assert(r.status === 200, 'GET /analytics/products', r.status);

  r = await api('GET', '/analytics/profitability/1?days=30');
  assert(r.status === 200, 'GET /analytics/profitability/:channelId', r.status);

  r = await api('GET', '/analytics/sell-through/1?days=30');
  assert(r.status === 200, 'GET /analytics/sell-through/:channelId', r.status);

  r = await api('GET', '/ai/anomalies');
  assert(r.status === 200, 'GET /ai/anomalies', r.status);

  r = await api('POST', '/ai/query', { question: 'How many orders?' });
  assert(r.status === 200, 'POST /ai/query', r.status);

  // ──── TAB 10: Settings ────
  console.log('\n--- TAB 10: Settings ---');
  r = await api('GET', '/order-settings');
  assert(r.status === 200, 'GET /order-settings', r.status);

  r = await api('GET', '/sync-settings');
  assert(r.status === 200, 'GET /sync-settings', r.status);

  r = await api('GET', '/return-settings');
  assert(r.status === 200, 'GET /return-settings', r.status);

  r = await api('GET', '/settings');
  assert(r.status === 200, 'GET /settings', r.status);

  r = await api('PUT', '/settings/default_carrier', { value: 'purolator' });
  assert(r.status === 200, 'PUT /settings/default_carrier', r.status);

  r = await api('GET', '/polling-status');
  assert(r.status === 200, 'GET /polling-status', r.status);

  // ──── SHARED: Audit ────
  console.log('\n--- Shared ---');
  r = await api('GET', '/audit-log');
  assert(r.status === 200, 'GET /audit-log', r.status);

  console.log('\n========================================');
  console.log('RESULTS: ' + passed + ' passed, ' + failed + ' failed');
  console.log('========================================\n');
  process.exit(failed > 0 ? 1 : 0);
})().catch(function(err) {
  console.error('FATAL:', err.message);
  process.exit(1);
});
