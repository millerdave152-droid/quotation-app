/**
 * Migration: Map existing product categories to normalized category IDs
 *
 * This script:
 * 1. Gets all unique (category, manufacturer) combinations
 * 2. Maps each to normalized category using CategoryMappingService
 * 3. Updates products with category_id and subcategory_id
 * 4. Reports unmapped categories for manual review
 *
 * Usage: node migrations/migrate-product-categories.js
 */

require('dotenv').config();
const { Pool } = require('pg');
const CategoryMappingService = require('../services/CategoryMappingService');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function migrate() {
  const mappingService = new CategoryMappingService(pool);

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  PRODUCT CATEGORY MIGRATION');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  try {
    // Get all unique category/manufacturer combinations with counts
    console.log('Step 1: Analyzing existing categories...');

    const categoriesResult = await pool.query(`
      SELECT
        category,
        manufacturer,
        COUNT(*) as count
      FROM products
      WHERE category IS NOT NULL AND category != ''
      GROUP BY category, manufacturer
      ORDER BY count DESC
    `);

    console.log(`   Found ${categoriesResult.rows.length} unique category/manufacturer combinations`);
    console.log('');

    // Get total product count
    const totalResult = await pool.query(`
      SELECT COUNT(*) as total FROM products WHERE category IS NOT NULL AND category != ''
    `);
    const totalProducts = parseInt(totalResult.rows[0].total);
    console.log(`   Total products with categories: ${totalProducts}`);
    console.log('');

    // Map each category
    console.log('Step 2: Mapping categories...');
    console.log('');

    const stats = {
      mapped: 0,
      unmapped: 0,
      categoryMappings: {},
      unmappedList: []
    };

    for (const row of categoriesResult.rows) {
      const mapping = await mappingService.mapCategory(row.category, row.manufacturer);
      const count = parseInt(row.count);

      if (mapping.categoryId) {
        stats.mapped += count;

        // Track which category they mapped to
        const catName = mapping.matchedCategory || `ID:${mapping.categoryId}`;
        if (!stats.categoryMappings[catName]) {
          stats.categoryMappings[catName] = { count: 0, sources: [] };
        }
        stats.categoryMappings[catName].count += count;
        if (stats.categoryMappings[catName].sources.length < 5) {
          stats.categoryMappings[catName].sources.push(row.category);
        }

        // Update products
        await pool.query(`
          UPDATE products
          SET category_id = $1, subcategory_id = $2
          WHERE category = $3 AND (manufacturer = $4 OR ($4 IS NULL AND manufacturer IS NULL))
        `, [mapping.categoryId, mapping.subcategoryId, row.category, row.manufacturer]);

      } else {
        stats.unmapped += count;
        stats.unmappedList.push({
          category: row.category,
          manufacturer: row.manufacturer,
          count
        });
      }
    }

    // Print mapping summary
    console.log('Step 3: Migration Summary');
    console.log('');
    console.log('─────────────────────────────────────────────────────────────────');
    console.log('MAPPED CATEGORIES:');
    console.log('─────────────────────────────────────────────────────────────────');

    const sortedMappings = Object.entries(stats.categoryMappings)
      .sort((a, b) => b[1].count - a[1].count);

    for (const [catName, data] of sortedMappings) {
      console.log(`\n  ${catName}: ${data.count} products`);
      console.log(`    Sources: ${data.sources.slice(0, 3).join(', ')}${data.sources.length > 3 ? '...' : ''}`);
    }

    console.log('');
    console.log('─────────────────────────────────────────────────────────────────');
    console.log('UNMAPPED CATEGORIES (Top 30):');
    console.log('─────────────────────────────────────────────────────────────────');

    const sortedUnmapped = stats.unmappedList.sort((a, b) => b.count - a.count);

    for (const item of sortedUnmapped.slice(0, 30)) {
      console.log(`  [${item.count}] "${item.category}" (${item.manufacturer || 'no manufacturer'})`);
    }

    if (sortedUnmapped.length > 30) {
      console.log(`  ... and ${sortedUnmapped.length - 30} more`);
    }

    // Final stats
    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  MIGRATION COMPLETE');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`  ✅ Products mapped:   ${stats.mapped} (${((stats.mapped / totalProducts) * 100).toFixed(1)}%)`);
    console.log(`  ⚠️  Products unmapped: ${stats.unmapped} (${((stats.unmapped / totalProducts) * 100).toFixed(1)}%)`);
    console.log(`  📊 Categories created: ${Object.keys(stats.categoryMappings).length}`);
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');

    // Verify migration
    console.log('Verification:');
    const verifyResult = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(category_id) as with_category,
        COUNT(subcategory_id) as with_subcategory
      FROM products
    `);

    console.log(`  Total products: ${verifyResult.rows[0].total}`);
    console.log(`  With category_id: ${verifyResult.rows[0].with_category}`);
    console.log(`  With subcategory_id: ${verifyResult.rows[0].with_subcategory}`);
    console.log('');

    // Show category breakdown
    const breakdownResult = await pool.query(`
      SELECT c.name, c.slug, COUNT(p.id) as count
      FROM categories c
      LEFT JOIN products p ON p.category_id = c.id
      WHERE c.level = 2
      GROUP BY c.id, c.name, c.slug
      ORDER BY count DESC
    `);

    console.log('Products by Category:');
    for (const row of breakdownResult.rows) {
      if (parseInt(row.count) > 0) {
        console.log(`  ${row.name}: ${row.count}`);
      }
    }
    console.log('');

  } catch (err) {
    console.error('Migration failed:', err);
    throw err;
  } finally {
    await pool.end();
  }
}

migrate().catch(console.error);
