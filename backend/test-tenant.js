require('dotenv').config();
var pool = require('./db');
var tenantManager = require('./services/TenantManager');

var passed = 0, failed = 0;
function assert(cond, label, detail) {
  console.log((cond ? '\u2705' : '\u274C') + ' ' + label + (detail ? ' \u2014 ' + detail : ''));
  if (cond) passed++; else failed++;
}

(async function() {
  console.log('=== TENANT MANAGER TEST ===\n');

  // 1. List tenants (should have TELETIME from seed)
  console.log('--- LIST TENANTS ---\n');
  var tenants = await tenantManager.getTenants(false);
  assert(tenants.length >= 1, 'At least 1 tenant exists', 'count=' + tenants.length);
  var tt = tenants.find(function(t) { return t.tenant_code === 'TELETIME'; });
  assert(tt !== undefined, 'TELETIME tenant seeded');
  assert(tt.plan === 'ENTERPRISE', 'TELETIME is ENTERPRISE plan');

  // 2. Create tenant
  console.log('\n--- CREATE TENANT ---\n');
  var newTenant = await tenantManager.createTenant({
    tenantCode: 'TEST_TENANT_' + Date.now(),
    companyName: 'Test Corp',
    contactEmail: 'test@corp.com',
    plan: 'STANDARD',
    config: { maxChannels: 3 }
  });
  assert(newTenant.id > 0, 'Tenant created', 'id=' + newTenant.id);
  assert(newTenant.company_name === 'Test Corp', 'Company name set');
  assert(newTenant.plan === 'STANDARD', 'Plan set');
  assert(newTenant.config.maxChannels === 3, 'Config stored');
  var testId = newTenant.id;

  // 3. Get single tenant
  console.log('\n--- GET TENANT ---\n');
  var fetched = await tenantManager.getTenant(testId);
  assert(fetched.id === testId, 'getTenant returns correct record');

  // 4. Update tenant
  console.log('\n--- UPDATE TENANT ---\n');
  var updated = await tenantManager.updateTenant(testId, {
    companyName: 'Updated Corp',
    plan: 'PREMIUM',
    config: { maxChannels: 10 }
  });
  assert(updated.company_name === 'Updated Corp', 'Name updated');
  assert(updated.plan === 'PREMIUM', 'Plan updated');
  assert(updated.config.maxChannels === 10, 'Config updated');

  // 5. Tenant channels (TeleTime)
  console.log('\n--- TENANT CHANNELS ---\n');
  var channels = await tenantManager.getTenantChannels(tt.id);
  assert(channels.length >= 1, 'TeleTime has channels', 'count=' + channels.length);
  if (channels.length > 0) {
    assert(channels[0].tenant_id === tt.id, 'Channel belongs to tenant');
    assert(typeof channels[0].order_count === 'number', 'Order count included');
    assert(typeof channels[0].active_listings === 'number', 'Active listings included');
    console.log('  Channel:', channels[0].channel_code, 'orders=' + channels[0].order_count, 'listings=' + channels[0].active_listings);
  }

  // 6. Tenant stats (TeleTime)
  console.log('\n--- TENANT STATS ---\n');
  var stats = await tenantManager.getTenantStats(tt.id);
  assert(typeof stats.orders.total === 'number', 'Orders total', stats.orders.total);
  assert(stats.orders.revenue !== undefined, 'Revenue tracked', '$' + stats.orders.revenue);
  assert(typeof stats.listings.total === 'number', 'Listings tracked');
  assert(typeof stats.channels.total === 'number', 'Channels tracked', stats.channels.total);
  assert(typeof stats.returns.total === 'number', 'Returns tracked');
  assert(typeof stats.recent_30d.orders === 'number', 'Recent 30d orders');
  console.log('  Stats:', JSON.stringify(stats, null, 2));

  // 7. Tenant middleware
  console.log('\n--- TENANT MIDDLEWARE ---\n');
  var middleware = tenantManager.tenantMiddleware();
  assert(typeof middleware === 'function', 'Middleware is a function');

  // Simulate middleware with mock req/res
  var mockReq = { user: { userId: 1 }, headers: {} };
  var middlewareResolved = false;
  await new Promise(function(resolve) {
    middleware(mockReq, {}, function() { middlewareResolved = true; resolve(); });
  });
  assert(middlewareResolved, 'Middleware calls next()');
  assert(mockReq.tenantId > 0, 'Middleware sets req.tenantId', 'tenantId=' + mockReq.tenantId);

  // Test X-Tenant-Id header
  var mockReq2 = { user: { userId: 1 }, headers: { 'x-tenant-id': String(tt.id) } };
  await new Promise(function(resolve) {
    middleware(mockReq2, {}, function() { resolve(); });
  });
  assert(mockReq2.tenantId === tt.id, 'X-Tenant-Id header respected', 'tenantId=' + mockReq2.tenantId);

  // Test invalid tenant header
  var mockReq3 = { user: { userId: 1 }, headers: { 'x-tenant-id': '99999' } };
  var rejected = false;
  var mockRes = { status: function() { return { json: function() { rejected = true; } }; } };
  await new Promise(function(resolve) {
    middleware(mockReq3, mockRes, function() { resolve(); });
    setTimeout(resolve, 100);
  });
  assert(rejected, 'Invalid tenant header rejected');

  // Cleanup
  console.log('\n--- CLEANUP ---\n');
  await pool.query('DELETE FROM marketplace_tenants WHERE id = $1', [testId]);
  console.log('Cleaned up test tenant #' + testId);

  console.log('\n=== RESULTS: ' + passed + ' passed, ' + failed + ' failed ===\n');
  process.exit(failed > 0 ? 1 : 0);
})().catch(function(err) {
  console.error('FATAL:', err.message, err.stack);
  process.exit(1);
});
