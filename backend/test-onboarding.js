require('dotenv').config();
var pool = require('./db');
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
  console.log('=== ONBOARDING WIZARD TEST ===\n');

  // 1. POST /onboarding/start
  console.log('--- START ONBOARDING ---\n');
  var start = await api('POST', '/onboarding/start', {
    channelType: 'MIRAKL',
    channelName: 'Test Marketplace'
  });
  assert(start.status === 201, 'POST /onboarding/start', 'status=' + start.status);
  assert(start.data.onboardingId > 0, 'Returns onboardingId', start.data.onboardingId);
  assert(start.data.channelId > 0, 'Returns channelId', start.data.channelId);
  assert(start.data.currentStep === 1, 'Starts at step 1');
  assert(start.data.steps && start.data.steps.length === 7, '7 steps defined');
  assert(start.data.channel.status === 'INACTIVE', 'Channel starts INACTIVE');

  var obId = start.data.onboardingId;
  var chId = start.data.channelId;

  // 2. GET /onboarding/:id
  console.log('\n--- GET STATE ---\n');
  var state = await api('GET', '/onboarding/' + obId);
  assert(state.status === 200, 'GET /onboarding/:id', 'status=' + state.status);
  assert(state.data.currentStep === 1, 'State shows step 1');
  assert(state.data.status === 'IN_PROGRESS', 'Status is IN_PROGRESS');
  assert(state.data.steps[0].current === true, 'Step 1 marked as current');
  assert(state.data.channel.channel_type === 'MIRAKL', 'Channel type persisted');

  // 3. Step 1: Channel Setup
  console.log('\n--- STEP 1: CHANNEL SETUP ---\n');
  var s1 = await api('PUT', '/onboarding/' + obId + '/step/1', {
    channelType: 'MIRAKL',
    channelCode: 'TEST_MKT',
    channelName: 'Test Marketplace Updated'
  });
  assert(s1.status === 200, 'Step 1 complete', 'status=' + s1.status);
  assert(s1.data.stepCompleted === 1, 'stepCompleted=1');
  assert(s1.data.nextStep === 2, 'nextStep=2');

  // Verify channel updated
  var ch = (await pool.query('SELECT channel_code, channel_name FROM marketplace_channels WHERE id = $1', [chId])).rows[0];
  assert(ch.channel_code === 'TEST_MKT', 'Channel code updated');
  assert(ch.channel_name === 'Test Marketplace Updated', 'Channel name updated');

  // 4. Step 2: Credentials (will fail connection since test API — that's OK)
  console.log('\n--- STEP 2: CREDENTIALS ---\n');
  var s2 = await api('PUT', '/onboarding/' + obId + '/step/2', {
    apiUrl: 'https://test-marketplace.example.com/api',
    apiKey: 'test-key-12345',
    shopId: '9999'
  });
  assert(s2.status === 200, 'Step 2 complete', 'status=' + s2.status);
  assert(s2.data.connectionTest !== undefined, 'Connection test returned');
  assert(s2.data.nextStep === 3, 'nextStep=3');
  console.log('  Connection test:', JSON.stringify(s2.data.connectionTest));

  // Verify credentials saved
  var creds = (await pool.query('SELECT api_url, credentials FROM marketplace_channels WHERE id = $1', [chId])).rows[0];
  assert(creds.api_url === 'https://test-marketplace.example.com/api', 'API URL saved');
  var credsParsed = typeof creds.credentials === 'string' ? JSON.parse(creds.credentials) : creds.credentials;
  assert(credsParsed.api_key === 'test-key-12345', 'API key saved');

  // 5. Step 3: Fetch categories (will fail with test creds, but should handle gracefully)
  console.log('\n--- STEP 3: CATEGORIES ---\n');
  var s3 = await api('PUT', '/onboarding/' + obId + '/step/3', {});
  assert(s3.status === 200, 'Step 3 handled', 'status=' + s3.status);
  assert(s3.data.nextStep === 4, 'nextStep=4');
  console.log('  Categories result:', s3.data.error ? 'Expected error: ' + s3.data.error.slice(0, 80) : 'imported=' + s3.data.categoriesImported);

  // 6. Step 4: Category mappings (can still proceed with empty mappings)
  console.log('\n--- STEP 4: MAPPINGS ---\n');
  var s4 = await api('PUT', '/onboarding/' + obId + '/step/4', {
    categoryMappings: [
      { productCategory: 'Electronics', channelCategory: 'TV_AUDIO', channelCategoryName: 'TV & Audio' }
    ]
  });
  assert(s4.status === 200, 'Step 4 complete', 'status=' + s4.status);
  assert(s4.data.mappingsApplied === 1, 'Mapping applied');
  assert(s4.data.nextStep === 5, 'nextStep=5');

  // 7. Step 5: Product selection
  console.log('\n--- STEP 5: PRODUCTS ---\n');
  var prods = (await pool.query("SELECT id FROM products WHERE price > 50 AND quantity_in_stock > 0 LIMIT 3")).rows;
  var pids = prods.map(function(p) { return p.id; });
  var s5 = await api('PUT', '/onboarding/' + obId + '/step/5', { productIds: pids });
  assert(s5.status === 200, 'Step 5 complete', 'status=' + s5.status);
  assert(s5.data.productsListed >= 1, 'Products listed', s5.data.productsListed);
  assert(s5.data.nextStep === 6, 'nextStep=6');

  // 8. Step 6: Pricing & inventory
  console.log('\n--- STEP 6: PRICING ---\n');
  var s6 = await api('PUT', '/onboarding/' + obId + '/step/6', {
    inventoryAllocation: 80,
    stockBuffer: 5
  });
  assert(s6.status === 200, 'Step 6 complete', 'status=' + s6.status);
  assert(s6.data.applied.inventoryAllocation === 80, 'Allocation set to 80%');
  assert(s6.data.applied.stockBuffer === 5, 'Buffer set to 5');
  assert(s6.data.nextStep === 7, 'nextStep=7');

  // Verify on listings
  var listings = (await pool.query(
    'SELECT allocation_percent, safety_buffer FROM product_channel_listings WHERE channel_id = $1 LIMIT 1', [chId]
  )).rows[0];
  if (listings) {
    assert(parseFloat(listings.allocation_percent) === 80, 'Allocation persisted on listings');
    assert(listings.safety_buffer === 5, 'Buffer persisted on listings');
  }

  // 9. Check state before final step
  console.log('\n--- CHECK STATE BEFORE STEP 7 ---\n');
  var preState = await api('GET', '/onboarding/' + obId);
  assert(preState.data.currentStep === 7, 'At step 7');
  assert(preState.data.stepData.step1 !== undefined, 'Step 1 data persisted');
  assert(preState.data.stepData.step2 !== undefined, 'Step 2 data persisted');
  assert(preState.data.stepData.step5 !== undefined, 'Step 5 data persisted');

  // 10. Step 7 — skip activation for test (would try to push offers to fake API)
  // Instead test the DELETE/abandon flow
  console.log('\n--- ABANDON ONBOARDING ---\n');
  var del = await api('DELETE', '/onboarding/' + obId);
  assert(del.status === 200, 'DELETE /onboarding/:id', 'status=' + del.status);
  assert(del.data.status === 'ABANDONED', 'Status = ABANDONED');
  assert(del.data.channelId === chId, 'Correct channel');

  // Verify channel deactivated
  var finalCh = (await pool.query('SELECT status FROM marketplace_channels WHERE id = $1', [chId])).rows[0];
  assert(finalCh.status === 'INACTIVE', 'Channel deactivated');

  // Verify onboarding record
  var finalOb = (await pool.query('SELECT status FROM channel_onboarding WHERE id = $1', [obId])).rows[0];
  assert(finalOb.status === 'ABANDONED', 'Onboarding marked ABANDONED');

  // Cleanup
  console.log('\n--- CLEANUP ---\n');
  await pool.query('DELETE FROM product_channel_listings WHERE channel_id = $1', [chId]);
  await pool.query('DELETE FROM channel_onboarding WHERE id = $1', [obId]);
  await pool.query('DELETE FROM marketplace_channels WHERE id = $1', [chId]);
  console.log('Cleaned up test channel #' + chId + ' and onboarding #' + obId);

  console.log('\n=== RESULTS: ' + passed + ' passed, ' + failed + ' failed ===\n');
  process.exit(failed > 0 ? 1 : 0);
})().catch(function(err) {
  console.error('FATAL:', err.message, err.stack);
  process.exit(1);
});
