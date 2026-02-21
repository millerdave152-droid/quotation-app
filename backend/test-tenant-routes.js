require('dotenv').config();
var jwt = require('./utils/jwt');
var pool = require('./db');
var token = jwt.generateAccessToken({ id: 1, email: 'admin@yourcompany.com', role: 'admin' });
var BASE = 'http://localhost:3001/api/marketplace';

async function api(method, path, body, extraHeaders) {
  var opts = { method: method, headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' } };
  if (extraHeaders) Object.assign(opts.headers, extraHeaders);
  if (body) opts.body = JSON.stringify(body);
  var r = await fetch(BASE + path, opts);
  var data = await r.json().catch(function() { return {}; });
  return { status: r.status, data: data };
}

(async function() {
  console.log('=== TENANT ROUTES TEST ===\n');

  // GET /tenants
  var g = await api('GET', '/tenants');
  console.log(g.status === 200 ? '\u2705' : '\u274C', 'GET /tenants', 'status=' + g.status, 'count=' + g.data.count);

  // POST /tenants
  var c = await api('POST', '/tenants', {
    tenantCode: 'ROUTE_TEST_' + Date.now(),
    companyName: 'Route Test Corp'
  });
  console.log(c.status === 201 ? '\u2705' : '\u274C', 'POST /tenants', 'status=' + c.status);
  var testId = c.data.id;

  // PUT /tenants/:id
  var u = await api('PUT', '/tenants/' + testId, { companyName: 'Updated Route Corp', plan: 'PREMIUM' });
  console.log(u.status === 200 ? '\u2705' : '\u274C', 'PUT /tenants/:id', 'status=' + u.status);

  // GET /tenants/current (with middleware)
  var cur = await api('GET', '/tenants/current');
  console.log(cur.status === 200 ? '\u2705' : '\u274C', 'GET /tenants/current', 'status=' + cur.status, 'tenant=' + (cur.data.tenant_code || 'none'));

  // GET /tenants/current with X-Tenant-Id header
  var cur2 = await api('GET', '/tenants/current', null, { 'X-Tenant-Id': '1' });
  console.log(cur2.status === 200 ? '\u2705' : '\u274C', 'GET /tenants/current (header)', 'status=' + cur2.status, 'tenant=' + (cur2.data.tenant_code || 'none'));

  // GET /tenants/:id/channels (TeleTime)
  var ch = await api('GET', '/tenants/1/channels');
  console.log(ch.status === 200 ? '\u2705' : '\u274C', 'GET /tenants/:id/channels', 'status=' + ch.status, 'count=' + ch.data.count);

  // GET /tenants/:id/stats (TeleTime)
  var st = await api('GET', '/tenants/1/stats');
  console.log(st.status === 200 ? '\u2705' : '\u274C', 'GET /tenants/:id/stats', 'status=' + st.status, 'orders=' + (st.data.orders && st.data.orders.total));

  // Cleanup
  await pool.query('DELETE FROM marketplace_tenants WHERE id = $1', [testId]);
  console.log('\nCleaned up. All routes tested.');
  process.exit(0);
})().catch(function(err) {
  console.error('FATAL:', err.message);
  process.exit(1);
});
