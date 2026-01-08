/**
 * Import Whirlpool Central Extracted Data into Database
 *
 * This script:
 * 1. Reads all whirlpool_batch_*.json files from Downloads folder
 * 2. Merges them into one dataset (deduplicates by SKU)
 * 3. Imports into vendor_products table
 *
 * Usage: node scripts/import-whirlpool-data.js
 */

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Database connection with SSL
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

// Whirlpool Files folder path
const DOWNLOADS_FOLDER = 'C:\\Users\\WD-PC1\\OneDrive\\Desktop\\Whirlpool Files';

/**
 * Find all whirlpool batch JSON files
 */
function findJsonFiles() {
  const files = fs.readdirSync(DOWNLOADS_FOLDER);
  const jsonFiles = files.filter(f =>
    f.startsWith('whirlpool_batch_') && f.endsWith('.json')
  );

  console.log(`📁 Found ${jsonFiles.length} batch files in Downloads:`);
  jsonFiles.forEach(f => console.log(`   - ${f}`));

  return jsonFiles.map(f => path.join(DOWNLOADS_FOLDER, f));
}

/**
 * Read and merge all JSON files
 */
function mergeJsonFiles(filePaths) {
  const allProducts = new Map(); // Use Map for deduplication by SKU
  let totalFromFiles = 0;

  for (const filePath of filePaths) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(content);

      const products = data.products || [data]; // Handle single product or batch
      totalFromFiles += products.length;

      for (const product of products) {
        if (product.sku) {
          // If duplicate, keep the newer one
          if (!allProducts.has(product.sku) ||
              new Date(product.scrapedAt) > new Date(allProducts.get(product.sku).scrapedAt)) {
            allProducts.set(product.sku, product);
          }
        }
      }

      console.log(`   ✅ Loaded ${products.length} products from ${path.basename(filePath)}`);
    } catch (err) {
      console.error(`   ❌ Error reading ${path.basename(filePath)}:`, err.message);
    }
  }

  console.log(`\n📊 Total: ${totalFromFiles} products loaded, ${allProducts.size} unique SKUs`);

  return Array.from(allProducts.values());
}

/**
 * Get or create vendor source
 */
async function getVendorSourceId() {
  // Check if Whirlpool Central source exists
  let result = await pool.query(
    `SELECT id FROM vendor_sources WHERE name ILIKE '%whirlpool%' LIMIT 1`
  );

  if (result.rows.length > 0) {
    return result.rows[0].id;
  }

  // Create it
  result = await pool.query(`
    INSERT INTO vendor_sources (name, base_url, requires_auth, is_active)
    VALUES ('Whirlpool Central', 'https://whirlpoolcentral.ca', true, true)
    RETURNING id
  `);

  return result.rows[0].id;
}

/**
 * Determine category from product data
 */
function normalizeCategory(product) {
  const cat = (product.category || '').toLowerCase();
  const title = (product.title || '').toLowerCase();

  if (cat.includes('refriger') || title.includes('refriger') || title.includes('freezer')) {
    return 'Refrigeration';
  }
  if (cat.includes('laundry') || title.includes('washer') || title.includes('dryer')) {
    return 'Laundry';
  }
  if (cat.includes('cook') || title.includes('range') || title.includes('oven') ||
      title.includes('cooktop') || title.includes('microwave')) {
    return 'Cooking';
  }
  if (cat.includes('dish') || title.includes('dishwasher')) {
    return 'Cleaning';
  }

  return product.category || 'Other';
}

/**
 * Import a single product
 */
async function importProduct(product, vendorSourceId) {
  const category = normalizeCategory(product);

  // Check if product already exists
  const existing = await pool.query(
    `SELECT id FROM vendor_products WHERE model_number = $1 AND vendor_source_id = $2`,
    [product.sku, vendorSourceId]
  );

  const specifications = product.specifications || {};
  const features = Object.entries(specifications)
    .filter(([k, v]) => k.toLowerCase().includes('feature') || v.length > 50)
    .map(([k, v]) => v);

  const dimensions = {};
  Object.entries(specifications).forEach(([key, value]) => {
    const lowerKey = key.toLowerCase();
    if (lowerKey.includes('width') || lowerKey.includes('height') ||
        lowerKey.includes('depth') || lowerKey.includes('weight') ||
        lowerKey.includes('capacity') || lowerKey.includes('volume')) {
      dimensions[key] = value;
    }
  });

  const productData = {
    vendor_source_id: vendorSourceId,
    external_id: product.sku,
    model_number: product.sku,
    name: product.title || product.sku,
    description: product.title,
    category: category,
    subcategory: null,
    brand: product.brand || 'Whirlpool',
    specifications: JSON.stringify(specifications),
    features: JSON.stringify(features),
    dimensions: JSON.stringify(dimensions),
    energy_rating: specifications['Energy Star Qualified'] === 'Yes' ? 'Energy Star' : null,
    color_finish: specifications['Handle Color'] || specifications['Door Finish'] || null,
    is_active: !((product.status || '').toLowerCase().includes('discontinued')),
    last_scraped: product.scrapedAt
  };

  if (existing.rows.length > 0) {
    // Update existing
    await pool.query(`
      UPDATE vendor_products SET
        name = $1, description = $2, category = $3, brand = $4,
        specifications = $5, features = $6, dimensions = $7,
        energy_rating = $8, color_finish = $9, is_active = $10,
        last_scraped = $11, updated_at = CURRENT_TIMESTAMP
      WHERE id = $12
    `, [
      productData.name, productData.description, productData.category,
      productData.brand, productData.specifications, productData.features,
      productData.dimensions, productData.energy_rating, productData.color_finish,
      productData.is_active, productData.last_scraped, existing.rows[0].id
    ]);

    return { action: 'updated', id: existing.rows[0].id, sku: product.sku };
  } else {
    // Insert new
    const result = await pool.query(`
      INSERT INTO vendor_products (
        vendor_source_id, external_id, model_number, name, description,
        category, subcategory, brand, specifications, features, dimensions,
        energy_rating, color_finish, is_active, last_scraped
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING id
    `, [
      productData.vendor_source_id, productData.external_id, productData.model_number,
      productData.name, productData.description, productData.category,
      productData.subcategory, productData.brand, productData.specifications,
      productData.features, productData.dimensions, productData.energy_rating,
      productData.color_finish, productData.is_active, productData.last_scraped
    ]);

    return { action: 'inserted', id: result.rows[0].id, sku: product.sku };
  }
}

/**
 * Import product images
 */
async function importImages(productId, product) {
  if (!product.images) return 0;

  let count = 0;
  const images = product.images.gallery || [];

  // Add hero image first
  if (product.images.hero) {
    await pool.query(`
      INSERT INTO vendor_product_images (vendor_product_id, image_type, original_url, is_primary, sort_order)
      VALUES ($1, 'hero', $2, true, 0)
      ON CONFLICT DO NOTHING
    `, [productId, product.images.hero]);
    count++;
  }

  // Add gallery images
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    if (img.url && img.url !== product.images.hero) {
      try {
        await pool.query(`
          INSERT INTO vendor_product_images (vendor_product_id, image_type, original_url, sort_order)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT DO NOTHING
        `, [productId, img.type || 'gallery', img.url, i + 1]);
        count++;
      } catch (err) {
        // Ignore duplicates
      }
    }
  }

  return count;
}

/**
 * Import product assets (PDFs, documents)
 */
async function importAssets(productId, product) {
  if (!product.assets) return 0;

  let count = 0;

  for (const asset of product.assets) {
    if (asset.url) {
      try {
        await pool.query(`
          INSERT INTO vendor_product_assets (vendor_product_id, asset_type, name, original_url)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT DO NOTHING
        `, [productId, asset.type || 'document', asset.name || 'Document', asset.url]);
        count++;
      } catch (err) {
        // Ignore duplicates
      }
    }
  }

  return count;
}

/**
 * Main import function
 */
async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log('  WHIRLPOOL CENTRAL DATA IMPORT');
  console.log('═══════════════════════════════════════════════════════');
  console.log('');

  try {
    // Find JSON files
    const jsonFiles = findJsonFiles();

    if (jsonFiles.length === 0) {
      console.log('❌ No whirlpool_batch_*.json files found in Downloads folder');
      console.log('   Run the batch extractor first to create export files.');
      process.exit(1);
    }

    // Merge all files
    console.log('\n📂 Merging JSON files...');
    const products = mergeJsonFiles(jsonFiles);

    if (products.length === 0) {
      console.log('❌ No products found in JSON files');
      process.exit(1);
    }

    // Get vendor source ID
    const vendorSourceId = await getVendorSourceId();
    console.log(`\n🏭 Vendor Source ID: ${vendorSourceId}`);

    // Import products
    console.log('\n📦 Importing products...\n');

    let inserted = 0, updated = 0, errors = 0;
    let totalImages = 0, totalAssets = 0;

    for (let i = 0; i < products.length; i++) {
      const product = products[i];

      try {
        // Import product
        const result = await importProduct(product, vendorSourceId);

        if (result.action === 'inserted') {
          inserted++;
        } else {
          updated++;
        }

        // Import images
        const imgCount = await importImages(result.id, product);
        totalImages += imgCount;

        // Import assets
        const assetCount = await importAssets(result.id, product);
        totalAssets += assetCount;

        // Progress
        const pct = Math.round((i + 1) / products.length * 100);
        process.stdout.write(`\r   [${pct}%] ${result.action}: ${product.sku} (${imgCount} images, ${assetCount} assets)`);

      } catch (err) {
        errors++;
        console.error(`\n   ❌ Error importing ${product.sku}:`, err.message);
      }
    }

    // Summary
    console.log('\n');
    console.log('═══════════════════════════════════════════════════════');
    console.log('  IMPORT COMPLETE');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`  ✅ Inserted: ${inserted} products`);
    console.log(`  🔄 Updated:  ${updated} products`);
    console.log(`  ❌ Errors:   ${errors} products`);
    console.log(`  🖼️  Images:   ${totalImages} imported`);
    console.log(`  📎 Assets:   ${totalAssets} imported`);
    console.log('═══════════════════════════════════════════════════════');
    console.log('');

    // Save merged data to file
    const mergedPath = path.join(DOWNLOADS_FOLDER, `whirlpool_merged_${products.length}_products.json`);
    fs.writeFileSync(mergedPath, JSON.stringify({
      mergedAt: new Date().toISOString(),
      source: 'whirlpoolcentral.ca',
      totalProducts: products.length,
      products: products
    }, null, 2));
    console.log(`💾 Merged data saved to: ${mergedPath}`);
    console.log('');

  } catch (err) {
    console.error('❌ Import failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run
main();
