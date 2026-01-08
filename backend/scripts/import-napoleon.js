/**
 * Import Napoleon Grills products from Dealer Cost Price List Excel
 * Columns: Part ID, Product Name, Dealer Cost - CAD, MSRP - CAD, UPC, Note
 * Header Row: 2, Data starts Row 3
 */
const XLSX = require('xlsx');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function importNapoleon() {
  const path = 'C:/Users/WD-PC1/OneDrive/Desktop/price/napoleon-grills-dealer-cost-price-list_canada-revised-september-1st-2025-en.xlsx';
  const workbook = XLSX.readFile(path);
  const sheet = workbook.Sheets['Sheet1'];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  console.log('Importing Napoleon Grills products...\n');
  console.log('Total rows in sheet:', data.length);

  // Header is row 2 (index 1): Part ID, Product Name, Dealer Cost - CAD, MSRP - CAD, UPC, Note
  // Data starts at row 3 (index 2)
  const products = {};

  for (let i = 2; i < data.length; i++) {
    const row = data[i];
    if (!row || !row[0]) continue;

    const model = String(row[0]).trim();
    const name = String(row[1] || '').trim();
    const cost = parseFloat(row[2]) || 0;
    const msrp = parseFloat(row[3]) || 0;

    // Skip invalid rows
    if (!model || model.length < 2 || (cost <= 0 && msrp <= 0)) continue;

    // Determine category from product name
    let category = 'Grill Accessory';
    const nameLower = name.toLowerCase();

    if (nameLower.includes('grill') && (nameLower.includes('gas') || nameLower.includes('propane') || nameLower.includes('natural'))) {
      category = 'Gas Grill';
    } else if (nameLower.includes('charcoal') || nameLower.includes('kettle')) {
      category = 'Charcoal Grill';
    } else if (nameLower.includes('smoker')) {
      category = 'Smoker';
    } else if (nameLower.includes('griddle')) {
      category = 'Griddle';
    } else if (nameLower.includes('cover')) {
      category = 'Grill Cover';
    } else if (nameLower.includes('rotisserie')) {
      category = 'Rotisserie';
    } else if (nameLower.includes('burner') || nameLower.includes('side burner')) {
      category = 'Burner';
    } else if (nameLower.includes('cart')) {
      category = 'Grill Cart';
    } else if (nameLower.includes('built-in') || nameLower.includes('built in')) {
      category = 'Built-In Grill';
    } else if (nameLower.includes('portable')) {
      category = 'Portable Grill';
    } else if (nameLower.includes('infrared')) {
      category = 'Infrared Grill';
    } else if (nameLower.includes('pizza')) {
      category = 'Pizza Oven';
    } else if (nameLower.includes('knife') || nameLower.includes('tongs') || nameLower.includes('spatula') || nameLower.includes('brush')) {
      category = 'Grilling Tools';
    } else if (nameLower.includes('thermometer') || nameLower.includes('gauge')) {
      category = 'Thermometer';
    } else if (nameLower.includes('grate') || nameLower.includes('grid')) {
      category = 'Cooking Grate';
    }

    products[model] = {
      model,
      name,
      cost,
      msrp,
      category
    };
  }

  const productList = Object.values(products);
  console.log('Unique products to import:', productList.length);

  let totalImported = 0;
  let totalUpdated = 0;
  const errors = [];

  for (const product of productList) {
    const model = product.model;

    // Format category
    const category = 'Napoleon - ' + product.category;

    // Parse prices to cents
    const msrpCents = Math.round(product.msrp * 100);
    const costCents = Math.round(product.cost * 100);

    try {
      const existing = await pool.query(
        'SELECT id FROM products WHERE model = $1',
        [model]
      );

      if (existing.rows.length > 0) {
        await pool.query(
          `UPDATE products SET
            msrp_cents = $1,
            cost_cents = $2,
            manufacturer = 'NAPOLEON',
            category = $3,
            name = $4,
            description = $5,
            updated_at = NOW()
          WHERE id = $6`,
          [msrpCents, costCents, category, product.name, product.name, existing.rows[0].id]
        );
        totalUpdated++;
      } else {
        await pool.query(
          `INSERT INTO products (model, manufacturer, category, name, description, cost_cents, msrp_cents, active)
           VALUES ($1, 'NAPOLEON', $2, $3, $4, $5, $6, true)`,
          [model, category, product.name, product.name, costCents, msrpCents]
        );
        totalImported++;
      }
    } catch (err) {
      errors.push({ model, error: err.message });
    }
  }

  console.log('\n========================================');
  console.log('Napoleon Grills Import Complete');
  console.log('========================================');
  console.log('  New products imported:', totalImported);
  console.log('  Existing products updated:', totalUpdated);
  console.log('  Errors:', errors.length);

  if (errors.length > 0) {
    console.log('\nFirst 5 errors:');
    errors.slice(0, 5).forEach(e => console.log('  ', e.model, '-', e.error));
  }

  // Show sample by category
  const sample = await pool.query(`
    SELECT model, name, category, cost_cents, msrp_cents
    FROM products
    WHERE manufacturer = 'NAPOLEON'
    ORDER BY category, model
    LIMIT 25
  `);

  console.log('\nSample Napoleon products:');
  sample.rows.forEach(p => {
    const cost = p.cost_cents ? '$' + (p.cost_cents / 100).toFixed(2) : 'N/A';
    const msrp = p.msrp_cents ? '$' + (p.msrp_cents / 100).toFixed(2) : 'N/A';
    console.log(`  ${p.model}: Cost=${cost}, MSRP=${msrp} | ${p.category}`);
  });

  // Category breakdown
  const categories = await pool.query(`
    SELECT category, COUNT(*) as count
    FROM products
    WHERE manufacturer = 'NAPOLEON'
    GROUP BY category
    ORDER BY count DESC
  `);
  console.log('\nProducts by category:');
  categories.rows.forEach(c => console.log(`  ${c.category}: ${c.count}`));

  // Total count
  const total = await pool.query(`
    SELECT COUNT(*) as count FROM products WHERE manufacturer = 'NAPOLEON'
  `);
  console.log('\nTotal Napoleon products:', total.rows[0].count);

  await pool.end();
}

importNapoleon().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
