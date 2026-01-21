/**
 * Fix products with missing names
 * Sets name from description (first line) or model number
 */

const pool = require('../db');

async function fixMissingNames() {
  console.log('Fixing products with missing names...\n');

  try {
    // Count products with missing names
    const countResult = await pool.query(`
      SELECT COUNT(*) as total FROM products WHERE name IS NULL OR name = ''
    `);
    console.log('Products with missing names:', countResult.rows[0].total);

    if (parseInt(countResult.rows[0].total) === 0) {
      console.log('No products to fix!');
      return;
    }

    // Fix: Set name from description (first line) or model number
    const result = await pool.query(`
      UPDATE products
      SET name = COALESCE(
        NULLIF(TRIM(SPLIT_PART(description, E'\n', 1)), ''),
        NULLIF(TRIM(SPLIT_PART(description, E'\r', 1)), ''),
        model || ' - ' || COALESCE(manufacturer, 'Product')
      )
      WHERE name IS NULL OR name = ''
      RETURNING id, model, LEFT(name, 60) as name
    `);

    console.log('\nFixed', result.rowCount, 'products');
    console.log('\nSample fixes:');
    result.rows.slice(0, 10).forEach(row => {
      console.log(`  ${row.model}: ${row.name}`);
    });

    // Verify no more missing names
    const verify = await pool.query(`
      SELECT COUNT(*) as remaining FROM products WHERE name IS NULL OR name = ''
    `);
    console.log('\nRemaining products without names:', verify.rows[0].remaining);

  } catch (err) {
    console.error('Error:', err.message);
    throw err;
  } finally {
    await pool.end();
  }
}

fixMissingNames()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch(() => process.exit(1));
