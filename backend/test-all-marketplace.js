require('dotenv').config();
var jwt = require('./utils/jwt');
var token = jwt.generateAccessToken({ id: 1, email: 'admin@yourcompany.com', role: 'admin' });
var BASE = 'http://localhost:3001/api/marketplace';

var passed = 0, failed = 0, skipped = 0;
function assert(cond, label, detail) {
  console.log((cond ? '\u2705' : '\u274C') + ' ' + label + (detail ? ' \u2014 ' + detail : ''));
  if (cond) passed++; else failed++;
}
function skip(label, reason) {
  console.log('\u23ED ' + label + ' \u2014 ' + reason);
  skipped++;
}

async function api(method, path, body) {
  var opts = { method: method, headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  var r = await fetch(BASE + path, opts);
  var text = await r.text();
  var data;
  try { data = JSON.parse(text); } catch(e) { data = { _raw: text }; }
  return { status: r.status, data: data };
}

(async function() {
  console.log('=== COMPREHENSIVE MARKETPLACE ROUTE TEST ===\n');

  // ──── DASHBOARD ────
  console.log('--- DASHBOARD ---');
  var d1 = await api('GET', '/dashboard-analytics');
  assert(d1.status === 200, 'GET /dashboard-analytics', 'status=' + d1.status);

  var d2 = await api('GET', '/stats');
  assert(d2.status === 200, 'GET /stats', 'status=' + d2.status);

  // ──── CHANNELS ────
  console.log('\n--- CHANNELS ---');
  var ch1 = await api('GET', '/channels');
  assert(ch1.status === 200, 'GET /channels', 'status=' + ch1.status);
  var channelId = ch1.data.channels && ch1.data.channels[0] ? ch1.data.channels[0].id : null;

  if (channelId) {
    var ch2 = await api('GET', '/channels/' + channelId);
    assert(ch2.status === 200, 'GET /channels/:id', 'status=' + ch2.status);

    var ch3 = await api('GET', '/channels/' + channelId + '/dashboard');
    assert(ch3.status === 200, 'GET /channels/:id/dashboard', 'status=' + ch3.status);
  }

  // ──── ORDERS ────
  console.log('\n--- ORDERS ---');
  var o1 = await api('GET', '/orders');
  assert(o1.status === 200, 'GET /orders', 'status=' + o1.status);

  var o2 = await api('GET', '/orders/stats');
  assert(o2.status === 200, 'GET /orders/stats', 'status=' + o2.status);

  // ──── LISTINGS/OFFERS ────
  console.log('\n--- LISTINGS ---');
  var l1 = await api('GET', '/listings');
  assert(l1.status === 200, 'GET /listings', 'status=' + l1.status);

  var l2 = await api('GET', '/listing-health');
  assert(l2.status === 200, 'GET /listing-health', 'status=' + l2.status);

  // ──── RETURNS ────
  console.log('\n--- RETURNS ---');
  var ret1 = await api('GET', '/returns');
  assert(ret1.status === 200, 'GET /returns', 'status=' + ret1.status);

  var ret2 = await api('GET', '/returns/stats');
  assert(ret2.status === 200, 'GET /returns/stats', 'status=' + ret2.status);

  var ret3 = await api('GET', '/returns/rules');
  assert(ret3.status === 200, 'GET /returns/rules', 'status=' + ret3.status);

  var ret4 = await api('GET', '/returns/analytics');
  assert(ret4.status === 200, 'GET /returns/analytics', 'status=' + ret4.status);

  var ret5 = await api('GET', '/return-settings');
  assert(ret5.status === 200, 'GET /return-settings', 'status=' + ret5.status);

  // ──── SETTINGS ────
  console.log('\n--- SETTINGS ---');
  var s1 = await api('GET', '/settings');
  assert(s1.status === 200, 'GET /settings', 'status=' + s1.status);

  var s2 = await api('GET', '/order-settings');
  assert(s2.status === 200, 'GET /order-settings', 'status=' + s2.status);

  var s3 = await api('GET', '/sync-settings');
  assert(s3.status === 200, 'GET /sync-settings', 'status=' + s3.status);

  var s4 = await api('PUT', '/settings/test_setting', { value: 'test123' });
  assert(s4.status === 200, 'PUT /settings/:key', 'status=' + s4.status);

  // ──── PRICING ────
  console.log('\n--- PRICING ---');
  var pr1 = await api('GET', '/pricing/rules');
  assert(pr1.status === 200, 'GET /pricing/rules', 'status=' + pr1.status);

  var pr2 = await api('GET', '/pricing/pending-approvals');
  assert(pr2.status === 200, 'GET /pricing/pending-approvals', 'status=' + pr2.status);

  var pr3 = await api('GET', '/pricing/change-log');
  assert(pr3.status === 200, 'GET /pricing/change-log', 'status=' + pr3.status);

  // ──── MESSAGES ────
  console.log('\n--- MESSAGES ---');
  var msg1 = await api('GET', '/messages/inbox');
  assert(msg1.status === 200, 'GET /messages/inbox', 'status=' + msg1.status);

  var msg2 = await api('GET', '/messages/stats');
  assert(msg2.status === 200, 'GET /messages/stats', 'status=' + msg2.status);

  var msg3 = await api('GET', '/messages/templates');
  assert(msg3.status === 200, 'GET /messages/templates', 'status=' + msg3.status);

  // ──── ANALYTICS ────
  console.log('\n--- ANALYTICS ---');
  var an1 = await api('GET', '/analytics/kpi');
  assert(an1.status === 200, 'GET /analytics/kpi', 'status=' + an1.status);

  var an2 = await api('GET', '/analytics/revenue?period=30');
  assert(an2.status === 200, 'GET /analytics/revenue', 'status=' + an2.status);

  var an3 = await api('GET', '/analytics/products');
  assert(an3.status === 200, 'GET /analytics/products', 'status=' + an3.status);

  if (channelId) {
    var an4 = await api('GET', '/analytics/profitability/' + channelId);
    assert(an4.status === 200, 'GET /analytics/profitability/:channelId', 'status=' + an4.status);

    var an5 = await api('GET', '/analytics/sell-through/' + channelId);
    assert(an5.status === 200, 'GET /analytics/sell-through/:channelId', 'status=' + an5.status);
  }

  // ──── FORECASTING ────
  console.log('\n--- FORECASTING ---');
  var fc1 = await api('GET', '/forecasting/stockout-alerts');
  assert(fc1.status === 200, 'GET /forecasting/stockout-alerts', 'status=' + fc1.status);

  var fc2 = await api('GET', '/forecasting/reorder-suggestions');
  assert(fc2.status === 200, 'GET /forecasting/reorder-suggestions', 'status=' + fc2.status);

  var fc3 = await api('GET', '/forecasting/overstock');
  assert(fc3.status === 200, 'GET /forecasting/overstock', 'status=' + fc3.status);

  // ──── SYNC / POLLING ────
  console.log('\n--- SYNC ---');
  var sy1 = await api('GET', '/sync/status');
  assert(sy1.status === 200, 'GET /sync/status', 'status=' + sy1.status);

  var sy2 = await api('GET', '/sync/history');
  assert(sy2.status === 200, 'GET /sync/history', 'status=' + sy2.status);

  // ──── BUNDLES ────
  console.log('\n--- BUNDLES ---');
  var b1 = await api('GET', '/bundles');
  assert(b1.status === 200, 'GET /bundles', 'status=' + b1.status);

  // ──── NOTIFICATIONS ────
  console.log('\n--- NOTIFICATIONS ---');
  var n1 = await api('GET', '/notifications');
  assert(n1.status === 200, 'GET /notifications', 'status=' + n1.status);

  // ──── REPORTS ────
  console.log('\n--- REPORTS ---');
  var rp1 = await api('GET', '/reports');
  assert(rp1.status === 200, 'GET /reports', 'status=' + rp1.status);

  // ──── AI ────
  console.log('\n--- AI ---');
  var ai1 = await api('GET', '/ai/anomalies');
  assert(ai1.status === 200, 'GET /ai/anomalies', 'status=' + ai1.status);

  var ai2 = await api('POST', '/ai/query', { question: 'How many orders are there?' });
  assert(ai2.status === 200, 'POST /ai/query', 'status=' + ai2.status);

  // ──── AUDIT LOG ────
  console.log('\n--- AUDIT ---');
  var au1 = await api('GET', '/audit-log');
  assert(au1.status === 200, 'GET /audit-log', 'status=' + au1.status);

  console.log('\n=== RESULTS: ' + passed + ' passed, ' + failed + ' failed, ' + skipped + ' skipped ===\n');
  process.exit(failed > 0 ? 1 : 0);
})().catch(function(err) {
  console.error('FATAL:', err.message);
  process.exit(1);
});
