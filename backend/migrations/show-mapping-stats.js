/**
 * Show mapping statistics after auto-map
 */
const pool = require('../db');

async function showStats() {
  const client = await pool.connect();
  try {
    console.log('='.repeat(70));
    console.log('FINAL DATABASE STATS');
    console.log('='.repeat(70));

    // Total counts
    const total = await client.query('SELECT COUNT(*) as count FROM products');
    const mapped = await client.query('SELECT COUNT(*) as count FROM products WHERE bestbuy_category_code IS NOT NULL');
    const unmapped = await client.query('SELECT COUNT(*) as count FROM products WHERE bestbuy_category_code IS NULL');

    console.log('');
    console.log('Total Products:     ', total.rows[0].count);
    console.log('Mapped Products:    ', mapped.rows[0].count);
    console.log('Unmapped Products:  ', unmapped.rows[0].count);
    console.log('Mapping Rate:       ', ((mapped.rows[0].count / total.rows[0].count) * 100).toFixed(1) + '%');

    // Category breakdown
    console.log('');
    console.log('='.repeat(70));
    console.log('PRODUCTS BY CATEGORY');
    console.log('='.repeat(70));

    const byCategory = await client.query(`
      SELECT
        p.bestbuy_category_code as code,
        c.name as category_name,
        COUNT(*) as count
      FROM products p
      LEFT JOIN bestbuy_categories c ON p.bestbuy_category_code = c.code
      WHERE p.bestbuy_category_code IS NOT NULL
      GROUP BY p.bestbuy_category_code, c.name
      ORDER BY count DESC
    `);

    for (const row of byCategory.rows) {
      console.log(`  ${row.code}: ${row.category_name || 'Unknown'} (${row.count})`);
    }

    // Sample of 10 mapped products
    console.log('');
    console.log('='.repeat(70));
    console.log('SAMPLE OF 10 SUCCESSFULLY MAPPED PRODUCTS');
    console.log('='.repeat(70));

    const samples = await client.query(`
      SELECT
        p.id,
        p.model,
        p.manufacturer,
        p.bestbuy_category_code,
        c.name as category_name
      FROM products p
      LEFT JOIN bestbuy_categories c ON p.bestbuy_category_code = c.code
      WHERE p.bestbuy_category_code IS NOT NULL
      ORDER BY RANDOM()
      LIMIT 10
    `);

    for (const row of samples.rows) {
      console.log(`  [${row.id}] ${row.model} (${row.manufacturer}) -> ${row.bestbuy_category_code} (${row.category_name})`);
    }

  } finally {
    client.release();
    process.exit(0);
  }
}
showStats();
