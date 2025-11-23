/**
 * CALCULATE AND UPDATE MSRP
 * ==========================
 * This script calculates MSRP for products that have:
 * - Valid cost_cents > 0
 * - Missing or zero MSRP (msrp_cents = 0 or NULL)
 *
 * Calculation: MSRP = cost * (1 + markup_percentage)
 * Default markup: 30% (configurable)
 *
 * Run with: node scripts/calculate-msrp.js [--markup=30] [--execute]
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

async function analyzeMissingMSRP() {
  console.log('\n' + '='.repeat(70));
  console.log('ANALYZING MISSING MSRP');
  console.log('='.repeat(70));

  const queries = [
    {
      name: 'Total products',
      query: 'SELECT COUNT(*) as count FROM products'
    },
    {
      name: 'Products with MSRP > 0',
      query: 'SELECT COUNT(*) as count FROM products WHERE msrp_cents > 0'
    },
    {
      name: 'Products with cost > 0 but MSRP = 0',
      query: `SELECT COUNT(*) as count FROM products
              WHERE cost_cents > 0 AND (msrp_cents = 0 OR msrp_cents IS NULL)`
    },
    {
      name: 'Products with both cost = 0 and MSRP = 0',
      query: `SELECT COUNT(*) as count FROM products
              WHERE (cost_cents = 0 OR cost_cents IS NULL)
              AND (msrp_cents = 0 OR msrp_cents IS NULL)`
    }
  ];

  console.log('\nCurrent Database State:');
  console.log('-'.repeat(70));

  for (const q of queries) {
    const result = await pool.query(q.query);
    console.log(`${q.name}: ${result.rows[0].count}`);
  }

  // Get sample products that need MSRP
  const sampleQuery = `
    SELECT id, model, manufacturer, cost_cents, msrp_cents
    FROM products
    WHERE cost_cents > 0 AND (msrp_cents = 0 OR msrp_cents IS NULL)
    AND model IS NOT NULL AND manufacturer IS NOT NULL
    LIMIT 10
  `;

  const samples = await pool.query(sampleQuery);

  if (samples.rows.length > 0) {
    console.log('\nSample Products Needing MSRP:');
    console.log('-'.repeat(70));
    samples.rows.forEach(p => {
      const cost = (p.cost_cents / 100).toFixed(2);
      console.log(`${p.manufacturer} ${p.model}: Cost=$${cost}, MSRP=$0.00`);
    });
  }

  console.log('='.repeat(70));
}

async function calculateMSRP(markupPercent = 30, dryRun = true) {
  console.log('\n' + '='.repeat(70));
  console.log(dryRun ? 'DRY RUN - NO CHANGES WILL BE MADE' : 'CALCULATING AND UPDATING MSRP');
  console.log('='.repeat(70));
  console.log(`Markup Percentage: ${markupPercent}%`);
  console.log('='.repeat(70));

  // Get products that need MSRP calculated
  const selectQuery = `
    SELECT id, model, manufacturer, cost_cents, msrp_cents, category
    FROM products
    WHERE cost_cents > 0
    AND (msrp_cents = 0 OR msrp_cents IS NULL)
    AND model IS NOT NULL AND model != ''
    AND manufacturer IS NOT NULL AND manufacturer != ''
    ORDER BY manufacturer, model
  `;

  const result = await pool.query(selectQuery);
  const products = result.rows;

  console.log(`\nProducts to update: ${products.length}`);

  if (products.length === 0) {
    console.log('✓ No products need MSRP calculation!');
    return { updated: 0 };
  }

  const markupMultiplier = 1 + (markupPercent / 100);
  let updatedCount = 0;
  const updates = [];

  console.log('\nCalculating MSRP values...\n');

  for (const product of products) {
    const costCents = parseInt(product.cost_cents);
    const calculatedMSRP = Math.round(costCents * markupMultiplier);

    const costDollars = (costCents / 100).toFixed(2);
    const msrpDollars = (calculatedMSRP / 100).toFixed(2);

    updates.push({
      id: product.id,
      manufacturer: product.manufacturer,
      model: product.model,
      costCents,
      calculatedMSRP,
      costDollars,
      msrpDollars
    });

    if (updatedCount < 10 || !dryRun) {
      console.log(`${product.manufacturer} ${product.model}`);
      console.log(`  Cost: $${costDollars} → MSRP: $${msrpDollars} (+${markupPercent}%)`);
    }
  }

  if (products.length > 10 && dryRun) {
    console.log(`... and ${products.length - 10} more products`);
  }

  if (dryRun) {
    console.log('\n⚠️  DRY RUN MODE - No products will be updated');
    console.log('Run with --execute flag to actually update MSRP values');
    return { updated: 0, dryRun: true, calculated: updates.length };
  }

  // Confirm update
  console.log(`\n⚠️  This will update MSRP for ${updates.length} products!`);
  console.log('Press Ctrl+C to cancel, or wait 5 seconds to proceed...');

  await new Promise(resolve => setTimeout(resolve, 5000));

  console.log('\nUpdating MSRP values...');

  // Update in batches
  const batchSize = 100;
  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = updates.slice(i, i + batchSize);

    for (const update of batch) {
      const updateQuery = `
        UPDATE products
        SET msrp_cents = $1,
            price = $1,
            last_updated = CURRENT_TIMESTAMP
        WHERE id = $2
      `;

      await pool.query(updateQuery, [update.calculatedMSRP, update.id]);
      updatedCount++;
    }

    console.log(`  Updated ${Math.min(i + batchSize, updates.length)} / ${updates.length} products...`);
  }

  console.log(`\n✓ Updated ${updatedCount} products with calculated MSRP`);

  return { updated: updatedCount, markupPercent };
}

async function main() {
  try {
    // Parse command line arguments
    const args = process.argv.slice(2);
    const execute = args.includes('--execute') || args.includes('-e');
    const analyze = args.includes('--analyze') || args.includes('-a');

    // Parse markup percentage
    let markupPercent = 30; // default
    const markupArg = args.find(arg => arg.startsWith('--markup='));
    if (markupArg) {
      markupPercent = parseFloat(markupArg.split('=')[1]);
      if (isNaN(markupPercent) || markupPercent < 0 || markupPercent > 200) {
        console.error('Invalid markup percentage. Must be between 0 and 200.');
        process.exit(1);
      }
    }

    if (analyze) {
      await analyzeMissingMSRP();
    } else {
      await analyzeMissingMSRP();
      const result = await calculateMSRP(markupPercent, !execute);

      if (!result.dryRun) {
        console.log('\n' + '='.repeat(70));
        console.log('MSRP CALCULATION COMPLETE');
        console.log('='.repeat(70));
        console.log(`Total products updated: ${result.updated}`);
        console.log(`Markup applied: ${result.markupPercent}%`);

        // Show updated stats
        const totalQuery = `
          SELECT
            COUNT(*) as total,
            COUNT(CASE WHEN msrp_cents > 0 THEN 1 END) as with_msrp
          FROM products
        `;
        const stats = await pool.query(totalQuery);
        console.log(`Total products: ${stats.rows[0].total}`);
        console.log(`Products with MSRP: ${stats.rows[0].with_msrp}`);
      } else {
        console.log('\n' + '='.repeat(70));
        console.log('DRY RUN SUMMARY');
        console.log('='.repeat(70));
        console.log(`Products that would be updated: ${result.calculated}`);
        console.log(`\nTo apply changes, run:`);
        console.log(`  node scripts/calculate-msrp.js --markup=${markupPercent} --execute`);
      }
    }

  } catch (error) {
    console.error('\n❌ Error during MSRP calculation:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { analyzeMissingMSRP, calculateMSRP };
