require('dotenv').config();
var jwt = require('./utils/jwt');
var pool = require('./db');
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
  console.log('=== SHIPPING ROUTES TEST ===\n');

  // 1. POST /shipping/rates — ad-hoc
  console.log('--- POST /shipping/rates (ad-hoc) ---\n');
  var r1 = await api('POST', '/shipping/rates', {
    weightKg: 3,
    destinationPostal: 'V6B 1A1',
    destinationProvince: 'BC',
    destinationCountry: 'CA'
  });
  assert(r1.status === 200, 'POST /shipping/rates status', 'status=' + r1.status);
  assert(r1.data.quotes && r1.data.quotes.length >= 1, 'Has rate quotes', 'count=' + (r1.data.quotes || []).length);
  assert(r1.data.weightKg === 3, 'Weight in response');
  assert(r1.data.destination.province === 'BC', 'Province in response');
  console.log('  Cheapest: $' + r1.data.quotes[0].totalRate + ' ' + r1.data.quotes[0].carrierName);

  // 2. POST /shipping/rates — with orderId
  console.log('\n--- POST /shipping/rates (with order) ---\n');
  var orderCheck = await pool.query('SELECT id FROM marketplace_orders LIMIT 1');
  if (orderCheck.rows.length > 0) {
    var r2 = await api('POST', '/shipping/rates', { orderId: orderCheck.rows[0].id });
    assert(r2.status === 200, 'POST /shipping/rates (order) status', 'status=' + r2.status);
    assert(r2.data.orderId === orderCheck.rows[0].id, 'orderId in response');
    assert(r2.data.quotes.length >= 1, 'Quotes returned');
  } else {
    console.log('  SKIP: no orders');
  }

  // 3. POST /shipping/labels/:orderId
  console.log('\n--- POST /shipping/labels/:orderId ---\n');
  var createdFulfillmentIds = [];
  if (orderCheck.rows.length > 0) {
    var r3 = await api('POST', '/shipping/labels/' + orderCheck.rows[0].id, {
      serviceCode: 'regular',
      packages: [{ weightKg: 2 }],
      notes: 'Route test label'
    });
    assert(r3.status === 201, 'POST /shipping/labels/:orderId status', 'status=' + r3.status);
    assert(r3.data.fulfillmentId > 0, 'fulfillmentId returned', r3.data.fulfillmentId);
    assert(r3.data.trackingNumber !== undefined, 'trackingNumber returned');
    assert(r3.data.carrier !== undefined, 'carrier info returned');
    assert(r3.data.shippingCost > 0, 'shippingCost > 0', '$' + r3.data.shippingCost);
    createdFulfillmentIds.push(r3.data.fulfillmentId);
    var testTrackingNumber = r3.data.trackingNumber;

    // 4. GET /shipping/track/:trackingNumber
    console.log('\n--- GET /shipping/track/:trackingNumber ---\n');
    var r4 = await api('GET', '/shipping/track/' + testTrackingNumber);
    assert(r4.status === 200, 'GET /shipping/track/:tn status', 'status=' + r4.status);
    assert(r4.data.found === true, 'Shipment found');
    assert(r4.data.trackingNumber === testTrackingNumber, 'Tracking number matches');
    assert(r4.data.carrier !== undefined, 'Carrier in response');

    // 5. GET /shipping/track/:trackingNumber — not found
    console.log('\n--- GET /shipping/track/:trackingNumber (404) ---\n');
    var r5 = await api('GET', '/shipping/track/BOGUS-TRACKING-999');
    assert(r5.status === 200, 'Returns 200 with found=false', 'status=' + r5.status);
    assert(r5.data.found === false, 'found=false for unknown tracking');
  } else {
    console.log('  SKIP: no orders');
  }

  // 6. POST /shipping/labels/batch
  console.log('\n--- POST /shipping/labels/batch ---\n');
  var orders = await pool.query('SELECT id FROM marketplace_orders LIMIT 2');
  if (orders.rows.length >= 1) {
    var batchIds = orders.rows.map(function(r) { return r.id; });
    var r6 = await api('POST', '/shipping/labels/batch', {
      orderIds: batchIds,
      serviceCode: 'expedited'
    });
    assert(r6.status === 200, 'POST /shipping/labels/batch status', 'status=' + r6.status);
    assert(r6.data.total === batchIds.length, 'Batch total correct', r6.data.total);
    assert(r6.data.succeeded >= 1, 'At least 1 succeeded', r6.data.succeeded);
    assert(r6.data.results.length === batchIds.length, 'Results array correct length');
    // Track for cleanup
    for (var br of r6.data.results) {
      if (br.success && br.fulfillmentId) createdFulfillmentIds.push(br.fulfillmentId);
    }
    console.log('  Batch: ' + r6.data.succeeded + '/' + r6.data.total + ' succeeded');
  } else {
    console.log('  SKIP: no orders');
  }

  // 7. GET /shipping/cost-report
  console.log('\n--- GET /shipping/cost-report ---\n');
  var r7 = await api('GET', '/shipping/cost-report');
  assert(r7.status === 200, 'GET /shipping/cost-report status', 'status=' + r7.status);
  assert(r7.data.summary !== undefined, 'Summary present');
  assert(typeof r7.data.summary.totalShipments === 'number', 'totalShipments is number');
  assert(Array.isArray(r7.data.breakdown), 'Breakdown is array');

  // 8. GET /shipping/cost-report?groupBy=month
  console.log('\n--- GET /shipping/cost-report?groupBy=month ---\n');
  var r8 = await api('GET', '/shipping/cost-report?groupBy=month');
  assert(r8.status === 200, 'cost-report by month status', 'status=' + r8.status);
  assert(Array.isArray(r8.data.breakdown), 'Monthly breakdown is array');

  // 9. GET /shipping/cost-report?groupBy=channel
  console.log('\n--- GET /shipping/cost-report?groupBy=channel ---\n');
  var r9 = await api('GET', '/shipping/cost-report?groupBy=channel');
  assert(r9.status === 200, 'cost-report by channel status', 'status=' + r9.status);

  // Cleanup
  console.log('\n--- CLEANUP ---\n');
  for (var fid of createdFulfillmentIds) {
    await pool.query('DELETE FROM fulfillment_status_history WHERE fulfillment_id = $1', [fid]);
    await pool.query('DELETE FROM order_fulfillment WHERE id = $1', [fid]);
  }
  await pool.query("DELETE FROM marketplace_shipments WHERE shipment_status = 'PROCESSING' AND shipment_date >= CURRENT_DATE");
  console.log('  Cleaned up ' + createdFulfillmentIds.length + ' fulfillment records');

  console.log('\n=== RESULTS: ' + passed + ' passed, ' + failed + ' failed ===\n');
  process.exit(failed > 0 ? 1 : 0);
})().catch(function(err) {
  console.error('FATAL:', err.message, err.stack);
  process.exit(1);
});
