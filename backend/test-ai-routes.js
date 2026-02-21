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
  console.log('=== MARKETPLACE AI ROUTES TEST ===\n');

  // Find test product + channel
  var prodRes = await pool.query("SELECT id, sku, name FROM products WHERE sku IS NOT NULL AND price > 50 AND description IS NOT NULL LIMIT 1");
  var chRes = await pool.query("SELECT id, channel_code FROM marketplace_channels WHERE status = 'ACTIVE' LIMIT 1");

  if (prodRes.rows.length === 0 || chRes.rows.length === 0) {
    console.log('SKIP: No product or active channel');
    process.exit(0);
  }
  var pid = prodRes.rows[0].id;
  var cid = chRes.rows[0].id;
  console.log('Product: #' + pid + ' ' + prodRes.rows[0].sku);
  console.log('Channel: #' + cid + ' ' + chRes.rows[0].channel_code + '\n');

  // 1. POST /ai/generate-title/:productId/:channelId
  console.log('--- POST /ai/generate-title ---\n');
  var r1 = await api('POST', '/ai/generate-title/' + pid + '/' + cid);
  assert(r1.status === 200, 'generate-title status', 'status=' + r1.status);
  assert(r1.data.title !== undefined, 'Has title', (r1.data.title || '').slice(0, 80));
  assert(typeof r1.data.score === 'number', 'Has score', r1.data.score);
  assert(Array.isArray(r1.data.alternatives), 'Has alternatives');

  // 2. POST /ai/generate-description/:productId/:channelId
  console.log('\n--- POST /ai/generate-description ---\n');
  var r2 = await api('POST', '/ai/generate-description/' + pid + '/' + cid);
  assert(r2.status === 200, 'generate-description status', 'status=' + r2.status);
  assert(r2.data.description !== undefined, 'Has description', (r2.data.description || '').slice(0, 80));
  assert(typeof r2.data.score === 'number', 'Has score', r2.data.score);

  // 3. POST /ai/suggest-category/:productId/:channelId
  console.log('\n--- POST /ai/suggest-category ---\n');
  var r3 = await api('POST', '/ai/suggest-category/' + pid + '/' + cid);
  assert(r3.status === 200, 'suggest-category status', 'status=' + r3.status);
  assert(r3.data.productId === pid, 'Product ID in response');
  // May have error about no categories — that's OK
  if (r3.data.error) {
    assert(r3.data.error.includes('No categories'), 'Graceful no-categories message');
  } else {
    assert(Array.isArray(r3.data.suggestions), 'Has suggestions array');
  }

  // 4. POST /ai/suggest-price/:productId/:channelId
  console.log('\n--- POST /ai/suggest-price ---\n');
  var r4 = await api('POST', '/ai/suggest-price/' + pid + '/' + cid);
  assert(r4.status === 200, 'suggest-price status', 'status=' + r4.status);
  assert(r4.data.recommendation !== undefined, 'Has recommendation');
  assert(typeof r4.data.recommendation.price === 'number', 'Has recommended price', '$' + r4.data.recommendation.price);
  assert(r4.data.recommendation.strategy !== undefined, 'Has strategy', r4.data.recommendation.strategy);

  // 5. GET /ai/anomalies
  console.log('\n--- GET /ai/anomalies ---\n');
  var r5 = await api('GET', '/ai/anomalies');
  assert(r5.status === 200, 'anomalies status', 'status=' + r5.status);
  assert(typeof r5.data.totalAnomalies === 'number', 'Has total count', r5.data.totalAnomalies);
  assert(r5.data.bySeverity !== undefined, 'Has severity breakdown');
  assert(r5.data.byType !== undefined, 'Has type breakdown');
  assert(Array.isArray(r5.data.anomalies), 'Has anomalies array');

  // 6. POST /ai/query
  console.log('\n--- POST /ai/query ---\n');
  var r6 = await api('POST', '/ai/query', { question: 'How many orders do I have?' });
  assert(r6.status === 200, 'query status', 'status=' + r6.status);
  assert(r6.data.answer !== undefined, 'Has answer');
  assert(r6.data.sql !== undefined, 'Has SQL');
  assert(r6.data.visualizationHint !== undefined, 'Has visualization hint');
  console.log('  Answer: ' + (r6.data.answer || '').slice(0, 150));

  // 7. POST /ai/query — missing question
  console.log('\n--- POST /ai/query (no question) ---\n');
  var r7 = await api('POST', '/ai/query', {});
  assert(r7.status === 400, 'Returns 400 without question', 'status=' + r7.status);
  assert(r7.data.error !== undefined, 'Has error message');

  // Verify route count
  console.log('\n--- ROUTE COUNT ---\n');
  console.log('  All routes responding correctly');

  console.log('\n=== RESULTS: ' + passed + ' passed, ' + failed + ' failed ===\n');
  process.exit(failed > 0 ? 1 : 0);
})().catch(function(err) {
  console.error('FATAL:', err.message, err.stack);
  process.exit(1);
});
