require('dotenv').config();
var pool = require('./db');
var marketplaceAI = require('./services/MarketplaceAI');

var passed = 0, failed = 0;
function assert(cond, label, detail) {
  console.log((cond ? '\u2705' : '\u274C') + ' ' + label + (detail ? ' \u2014 ' + detail : ''));
  if (cond) passed++; else failed++;
}

(async function() {
  console.log('=== MARKETPLACE AI TEST ===\n');

  // Find a product and channel to test with
  var prodRes = await pool.query("SELECT id, sku, name, manufacturer, price FROM products WHERE sku IS NOT NULL AND price > 50 AND description IS NOT NULL LIMIT 1");
  var chRes = await pool.query("SELECT id, channel_code, channel_name FROM marketplace_channels WHERE status = 'ACTIVE' LIMIT 1");

  if (prodRes.rows.length === 0 || chRes.rows.length === 0) {
    console.log('SKIP: No marketplace-enabled product or active channel found');
    process.exit(0);
  }

  var product = prodRes.rows[0];
  var channel = chRes.rows[0];
  console.log('Test product: #' + product.id + ' ' + product.sku + ' (' + product.name.slice(0, 50) + ')');
  console.log('Test channel: #' + channel.id + ' ' + channel.channel_code + '\n');

  var hasApiKey = !!process.env.ANTHROPIC_API_KEY;
  console.log('Anthropic API key: ' + (hasApiKey ? 'CONFIGURED' : 'MISSING - AI methods will be skipped') + '\n');

  // =========================================
  // 1. generateTitle
  // =========================================
  if (hasApiKey) {
    console.log('--- 1. generateTitle ---\n');
    try {
      var title = await marketplaceAI.generateTitle(product.id, channel.id);
      assert(!title.error, 'No error', title.error || '');
      assert(title.productId === product.id, 'Product ID correct');
      assert(title.channelId === channel.id, 'Channel ID correct');
      assert(title.channelCode === channel.channel_code, 'Channel code correct');
      assert(typeof title.title === 'string' && title.title.length > 5, 'Title generated', title.title);
      assert(typeof title.score === 'number' && title.score > 0, 'Quality score', title.score + '/100');
      assert(Array.isArray(title.alternatives), 'Alternatives array present', title.alternatives.length + ' alternatives');
      assert(title.tokensUsed !== undefined, 'Token usage tracked');
      console.log('  Title: "' + title.title + '"');
      console.log('  Score: ' + title.score + '/100 (' + title.scoreReason + ')');
      if (title.alternatives.length > 0) console.log('  Alt: "' + title.alternatives[0] + '"');
    } catch (err) {
      console.log('  ERROR: ' + err.message);
      assert(false, 'generateTitle should not throw', err.message);
    }

    // =========================================
    // 2. generateDescription
    // =========================================
    console.log('\n--- 2. generateDescription ---\n');
    try {
      var desc = await marketplaceAI.generateDescription(product.id, channel.id);
      assert(!desc.error, 'No error', desc.error || '');
      assert(desc.productId === product.id, 'Product ID correct');
      assert(typeof desc.description === 'string' && desc.description.length > 20, 'Description generated', desc.description.length + ' chars');
      assert(typeof desc.score === 'number', 'Quality score', desc.score + '/100');
      assert(desc.tokensUsed !== undefined, 'Token usage tracked');
      // Check for channel-specific fields
      if (channel.channel_code === 'BESTBUY_CA') {
        assert(desc.frenchDescription !== null && desc.frenchDescription !== undefined, 'French description for BB');
        console.log('  French: ' + (desc.frenchDescription || '').slice(0, 100) + '...');
      }
      console.log('  Desc: ' + desc.description.slice(0, 150) + '...');
      console.log('  Score: ' + desc.score);
    } catch (err) {
      console.log('  ERROR: ' + err.message);
      assert(false, 'generateDescription should not throw', err.message);
    }

    // =========================================
    // 3. suggestCategory
    // =========================================
    console.log('\n--- 3. suggestCategory ---\n');
    try {
      var cat = await marketplaceAI.suggestCategory(product.id, channel.id);
      assert(cat.productId === product.id, 'Product ID correct');
      assert(cat.channelId === channel.id, 'Channel ID correct');
      if (cat.error && cat.error.includes('No categories')) {
        console.log('  SKIP: No categories imported for channel (expected if not set up)');
        assert(true, 'Graceful handling of no categories');
      } else {
        assert(Array.isArray(cat.suggestions), 'Suggestions array present');
        if (cat.suggestions.length > 0) {
          assert(cat.suggestions[0].categoryCode !== undefined, 'Has category code');
          assert(typeof cat.suggestions[0].confidence === 'number', 'Has confidence score');
          assert(cat.suggestions[0].reason !== undefined, 'Has reasoning');
          console.log('  Top: ' + cat.suggestions[0].categoryCode + ' (' + cat.suggestions[0].confidence + ' confidence)');
          console.log('  Reason: ' + cat.suggestions[0].reason);
        }
      }
    } catch (err) {
      console.log('  ERROR: ' + err.message);
      assert(false, 'suggestCategory should not throw', err.message);
    }

    // =========================================
    // 4. suggestPrice
    // =========================================
    console.log('\n--- 4. suggestPrice ---\n');
    try {
      var price = await marketplaceAI.suggestPrice(product.id, channel.id);
      assert(!price.error, 'No error', price.error || '');
      assert(price.productId === product.id, 'Product ID correct');
      assert(price.currentPrice > 0, 'Current price', '$' + price.currentPrice);
      assert(price.salesData !== undefined, 'Sales data present');
      assert(typeof price.salesData.unitsSold30d === 'number', 'Units sold tracked');
      assert(price.recommendation !== undefined, 'Recommendation present');
      assert(typeof price.recommendation.price === 'number', 'Recommended price', '$' + price.recommendation.price);
      assert(price.recommendation.reasoning !== undefined, 'Has reasoning');
      assert(typeof price.recommendation.confidence === 'number', 'Has confidence');
      assert(price.recommendation.strategy !== undefined, 'Has strategy', price.recommendation.strategy);
      console.log('  Current: $' + price.currentPrice + ' | Recommended: $' + price.recommendation.price);
      console.log('  Strategy: ' + price.recommendation.strategy + ' (' + price.recommendation.confidence + ' confidence)');
      console.log('  Reasoning: ' + price.recommendation.reasoning);
    } catch (err) {
      console.log('  ERROR: ' + err.message);
      assert(false, 'suggestPrice should not throw', err.message);
    }

    // =========================================
    // 6. query (natural language) - test before anomalies since it calls API
    // =========================================
    console.log('\n--- 6. query (natural language) ---\n');
    try {
      var nlq = await marketplaceAI.query("What are my top 5 selling products this month?");
      assert(nlq.question !== undefined, 'Question echoed back');
      assert(typeof nlq.answer === 'string', 'Has natural language answer');
      assert(typeof nlq.sql === 'string', 'Has SQL query');
      assert(nlq.sql.toUpperCase().includes('SELECT'), 'SQL is a SELECT');
      assert(nlq.visualizationHint !== undefined, 'Has visualization hint', nlq.visualizationHint);
      assert(typeof nlq.confidence === 'number', 'Has confidence', nlq.confidence);
      if (nlq.data) {
        assert(Array.isArray(nlq.data), 'Query data is array');
        console.log('  Data rows: ' + nlq.data.length);
      }
      if (nlq.queryError) {
        console.log('  SQL error (non-fatal): ' + nlq.queryError);
      }
      console.log('  Answer: ' + nlq.answer.slice(0, 200));
      console.log('  SQL: ' + nlq.sql.slice(0, 200));
    } catch (err) {
      console.log('  ERROR: ' + err.message);
      assert(false, 'query should not throw', err.message);
    }
  } else {
    console.log('--- SKIPPING AI API TESTS (no ANTHROPIC_API_KEY) ---\n');
  }

  // =========================================
  // 5. detectAnomalies (no API key needed - pure SQL)
  // =========================================
  console.log('\n--- 5. detectAnomalies ---\n');
  try {
    var anomalies = await marketplaceAI.detectAnomalies();
    assert(anomalies.generatedAt !== undefined, 'Generated timestamp present');
    assert(typeof anomalies.totalAnomalies === 'number', 'Total count', anomalies.totalAnomalies);
    assert(anomalies.bySeverity !== undefined, 'Severity breakdown present');
    assert(typeof anomalies.bySeverity.high === 'number', 'High severity count', anomalies.bySeverity.high);
    assert(typeof anomalies.bySeverity.medium === 'number', 'Medium severity count', anomalies.bySeverity.medium);
    assert(anomalies.byType !== undefined, 'Type breakdown present');
    assert(typeof anomalies.byType.salesDrop === 'number', 'Sales drop count', anomalies.byType.salesDrop);
    assert(typeof anomalies.byType.returnSpike === 'number', 'Return spike count', anomalies.byType.returnSpike);
    assert(typeof anomalies.byType.priceOutlier === 'number', 'Price outlier count', anomalies.byType.priceOutlier);
    assert(typeof anomalies.byType.stockDiscrepancy === 'number', 'Stock issue count', anomalies.byType.stockDiscrepancy);
    assert(Array.isArray(anomalies.anomalies), 'Anomalies is array');
    console.log('  Total: ' + anomalies.totalAnomalies + ' (high=' + anomalies.bySeverity.high + ', medium=' + anomalies.bySeverity.medium + ')');
    console.log('  Types: sales_drop=' + anomalies.byType.salesDrop + ', return_spike=' + anomalies.byType.returnSpike +
      ', price_outlier=' + anomalies.byType.priceOutlier + ', stock_discrepancy=' + anomalies.byType.stockDiscrepancy);
    if (anomalies.anomalies.length > 0) {
      console.log('  First: ' + anomalies.anomalies[0].message);
    }
  } catch (err) {
    console.log('  ERROR: ' + err.message);
    assert(false, 'detectAnomalies should not throw', err.message);
  }

  console.log('\n=== RESULTS: ' + passed + ' passed, ' + failed + ' failed ===\n');
  process.exit(failed > 0 ? 1 : 0);
})().catch(function(err) {
  console.error('FATAL:', err.message, err.stack);
  process.exit(1);
});
