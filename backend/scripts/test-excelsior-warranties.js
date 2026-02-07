/**
 * Test Excelsior/Guardian Angel warranty integration
 */
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false }
});

const WarrantyService = require('../services/WarrantyService');
const service = new WarrantyService(pool);

async function run() {
  let passed = 0;
  let failed = 0;

  // Test 1: Appliance product (Refrigerator category 6, ~$1000)
  console.log('=== Test 1: Appliance (Refrigerator) ===');
  const appProduct = await pool.query(
    `SELECT id, CONCAT(manufacturer, ' ', model) as name, price, category_id
     FROM products
     WHERE category_id = 6 AND price BETWEEN 800 AND 1200
       AND is_active = true AND category != 'Warranty'
     LIMIT 1`
  );
  if (appProduct.rows.length > 0) {
    const p = appProduct.rows[0];
    console.log('Product:', p.name, '$' + p.price, '(cat=' + p.category_id + ')');
    const result = await service.getEligibleWarranties(p.id, parseFloat(p.price), 'at_sale');
    console.log('Eligible:', result.eligible, '| Warranties:', result.warranties?.length);
    if (result.warranties) {
      result.warranties.forEach(w =>
        console.log('  -', w.name, '(' + w.providerCode + '):', '$' + w.price, '/', w.durationMonths + 'mo')
      );
    }
    if (result.eligible && result.warranties?.length === 2) {
      console.log('PASS: 2 Excelsior warranties shown');
      passed++;
    } else {
      console.log('FAIL: Expected 2 warranties, got', result.warranties?.length);
      failed++;
    }
  } else {
    console.log('SKIP: No refrigerator products in $800-1200 range');
  }

  // Test 2: TV product (category 27, ~$500)
  console.log('\n=== Test 2: TV ===');
  const tvProduct = await pool.query(
    `SELECT id, CONCAT(manufacturer, ' ', model) as name, price, category_id
     FROM products
     WHERE category_id = 27 AND price BETWEEN 400 AND 700
       AND is_active = true AND category != 'Warranty'
     LIMIT 1`
  );
  if (tvProduct.rows.length > 0) {
    const p = tvProduct.rows[0];
    console.log('Product:', p.name, '$' + p.price, '(cat=' + p.category_id + ')');
    const result = await service.getEligibleWarranties(p.id, parseFloat(p.price), 'at_sale');
    console.log('Eligible:', result.eligible, '| Warranties:', result.warranties?.length);
    if (result.warranties) {
      result.warranties.forEach(w =>
        console.log('  -', w.name, '(' + w.providerCode + '):', '$' + w.price, '/', w.durationMonths + 'mo')
      );
    }
    if (result.eligible && result.warranties?.length === 3) {
      console.log('PASS: 3 Guardian Angel TV warranties shown');
      passed++;
    } else {
      console.log('FAIL: Expected 3 warranties, got', result.warranties?.length);
      failed++;
    }
  } else {
    console.log('SKIP: No TV products in $400-700 range');
  }

  // Test 3: Post-delivery isolation
  console.log('\n=== Test 3: Post-delivery isolation ===');
  const anyApp = await pool.query(
    `SELECT id, price, category_id FROM products
     WHERE category_id IN (6,7,8,9,10) AND price > 500
       AND is_active = true AND category != 'Warranty'
     LIMIT 1`
  );
  if (anyApp.rows.length > 0) {
    const p = anyApp.rows[0];
    const atSale = await service.getEligibleWarranties(p.id, parseFloat(p.price), 'at_sale');
    const postDel = await service.getEligibleWarranties(p.id, parseFloat(p.price), 'post_delivery');
    console.log('at_sale warranties:', atSale.warranties?.length);
    console.log('post_delivery warranties:', postDel.warranties?.length);

    const hasPostInCheckout = atSale.warranties?.some(w => w.name.includes('Post-Delivery'));
    if (!hasPostInCheckout && atSale.warranties?.length > 0) {
      console.log('PASS: Post-delivery NOT in checkout');
      passed++;
    } else {
      console.log('FAIL');
      failed++;
    }
  } else {
    console.log('SKIP: No appliance products');
  }

  // Test 4: Old samples should NOT appear
  console.log('\n=== Test 4: Old samples deactivated ===');
  const oldSamples = await pool.query(
    `SELECT wp.is_active, p.sku FROM warranty_products wp
     JOIN products p ON p.id = wp.product_id
     WHERE p.sku LIKE 'WRN-%YR-%'`
  );
  const allInactive = oldSamples.rows.every(r => !r.is_active);
  console.log('Old samples:', oldSamples.rows.length, '| All inactive:', allInactive);
  if (allInactive && oldSamples.rows.length === 5) {
    console.log('PASS');
    passed++;
  } else {
    console.log('FAIL');
    failed++;
  }

  // Test 5: providerCode and coverageDetails in response
  console.log('\n=== Test 5: Provider fields in response ===');
  if (appProduct.rows.length > 0) {
    const p = appProduct.rows[0];
    const result = await service.getEligibleWarranties(p.id, parseFloat(p.price), 'at_sale');
    const w = result.warranties?.[0];
    if (w && w.providerCode && w.coverageDetails) {
      console.log('providerCode:', w.providerCode);
      console.log('coverageDetails keys:', Object.keys(w.coverageDetails).join(', '));
      console.log('PASS');
      passed++;
    } else {
      console.log('FAIL: Missing providerCode or coverageDetails');
      failed++;
    }
  }

  console.log('\n=============================');
  console.log('Results:', passed, 'passed,', failed, 'failed');
  console.log('=============================');

  await pool.end();
}

run().catch(err => {
  console.error('Fatal:', err);
  pool.end();
});
