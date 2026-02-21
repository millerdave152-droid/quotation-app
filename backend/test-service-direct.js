const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Use config/database.js like the actual app does
const pool = require('./config/database');
const ARAgingService = require('./services/ARAgingService');
const InsightsEngine = require('./services/InsightsEngine');

async function main() {
  // Initialize AR Aging with pool
  ARAgingService.init({ pool });
  InsightsEngine._setPool(pool);

  // Wait for DB connection
  await new Promise(r => setTimeout(r, 2000));

  // Test AR Aging
  try {
    const report = await ARAgingService.getAgingReport();
    console.log('PASS [AR-Aging] -', report.customers.length, 'customers');
  } catch (err) {
    console.log('FAIL [AR-Aging] -', err.message, 'Code:', err.code, 'Position:', err.position);
  }

  // Test Insights
  try {
    const insights = await InsightsEngine.generateInsights({ limit: 5 });
    console.log('PASS [Insights] -', insights.length, 'insights');
  } catch (err) {
    console.log('FAIL [Insights] -', err.message, 'Code:', err.code, 'Position:', err.position);
  }

  pool.end();
}

main();
