require('dotenv').config();
var jwt = require('./utils/jwt');
var pool = require('./db');
var token = jwt.generateAccessToken({ id: 1, email: 'admin@yourcompany.com', role: 'admin' });
var BASE = 'http://localhost:3001/api/marketplace';

async function api(method, path, body) {
  var opts = { method: method, headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  var r = await fetch(BASE + path, opts);
  var data = await r.json().catch(function() { return {}; });
  return { status: r.status, data: data };
}

(async function() {
  console.log('=== BUNDLE ROUTES TEST ===\n');

  // Find products
  var prods = (await pool.query(
    "SELECT id, price FROM products WHERE price > 50 AND quantity_in_stock > 0 LIMIT 2"
  )).rows;

  var p1 = prods[0], p2 = prods[1];
  var bundlePrice = Math.round((parseFloat(p1.price) + parseFloat(p2.price)) * 0.85 * 100) / 100;

  // POST /bundles — create
  var c = await api('POST', '/bundles', {
    bundleSku: 'ROUTE-TEST-' + Date.now(),
    bundleName: 'Route Test Bundle',
    bundlePrice: bundlePrice,
    components: [{ productId: p1.id, quantity: 1 }, { productId: p2.id, quantity: 1 }]
  });
  console.log(c.status === 201 ? '\u2705' : '\u274C', 'POST /bundles', 'status=' + c.status);
  var bundleId = c.data.id;

  // GET /bundles
  var g = await api('GET', '/bundles');
  console.log(g.status === 200 ? '\u2705' : '\u274C', 'GET /bundles', 'status=' + g.status, 'count=' + g.data.count);

  // PUT /bundles/:id
  var u = await api('PUT', '/bundles/' + bundleId, { bundleName: 'Updated Route Bundle' });
  console.log(u.status === 200 ? '\u2705' : '\u274C', 'PUT /bundles/:id', 'status=' + u.status);

  // POST /bundles/sync
  var s = await api('POST', '/bundles/sync');
  console.log(s.status === 200 ? '\u2705' : '\u274C', 'POST /bundles/sync', 'status=' + s.status, 'synced=' + s.data.synced);

  // DELETE /bundles/:id
  var d = await api('DELETE', '/bundles/' + bundleId);
  console.log(d.status === 200 ? '\u2705' : '\u274C', 'DELETE /bundles/:id', 'status=' + d.status);

  // Cleanup
  await pool.query('DELETE FROM bundle_components WHERE bundle_id = $1', [bundleId]);
  await pool.query('DELETE FROM product_bundles WHERE id = $1', [bundleId]);
  console.log('\nCleaned up. All routes tested.');
  process.exit(0);
})().catch(function(err) {
  console.error('FATAL:', err.message);
  process.exit(1);
});
