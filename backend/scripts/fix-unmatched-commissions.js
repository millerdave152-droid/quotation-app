/**
 * Fix unmatched commission rates by looking at parent categories in order data
 * Usage: node backend/scripts/fix-unmatched-commissions.js
 */

const pool = require('../db');

async function fix() {
  // Show what category_code values the unmatched items have
  const unmatched = await pool.query(`
    SELECT DISTINCT category_label, category_code,
      (SELECT category_path FROM marketplace_commission_rates
       WHERE LOWER(category_path) LIKE '%' || LOWER(oi.category_label) || '%'
       LIMIT 1) as possible_match
    FROM marketplace_order_items oi
    WHERE expected_commission_rate IS NULL AND category_label IS NOT NULL
    ORDER BY category_label
  `);

  console.log('Unmatched items with their category codes:');
  for (const row of unmatched.rows) {
    console.log(`  ${row.category_label} (code: ${row.category_code}) -> match: ${row.possible_match || 'NONE'}`);
  }

  // For appliance sub-categories not in the CSV, we can check if there's
  // a parent "Appliances" match. Looking at the CSV structure:
  // - "Product Root > Appliances > ..." entries have 8% commission
  // The unmatched items are likely Appliances sub-categories not in the list

  // Check the order_lines JSON for full category paths
  const orderLines = await pool.query(`
    SELECT DISTINCT oi.category_label, oi.category_code,
      mo.order_lines::text as raw_lines
    FROM marketplace_order_items oi
    JOIN marketplace_orders mo ON mo.id = oi.order_id
    WHERE oi.expected_commission_rate IS NULL AND oi.category_label IS NOT NULL
    LIMIT 5
  `);

  for (const row of orderLines.rows) {
    try {
      const lines = JSON.parse(row.raw_lines);
      for (const line of lines) {
        if (line.category_label === row.category_label) {
          console.log(`\n  ${row.category_label}: category_code=${line.category_code}`);
          // The category_code in Mirakl often contains hierarchy info
          break;
        }
      }
    } catch (e) {}
  }

  // Apply parent-category matching: if the category_code starts with
  // a known parent code, use that rate. For now, let's try matching
  // by finding if any commission rate category_path contains a parent
  // segment that matches

  // Try to match "Blenders" -> Appliances (8%), "Microwaves" -> Appliances (8%)
  // "Range Hoods" -> Appliances (8%), "Living Room Chairs" -> Home & Furniture
  const parentMappings = {
    'Blenders': 8.00,        // Appliances sub-category
    'Microwaves': 8.00,      // Appliances sub-category
    'Range Hoods': 8.00,     // Appliances sub-category
    'Living Room Chairs': 10.00  // Home & Furniture
  };

  let updated = 0;
  for (const [label, rate] of Object.entries(parentMappings)) {
    const result = await pool.query(`
      UPDATE marketplace_order_items
      SET expected_commission_rate = $1, updated_at = CURRENT_TIMESTAMP
      WHERE LOWER(category_label) = LOWER($2) AND expected_commission_rate IS NULL
    `, [rate, label]);
    if (result.rowCount > 0) {
      console.log(`\n  Updated ${result.rowCount} items: ${label} -> ${rate}%`);
      updated += result.rowCount;
    }
  }

  console.log(`\nTotal additionally updated: ${updated}`);

  // Final stats
  const stats = await pool.query(`
    SELECT
      COUNT(*) as total_items,
      COUNT(expected_commission_rate) as matched,
      COUNT(*) - COUNT(expected_commission_rate) as unmatched
    FROM marketplace_order_items
  `);
  console.log('Final stats:', stats.rows[0]);

  await pool.end();
}

fix().catch(e => { console.error(e); process.exit(1); });
