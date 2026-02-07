/**
 * Test warranty eligibility with products that have null category_id or null price
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.DB_HOST, port: process.env.DB_PORT, user: process.env.DB_USER,
  password: process.env.DB_PASSWORD, database: process.env.DB_NAME, ssl: { rejectUnauthorized: false }
});
const WarrantyService = require('../services/WarrantyService');
const svc = new WarrantyService(pool);

let passed = 0, failed = 0;

async function test(name, fn) {
  console.log(`\n=== ${name} ===`);
  try {
    const ok = await fn();
    if (ok) { console.log('PASS'); passed++; }
    else { console.log('FAIL'); failed++; }
  } catch (err) {
    console.log('FAIL (error):', err.message);
    failed++;
  }
}

(async () => {
  // Test 1: Samsung Q60CF - null category_id, null price, POS sends $499.99
  await test('Samsung Q60CF (null cat, POS price $499.99)', async () => {
    const result = await svc.getEligibleWarranties(20772, 499.99, 'at_sale');
    console.log('  category_string should resolve to TV (27)');
    console.log('  eligible:', result.eligible, 'warranties:', result.warranties?.length);
    if (result.warranties) {
      result.warranties.forEach(w => console.log('   ', w.name, '$' + w.price, w.providerCode));
    }
    // Q-Series Q60CF contains no direct TV keyword but the _resolveCategoryId should still handle it
    // It has "Q-Series Q60CF" which doesn't match any keyword - let's see
    return result.warranties?.length > 0;
  });

  // Test 2: Product with category string "TVs" and null category_id
  await test('Category string fuzzy match: "TVs"', async () => {
    const catId = await svc._resolveCategoryId('TVs');
    console.log('  Resolved "TVs" to category_id:', catId);
    return catId === 27;
  });

  // Test 3: Category string "Refrigerators"
  await test('Category string fuzzy match: "Refrigerators"', async () => {
    const catId = await svc._resolveCategoryId('Refrigerators');
    console.log('  Resolved "Refrigerators" to category_id:', catId);
    return catId === 6;
  });

  // Test 4: Category string "Microwaves"
  await test('Category string fuzzy match: "Microwaves"', async () => {
    const catId = await svc._resolveCategoryId('Microwaves');
    console.log('  Resolved "Microwaves" to category_id:', catId);
    return catId === 13;
  });

  // Test 5: Category string "Q-Series Q60CF" matches q-series -> TV (27)
  await test('Category string fuzzy match: "Q-Series Q60CF"', async () => {
    const catId = await svc._resolveCategoryId('Q-Series Q60CF');
    console.log('  Resolved "Q-Series Q60CF" to category_id:', catId);
    return catId === 27;
  });

  // Test 6: Danby fridge with null price (use retail_price_cents fallback)
  await test('Price fallback: retail_price_cents when price is null', async () => {
    // Find a product with null price but has retail_price_cents
    const r = await pool.query(
      "SELECT id, name, price, retail_price_cents, category_id FROM products WHERE price IS NULL AND retail_price_cents IS NOT NULL AND retail_price_cents::int > 0 AND category_id IS NOT NULL LIMIT 1"
    );
    if (r.rows.length === 0) {
      console.log('  SKIP: No products with null price + retail_price_cents');
      return true;
    }
    const p = r.rows[0];
    console.log('  Product:', p.name, 'price=null, retail_price_cents=' + p.retail_price_cents, 'cat=' + p.category_id);
    // Call with null productPrice to force fallback
    const result = await svc.getEligibleWarranties(p.id, null, 'at_sale');
    console.log('  eligible:', result.eligible, 'productPrice resolved to:', result.productPrice);
    return result.productPrice > 0;
  });

  // Test 7: Existing test - Danby fridge still works
  await test('Danby fridge (cat=6, $999.99) still works', async () => {
    const result = await svc.getEligibleWarranties(12484, 999.99, 'at_sale');
    console.log('  eligible:', result.eligible, 'warranties:', result.warranties?.length);
    return result.eligible && result.warranties?.length === 2;
  });

  // Test 8: TV with proper category_id still works
  await test('Samsung TV (cat=27) still works', async () => {
    const tv = await pool.query("SELECT id, price FROM products WHERE category_id = 27 AND price IS NOT NULL AND price > 0 LIMIT 1");
    if (tv.rows.length === 0) { console.log('  SKIP'); return true; }
    const p = tv.rows[0];
    const result = await svc.getEligibleWarranties(p.id, parseFloat(p.price), 'at_sale');
    console.log('  eligible:', result.eligible, 'warranties:', result.warranties?.length);
    return result.eligible && result.warranties?.length === 3;
  });

  console.log('\n=============================');
  console.log('Results:', passed, 'passed,', failed, 'failed');
  console.log('=============================');

  await pool.end();
})();
