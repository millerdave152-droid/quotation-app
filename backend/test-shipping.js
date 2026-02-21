require('dotenv').config();
var pool = require('./db');
var shippingService = require('./services/ShippingService');

var passed = 0, failed = 0;
function assert(cond, label, detail) {
  console.log((cond ? '\u2705' : '\u274C') + ' ' + label + (detail ? ' \u2014 ' + detail : ''));
  if (cond) passed++; else failed++;
}

(async function() {
  console.log('=== SHIPPING SERVICE TEST ===\n');

  // Ensure we have at least one carrier seeded
  console.log('--- SEED CARRIERS ---\n');
  var cpRes = await pool.query("SELECT id FROM shipping_carriers WHERE carrier_code = 'canada_post'");
  var cpId;
  if (cpRes.rows.length === 0) {
    var ins = await pool.query(
      "INSERT INTO shipping_carriers (carrier_code, carrier_name, api_endpoint, default_package_type, rate_markup_percent, rate_markup_flat, is_active) " +
      "VALUES ('canada_post', 'Canada Post', 'https://api.canadapost.ca', 'PARCEL', 5.00, 1.50, true) RETURNING id"
    );
    cpId = ins.rows[0].id;
    console.log('  Seeded Canada Post carrier id=' + cpId);
  } else {
    cpId = cpRes.rows[0].id;
    // Ensure markup is set for testing
    await pool.query("UPDATE shipping_carriers SET rate_markup_percent = 5.00, rate_markup_flat = 1.50 WHERE id = $1", [cpId]);
    console.log('  Canada Post carrier exists id=' + cpId + ' (markup updated)');
  }

  var purRes = await pool.query("SELECT id FROM shipping_carriers WHERE carrier_code = 'purolator'");
  var purId;
  if (purRes.rows.length === 0) {
    var ins2 = await pool.query(
      "INSERT INTO shipping_carriers (carrier_code, carrier_name, api_endpoint, default_package_type, rate_markup_percent, is_active) " +
      "VALUES ('purolator', 'Purolator', 'https://api.purolator.com', 'PARCEL', 3.00, true) RETURNING id"
    );
    purId = ins2.rows[0].id;
    console.log('  Seeded Purolator carrier id=' + purId);
  } else {
    purId = purRes.rows[0].id;
    console.log('  Purolator carrier exists id=' + purId);
  }

  // Seed shipping rates
  console.log('\n--- SEED RATES ---\n');
  var rateCheck = await pool.query('SELECT COUNT(*) as cnt FROM shipping_rates WHERE carrier_id = $1', [cpId]);
  if (parseInt(rateCheck.rows[0].cnt) === 0) {
    await pool.query(
      "INSERT INTO shipping_rates (carrier_id, service_code, service_name, destination_zone, destination_country, min_weight_kg, max_weight_kg, base_rate, per_kg_rate, estimated_days_min, estimated_days_max, is_active) VALUES " +
      "($1, 'regular', 'Regular Parcel', 'domestic', 'CA', 0, 30, 12.99, 1.50, 5, 10, true)," +
      "($1, 'expedited', 'Expedited Parcel', 'domestic', 'CA', 0, 30, 18.99, 2.00, 2, 5, true)," +
      "($1, 'priority', 'Priority', 'domestic', 'CA', 0, 30, 29.99, 3.50, 1, 2, true)",
      [cpId]
    );
    console.log('  Seeded 3 Canada Post rates');
  } else {
    console.log('  Canada Post rates already exist: ' + rateCheck.rows[0].cnt);
  }

  var rateCheck2 = await pool.query('SELECT COUNT(*) as cnt FROM shipping_rates WHERE carrier_id = $1', [purId]);
  if (parseInt(rateCheck2.rows[0].cnt) === 0) {
    await pool.query(
      "INSERT INTO shipping_rates (carrier_id, service_code, service_name, destination_zone, destination_country, min_weight_kg, max_weight_kg, base_rate, per_kg_rate, estimated_days_min, estimated_days_max, is_active) VALUES " +
      "($1, 'ground', 'Purolator Ground', 'domestic', 'CA', 0, 50, 14.50, 1.25, 4, 8, true)," +
      "($1, 'express', 'Purolator Express', 'domestic', 'CA', 0, 50, 24.99, 2.75, 1, 3, true)",
      [purId]
    );
    console.log('  Seeded 2 Purolator rates');
  } else {
    console.log('  Purolator rates already exist: ' + rateCheck2.rows[0].cnt);
  }

  // Reset adapter cache so new carriers are picked up
  shippingService._loaded = false;
  shippingService._adapters.clear();

  // 1. getRates — ad-hoc (no orderId)
  console.log('\n--- 1. getRates (ad-hoc) ---\n');
  var rates = await shippingService.getRates({
    weightKg: 5,
    destinationPostal: 'M5V 1A1',
    destinationProvince: 'ON',
    destinationCountry: 'CA',
  });
  assert(rates.quotes.length >= 3, 'At least 3 quotes returned', 'count=' + rates.quotes.length);
  assert(rates.weightKg === 5, 'Weight preserved', rates.weightKg + 'kg');
  assert(rates.destination.province === 'ON', 'Province set');
  assert(rates.quotes[0].totalRate <= rates.quotes[rates.quotes.length - 1].totalRate, 'Sorted cheapest first');
  assert(rates.quotes[0].source === 'rate_table', 'Source is rate_table');
  assert(rates.quotes[0].carrierCode !== undefined, 'Has carrierCode');
  assert(rates.quotes[0].serviceCode !== undefined, 'Has serviceCode');
  assert(rates.quotes[0].totalRate > rates.quotes[0].baseRate, 'Markup applied (totalRate > baseRate)');
  console.log('  Cheapest: $' + rates.quotes[0].totalRate + ' (' + rates.quotes[0].carrierName + ' ' + rates.quotes[0].serviceName + ')');
  console.log('  Most expensive: $' + rates.quotes[rates.quotes.length - 1].totalRate);

  // 2. getRates — with orderId (if marketplace_orders has data)
  console.log('\n--- 2. getRates (with order) ---\n');
  var orderCheck = await pool.query('SELECT id FROM marketplace_orders LIMIT 1');
  if (orderCheck.rows.length > 0) {
    var orderRates = await shippingService.getRates({ orderId: orderCheck.rows[0].id });
    assert(orderRates.orderId === orderCheck.rows[0].id, 'orderId in response');
    assert(orderRates.quotes.length >= 1, 'Quotes returned for order', 'count=' + orderRates.quotes.length);
    console.log('  Order #' + orderRates.orderId + ': ' + orderRates.quotes.length + ' quotes, weight=' + orderRates.weightKg + 'kg');
  } else {
    console.log('  SKIP: no marketplace_orders to test with');
  }

  // 3. autoSelectCarrier — cheapest
  console.log('\n--- 3. autoSelectCarrier (cheapest) ---\n');
  var cheapest = await shippingService.autoSelectCarrier({
    weightKg: 3,
    destinationPostal: 'T2P 1J9',
    destinationProvince: 'AB',
    preference: 'cheapest',
  });
  assert(cheapest.selected !== null, 'Carrier selected');
  assert(cheapest.preference === 'cheapest', 'Preference recorded');
  assert(cheapest.selected.totalRate > 0, 'Rate > 0', '$' + cheapest.selected.totalRate);
  assert(cheapest.alternativeCount >= 1, 'Alternatives available', cheapest.alternativeCount);
  console.log('  Selected: ' + cheapest.selected.carrierName + ' ' + cheapest.selected.serviceName + ' $' + cheapest.selected.totalRate);

  // 4. autoSelectCarrier — fastest
  console.log('\n--- 4. autoSelectCarrier (fastest) ---\n');
  var fastest = await shippingService.autoSelectCarrier({
    weightKg: 3,
    destinationPostal: 'T2P 1J9',
    destinationProvince: 'AB',
    preference: 'fastest',
  });
  assert(fastest.selected !== null, 'Fastest carrier selected');
  assert(fastest.preference === 'fastest', 'Preference=fastest');
  assert(fastest.selected.estimatedDaysMin <= 2, 'Fast delivery', fastest.selected.estimatedDaysMin + ' days min');
  console.log('  Selected: ' + fastest.selected.carrierName + ' ' + fastest.selected.serviceName + ' (' + fastest.selected.estimatedDaysMin + '-' + fastest.selected.estimatedDaysMax + ' days)');

  // 5. generateLabel
  console.log('\n--- 5. generateLabel ---\n');
  if (orderCheck.rows.length > 0) {
    var label = await shippingService.generateLabel({
      orderId: orderCheck.rows[0].id,
      carrierId: cpId,
      serviceCode: 'regular',
      packages: [{ weightKg: 2.5 }],
      notes: 'Test label generation',
    });
    assert(label.fulfillmentId > 0, 'Fulfillment record created', 'id=' + label.fulfillmentId);
    assert(label.trackingNumber.length > 5, 'Tracking number generated', label.trackingNumber);
    assert(label.carrier.code === 'canada_post', 'Carrier = Canada Post');
    assert(label.serviceCode === 'regular', 'Service = regular');
    assert(label.shippingCost > 0, 'Shipping cost calculated', '$' + label.shippingCost);
    assert(label.status === 'processing', 'Status = processing');
    assert(label.weightKg === 2.5, 'Weight recorded');
    assert(label.packageCount === 1, 'Package count = 1');
    console.log('  Label: tracking=' + label.trackingNumber + ' cost=$' + label.shippingCost);

    // 6. trackShipment — using the tracking number we just generated
    console.log('\n--- 6. trackShipment ---\n');
    var tracking = await shippingService.trackShipment(label.trackingNumber);
    assert(tracking.found === true, 'Shipment found');
    assert(tracking.trackingNumber === label.trackingNumber, 'Tracking number matches');
    assert(tracking.carrier.code === 'canada_post', 'Carrier in tracking');
    assert(tracking.orderId === orderCheck.rows[0].id, 'Order ID in tracking');
    assert(tracking.status !== undefined, 'Status present', tracking.status);
    console.log('  Tracking: status=' + tracking.status + ' carrier=' + tracking.carrier.name);

    // 7. trackShipment — not found
    console.log('\n--- 7. trackShipment (not found) ---\n');
    var notFound = await shippingService.trackShipment('FAKE-XXXXX-12345');
    assert(notFound.found === false, 'Not found returns found=false');
    assert(notFound.message.includes('No shipment'), 'Appropriate message');

    // 8. generateBatchLabels
    console.log('\n--- 8. generateBatchLabels ---\n');
    var orderIds = [orderCheck.rows[0].id];
    var secondOrder = await pool.query('SELECT id FROM marketplace_orders WHERE id != $1 LIMIT 1', [orderCheck.rows[0].id]);
    if (secondOrder.rows.length > 0) orderIds.push(secondOrder.rows[0].id);

    var batch = await shippingService.generateBatchLabels({
      orderIds: orderIds,
      carrierId: purId,
      serviceCode: 'ground',
    });
    assert(batch.total === orderIds.length, 'Batch total correct', batch.total);
    assert(batch.succeeded >= 1, 'At least 1 succeeded', batch.succeeded);
    assert(batch.results.length === orderIds.length, 'Results for each order');
    assert(batch.results[0].success === true, 'First result succeeded');
    assert(batch.results[0].trackingNumber !== undefined, 'Batch result has tracking');
    console.log('  Batch: ' + batch.succeeded + '/' + batch.total + ' succeeded');

    // Cleanup fulfillment + shipment records we created
    console.log('\n--- CLEANUP ---\n');
    // Delete fulfillment records created by this test
    await pool.query("DELETE FROM order_fulfillment WHERE customer_notes = 'Test label generation'");
    // Delete batch-generated fulfillment records
    for (var r of batch.results) {
      if (r.success && r.fulfillmentId) {
        await pool.query('DELETE FROM fulfillment_status_history WHERE fulfillment_id = $1', [r.fulfillmentId]);
        await pool.query('DELETE FROM order_fulfillment WHERE id = $1', [r.fulfillmentId]);
      }
    }
    // Delete test marketplace_shipments
    await pool.query("DELETE FROM marketplace_shipments WHERE shipment_status = 'PROCESSING' AND carrier_code IN ('canada_post', 'purolator') AND shipment_date >= CURRENT_DATE");
    console.log('  Cleaned up test fulfillment and shipment records');
  } else {
    console.log('  SKIP: no marketplace_orders for label/tracking tests');
  }

  // 9. getShippingCostReport
  console.log('\n--- 9. getShippingCostReport ---\n');
  var report = await shippingService.getShippingCostReport({});
  assert(report.summary !== undefined, 'Summary present');
  assert(typeof report.summary.totalShipments === 'number', 'totalShipments is number', report.summary.totalShipments);
  assert(typeof report.summary.totalRevenue === 'number', 'totalRevenue is number', '$' + report.summary.totalRevenue);
  assert(typeof report.summary.totalCost === 'number', 'totalCost is number', '$' + report.summary.totalCost);
  assert(typeof report.summary.marginPercent === 'number', 'marginPercent is number', report.summary.marginPercent + '%');
  assert(report.breakdown !== undefined, 'Breakdown present');
  assert(Array.isArray(report.breakdown), 'Breakdown is array');
  console.log('  Report: shipments=' + report.summary.totalShipments + ' revenue=$' + report.summary.totalRevenue + ' cost=$' + report.summary.totalCost);

  // 10. getShippingCostReport with groupBy=month
  console.log('\n--- 10. getShippingCostReport (by month) ---\n');
  var monthReport = await shippingService.getShippingCostReport({ groupBy: 'month' });
  assert(monthReport.summary !== undefined, 'Monthly summary present');
  assert(Array.isArray(monthReport.breakdown), 'Monthly breakdown is array');
  if (monthReport.breakdown.length > 0) {
    assert(monthReport.breakdown[0].month !== undefined, 'Has month key');
    console.log('  Months: ' + monthReport.breakdown.map(function(b) { return b.month; }).join(', '));
  }

  // 11. getShippingCostReport with groupBy=channel
  console.log('\n--- 11. getShippingCostReport (by channel) ---\n');
  var channelReport = await shippingService.getShippingCostReport({ groupBy: 'channel' });
  assert(Array.isArray(channelReport.breakdown), 'Channel breakdown is array');

  console.log('\n=== RESULTS: ' + passed + ' passed, ' + failed + ' failed ===\n');
  process.exit(failed > 0 ? 1 : 0);
})().catch(function(err) {
  console.error('FATAL:', err.message, err.stack);
  process.exit(1);
});
