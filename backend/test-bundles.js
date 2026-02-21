require('dotenv').config();
var pool = require('./db');
var bundleManager = require('./services/BundleManager');

var passed = 0, failed = 0;
function assert(cond, label, detail) {
  console.log((cond ? '\u2705' : '\u274C') + ' ' + label + (detail ? ' \u2014 ' + detail : ''));
  if (cond) passed++; else failed++;
}

(async function() {
  console.log('=== BUNDLE MANAGER TEST ===\n');

  // Find 2 products with stock for testing
  var prods = (await pool.query(
    "SELECT id, name, sku, price, COALESCE(quantity_in_stock, 0) as stock FROM products WHERE price > 50 AND quantity_in_stock > 0 LIMIT 2"
  )).rows;
  if (prods.length < 2) {
    console.log('Need 2 products with stock, found:', prods.length);
    process.exit(1);
  }
  console.log('Test products:');
  prods.forEach(function(p) { console.log('  #' + p.id + ' ' + p.name + ' $' + p.price + ' stock=' + p.stock); });

  var p1 = prods[0], p2 = prods[1];
  var componentsTotal = parseFloat(p1.price) + parseFloat(p2.price);
  var bundlePrice = Math.round(componentsTotal * 0.85 * 100) / 100; // 15% discount

  // 1. Create bundle
  console.log('\n--- CREATE BUNDLE ---\n');
  var created = await bundleManager.createBundle({
    bundleSku: 'TEST-BUNDLE-' + Date.now(),
    bundleName: 'Test Bundle',
    bundleDescription: 'Integration test bundle',
    bundlePrice: bundlePrice,
    components: [
      { productId: p1.id, quantity: 1 },
      { productId: p2.id, quantity: 1 }
    ]
  });
  assert(created.id > 0, 'Bundle created', 'id=' + created.id);
  assert(created.bundle_price === bundlePrice, 'Bundle price correct', '$' + created.bundle_price);
  assert(created.discount_amount > 0, 'Discount calculated', '$' + created.discount_amount);
  assert(created.components.length === 2, 'Components inserted', created.components.length);
  var bundleId = created.id;

  // 2. Get availability
  console.log('\n--- BUNDLE AVAILABILITY ---\n');
  var avail = await bundleManager.getBundleAvailability(bundleId);
  assert(avail.maxAvailable >= 0, 'Availability calculated', 'max=' + avail.maxAvailable);
  assert(avail.components.length === 2, 'All components listed');
  assert(avail.limitingComponent !== null, 'Limiting component identified', avail.limitingComponent);

  // 3. List bundles
  console.log('\n--- LIST BUNDLES ---\n');
  var all = await bundleManager.getBundles(false);
  assert(all.length > 0, 'getBundles returns results', 'count=' + all.length);
  var found = all.find(function(b) { return b.id === bundleId; });
  assert(found !== undefined, 'Created bundle in list');
  assert(found.components.length === 2, 'Components included in list');
  assert(typeof found.max_available === 'number', 'Availability in list', 'max=' + found.max_available);

  // 4. Update bundle
  console.log('\n--- UPDATE BUNDLE ---\n');
  var newPrice = Math.round(componentsTotal * 0.80 * 100) / 100;
  var updated = await bundleManager.updateBundle(bundleId, {
    bundleName: 'Updated Test Bundle',
    bundlePrice: newPrice
  });
  assert(updated.bundle_name === 'Updated Test Bundle', 'Name updated');
  assert(updated.bundle_price === newPrice, 'Price updated', '$' + updated.bundle_price);
  assert(updated.components.length === 2, 'Components preserved after update');

  // 5. Update with new components
  console.log('\n--- UPDATE COMPONENTS ---\n');
  var updatedComps = await bundleManager.updateBundle(bundleId, {
    components: [{ productId: p1.id, quantity: 2 }]
  });
  assert(updatedComps.components.length === 1, 'Components replaced', 'count=' + updatedComps.components.length);
  assert(updatedComps.components[0].quantity === 2, 'New quantity correct');

  // 6. Sync listings
  console.log('\n--- SYNC LISTINGS ---\n');
  var sync = await bundleManager.syncBundleListings();
  assert(sync.synced >= 1, 'Sync processed bundles', 'synced=' + sync.synced);
  var syncBundle = sync.bundles.find(function(b) { return b.bundleId === bundleId; });
  if (syncBundle) {
    assert(typeof syncBundle.available === 'number', 'Sync reports availability');
    assert(typeof syncBundle.active === 'boolean', 'Sync reports active status');
  }

  // 7. Soft delete
  console.log('\n--- SOFT DELETE ---\n');
  var deleted = await bundleManager.deleteBundle(bundleId);
  assert(deleted.is_active === false, 'Bundle deactivated');
  assert(deleted.id === bundleId, 'Correct bundle deactivated');

  // Verify it's deactivated
  var activeOnly = await bundleManager.getBundles(true);
  var stillThere = activeOnly.find(function(b) { return b.id === bundleId; });
  assert(!stillThere, 'Deactivated bundle excluded from active list');

  // Cleanup
  await pool.query('DELETE FROM bundle_components WHERE bundle_id = $1', [bundleId]);
  await pool.query('DELETE FROM product_bundles WHERE id = $1', [bundleId]);
  console.log('\nCleaned up test bundle #' + bundleId);

  console.log('\n=== RESULTS: ' + passed + ' passed, ' + failed + ' failed ===\n');
  process.exit(failed > 0 ? 1 : 0);
})().catch(function(err) {
  console.error('FATAL:', err.message, err.stack);
  process.exit(1);
});
