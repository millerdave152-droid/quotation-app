/**
 * Import All Manufacturers Product Data
 * Imports products from the ALL_MANUFACTURERS CSV file
 *
 * Run with: node scripts/import-all-manufacturers.js
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parse/sync');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
  ssl: { rejectUnauthorized: false }
});

// CSV file path
const CSV_FILE = 'C:\\Users\\WD-PC1\\OneDrive\\Desktop\\Appliance Cost\\cleaned_data\\synced\\20251101_163824_ALL_MANUFACTURERS_20251101_161817.csv';

/**
 * Parse price string to cents
 */
function parsePriceToCents(priceStr) {
  if (!priceStr || priceStr === '' || priceStr === 'N/A') return null;

  // Remove currency symbols, commas, spaces
  const cleaned = String(priceStr).replace(/[$,\s]/g, '').trim();

  // Parse as float and convert to cents
  const price = parseFloat(cleaned);
  if (isNaN(price)) return null;

  return Math.round(price * 100);
}

/**
 * Get the best available value from multiple possible columns
 */
function getFirstValid(...values) {
  for (const val of values) {
    if (val && val.trim && val.trim() !== '' && val.trim().toLowerCase() !== 'nan') {
      return val.trim();
    }
  }
  return null;
}

/**
 * Truncate string to max length
 */
function truncate(str, maxLength) {
  if (!str) return str;
  return str.length > maxLength ? str.substring(0, maxLength - 3) + '...' : str;
}

/**
 * Extract category from description or model
 */
function extractCategory(description, model) {
  const text = `${description || ''} ${model || ''}`.toLowerCase();

  const categories = {
    'Refrigerator': ['refrigerator', 'fridge', 'freezer'],
    'Range': ['range', 'stove', 'oven', 'cooktop'],
    'Dishwasher': ['dishwasher'],
    'Washer': ['washer', 'washing machine'],
    'Dryer': ['dryer'],
    'Microwave': ['microwave', 'mwo'],
    'Hood': ['hood', 'ventilation', 'range hood', 'vent'],
    'Wine Cooler': ['wine cooler', 'wine cellar', 'beverage'],
    'Air Conditioner': ['air conditioner', 'ac unit', 'portable ac'],
    'Dehumidifier': ['dehumidifier'],
    'Freezer': ['freezer', 'chest freezer', 'upright freezer'],
    'Cooktop': ['cooktop', 'gas cooktop', 'electric cooktop', 'induction'],
    'Wall Oven': ['wall oven', 'built-in oven'],
    'Laundry': ['laundry', 'washer dryer']
  };

  for (const [category, keywords] of Object.entries(categories)) {
    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        return category;
      }
    }
  }

  return 'Appliance';
}

async function importProducts() {
  const client = await pool.connect();

  try {
    console.log('📦 Starting product import from ALL_MANUFACTURERS...\n');

    // Read CSV file
    console.log('📂 Reading CSV file...');
    const fileContent = fs.readFileSync(CSV_FILE, 'utf-8');

    // Parse CSV
    const records = csv.parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      relax_quotes: true
    });

    console.log(`📊 Found ${records.length} records in CSV\n`);

    let imported = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    // Process records individually (no global transaction to avoid cascade failures)
    for (const record of records) {
      try {
        // Extract manufacturer
        const manufacturer = getFirstValid(
          record['MANUFACTURER'],
          record['Brand'],
          record['BRAND']
        );

        // Extract model number
        const model = getFirstValid(
          record['Model'],
          record['MODEL'],
          record['Model #'],
          record['# Modèle / Model #'],
          record['Current Model No.'],
          record['MATERIAL'],
          record['Part Number']
        );

        // Skip if no model number
        if (!model) {
          skipped++;
          continue;
        }

        // Skip header/category rows
        if (model.toLowerCase().includes('range') && !record['Dealer Cost'] && !record['MSRP']) {
          skipped++;
          continue;
        }

        // Extract description
        const description = getFirstValid(
          record['Description'],
          record['English Description'],
          record['Product Description'],
          record['DESCRIPTION'],
          record['PART DESCRIPTION'],
          record['Product Detail']
        );

        // Skip if no description and model looks like a category
        if (!description && model.length < 5) {
          skipped++;
          continue;
        }

        // Extract prices
        const costCents = parsePriceToCents(
          getFirstValid(
            record['Dealer Cost'],
            record['Cost CAD'],
            record['Marchand\n/ Dealer'],
            record['2025 Cost'],
            record['ACTUAL_COST'],
            record['DEALER COST'],
            record['Dealer Price 2025 CAN'],
            record['2025 Dealer Price'],
            record['2024 Unit Price']
          )
        );

        const msrpCents = parsePriceToCents(
          getFirstValid(
            record['MSRP'],
            record['CDN.\nSRP'],
            record['PDSM / MSRP'],
            record['2025 MSRP'],
            record['MSRP 2025 CN$']
          )
        );

        const mapCents = parsePriceToCents(
          getFirstValid(
            record['MAP'],
            record['Promo MAP'],
            record['MAP 2025 CAN$']
          )
        );

        // Use MAP as sell price if available, otherwise MSRP
        const sellCents = mapCents || msrpCents;

        // Skip if no valid price data
        if (!costCents && !sellCents && !msrpCents) {
          skipped++;
          continue;
        }

        // Extract colour
        const colour = getFirstValid(
          record['Colour'],
          record['COLOR']
        );

        // Extract category
        const category = getFirstValid(
          record['Catégorie de produit / Product Category'],
          record['CATEGORY'],
          record['Category'],
          record['SUBCATEGORY']
        ) || extractCategory(description, model);

        // Extract UPC
        const upc = getFirstValid(record['UPC']);

        // Create unique SKU from manufacturer and model
        const sku = `${(manufacturer || 'UNK').substring(0, 3).toUpperCase()}-${model}`.replace(/[^a-zA-Z0-9-]/g, '');

        // Check if product exists (by model)
        const existingResult = await client.query(
          'SELECT id FROM products WHERE model = $1',
          [model]
        );

        // Convert cents to dollars for the price/cost columns (numeric)
        const costDollars = costCents ? costCents / 100 : null;
        const priceDollars = sellCents ? sellCents / 100 : (msrpCents ? msrpCents / 100 : null);

        // Truncate string values to fit database columns
        const safeModel = truncate(model, 250);
        const safeManufacturer = truncate(manufacturer, 250);
        const safeDescription = truncate(description, 1000); // text field, but be safe
        const safeCategory = truncate(category, 250);
        const safeColour = truncate(colour, 100);
        const safeName = truncate(description || `${manufacturer} ${model}`, 250);

        if (existingResult.rows.length > 0) {
          // Update existing product
          await client.query(`
            UPDATE products SET
              manufacturer = COALESCE($1, manufacturer),
              description = COALESCE($2, description),
              cost_cents = COALESCE($3, cost_cents),
              cost = COALESCE($4, cost),
              price = COALESCE($5, price),
              msrp_cents = COALESCE($6, msrp_cents),
              retail_price_cents = COALESCE($7, retail_price_cents),
              category = COALESCE($8, category),
              color = COALESCE($9, color),
              name = COALESCE($10, name),
              updated_at = CURRENT_TIMESTAMP,
              import_source = 'ALL_MANUFACTURERS_CSV',
              import_date = CURRENT_TIMESTAMP
            WHERE model = $11
          `, [
            safeManufacturer,
            safeDescription,
            costCents,
            costDollars,
            priceDollars,
            msrpCents,
            sellCents || msrpCents,
            safeCategory,
            safeColour,
            safeName,
            model
          ]);
          updated++;
        } else {
          // Insert new product
          await client.query(`
            INSERT INTO products (
              model, manufacturer, description, name, cost_cents, cost, price,
              msrp_cents, retail_price_cents, category, color,
              created_at, updated_at, import_source, import_date, active
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
              CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'ALL_MANUFACTURERS_CSV', CURRENT_TIMESTAMP, true)
          `, [
            safeModel,
            safeManufacturer,
            safeDescription || safeName,
            safeName,
            costCents,
            costDollars,
            priceDollars || costDollars,
            msrpCents,
            sellCents || msrpCents,
            safeCategory,
            safeColour
          ]);
          imported++;
        }

        // Progress indicator
        if ((imported + updated) % 100 === 0) {
          process.stdout.write(`\r  Processing: ${imported + updated} products...`);
        }

      } catch (err) {
        errors++;
        if (errors <= 5) {
          console.error(`\n  ⚠️  Error on record: ${err.message}`);
        }
      }
    }

    console.log('\n');
    console.log('═══════════════════════════════════════════');
    console.log('📊 IMPORT SUMMARY');
    console.log('═══════════════════════════════════════════');
    console.log(`  ✅ New products imported:  ${imported}`);
    console.log(`  🔄 Existing products updated: ${updated}`);
    console.log(`  ⏭️  Skipped (no valid data): ${skipped}`);
    console.log(`  ❌ Errors: ${errors}`);
    console.log(`  📦 Total processed: ${imported + updated + skipped}`);
    console.log('═══════════════════════════════════════════\n');

    // Get final product count
    const countResult = await client.query('SELECT COUNT(*) as count FROM products');
    console.log(`📦 Total products in database: ${countResult.rows[0].count}\n`);

    // Show manufacturer breakdown
    const manufacturerResult = await client.query(`
      SELECT manufacturer, COUNT(*) as count
      FROM products
      WHERE manufacturer IS NOT NULL
      GROUP BY manufacturer
      ORDER BY count DESC
      LIMIT 15
    `);

    console.log('🏭 Products by Manufacturer:');
    console.log('─────────────────────────────');
    for (const row of manufacturerResult.rows) {
      console.log(`  ${row.manufacturer}: ${row.count}`);
    }

  } catch (error) {
    console.error('❌ Import failed:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run import
importProducts()
  .then(() => {
    console.log('\n🎉 Import completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Import error:', error);
    process.exit(1);
  });
