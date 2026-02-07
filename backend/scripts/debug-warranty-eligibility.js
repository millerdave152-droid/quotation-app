/**
 * Debug: verify warranty eligibility records and test the full query
 */
const { Pool } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false }
});

(async () => {
  try {
    // 1. Check eligibility records
    const elig = await pool.query(
      'SELECT DISTINCT category_id, COUNT(*) as cnt FROM warranty_eligibility WHERE is_active = true GROUP BY category_id ORDER BY category_id'
    );
    console.log('=== Warranty Eligibility Categories ===');
    elig.rows.forEach(r => console.log(`  category_id=${r.category_id}: ${r.cnt} records`));
    console.log(`  Total: ${elig.rows.reduce((s, r) => s + parseInt(r.cnt), 0)} records`);

    // 2. Check TV products
    const tv = await pool.query(
      "SELECT id, name, category_id, price FROM products WHERE category_id = 27 AND is_active = true AND category != 'Warranty' LIMIT 2"
    );
    console.log('\n=== TV Products (cat 27) ===');
    tv.rows.forEach(r => console.log(`  id=${r.id}: ${r.name} $${r.price} cat=${r.category_id}`));

    // 3. Check appliance products
    const app = await pool.query(
      "SELECT id, name, category_id, price FROM products WHERE category_id IN (1,6,7,8,9,10,11,12,13,14,15) AND is_active = true AND category != 'Warranty' LIMIT 3"
    );
    console.log('\n=== Appliance Products ===');
    app.rows.forEach(r => console.log(`  id=${r.id}: ${r.name} $${r.price} cat=${r.category_id}`));

    // 4. Test the exact eligibility query for a TV
    if (tv.rows.length > 0) {
      const p = tv.rows[0];
      console.log(`\n=== Eligibility Query Test: TV id=${p.id} cat=${p.category_id} $${p.price} ===`);

      // Check parent category
      const parent = await pool.query('SELECT parent_id FROM categories WHERE id = $1', [p.category_id]);
      console.log(`  Parent of cat ${p.category_id}: ${parent.rows[0]?.parent_id || 'NULL'}`);

      const result = await pool.query(`
        SELECT wp.warranty_name, wp.sale_context, wp.provider_code, we.category_id as elig_cat_id,
               wp.min_product_price, wp.max_product_price, wp.is_active as wp_active, we.is_active as we_active
        FROM warranty_products wp
        JOIN warranty_eligibility we ON we.warranty_product_id = wp.id
        WHERE wp.provider_code = 'guardian_angel_tv'
        LIMIT 5
      `, []);
      console.log('\n  guardian_angel_tv records (first 5):');
      result.rows.forEach(r => console.log(`    ${r.warranty_name} | elig_cat=${r.elig_cat_id} | range=$${r.min_product_price}-$${r.max_product_price} | wp_active=${r.wp_active} we_active=${r.we_active} | sale_context=${r.sale_context}`));

      // Now try the full query
      const fullResult = await pool.query(`
        SELECT DISTINCT wp.warranty_name, wp.provider_code, we.category_id as elig_cat
        FROM warranty_products wp
        JOIN products prod ON prod.id = wp.product_id
        JOIN warranty_eligibility we ON we.warranty_product_id = wp.id AND we.is_active = true
        WHERE wp.is_active = true
          AND wp.sale_context = 'at_sale'
          AND (
            we.product_id = $1
            OR we.category_id = $2
            OR we.category_id = (SELECT parent_id FROM categories WHERE id = $2)
          )
          AND $3 >= COALESCE(we.custom_min_price, wp.min_product_price)
          AND $3 <= COALESCE(we.custom_max_price, wp.max_product_price)
        ORDER BY wp.warranty_name
      `, [p.id, p.category_id, parseFloat(p.price)]);
      console.log(`\n  Full eligibility query result: ${fullResult.rows.length} warranties`);
      fullResult.rows.forEach(r => console.log(`    ${r.warranty_name} (${r.provider_code}) elig_cat=${r.elig_cat}`));
    }

    // 5. Check if POS is even hitting the right endpoint
    console.log('\n=== POS API Check ===');
    console.log('POS hook calls: POST /warranty/eligible with { products: [{ productId, price }] }');
    console.log('Backend route: POST /api/warranty/eligible');

    // 6. Check if warranty routes are mounted
    console.log('\n=== Warranty Route Registration ===');
    console.log('Check server.js for warranty route mounting');

  } catch (err) {
    console.error('ERROR:', err.message);
  } finally {
    await pool.end();
  }
})();
