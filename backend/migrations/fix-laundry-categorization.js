/**
 * Migration: Fix Laundry Categorization
 *
 * Audits and reports products that may be miscategorized as washers/dryers.
 * Uses model number patterns to detect products that are in the wrong category.
 *
 * Usage: node migrations/fix-laundry-categorization.js [--fix]
 *
 * Options:
 *   --fix    Actually update the database (default is dry-run/audit only)
 */

const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
  ssl: {
    rejectUnauthorized: false
  }
});

// DRYER model patterns - products matching these should be categorized as dryers
const DRYER_PATTERNS = [
  /^DVE\d/i,              // Samsung electric dryers (DVE45, DVE50, etc.)
  /^DVG\d/i,              // Samsung gas dryers
  /^DV\d{2}[A-Z]/i,       // Samsung older dryer pattern
  /^WED\d/i,              // Whirlpool electric dryers
  /^WGD\d/i,              // Whirlpool gas dryers
  /^MED\d/i,              // Maytag electric dryers
  /^MGD\d/i,              // Maytag gas dryers
  /^YMED\d/i,             // Maytag dryers (alternate)
  /^GTD\d/i,              // GE electric dryers
  /^GTD[A-Z]*\d/i,        // GE dryers extended pattern
  /^PTD\d/i,              // GE Profile dryers
  /^DLE[X]?\d/i,          // LG electric dryers (DLE, DLEX)
  /^DLG[X]?\d/i,          // LG gas dryers
  /^DLHC\d/i,             // LG heat pump dryers
  /^WTG\d/i,              // Bosch heat pump dryers (WTG86401UC, etc.)
  /^WQB\d/i,              // Bosch dryers (WQB245BGUC, etc.)
  /^ELFG\d/i,             // Electrolux gas dryers
  /^ELFE\d/i,             // Electrolux electric dryers
  /^EFME\d/i,             // Electrolux dryers
  /^EFMG\d/i,             // Electrolux gas dryers
];

// WASHER model patterns - products matching these should be categorized as washers
const WASHER_PATTERNS = [
  /^WF\d{2}[A-Z]/i,       // Samsung front load washers (WF45, WF50, etc.)
  /^WA\d{2}[A-Z]/i,       // Samsung top load washers
  /^WTW\d/i,              // Whirlpool top load washers
  /^WFW\d/i,              // Whirlpool front load washers
  /^MHW\d/i,              // Maytag front load washers
  /^MVW\d/i,              // Maytag top load washers
  /^GTW\d/i,              // GE top load washers
  /^GFW\d/i,              // GE front load washers
  /^PTW\d/i,              // GE Profile top load washers
  /^PFW\d/i,              // GE Profile front load washers
  /^WM\d{4}/i,            // LG front load washers (WM3600, WM4000, etc.)
  /^WT\d{4}/i,            // LG top load washers
  /^WAT\d/i,              // Bosch washers
  /^WAW\d/i,              // Bosch washers
  /^WAV\d/i,              // Bosch washers
  /^WGG\d/i,              // Bosch compact washers
  /^ELFW\d/i,             // Electrolux front load washers
  /^ELTW\d/i,             // Electrolux top load washers
  /^EFLS\d/i,             // Electrolux washers
];

/**
 * Detect appliance type from model number
 */
function detectType(model) {
  if (!model) return null;
  const m = model.toUpperCase();

  for (const pattern of DRYER_PATTERNS) {
    if (pattern.test(m)) return 'dryer';
  }
  for (const pattern of WASHER_PATTERNS) {
    if (pattern.test(m)) return 'washer';
  }
  return null;
}

/**
 * Check if category indicates washer
 */
function isCategoryWasher(category) {
  const cat = (category || '').toLowerCase();
  return cat.includes('washer') && !cat.includes('dryer') && !cat.includes('dish');
}

/**
 * Check if category indicates dryer
 */
function isCategoryDryer(category) {
  const cat = (category || '').toLowerCase();
  return cat.includes('dryer') && !cat.includes('washer') && !cat.includes('dish');
}

async function run() {
  const doFix = process.argv.includes('--fix');

  console.log('=== LAUNDRY CATEGORIZATION AUDIT ===\n');
  console.log(`Mode: ${doFix ? 'FIX (will update database)' : 'AUDIT ONLY (dry run)'}\n`);

  try {
    // Step 1: Fetch all products with laundry-related categories
    console.log('Step 1: Fetching laundry products...\n');

    const result = await pool.query(`
      SELECT id, model, name, manufacturer, category, category_id
      FROM products
      WHERE (
        LOWER(category) LIKE '%washer%'
        OR LOWER(category) LIKE '%dryer%'
        OR LOWER(category) LIKE '%laundry%'
        OR LOWER(category) LIKE '%w/m%'
        OR LOWER(category) LIKE '%fabric care%'
      )
      AND LOWER(category) NOT LIKE '%dish%'
      AND (active = true OR active IS NULL)
      ORDER BY manufacturer, model
    `);

    const products = result.rows;
    console.log(`  Found ${products.length} laundry products\n`);

    // Step 2: Analyze each product
    console.log('Step 2: Analyzing categorization...\n');

    const miscategorized = [];
    const ambiguous = [];
    const correct = [];

    for (const product of products) {
      const detectedType = detectType(product.model);
      const categoryIsWasher = isCategoryWasher(product.category);
      const categoryIsDryer = isCategoryDryer(product.category);

      if (!detectedType) {
        // Can't determine from model
        if (!categoryIsWasher && !categoryIsDryer) {
          ambiguous.push({
            ...product,
            issue: 'Unknown type - category is ambiguous',
            detectedType: null
          });
        }
        continue;
      }

      // Check for mismatch
      if (detectedType === 'dryer' && categoryIsWasher) {
        miscategorized.push({
          ...product,
          issue: 'Model indicates DRYER but category says washer',
          detectedType,
          shouldBe: 'dryer'
        });
      } else if (detectedType === 'washer' && categoryIsDryer) {
        miscategorized.push({
          ...product,
          issue: 'Model indicates WASHER but category says dryer',
          detectedType,
          shouldBe: 'washer'
        });
      } else {
        correct.push(product);
      }
    }

    // Step 3: Report findings
    console.log('=== AUDIT RESULTS ===\n');
    console.log(`Correctly categorized: ${correct.length}`);
    console.log(`Miscategorized: ${miscategorized.length}`);
    console.log(`Ambiguous (needs manual review): ${ambiguous.length}\n`);

    if (miscategorized.length > 0) {
      console.log('--- MISCATEGORIZED PRODUCTS ---\n');
      for (const p of miscategorized) {
        console.log(`  ID: ${p.id}`);
        console.log(`  Model: ${p.model}`);
        console.log(`  Manufacturer: ${p.manufacturer}`);
        console.log(`  Current Category: ${p.category}`);
        console.log(`  Issue: ${p.issue}`);
        console.log(`  Should Be: ${p.shouldBe}`);
        console.log('');
      }
    }

    if (ambiguous.length > 0 && ambiguous.length <= 20) {
      console.log('--- AMBIGUOUS PRODUCTS (needs manual review) ---\n');
      for (const p of ambiguous) {
        console.log(`  ID: ${p.id} | Model: ${p.model} | Category: ${p.category}`);
      }
      console.log('');
    } else if (ambiguous.length > 20) {
      console.log(`--- ${ambiguous.length} ambiguous products need manual review ---\n`);
    }

    // Step 4: Fix if requested
    if (doFix && miscategorized.length > 0) {
      console.log('Step 4: Fixing miscategorized products...\n');

      // Get category IDs for washers and dryers
      const catResult = await pool.query(`
        SELECT id, slug FROM categories
        WHERE slug IN ('washers', 'dryers')
      `);
      const categoryMap = {};
      catResult.rows.forEach(c => { categoryMap[c.slug] = c.id; });

      let fixed = 0;
      for (const p of miscategorized) {
        const newCategoryId = categoryMap[p.shouldBe + 's']; // washers or dryers

        if (newCategoryId) {
          // Update category_id to correct category
          await pool.query(
            'UPDATE products SET category_id = $1 WHERE id = $2',
            [newCategoryId, p.id]
          );
          console.log(`  Fixed: ${p.model} -> category_id = ${newCategoryId} (${p.shouldBe})`);
          fixed++;
        } else {
          console.log(`  WARNING: Could not find category for ${p.shouldBe}s`);
        }
      }

      console.log(`\n  Fixed ${fixed} products`);
    }

    console.log('\n=== AUDIT COMPLETE ===\n');

    // Summary for package builder
    console.log('RECOMMENDATION FOR PACKAGE BUILDER:');
    console.log('The PackageSelectionEngine now uses detectLaundryApplianceType() to');
    console.log('filter products at runtime, preventing this miscategorization issue.');
    if (miscategorized.length > 0) {
      console.log(`\nRun with --fix to update ${miscategorized.length} miscategorized products.`);
    }

  } catch (err) {
    console.error('Audit error:', err);
    throw err;
  } finally {
    await pool.end();
  }
}

run().catch(console.error);
