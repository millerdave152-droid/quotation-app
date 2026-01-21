/**
 * Import Scraped Products from JSON
 *
 * Usage: node scripts/import-scraped-products.js [path-to-json]
 *
 * Expected JSON format:
 * [
 *   {
 *     "vendor": "Whirlpool Portal Canada",
 *     "modelNumber": "KMCS522RPS",
 *     "name": "Product Name",
 *     "brand": "KitchenAid",
 *     "category": "Cooking",
 *     "subcategory": "Microwaves",
 *     "msrp": 599.99,
 *     "dealerPrice": null,
 *     "description": "Product description...",
 *     "imageUrls": "https://..."
 *   }
 * ]
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

// Lazy-load NomenclatureService for auto-decode
let nomenclatureService = null;
const getNomenclatureService = () => {
  if (!nomenclatureService) {
    const NomenclatureService = require('../services/NomenclatureService');
    nomenclatureService = new NomenclatureService(pool, null);
  }
  return nomenclatureService;
};

// Auto-decode product model number
async function autoDecodeProduct(modelNumber, manufacturer) {
  try {
    const service = getNomenclatureService();
    const result = await service.decodeModel(modelNumber, manufacturer);

    if (result.success && result.data && result.data.confidence >= 50) {
      // Update product with decoded attributes
      await pool.query(`
        UPDATE products SET
          decoded_attributes = $1,
          nomenclature_confidence = $2,
          decoded_at = NOW()
        WHERE model = $3
      `, [
        JSON.stringify(result.data.breakdown),
        result.data.confidence,
        modelNumber
      ]);
      return result.data.confidence;
    }
    return null;
  } catch (err) {
    // Silent fail - decode is optional
    return null;
  }
}

// Map vendor brands to manufacturer names in database
const brandMapping = {
  'kitchenaid': 'KITCHENAID',
  'whirlpool': 'WHIRLPOOL',
  'maytag': 'MAYTAG',
  'amana': 'AMANA',
  'jenn-air': 'JENN-AIR',
  'jennair': 'JENN-AIR',
  'samsung': 'SAMSUNG',
  'lg': 'LG',
  'ge': 'GE',
  'bosch': 'BOSCH',
  'frigidaire': 'FRIGIDAIRE',
  'electrolux': 'ELECTROLUX'
};

function normalizeManufacturer(brand) {
  if (!brand) return 'OTHER';
  const normalized = brand.toLowerCase().trim();
  return brandMapping[normalized] || brand.toUpperCase();
}

function buildCategory(category, subcategory, brand) {
  // Create a category string like "KitchenAid - Microwaves" or "Cooking - Ranges"
  const parts = [];
  if (brand) parts.push(brand);
  if (subcategory) {
    parts.push(subcategory);
  } else if (category) {
    parts.push(category);
  }
  return parts.join(' - ') || 'Uncategorized';
}

async function importProducts(jsonPath) {
  console.log('\n========================================');
  console.log('  SCRAPED PRODUCTS IMPORT');
  console.log('========================================\n');

  // Read JSON file
  let products;
  try {
    const jsonContent = fs.readFileSync(jsonPath, 'utf8');
    products = JSON.parse(jsonContent);
    console.log(`Loaded ${products.length} products from ${jsonPath}\n`);
  } catch (err) {
    console.error('Error reading JSON file:', err.message);
    process.exit(1);
  }

  if (!Array.isArray(products) || products.length === 0) {
    console.error('No products found in JSON file');
    process.exit(1);
  }

  // Stats
  let imported = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const product of products) {
    const modelNumber = product.modelNumber?.trim();

    if (!modelNumber) {
      console.log('  SKIP: No model number');
      skipped++;
      continue;
    }

    const manufacturer = normalizeManufacturer(product.brand);
    const category = buildCategory(product.category, product.subcategory, product.brand);
    const description = product.name || product.description || '';
    const msrpCents = product.msrp ? Math.round(product.msrp * 100) : null;
    const costCents = product.dealerPrice ? Math.round(product.dealerPrice * 100) : null;
    const imageUrl = product.imageUrls || null;
    const vendor = product.vendor || 'Manual Import';

    try {
      // Check if product exists
      const existing = await pool.query(
        'SELECT id, msrp_cents, cost_cents FROM products WHERE model = $1',
        [modelNumber]
      );

      if (existing.rows.length > 0) {
        // Update existing product
        const existingProduct = existing.rows[0];

        // Only update if we have better data
        const updateMsrp = msrpCents && (!existingProduct.msrp_cents || msrpCents !== existingProduct.msrp_cents);
        const updateCost = costCents && (!existingProduct.cost_cents || costCents !== existingProduct.cost_cents);

        if (updateMsrp || updateCost) {
          await pool.query(`
            UPDATE products SET
              msrp_cents = COALESCE($1, msrp_cents),
              cost_cents = COALESCE($2, cost_cents),
              description = COALESCE(NULLIF($3, ''), description),
              category = COALESCE(NULLIF($4, ''), category),
              image_url = COALESCE($5, image_url),
              updated_at = NOW()
            WHERE model = $6
          `, [msrpCents, costCents, description, category, imageUrl, modelNumber]);

          // Auto-decode the updated product
          const confidence = await autoDecodeProduct(modelNumber, manufacturer);
          const decodeInfo = confidence ? ` [decoded: ${confidence}%]` : '';
          console.log(`  UPDATE: ${modelNumber} (${manufacturer})${decodeInfo}`);
          updated++;
        } else {
          console.log(`  EXISTS: ${modelNumber} - no changes`);
          skipped++;
        }
      } else {
        // Insert new product
        await pool.query(`
          INSERT INTO products (
            model, manufacturer, category, description,
            msrp_cents, cost_cents, image_url, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
        `, [modelNumber, manufacturer, category, description, msrpCents, costCents, imageUrl]);

        // Auto-decode the new product
        const confidence = await autoDecodeProduct(modelNumber, manufacturer);
        const decodeInfo = confidence ? ` [decoded: ${confidence}%]` : '';
        console.log(`  INSERT: ${modelNumber} - ${manufacturer} - $${(msrpCents/100).toFixed(2)}${decodeInfo}`);
        imported++;
      }
    } catch (err) {
      console.error(`  ERROR: ${modelNumber} - ${err.message}`);
      errors++;
    }
  }

  console.log('\n========================================');
  console.log('  IMPORT COMPLETE');
  console.log('========================================');
  console.log(`  Imported: ${imported}`);
  console.log(`  Updated:  ${updated}`);
  console.log(`  Skipped:  ${skipped}`);
  console.log(`  Errors:   ${errors}`);
  console.log(`  Total:    ${products.length}`);
  console.log('========================================\n');

  await pool.end();
}

// Also support piped JSON input or inline JSON argument
async function main() {
  let jsonPath = process.argv[2];

  if (!jsonPath) {
    // Check if there's piped input
    if (!process.stdin.isTTY) {
      let input = '';
      process.stdin.setEncoding('utf8');
      for await (const chunk of process.stdin) {
        input += chunk;
      }

      if (input.trim()) {
        // Save to temp file and import
        const tempPath = path.join(__dirname, 'temp-import.json');
        fs.writeFileSync(tempPath, input);
        await importProducts(tempPath);
        fs.unlinkSync(tempPath); // Clean up
        return;
      }
    }

    console.log('Usage: node scripts/import-scraped-products.js <path-to-json>');
    console.log('   or: cat products.json | node scripts/import-scraped-products.js');
    console.log('\nExample JSON format:');
    console.log('[');
    console.log('  {');
    console.log('    "modelNumber": "WFG550S0LZ",');
    console.log('    "brand": "Whirlpool",');
    console.log('    "category": "Cooking",');
    console.log('    "subcategory": "Ranges",');
    console.log('    "msrp": 1649.99,');
    console.log('    "name": "5.0 Cu. Ft. Gas Range",');
    console.log('    "description": "Product description..."');
    console.log('  }');
    console.log(']');
    process.exit(1);
  }

  // Resolve path
  if (!path.isAbsolute(jsonPath)) {
    jsonPath = path.join(process.cwd(), jsonPath);
  }

  if (!fs.existsSync(jsonPath)) {
    console.error(`File not found: ${jsonPath}`);
    process.exit(1);
  }

  await importProducts(jsonPath);
}

main().catch(err => {
  console.error('Import failed:', err);
  process.exit(1);
});
