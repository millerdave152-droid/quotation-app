/**
 * Import BFBD (Frigidaire/Electrolux) products with MSRP and promo cost
 * Uses "Cost: Nov 20 - Jan 14" as dealer cost (promo pricing)
 * Imports from multiple sheets
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

async function importBFBDProducts() {
  const path = 'C:/Users/WD-PC1/OneDrive/Desktop/price/2025 BFBD PRICE List Nov 20th - Jan 14th Central 1.xlsx';
  const workbook = XLSX.readFile(path);

  console.log('Importing BFBD (Frigidaire/Electrolux) products...\n');
  console.log('Sheets found:', workbook.SheetNames.join(', '));

  // Skip "Disco - Removed" sheet
  const sheetsToImport = workbook.SheetNames.filter(s => !s.toLowerCase().includes('disco'));

  let grandTotalImported = 0;
  let grandTotalUpdated = 0;
  let grandTotalSkipped = 0;
  const allErrors = [];

  for (const sheetName of sheetsToImport) {
    console.log(`\n========================================`);
    console.log(`Processing sheet: ${sheetName}`);
    console.log(`========================================`);

    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    // Different sheets have different structures
    let headerRowIndex, colIndex;

    if (sheetName === 'RAC') {
      // RAC sheet: Header row 6 (index 5)
      headerRowIndex = 5;
      colIndex = {
        brand: 1,           // Brand
        productLine: 2,     // Product Line
        platform: 3,        // Platform
        model: 6,           // Model
        colour: 7,          // Colour
        status: null,       // No status column
        msrp: 12,           // 2025 MSRP
        regularCost: 13,    // 2025 Cost
        promoCost: null,    // No promo cost
        description: 15     // English Description
      };
    } else if (sheetName === 'Accessories' || sheetName === 'Vacuum') {
      // Same structure as main sheet
      headerRowIndex = 9;
      colIndex = {
        brand: 0,
        productLine: 1,
        platform: 2,
        model: 5,
        colour: 7,
        status: 8,
        regularMsrp: 11,    // 2025 MSRP (regular)
        regularCost: 12,    // 2025 Cost (regular)
        promoMsrp: 13,      // Retail: Nov 20 - Jan 14 (promo retail)
        promoCost: 14,      // Cost: Nov 20 - Jan 14 (promo cost)
        description: 18
      };
    } else {
      // Main Frigidaire & Electrolux sheet: Header row 10 (index 9)
      headerRowIndex = 9;
      colIndex = {
        brand: 0,           // Brand
        productLine: 1,     // Product Line
        platform: 2,        // Platform
        model: 5,           // Model
        colour: 7,          // Colour
        status: 8,          // Status
        regularMsrp: 11,    // 2025 MSRP (regular)
        regularCost: 12,    // 2025 Cost (regular)
        promoMsrp: 13,      // Retail: Nov 20 - Jan 14 (promo retail)
        promoCost: 14,      // Cost: Nov 20 - Jan 14 (promo cost)
        description: 18     // English Description
      };
    }

    const headers = data[headerRowIndex];
    if (!headers || headers.length < 10) {
      console.log('  Skipping - no valid headers found');
      continue;
    }

    let totalImported = 0;
    let totalUpdated = 0;
    let totalSkipped = 0;
    const errors = [];

    // Data starts after header row
    const dataStartIndex = headerRowIndex + 1;
    for (let i = dataStartIndex; i < data.length; i++) {
      const row = data[i];
      let model = row[colIndex.model];
      const brand = row[colIndex.brand];
      const productLine = row[colIndex.productLine];
      const platform = row[colIndex.platform];
      const colour = row[colIndex.colour];
      const status = colIndex.status !== null ? row[colIndex.status] : null;
      const regularMsrp = colIndex.regularMsrp !== undefined ? row[colIndex.regularMsrp] : row[colIndex.msrp];
      const promoMsrp = colIndex.promoMsrp !== undefined ? row[colIndex.promoMsrp] : null;
      const regularCost = row[colIndex.regularCost];
      const promoCost = colIndex.promoCost !== null ? row[colIndex.promoCost] : null;
      const description = row[colIndex.description];

      // Skip empty rows
      if (!model) continue;

      // Skip discontinued/expired products
      const statusStr = status ? String(status).toLowerCase() : '';
      if (statusStr === 'expired' || statusStr === 'discontinued') {
        totalSkipped++;
        continue;
      }

      // Convert model to string
      model = String(model).trim();

      // Use promo prices if available, otherwise regular prices
      const cost = promoCost || regularCost;
      const msrp = promoMsrp || regularMsrp;

      // Parse prices (convert to cents)
      const parseCents = (val) => {
        if (!val) return null;
        const parsed = parseFloat(String(val).replace(/[$,]/g, ''));
        return !isNaN(parsed) && parsed > 0 ? Math.round(parsed * 100) : null;
      };

      const costCents = parseCents(cost);
      const msrpCents = parseCents(msrp);

      if (!costCents && !msrpCents) {
        totalSkipped++;
        continue;
      }

      // Build category string
      let fullCategory = brand || 'BFBD';
      if (productLine) {
        fullCategory += ` - ${productLine}`;
      }
      if (platform) {
        fullCategory += ` - ${platform}`;
      }

      // Build name with colour (truncate if too long)
      let productName = description || platform || productLine || model;
      if (colour) {
        productName = `${productName} - ${colour}`;
      }
      // Truncate to 450 chars to leave room for colour
      if (productName && productName.length > 450) {
        productName = productName.substring(0, 447) + '...';
      }

      // Truncate description to 500 chars
      let truncatedDesc = description;
      if (truncatedDesc && truncatedDesc.length > 500) {
        truncatedDesc = truncatedDesc.substring(0, 497) + '...';
      }

      // Determine manufacturer from brand
      const manufacturer = brand ? brand.toUpperCase() : 'FRIGIDAIRE';

      try {
        // Check if product exists
        const existing = await pool.query(
          'SELECT id FROM products WHERE model = $1',
          [model]
        );

        if (existing.rows.length > 0) {
          // Update existing product
          await pool.query(
            `UPDATE products SET
              msrp_cents = $1,
              cost_cents = $2,
              manufacturer = $3,
              category = $4,
              name = $5,
              description = $6,
              updated_at = NOW()
            WHERE id = $7`,
            [msrpCents || 0, costCents || 0, manufacturer, fullCategory, productName, truncatedDesc, existing.rows[0].id]
          );
          totalUpdated++;
        } else {
          // Insert new product
          await pool.query(
            `INSERT INTO products (model, manufacturer, category, name, description, cost_cents, msrp_cents, active)
             VALUES ($1, $2, $3, $4, $5, $6, $7, true)`,
            [model, manufacturer, fullCategory, productName, truncatedDesc, costCents, msrpCents]
          );
          totalImported++;
        }
      } catch (err) {
        errors.push({ model, error: err.message });
      }
    }

    console.log(`  New products imported: ${totalImported}`);
    console.log(`  Existing products updated: ${totalUpdated}`);
    console.log(`  Skipped: ${totalSkipped}`);
    console.log(`  Errors: ${errors.length}`);

    grandTotalImported += totalImported;
    grandTotalUpdated += totalUpdated;
    grandTotalSkipped += totalSkipped;
    allErrors.push(...errors);
  }

  console.log('\n========================================');
  console.log('BFBD Import Complete - All Sheets');
  console.log('========================================');
  console.log('  Total new products imported:', grandTotalImported);
  console.log('  Total existing products updated:', grandTotalUpdated);
  console.log('  Total skipped:', grandTotalSkipped);
  console.log('  Total errors:', allErrors.length);

  if (allErrors.length > 0) {
    console.log('\nSample Errors:');
    allErrors.slice(0, 5).forEach(e => console.log('  ', e.model, '-', e.error));
  }

  // Show sample products
  const sample = await pool.query(`
    SELECT model, name, category, manufacturer, cost_cents, msrp_cents
    FROM products
    WHERE manufacturer IN ('FRIGIDAIRE', 'ELECTROLUX')
    ORDER BY updated_at DESC
    LIMIT 15
  `);

  console.log('\nSample BFBD products:');
  sample.rows.forEach(p => {
    const cost = p.cost_cents ? '$' + (p.cost_cents / 100).toFixed(2) : 'N/A';
    const msrp = p.msrp_cents ? '$' + (p.msrp_cents / 100).toFixed(2) : 'N/A';
    console.log(`  ${p.model} (${p.manufacturer}) - Cost: ${cost}, MSRP: ${msrp}`);
  });

  // Get total count by manufacturer
  const counts = await pool.query(`
    SELECT manufacturer, COUNT(*) as count
    FROM products
    WHERE manufacturer IN ('FRIGIDAIRE', 'ELECTROLUX')
    GROUP BY manufacturer
  `);
  console.log('\nTotal products by manufacturer:');
  counts.rows.forEach(r => console.log(`  ${r.manufacturer}: ${r.count}`));

  await pool.end();
}

importBFBDProducts().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
