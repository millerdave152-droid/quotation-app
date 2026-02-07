/**
 * Fix warranty eligibility - replace placeholder category IDs with real ones
 */
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false },
  statement_timeout: 60000
});

async function run() {
  try {
    // Delete any remaining incorrect eligibility records
    const del = await pool.query(
      `DELETE FROM warranty_eligibility
       WHERE warranty_product_id IN (SELECT id FROM warranty_products WHERE provider_code IS NOT NULL)
       RETURNING id`
    );
    console.log('Deleted', del.rows.length, 'eligibility records');

    // Guardian Angel TV -> category 27 (Televisions)
    const tvRes = await pool.query(
      `INSERT INTO warranty_eligibility (warranty_product_id, category_id, is_active)
       SELECT id, 27, true FROM warranty_products
       WHERE provider_code = 'guardian_angel_tv' AND is_active = true
       RETURNING id`
    );
    console.log('Guardian Angel TV:', tvRes.rows.length, 'records -> category 27');

    // Guardian Angel Electronics -> categories 28 (Audio), 3 (Small Appliances), 5 (Accessories)
    const elecCats = [28, 3, 5];
    let elecTotal = 0;
    for (const catId of elecCats) {
      const r = await pool.query(
        `INSERT INTO warranty_eligibility (warranty_product_id, category_id, is_active)
         SELECT id, $1, true FROM warranty_products
         WHERE provider_code = 'guardian_angel_electronics' AND is_active = true
         RETURNING id`,
        [catId]
      );
      elecTotal += r.rows.length;
    }
    console.log('Guardian Angel Electronics:', elecTotal, 'records -> categories 28, 3, 5');

    // Excelsior Appliance -> Major Appliances (1) + children (6-15)
    const appCats = [1, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
    let appTotal = 0;
    for (const catId of appCats) {
      const r = await pool.query(
        `INSERT INTO warranty_eligibility (warranty_product_id, category_id, is_active)
         SELECT id, $1, true FROM warranty_products
         WHERE provider_code = 'excelsior_appliance' AND is_active = true
         RETURNING id`,
        [catId]
      );
      appTotal += r.rows.length;
    }
    console.log('Excelsior Appliance:', appTotal, 'records -> categories 1, 6-15');

    const total = await pool.query('SELECT COUNT(*) as cnt FROM warranty_eligibility WHERE is_active = true');
    console.log('\nTotal eligibility records:', total.rows[0].cnt);

    // ---- TEST THE SERVICE ----
    const WarrantyService = require('../services/WarrantyService');
    const service = new WarrantyService(pool);

    // Test 1: Find an appliance product
    const appProduct = await pool.query(
      `SELECT id, CONCAT(manufacturer, ' ', model) as name, price, category_id
       FROM products
       WHERE category_id IN (6,7,8,9,10,32,33,34,35,36,37,38,39,40,41,42,43,44,45)
         AND price > 500 AND is_active = true AND sku NOT LIKE 'WRN-%'
       LIMIT 1`
    );
    if (appProduct.rows.length > 0) {
      const p = appProduct.rows[0];
      console.log('\nTest: Appliance -', p.name, '($' + p.price + ', cat=' + p.category_id + ')');
      const result = await service.getEligibleWarranties(p.id, parseFloat(p.price), 'at_sale');
      console.log('  Eligible:', result.eligible, ', Warranties:', result.warranties?.length);
      result.warranties?.forEach(w =>
        console.log('    ' + w.name + ' (' + w.providerCode + '): $' + w.price + ' / ' + w.durationMonths + 'mo')
      );
    } else {
      console.log('\nNo appliance products found');
    }

    // Test 2: Find a TV product
    const tvProduct = await pool.query(
      `SELECT id, CONCAT(manufacturer, ' ', model) as name, price, category_id
       FROM products
       WHERE category_id IN (27,66,67,68,69,70)
         AND price > 200 AND is_active = true AND sku NOT LIKE 'WRN-%'
       LIMIT 1`
    );
    if (tvProduct.rows.length > 0) {
      const p = tvProduct.rows[0];
      console.log('\nTest: TV -', p.name, '($' + p.price + ', cat=' + p.category_id + ')');
      const result = await service.getEligibleWarranties(p.id, parseFloat(p.price), 'at_sale');
      console.log('  Eligible:', result.eligible, ', Warranties:', result.warranties?.length);
      result.warranties?.forEach(w =>
        console.log('    ' + w.name + ' (' + w.providerCode + '): $' + w.price + ' / ' + w.durationMonths + 'mo')
      );
    } else {
      console.log('\nNo TV products found');
    }

    // Test 3: Find a small appliance/electronics product
    const elecProduct = await pool.query(
      `SELECT id, CONCAT(manufacturer, ' ', model) as name, price, category_id
       FROM products
       WHERE category_id IN (20,21,22,23,24,25,26,28,29,30,31,74)
         AND price > 50 AND is_active = true AND sku NOT LIKE 'WRN-%'
       LIMIT 1`
    );
    if (elecProduct.rows.length > 0) {
      const p = elecProduct.rows[0];
      console.log('\nTest: Electronics -', p.name, '($' + p.price + ', cat=' + p.category_id + ')');
      const result = await service.getEligibleWarranties(p.id, parseFloat(p.price), 'at_sale');
      console.log('  Eligible:', result.eligible, ', Warranties:', result.warranties?.length);
      result.warranties?.forEach(w =>
        console.log('    ' + w.name + ' (' + w.providerCode + '): $' + w.price + ' / ' + w.durationMonths + 'mo')
      );
    } else {
      console.log('\nNo electronics products found');
    }

    // Test 4: Post-delivery should NOT appear at checkout
    if (appProduct.rows.length > 0) {
      const p = appProduct.rows[0];
      const atSale = await service.getEligibleWarranties(p.id, parseFloat(p.price), 'at_sale');
      const postDel = await service.getEligibleWarranties(p.id, parseFloat(p.price), 'post_delivery');
      console.log('\nTest: Post-delivery isolation');
      console.log('  at_sale warranties:', atSale.warranties?.length);
      console.log('  post_delivery warranties:', postDel.warranties?.length);
      const hasPostDeliveryInCheckout = atSale.warranties?.some(w => w.name.includes('Post-Delivery'));
      console.log('  Post-delivery in checkout?', hasPostDeliveryInCheckout ? 'FAIL!' : 'No (PASS)');
    }

  } catch (err) {
    console.error('Error:', err.message, err.stack);
  }
  await pool.end();
}

run();
