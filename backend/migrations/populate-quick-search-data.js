/**
 * Migration: Populate Quick Search Data
 *
 * This migration populates the products table with realistic data for
 * quick search filters to work properly:
 * - Stock quantities (for stock level filters)
 * - Product statuses (for status filters)
 * - Normalized manufacturer names (for brand filters)
 * - Colors (for color filters)
 */

const pool = require('../db');

async function runMigration() {
  console.log('Starting Quick Search Data Population Migration...\n');

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Normalize manufacturer names (uppercase for consistent matching)
    console.log('1. Normalizing manufacturer names...');
    const normalizeResult = await client.query(`
      UPDATE products
      SET manufacturer = UPPER(TRIM(manufacturer))
      WHERE manufacturer IS NOT NULL
        AND manufacturer != UPPER(TRIM(manufacturer))
    `);
    console.log(`   Updated ${normalizeResult.rowCount} manufacturer names to uppercase\n`);

    // 2. Populate stock quantities for products with 0 or null stock
    console.log('2. Populating stock quantities...');

    // First, give all products a baseline stock based on brand
    const stockBaselineResult = await client.query(`
      UPDATE products SET
        stock_quantity = CASE
          WHEN UPPER(manufacturer) LIKE '%SAMSUNG%' OR UPPER(manufacturer) LIKE '%LG%'
            THEN floor(random() * 20) + 5
          WHEN UPPER(manufacturer) LIKE '%WHIRLPOOL%' OR UPPER(manufacturer) LIKE '%GE%'
            THEN floor(random() * 15) + 3
          ELSE floor(random() * 12) + 1
        END,
        reorder_point = COALESCE(reorder_point, 5)
      WHERE stock_quantity IS NULL OR stock_quantity = 0
    `);
    console.log(`   Set baseline stock for ${stockBaselineResult.rowCount} products`);

    // Set ~100 products to LOW STOCK (1-5)
    const lowStockResult = await client.query(`
      UPDATE products
      SET stock_quantity = floor(random() * 5) + 1
      WHERE id IN (
        SELECT id FROM products
        WHERE stock_quantity > 5
        ORDER BY random()
        LIMIT 100
      )
    `);
    console.log(`   Set ${lowStockResult.rowCount} products to LOW STOCK (1-5)`);

    // Set ~75 products to OVERSTOCK (>50)
    const overstockResult = await client.query(`
      UPDATE products
      SET stock_quantity = 50 + floor(random() * 30)
      WHERE id IN (
        SELECT id FROM products
        WHERE stock_quantity BETWEEN 6 AND 49
        ORDER BY random()
        LIMIT 75
      )
    `);
    console.log(`   Set ${overstockResult.rowCount} products to OVERSTOCK (50+)`);

    // Set ~50 products to OUT OF STOCK
    const outOfStockResult = await client.query(`
      UPDATE products
      SET stock_quantity = 0
      WHERE id IN (
        SELECT id FROM products
        WHERE stock_quantity > 0
        ORDER BY random()
        LIMIT 50
      )
    `);
    console.log(`   Set ${outOfStockResult.rowCount} products to OUT OF STOCK\n`);

    // 3. Populate product statuses
    console.log('3. Populating product statuses...');

    // Reset all to normal first (only if currently null or empty)
    const resetStatusResult = await client.query(`
      UPDATE products
      SET product_status = 'normal'
      WHERE product_status IS NULL OR product_status = ''
    `);
    console.log(`   Reset ${resetStatusResult.rowCount} products to normal status`);

    // Set ~100 products to CLEARANCE (with clearance price)
    const clearanceResult = await client.query(`
      UPDATE products
      SET
        product_status = 'clearance',
        clearance_price_cents = CASE
          WHEN msrp_cents IS NOT NULL THEN floor(msrp_cents * (0.6 + random() * 0.2))
          ELSE NULL
        END,
        clearance_reason = 'Making room for new models',
        clearance_start_date = CURRENT_DATE - floor(random() * 30)::int
      WHERE id IN (
        SELECT id FROM products
        WHERE product_status = 'normal'
        ORDER BY random()
        LIMIT 100
      )
    `);
    console.log(`   Set ${clearanceResult.rowCount} products to CLEARANCE`);

    // Set ~75 products to END OF LINE
    const eolResult = await client.query(`
      UPDATE products
      SET product_status = 'end_of_line'
      WHERE id IN (
        SELECT id FROM products
        WHERE product_status = 'normal'
        ORDER BY random()
        LIMIT 75
      )
    `);
    console.log(`   Set ${eolResult.rowCount} products to END OF LINE`);

    // Set ~50 products to DISCONTINUED (with 0 stock)
    const discontinuedResult = await client.query(`
      UPDATE products
      SET
        product_status = 'discontinued',
        stock_quantity = 0
      WHERE id IN (
        SELECT id FROM products
        WHERE product_status = 'normal'
        ORDER BY random()
        LIMIT 50
      )
    `);
    console.log(`   Set ${discontinuedResult.rowCount} products to DISCONTINUED\n`);

    // 4. Populate colors based on model suffix or product name
    console.log('4. Populating product colors...');
    const colorResult = await client.query(`
      UPDATE products
      SET color = CASE
        WHEN model LIKE '%SS' OR model LIKE '%/SS%' OR model LIKE '%-SS'
          OR LOWER(name) LIKE '%stainless steel%' OR LOWER(name) LIKE '%stainless%'
          THEN 'Stainless Steel'
        WHEN model LIKE '%WH' OR model LIKE '%WW' OR model LIKE '%-W' OR model LIKE '%-WH'
          OR LOWER(name) LIKE '%white%'
          THEN 'White'
        WHEN model LIKE '%BK' OR model LIKE '%BL' OR model LIKE '%-BK'
          OR LOWER(name) LIKE '%black stainless%'
          THEN 'Black Stainless'
        WHEN LOWER(name) LIKE '%black%' AND LOWER(name) NOT LIKE '%black stainless%'
          THEN 'Black'
        WHEN LOWER(name) LIKE '%slate%'
          THEN 'Slate'
        WHEN LOWER(name) LIKE '%bisque%'
          THEN 'Bisque'
        WHEN LOWER(name) LIKE '%graphite%'
          THEN 'Graphite'
        WHEN LOWER(name) LIKE '%panel ready%' OR LOWER(name) LIKE '%panelready%'
          THEN 'Panel Ready'
        WHEN LOWER(name) LIKE '%fingerprint resistant%' OR LOWER(name) LIKE '%fingerprint%'
          THEN 'Fingerprint Resistant Stainless'
        ELSE color
      END
      WHERE color IS NULL OR color = ''
    `);
    console.log(`   Populated colors for ${colorResult.rowCount} products\n`);

    // 5. Verify the results
    console.log('5. Verifying results...');

    const statusCounts = await client.query(`
      SELECT product_status, COUNT(*) as count
      FROM products
      GROUP BY product_status
      ORDER BY count DESC
    `);
    console.log('   Product Status Distribution:');
    statusCounts.rows.forEach(row => {
      console.log(`     - ${row.product_status || 'null'}: ${row.count}`);
    });

    const stockCounts = await client.query(`
      SELECT
        CASE
          WHEN stock_quantity IS NULL OR stock_quantity = 0 THEN 'Out of Stock'
          WHEN stock_quantity <= 5 THEN 'Low Stock (1-5)'
          WHEN stock_quantity > 50 THEN 'Overstock (50+)'
          ELSE 'In Stock (6-50)'
        END as stock_level,
        COUNT(*) as count
      FROM products
      GROUP BY 1
      ORDER BY count DESC
    `);
    console.log('\n   Stock Level Distribution:');
    stockCounts.rows.forEach(row => {
      console.log(`     - ${row.stock_level}: ${row.count}`);
    });

    const colorCounts = await client.query(`
      SELECT color, COUNT(*) as count
      FROM products
      WHERE color IS NOT NULL AND color != ''
      GROUP BY color
      ORDER BY count DESC
      LIMIT 10
    `);
    console.log('\n   Top Colors:');
    colorCounts.rows.forEach(row => {
      console.log(`     - ${row.color}: ${row.count}`);
    });

    const brandCounts = await client.query(`
      SELECT manufacturer, COUNT(*) as count
      FROM products
      WHERE manufacturer IS NOT NULL
      GROUP BY manufacturer
      ORDER BY count DESC
      LIMIT 10
    `);
    console.log('\n   Top Brands:');
    brandCounts.rows.forEach(row => {
      console.log(`     - ${row.manufacturer}: ${row.count}`);
    });

    await client.query('COMMIT');
    console.log('\n✅ Migration completed successfully!');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ Migration failed:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

// Run the migration
runMigration()
  .then(async () => {
    console.log('\nDone!');
    await pool.end();
    process.exit(0);
  })
  .catch(async err => {
    console.error('Migration error:', err);
    await pool.end();
    process.exit(1);
  });
