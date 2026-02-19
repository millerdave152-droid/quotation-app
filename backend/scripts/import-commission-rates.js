/**
 * Import Best Buy Marketplace Commission Rates from CSV
 *
 * Usage: node backend/scripts/import-commission-rates.js [path-to-csv]
 * Default CSV path: "Commission BB List.csv" on Desktop
 */

const fs = require('fs');
const path = require('path');
const pool = require('../db');

// Parse a CSV line handling quoted fields
function parseCSVLine(line) {
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

// Extract commission percentage from fee field like "0.00|XX.00|%"
function parseFee(feeStr) {
  if (!feeStr) return null;
  const match = feeStr.match(/\|(\d+(?:\.\d+)?)\|%/);
  if (match) return parseFloat(match[1]);
  // Fallback: try plain number
  const num = parseFloat(feeStr);
  return isNaN(num) ? null : num;
}

// Extract leaf category from path like "Product Root > Computers > Video Cards"
function extractLeaf(categoryPath) {
  const parts = categoryPath.split(' > ');
  return parts[parts.length - 1].trim();
}

async function main() {
  const csvPath = process.argv[2] || path.join(
    process.env.USERPROFILE || process.env.HOME,
    'OneDrive', 'Desktop', 'Commission BB List.csv'
  );

  if (!fs.existsSync(csvPath)) {
    console.error(`CSV file not found: ${csvPath}`);
    process.exit(1);
  }

  console.log(`Reading: ${csvPath}`);
  const content = fs.readFileSync(csvPath, 'utf8');
  const lines = content.split(/\r?\n/).filter(l => l.trim());

  // Skip header row
  const dataLines = lines.slice(1);

  let imported = 0;
  let skipped = 0;

  for (const line of dataLines) {
    const fields = parseCSVLine(line);
    const categoryPath = fields[0];
    const feeStr = fields[fields.length - 1]; // fee is the last column

    if (!categoryPath || !categoryPath.startsWith('Product Root')) {
      skipped++;
      continue;
    }

    const commissionPct = parseFee(feeStr);
    if (commissionPct === null) {
      console.warn(`  Skipping (bad fee): ${categoryPath} -> ${feeStr}`);
      skipped++;
      continue;
    }

    const categoryLeaf = extractLeaf(categoryPath);

    try {
      await pool.query(`
        INSERT INTO marketplace_commission_rates (category_path, category_leaf, commission_pct, item_condition)
        VALUES ($1, $2, $3, 'NEW')
        ON CONFLICT DO NOTHING
      `, [categoryPath, categoryLeaf, commissionPct]);
      imported++;
    } catch (err) {
      console.error(`  Error inserting "${categoryPath}": ${err.message}`);
      skipped++;
    }
  }

  console.log(`\nDone. Imported: ${imported}, Skipped: ${skipped}`);

  // Show summary by rate
  const summary = await pool.query(`
    SELECT commission_pct, COUNT(*) as count
    FROM marketplace_commission_rates
    GROUP BY commission_pct
    ORDER BY commission_pct
  `);
  console.log('\nCommission Rate Summary:');
  for (const row of summary.rows) {
    console.log(`  ${row.commission_pct}% — ${row.count} categories`);
  }

  const total = await pool.query('SELECT COUNT(*) FROM marketplace_commission_rates');
  console.log(`\nTotal rows in table: ${total.rows[0].count}`);

  await pool.end();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
