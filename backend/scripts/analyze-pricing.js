/**
 * Analyze pricing data for filter optimization
 */
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function analyze() {
  console.log('='.repeat(70));
  console.log('PRICING DATA ANALYSIS');
  console.log('='.repeat(70));

  // Overall pricing stats (using both price column and cents columns)
  const overall = await pool.query(`
    SELECT
      COUNT(*) as total,
      COUNT(price) FILTER (WHERE price > 0) as has_price,
      COUNT(cost) FILTER (WHERE cost > 0) as has_cost,
      COUNT(msrp_cents) FILTER (WHERE msrp_cents > 0) as has_msrp,
      COUNT(cost_cents) FILTER (WHERE cost_cents > 0) as has_cost_cents,
      MIN(price) FILTER (WHERE price > 0) as min_price,
      MAX(price) as max_price,
      ROUND(AVG(price)::numeric, 2) as avg_price
    FROM products
  `);

  console.log('\nOVERALL PRICING STATS:');
  console.log('-'.repeat(50));
  console.log(`Total products: ${overall.rows[0].total}`);
  console.log(`With price (decimal): ${overall.rows[0].has_price}`);
  console.log(`With cost (decimal): ${overall.rows[0].has_cost}`);
  console.log(`With MSRP (cents): ${overall.rows[0].has_msrp}`);
  console.log(`With cost (cents): ${overall.rows[0].has_cost_cents}`);
  console.log(`Price range: $${parseFloat(overall.rows[0].min_price || 0).toFixed(2)} - $${parseFloat(overall.rows[0].max_price || 0).toFixed(2)}`);
  console.log(`Average price: $${parseFloat(overall.rows[0].avg_price || 0).toFixed(2)}`);

  // Price distribution
  console.log('\nPRICE DISTRIBUTION:');
  console.log('-'.repeat(50));
  const distribution = await pool.query(`
    SELECT
      CASE
        WHEN price IS NULL OR price = 0 THEN 'No price / $0'
        WHEN price < 100 THEN '$0-$99'
        WHEN price < 500 THEN '$100-$499'
        WHEN price < 1000 THEN '$500-$999'
        WHEN price < 2000 THEN '$1,000-$1,999'
        WHEN price < 5000 THEN '$2,000-$4,999'
        WHEN price < 10000 THEN '$5,000-$9,999'
        ELSE '$10,000+'
      END as price_range,
      COUNT(*) as cnt
    FROM products
    GROUP BY 1
    ORDER BY
      CASE
        WHEN price IS NULL OR price = 0 THEN 0
        WHEN price < 100 THEN 1
        WHEN price < 500 THEN 2
        WHEN price < 1000 THEN 3
        WHEN price < 2000 THEN 4
        WHEN price < 5000 THEN 5
        WHEN price < 10000 THEN 6
        ELSE 7
      END
  `);
  for (const d of distribution.rows) {
    console.log(`  ${d.price_range.padEnd(20)} ${d.cnt}`);
  }

  // Products with zero or null pricing
  console.log('\nPRODUCTS WITHOUT PRICING (by category):');
  console.log('-'.repeat(50));
  const noPricing = await pool.query(`
    SELECT c.name as category, COUNT(*) as cnt
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.price IS NULL OR p.price = 0
    GROUP BY c.name
    ORDER BY cnt DESC
    LIMIT 15
  `);
  for (const n of noPricing.rows) {
    console.log(`  ${(n.category || 'Unknown').padEnd(25)} ${n.cnt}`);
  }

  // Sample products with zero price but have cost_cents
  console.log('\nPRODUCTS WITH $0 PRICE BUT HAS COST:');
  console.log('-'.repeat(50));
  const zeroPriced = await pool.query(`
    SELECT manufacturer, model, price, cost, cost_cents, msrp_cents
    FROM products
    WHERE (price IS NULL OR price = 0)
      AND (cost_cents > 0 OR cost > 0)
    LIMIT 15
  `);
  for (const p of zeroPriced.rows) {
    const costVal = p.cost_cents ? (p.cost_cents / 100).toFixed(2) : (p.cost || 0);
    const msrpVal = p.msrp_cents ? (p.msrp_cents / 100).toFixed(2) : 0;
    console.log(`  ${(p.manufacturer || '?').padEnd(15)} | ${(p.model || '-').padEnd(20)} | cost: $${costVal} | msrp: $${msrpVal}`);
  }

  // Pricing by category
  console.log('\nPRICING BY CATEGORY:');
  console.log('-'.repeat(70));
  const byCategory = await pool.query(`
    SELECT
      c.name as category,
      COUNT(*) as total,
      COUNT(p.price) FILTER (WHERE p.price > 0) as with_price,
      MIN(p.price) FILTER (WHERE p.price > 0) as min_price,
      MAX(p.price) FILTER (WHERE p.price > 0) as max_price,
      ROUND(AVG(p.price) FILTER (WHERE p.price > 0)::numeric, 0) as avg_price
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    GROUP BY c.name
    ORDER BY total DESC
    LIMIT 15
  `);
  console.log('Category'.padEnd(25) + 'Total'.padStart(6) + 'Priced'.padStart(8) + 'Min'.padStart(10) + 'Max'.padStart(12) + 'Avg'.padStart(10));
  for (const c of byCategory.rows) {
    const minP = c.min_price ? '$' + Math.round(c.min_price) : '-';
    const maxP = c.max_price ? '$' + Math.round(c.max_price) : '-';
    const avgP = c.avg_price ? '$' + Math.round(c.avg_price) : '-';
    console.log(
      `${(c.category || 'Unknown').padEnd(25)}${c.total.toString().padStart(6)}${c.with_price.toString().padStart(8)}${minP.padStart(10)}${maxP.padStart(12)}${avgP.padStart(10)}`
    );
  }

  // Check for negative prices
  console.log('\nPRICING ANOMALIES:');
  console.log('-'.repeat(50));
  const anomalies = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE price < 0) as negative_price,
      COUNT(*) FILTER (WHERE price > 100000) as very_high_price,
      COUNT(*) FILTER (WHERE cost > price AND price > 0) as cost_above_price
    FROM products
  `);
  console.log(`Negative prices: ${anomalies.rows[0].negative_price}`);
  console.log(`Very high prices (>$100k): ${anomalies.rows[0].very_high_price}`);
  console.log(`Cost > Price: ${anomalies.rows[0].cost_above_price}`);

  // Check price ranges per major category for filter suggestions
  console.log('\nSUGGESTED FILTER RANGES BY CATEGORY:');
  console.log('-'.repeat(70));
  const filterRanges = await pool.query(`
    SELECT
      c.name as category,
      PERCENTILE_CONT(0.05) WITHIN GROUP (ORDER BY p.price) as p5,
      PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY p.price) as p25,
      PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY p.price) as median,
      PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY p.price) as p75,
      PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY p.price) as p95
    FROM products p
    JOIN categories c ON p.category_id = c.id
    WHERE p.price > 0 AND c.level = 2
    GROUP BY c.name
    HAVING COUNT(*) > 20
    ORDER BY c.name
  `);
  console.log('Category'.padEnd(25) + 'Min(5%)'.padStart(10) + '25%'.padStart(10) + 'Median'.padStart(10) + '75%'.padStart(10) + 'Max(95%)'.padStart(10));
  for (const r of filterRanges.rows) {
    console.log(
      `${(r.category || '-').padEnd(25)}$${Math.round(r.p5).toString().padStart(8)}$${Math.round(r.p25).toString().padStart(8)}$${Math.round(r.median).toString().padStart(8)}$${Math.round(r.p75).toString().padStart(8)}$${Math.round(r.p95).toString().padStart(8)}`
    );
  }

  await pool.end();
  console.log('\n' + '='.repeat(70));
}

analyze().catch(console.error);
