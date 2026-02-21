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
  console.log('=== TESTING PREVIOUSLY FAILING ROUTES ===\n');

  // 1. GET /returns (was failing: countQuery regex crash)
  console.log('--- GET /returns ---');
  var r1 = await api('GET', '/returns');
  assert(r1.status === 200, 'GET /returns status', 'status=' + r1.status);
  assert(Array.isArray(r1.data.returns), 'Has returns array');
  assert(typeof r1.data.total === 'number', 'Has total count', 'total=' + r1.data.total);

  // 2. GET /returns/stats (was failing: caught by /returns/:id -> PG cast error)
  console.log('\n--- GET /returns/stats ---');
  var r2 = await api('GET', '/returns/stats');
  assert(r2.status === 200, 'GET /returns/stats status', 'status=' + r2.status);
  assert(r2.data.totalReturns !== undefined, 'Has totalReturns', 'totalReturns=' + r2.data.totalReturns);
  assert(r2.data.pending !== undefined, 'Has pending count');

  // 3. GET /returns/rules (was failing: caught by /returns/:id)
  console.log('\n--- GET /returns/rules ---');
  var r3 = await api('GET', '/returns/rules');
  assert(r3.status === 200, 'GET /returns/rules status', 'status=' + r3.status);
  assert(Array.isArray(r3.data.rules), 'Has rules array');
  assert(typeof r3.data.total === 'number', 'Has total', 'total=' + r3.data.total);

  // 4. GET /returns/analytics (was failing: caught by /returns/:id)
  console.log('\n--- GET /returns/analytics ---');
  var r4 = await api('GET', '/returns/analytics');
  assert(r4.status === 200, 'GET /returns/analytics status', 'status=' + r4.status);
  assert(Array.isArray(r4.data.status_breakdown), 'Has status_breakdown');
  assert(Array.isArray(r4.data.reason_breakdown), 'Has reason_breakdown');
  assert(r4.data.refund_stats !== undefined, 'Has refund_stats');

  // 5. GET /settings (was 404: route didn't exist)
  console.log('\n--- GET /settings ---');
  var r5 = await api('GET', '/settings');
  assert(r5.status === 200, 'GET /settings status', 'status=' + r5.status);
  assert(typeof r5.data === 'object', 'Returns object');

  // 6. PUT /settings/:key (also didn't exist)
  console.log('\n--- PUT /settings/default_carrier ---');
  var r6 = await api('PUT', '/settings/default_carrier', { value: 'purolator' });
  assert(r6.status === 200, 'PUT /settings/default_carrier status', 'status=' + r6.status);
  assert(r6.data.success === true, 'Returns success=true');

  // 7. Verify /returns/:id still works with numeric ID
  console.log('\n--- GET /returns/1 (numeric ID) ---');
  var r7 = await api('GET', '/returns/1');
  // May be 404 if no return exists, but should NOT be 500
  assert(r7.status === 200 || r7.status === 404, 'GET /returns/1 returns 200 or 404', 'status=' + r7.status);

  // === Run full route test suite ===
  console.log('\n=== BROADER ROUTE TESTS ===\n');

  // Messages routes
  console.log('--- Messages Routes ---');
  var m1 = await api('GET', '/messages/inbox');
  assert(m1.status === 200, 'GET /messages/inbox', 'status=' + m1.status);

  var m2 = await api('GET', '/messages/stats');
  assert(m2.status === 200, 'GET /messages/stats', 'status=' + m2.status);

  var m3 = await api('GET', '/messages/templates');
  assert(m3.status === 200, 'GET /messages/templates', 'status=' + m3.status);

  // Pricing routes
  console.log('\n--- Pricing Routes ---');
  var p1 = await api('GET', '/pricing/rules');
  assert(p1.status === 200, 'GET /pricing/rules', 'status=' + p1.status);

  // Channel routes
  console.log('\n--- Channel Routes ---');
  var c1 = await api('GET', '/channels');
  assert(c1.status === 200, 'GET /channels', 'status=' + c1.status);

  // Order settings
  console.log('\n--- Settings Routes ---');
  var s1 = await api('GET', '/order-settings');
  assert(s1.status === 200, 'GET /order-settings', 'status=' + s1.status);

  var s2 = await api('GET', '/sync-settings');
  assert(s2.status === 200, 'GET /sync-settings', 'status=' + s2.status);

  var s3 = await api('GET', '/return-settings');
  assert(s3.status === 200, 'GET /return-settings', 'status=' + s3.status);

  // Analytics routes
  console.log('\n--- Analytics Routes ---');
  var a1 = await api('GET', '/analytics/kpi');
  assert(a1.status === 200, 'GET /analytics/kpi', 'status=' + a1.status);

  var a2 = await api('GET', '/analytics/revenue?period=30');
  assert(a2.status === 200, 'GET /analytics/revenue', 'status=' + a2.status);

  var a3 = await api('GET', '/analytics/product-performance');
  assert(a3.status === 200, 'GET /analytics/product-performance', 'status=' + a3.status);

  // Inventory routes
  console.log('\n--- Inventory Routes ---');
  var i1 = await api('GET', '/inventory/alerts');
  assert(i1.status === 200, 'GET /inventory/alerts', 'status=' + i1.status);

  console.log('\n=== RESULTS: ' + passed + ' passed, ' + failed + ' failed ===\n');
  process.exit(failed > 0 ? 1 : 0);
})().catch(function(err) {
  console.error('FATAL:', err.message, err.stack);
  process.exit(1);
});
