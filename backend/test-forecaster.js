require('dotenv').config();
const pool = require('./db');
const forecaster = require('./services/InventoryForecaster');

(async () => {
  try {
    console.log('=== Service loaded ===');
    var methods = Object.getOwnPropertyNames(Object.getPrototypeOf(forecaster)).filter(function(m) { return m !== 'constructor'; });
    console.log('Methods:', methods);

    // Find a product that has marketplace sales
    var matched = (await pool.query(
      "SELECT oi.product_id, p.name, p.sku FROM marketplace_order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.product_id IS NOT NULL LIMIT 1"
    )).rows;
    var pid = matched.length > 0 ? matched[0].product_id : 12145;
    console.log('Test product:', pid, matched[0] ? matched[0].name : '(fallback)');

    console.log('\n=== 1. getSalesVelocity ===');
    var v = await forecaster.getSalesVelocity(pid, null, 365);
    console.log(JSON.stringify(v));

    console.log('\n=== 2. getStockoutProjection ===');
    var proj = await forecaster.getStockoutProjection(pid);
    console.log(JSON.stringify(proj));

    console.log('\n=== 3. getStockoutAlerts ===');
    var alerts = await forecaster.getStockoutAlerts(14);
    console.log('Alerts:', alerts.length);
    if (alerts.length > 0) console.log('First:', JSON.stringify(alerts[0]));

    console.log('\n=== 4. getReorderSuggestions ===');
    var reorder = await forecaster.getReorderSuggestions(7, 30, 7);
    console.log('Suggestions:', reorder.length);
    if (reorder.length > 0) console.log('First:', JSON.stringify(reorder[0]));

    console.log('\n=== 5. getOverstockAlerts ===');
    var overstock = await forecaster.getOverstockAlerts(90);
    console.log('Overstock:', overstock.length);
    if (overstock.length > 0) console.log('First:', JSON.stringify(overstock[0]));

    console.log('\n=== 6. getVelocityAnomalies ===');
    var anomalies = await forecaster.getVelocityAnomalies(50);
    console.log('Anomalies:', anomalies.length);
    if (anomalies.length > 0) console.log('First:', JSON.stringify(anomalies[0]));

    console.log('\n=== 7. getProductForecast ===');
    var forecast = await forecaster.getProductForecast(pid);
    console.log(JSON.stringify(forecast, null, 2));

    console.log('\nAll 7 methods executed successfully');
  } catch (err) {
    console.error('ERROR:', err.message);
    console.error(err.stack);
  }
  process.exit(0);
})();
