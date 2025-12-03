/**
 * Query unmapped products to find patterns
 */
const pool = require('../db');

async function analyzeUnmapped() {
  const client = await pool.connect();
  try {
    // Get model prefix patterns from unmapped products
    const result = await client.query(`
      SELECT
        SUBSTRING(model FROM 1 FOR 3) as prefix,
        manufacturer,
        COUNT(*) as cnt,
        ARRAY_AGG(model ORDER BY model LIMIT 5) as examples
      FROM products
      WHERE bestbuy_category_code IS NULL OR bestbuy_category_code = ''
      GROUP BY SUBSTRING(model FROM 1 FOR 3), manufacturer
      HAVING COUNT(*) >= 2
      ORDER BY COUNT(*) DESC
      LIMIT 30
    `);

    console.log('UNMAPPED PRODUCT PATTERNS (2+ occurrences):');
    console.log('='.repeat(70));
    for (const row of result.rows) {
      console.log(`\nPrefix: ${row.prefix} | Manufacturer: ${row.manufacturer} | Count: ${row.cnt}`);
      console.log(`  Examples: ${row.examples.join(', ')}`);
    }

    // Get total unmapped count
    const totalResult = await client.query(`
      SELECT COUNT(*) as total FROM products WHERE bestbuy_category_code IS NULL OR bestbuy_category_code = ''
    `);
    console.log(`\n\nTotal unmapped: ${totalResult.rows[0].total}`);

  } finally {
    client.release();
    process.exit(0);
  }
}

analyzeUnmapped();
