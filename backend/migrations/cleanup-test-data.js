/**
 * Migration: Cleanup Test Data
 * Removes test/sample products from the database
 */
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  console.log('=== CLEANUP TEST DATA ===\n');

  try {
    // Find test data
    const testProducts = await pool.query(`
      SELECT id, model, manufacturer, category, msrp_cents/100 as price
      FROM products
      WHERE model LIKE '%123%'
        AND model NOT LIKE '%FHWC123%'  -- Real Frigidaire model
        AND model NOT LIKE '%FHTC123%'  -- Real Frigidaire model
        AND manufacturer NOT LIKE '%NAPOLEON%'
      LIMIT 20
    `);

    console.log('Test products found:');
    testProducts.rows.forEach(r => {
      console.log(`  ID ${r.id}: ${r.manufacturer} "${r.model}" (${r.category}) - $${r.price}`);
    });

    if (testProducts.rows.length > 0) {
      const ids = testProducts.rows.map(r => r.id);
      console.log(`\nMarking ${ids.length} test products as inactive...`);

      // Mark as inactive instead of deleting (to preserve foreign key references)
      const result = await pool.query(
        `UPDATE products SET active = false WHERE id = ANY($1) RETURNING id, model`,
        [ids]
      );

      console.log(`Deactivated ${result.rowCount} products`);
      result.rows.forEach(r => console.log(`  - ${r.model}`));
    } else {
      console.log('\nNo test products to clean up');
    }

    // Also check for products with "Test" in category
    const testCategory = await pool.query(`
      SELECT id, model, manufacturer, category
      FROM products
      WHERE LOWER(category) LIKE '%test%'
      LIMIT 10
    `);

    if (testCategory.rows.length > 0) {
      console.log('\nProducts in test categories:');
      testCategory.rows.forEach(r => {
        console.log(`  ID ${r.id}: ${r.manufacturer} "${r.model}" (${r.category})`);
      });
    }

    console.log('\n=== CLEANUP COMPLETE ===\n');

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

run();
