/**
 * CLEANUP INCOMPLETE PRODUCTS
 * ============================
 * This script removes products with:
 * - NULL or empty model names
 * - NULL or empty manufacturer names
 * - Both cost and MSRP = $0.00
 *
 * Run with: node scripts/cleanup-incomplete-products.js
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false }
});

async function analyzeIncompleteProducts() {
  console.log('\n' + '='.repeat(70));
  console.log('ANALYZING INCOMPLETE PRODUCTS');
  console.log('='.repeat(70));

  // Count products with various issues
  const queries = [
    {
      name: 'NULL model names',
      query: 'SELECT COUNT(*) as count FROM products WHERE model IS NULL OR model = \'\''
    },
    {
      name: 'NULL manufacturer names',
      query: 'SELECT COUNT(*) as count FROM products WHERE manufacturer IS NULL OR manufacturer = \'\''
    },
    {
      name: 'Zero MSRP',
      query: 'SELECT COUNT(*) as count FROM products WHERE msrp_cents = 0 OR msrp_cents IS NULL'
    },
    {
      name: 'Zero cost',
      query: 'SELECT COUNT(*) as count FROM products WHERE cost_cents = 0 OR cost_cents IS NULL'
    },
    {
      name: 'Complete products (model + manufacturer + MSRP > 0)',
      query: `SELECT COUNT(*) as count FROM products
              WHERE model IS NOT NULL AND model != ''
              AND manufacturer IS NOT NULL AND manufacturer != ''
              AND msrp_cents > 0`
    }
  ];

  console.log('\nCurrent Database State:');
  console.log('-'.repeat(70));

  for (const q of queries) {
    const result = await pool.query(q.query);
    console.log(`${q.name}: ${result.rows[0].count}`);
  }

  // Get sample of incomplete products
  const sampleQuery = `
    SELECT id, model, manufacturer, cost_cents, msrp_cents, created_at
    FROM products
    WHERE (model IS NULL OR model = '' OR manufacturer IS NULL OR manufacturer = '')
    LIMIT 10
  `;

  const samples = await pool.query(sampleQuery);

  if (samples.rows.length > 0) {
    console.log('\nSample Incomplete Products:');
    console.log('-'.repeat(70));
    samples.rows.forEach(p => {
      console.log(`ID ${p.id}: model="${p.model}", mfr="${p.manufacturer}", cost=$${(p.cost_cents/100).toFixed(2)}, msrp=$${(p.msrp_cents/100).toFixed(2)}`);
    });
  }

  console.log('='.repeat(70));
}

async function cleanupIncompleteProducts(dryRun = true) {
  console.log('\n' + '='.repeat(70));
  console.log(dryRun ? 'DRY RUN - NO CHANGES WILL BE MADE' : 'CLEANING UP INCOMPLETE PRODUCTS');
  console.log('='.repeat(70));

  // Define what constitutes "incomplete" - but exclude products referenced in quotes
  const deleteQuery = `
    DELETE FROM products
    WHERE (
      (model IS NULL OR model = '')
      OR (manufacturer IS NULL OR manufacturer = '')
    )
    AND id NOT IN (
      SELECT DISTINCT product_id FROM quotation_items WHERE product_id IS NOT NULL
    )
    RETURNING id, model, manufacturer, cost_cents, msrp_cents
  `;

  const countQuery = `
    SELECT COUNT(*) as count FROM products
    WHERE (
      (model IS NULL OR model = '')
      OR (manufacturer IS NULL OR manufacturer = '')
    )
    AND id NOT IN (
      SELECT DISTINCT product_id FROM quotation_items WHERE product_id IS NOT NULL
    )
  `;

  const countReferencedQuery = `
    SELECT COUNT(*) as count FROM products
    WHERE (
      (model IS NULL OR model = '')
      OR (manufacturer IS NULL OR manufacturer = '')
    )
    AND id IN (
      SELECT DISTINCT product_id FROM quotation_items WHERE product_id IS NOT NULL
    )
  `;

  // First, count what will be deleted
  const countResult = await pool.query(countQuery);
  const toDelete = countResult.rows[0].count;

  // Count products that can't be deleted due to foreign key
  const referencedResult = await pool.query(countReferencedQuery);
  const referenced = referencedResult.rows[0].count;

  console.log(`\nProducts to be deleted: ${toDelete}`);
  console.log(`Products to keep (referenced in quotes): ${referenced}`);

  if (toDelete === 0) {
    console.log('✓ No incomplete products found. Database is clean!');
    return { deleted: 0 };
  }

  if (dryRun) {
    console.log('\n⚠️  DRY RUN MODE - No products will be deleted');
    console.log('Run with --execute flag to actually delete products');
    return { deleted: 0, dryRun: true };
  }

  // Confirm deletion
  console.log('\n⚠️  WARNING: This will permanently delete ' + toDelete + ' products!');
  console.log('Press Ctrl+C to cancel, or wait 5 seconds to proceed...');

  await new Promise(resolve => setTimeout(resolve, 5000));

  console.log('\nDeleting incomplete products...');

  const deleteResult = await pool.query(deleteQuery);
  const deleted = deleteResult.rows.length;

  console.log(`\n✓ Deleted ${deleted} incomplete products`);

  return { deleted };
}

async function main() {
  try {
    // Check command line arguments
    const args = process.argv.slice(2);
    const execute = args.includes('--execute') || args.includes('-e');
    const analyze = args.includes('--analyze') || args.includes('-a');

    if (analyze) {
      await analyzeIncompleteProducts();
    } else {
      await analyzeIncompleteProducts();
      const result = await cleanupIncompleteProducts(!execute);

      if (!result.dryRun) {
        console.log('\n' + '='.repeat(70));
        console.log('CLEANUP COMPLETE');
        console.log('='.repeat(70));
        console.log(`Total products deleted: ${result.deleted}`);

        // Show updated stats
        const totalResult = await pool.query('SELECT COUNT(*) as count FROM products');
        console.log(`Remaining products: ${totalResult.rows[0].count}`);
      }
    }

  } catch (error) {
    console.error('\n❌ Error during cleanup:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { analyzeIncompleteProducts, cleanupIncompleteProducts };
