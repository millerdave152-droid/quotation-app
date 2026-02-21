const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const pool = require('./config/database');
const InsightsEngine = require('./services/InsightsEngine');

async function main() {
  InsightsEngine._setPool(pool);
  await new Promise(r => setTimeout(r, 2000));

  const methods = [
    'getStaleQuoteInsights',
    'getExpiringQuoteInsights',
    'getChurnRiskInsights',
    'getInventoryInsights',
    'getOverdueInvoiceInsights',
    'getCustomerMilestoneInsights',
    'getSalesOpportunityInsights',
    'getQuickActionCounts',
  ];

  for (const method of methods) {
    try {
      const result = await InsightsEngine[method]();
      const count = Array.isArray(result) ? result.length : Object.keys(result).length;
      console.log(`PASS [${method}] - ${count} results`);
    } catch (err) {
      console.log(`FAIL [${method}] - ${err.message} (code: ${err.code}, pos: ${err.position})`);
    }
  }

  pool.end();
}

main();
