/**
 * Import Whirlpool Images into Database
 *
 * Reads whirlpool_images_*.json files and populates vendor_product_images table
 *
 * Usage: node scripts/import-whirlpool-images.js
 */

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

const IMAGES_FOLDER = 'C:\\Users\\WD-PC1\\OneDrive\\Desktop\\Whirlpool Files';

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log('  WHIRLPOOL IMAGE IMPORT');
  console.log('═══════════════════════════════════════════════════════');
  console.log('');

  try {
    // Find image JSON files
    const files = fs.readdirSync(IMAGES_FOLDER)
      .filter(f => f.startsWith('whirlpool_images_') && f.endsWith('.json'));

    if (files.length === 0) {
      console.log('❌ No whirlpool_images_*.json files found');
      console.log('   Run the image extractor in your browser first.');
      process.exit(1);
    }

    console.log(`📁 Found ${files.length} image files:`);
    files.forEach(f => console.log(`   - ${f}`));
    console.log('');

    // Merge all image files
    const allImages = {};
    for (const file of files) {
      const content = fs.readFileSync(path.join(IMAGES_FOLDER, file), 'utf8');
      const data = JSON.parse(content);

      if (data.images) {
        Object.assign(allImages, data.images);
      }
      console.log(`   ✅ Loaded ${Object.keys(data.images || {}).length} products from ${file}`);
    }

    console.log(`\n📊 Total: ${Object.keys(allImages).length} products with images\n`);

    // Get vendor products
    const vendorResult = await pool.query(
      `SELECT id FROM vendor_sources WHERE name ILIKE '%whirlpool%' LIMIT 1`
    );

    if (vendorResult.rows.length === 0) {
      console.log('❌ Whirlpool vendor source not found');
      process.exit(1);
    }

    const vendorSourceId = vendorResult.rows[0].id;

    // Import images
    let imported = 0;
    let updated = 0;
    let notFound = 0;
    let errors = 0;

    for (const [sku, imageData] of Object.entries(allImages)) {
      try {
        // Find the product by model number
        const productResult = await pool.query(
          `SELECT id FROM vendor_products WHERE model_number = $1 AND vendor_source_id = $2`,
          [sku, vendorSourceId]
        );

        if (productResult.rows.length === 0) {
          notFound++;
          continue;
        }

        const productId = productResult.rows[0].id;

        // Delete existing images for this product
        await pool.query(
          `DELETE FROM vendor_product_images WHERE vendor_product_id = $1`,
          [productId]
        );

        // Insert hero image first
        if (imageData.hero) {
          await pool.query(`
            INSERT INTO vendor_product_images (vendor_product_id, image_type, original_url, is_primary, sort_order)
            VALUES ($1, 'hero', $2, true, 0)
          `, [productId, imageData.hero]);
          imported++;
        }

        // Insert gallery images
        if (imageData.gallery && imageData.gallery.length > 0) {
          for (let i = 0; i < imageData.gallery.length; i++) {
            const img = imageData.gallery[i];
            if (img.url && img.url !== imageData.hero) {
              await pool.query(`
                INSERT INTO vendor_product_images (vendor_product_id, image_type, original_url, sort_order, alt_text)
                VALUES ($1, $2, $3, $4, $5)
              `, [productId, img.type || 'gallery', img.url, i + 1, img.alt || null]);
              imported++;
            }
          }
        }

        updated++;
        process.stdout.write(`\r   Updated ${updated} products, ${imported} images...`);

      } catch (err) {
        errors++;
        console.error(`\n   ❌ Error processing ${sku}:`, err.message);
      }
    }

    console.log('\n');
    console.log('═══════════════════════════════════════════════════════');
    console.log('  IMPORT COMPLETE');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`  ✅ Products updated: ${updated}`);
    console.log(`  🖼️  Images imported: ${imported}`);
    console.log(`  ⚠️  SKUs not found: ${notFound}`);
    console.log(`  ❌ Errors: ${errors}`);
    console.log('═══════════════════════════════════════════════════════');
    console.log('');

  } catch (err) {
    console.error('❌ Import failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
