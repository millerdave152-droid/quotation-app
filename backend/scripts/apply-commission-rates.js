/**
 * Apply commission rates to existing order items
 * Usage: node backend/scripts/apply-commission-rates.js
 */

const pool = require('../db');

async function apply() {
  // Exact leaf match
  const exact = await pool.query(`
    UPDATE marketplace_order_items oi
    SET expected_commission_rate = cr.commission_pct,
        updated_at = CURRENT_TIMESTAMP
    FROM marketplace_commission_rates cr
    WHERE LOWER(oi.category_label) = LOWER(cr.category_leaf)
      AND oi.category_label IS NOT NULL
  `);
  console.log('Exact matches updated:', exact.rowCount);

  // Partial path match for remaining
  const partial = await pool.query(`
    UPDATE marketplace_order_items oi
    SET expected_commission_rate = sub.commission_pct,
        updated_at = CURRENT_TIMESTAMP
    FROM (
      SELECT DISTINCT ON (oi2.id) oi2.id, cr2.commission_pct
      FROM marketplace_order_items oi2
      JOIN marketplace_commission_rates cr2
        ON LOWER(cr2.category_path) LIKE '%' || LOWER(oi2.category_label) || '%'
      WHERE oi2.category_label IS NOT NULL
        AND oi2.expected_commission_rate IS NULL
      ORDER BY oi2.id, LENGTH(cr2.category_path) DESC
    ) sub
    WHERE oi.id = sub.id
  `);
  console.log('Partial matches updated:', partial.rowCount);

  // Stats
  const stats = await pool.query(`
    SELECT
      COUNT(*) as total_items,
      COUNT(expected_commission_rate) as matched,
      COUNT(*) - COUNT(expected_commission_rate) as unmatched
    FROM marketplace_order_items
  `);
  console.log('\nStats:', stats.rows[0]);

  // Show unmatched categories
  const unmatched = await pool.query(`
    SELECT DISTINCT category_label, COUNT(*) as cnt
    FROM marketplace_order_items
    WHERE expected_commission_rate IS NULL AND category_label IS NOT NULL
    GROUP BY category_label
    ORDER BY cnt DESC
  `);
  if (unmatched.rows.length > 0) {
    console.log('\nUnmatched categories:');
    unmatched.rows.forEach(r => console.log('  -', r.category_label, '(' + r.cnt + ' items)'));
  }

  // Show sample matches
  const sample = await pool.query(`
    SELECT category_label, commission_rate, expected_commission_rate
    FROM marketplace_order_items
    WHERE expected_commission_rate IS NOT NULL
    LIMIT 5
  `);
  console.log('\nSample matched items:');
  sample.rows.forEach(r => console.log(' ', r.category_label, '- actual:', r.commission_rate + '%', 'expected:', r.expected_commission_rate + '%'));

  await pool.end();
}

apply().catch(e => { console.error(e); process.exit(1); });
