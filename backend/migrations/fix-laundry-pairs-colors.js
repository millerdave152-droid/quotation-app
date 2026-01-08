/**
 * Migration: Fix Laundry Pairs with Color Matching
 *
 * Improves washer-dryer pairing to match by:
 * 1. Same brand
 * 2. Same base model series
 * 3. Same color suffix (last 2-3 characters)
 *
 * Usage: node migrations/fix-laundry-pairs-colors.js
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
  ssl: { rejectUnauthorized: false }
});

// Color suffix patterns (last 2-3 chars of model number)
const COLOR_SUFFIXES = {
  'WW': 'white',
  'HW': 'white',
  'SW': 'white',
  'RW': 'white',
  'MW': 'white',
  'AW': 'white',
  'BW': 'white',
  'DW': 'white',
  'EW': 'white',
  'GW': 'white',
  'NW': 'white',
  'PW': 'white',
  'TW': 'white',
  'UW': 'white',
  'HC': 'graphite',
  'DC': 'graphite',
  'MC': 'graphite',
  'RC': 'graphite',
  'MBK': 'black',
  'BK': 'black',
  'DG': 'graphite',
  'RDG': 'graphite',
  'NDG': 'graphite',
  'RU': 'ruby',
  'RS': 'stainless',
  'WS': 'stainless',
  'AA': 'alpine',
  'AW': 'alpine white',
  'VDS': 'slate',
  'VRS': 'slate'
};

/**
 * Extract color suffix from model number
 */
function getColorSuffix(model) {
  if (!model) return null;

  // Check 3-char suffixes first
  const suffix3 = model.slice(-3).toUpperCase();
  if (COLOR_SUFFIXES[suffix3]) return suffix3;

  // Check 2-char suffixes
  const suffix2 = model.slice(-2).toUpperCase();
  if (COLOR_SUFFIXES[suffix2]) return suffix2;

  return suffix2; // Return last 2 chars as fallback
}

/**
 * Extract base model (without color suffix)
 */
function getBaseModel(model) {
  if (!model) return null;

  // Remove last 2-3 chars (color suffix)
  // But keep the core model number
  const suffix = getColorSuffix(model);
  if (suffix && model.toUpperCase().endsWith(suffix)) {
    return model.slice(0, -suffix.length).toUpperCase();
  }
  return model.toUpperCase();
}

/**
 * Extract numeric series from model
 */
function getModelSeries(model) {
  if (!model) return null;
  const numbers = model.replace(/[^0-9]/g, '');
  return numbers.length >= 3 ? numbers.substring(0, 4) : null;
}

async function run() {
  console.log('=== FIX LAUNDRY PAIRS WITH COLOR MATCHING ===\n');

  try {
    // Step 1: Clear existing pairs
    console.log('Step 1: Clearing existing pairs...');
    await pool.query('UPDATE products SET paired_product_id = NULL WHERE paired_product_id IS NOT NULL');
    console.log('  Cleared all existing pairs\n');

    // Step 2: Fetch all washers and dryers
    console.log('Step 2: Fetching laundry products...');

    const washersResult = await pool.query(`
      SELECT id, model, manufacturer, category, color, name
      FROM products
      WHERE LOWER(category) LIKE '%washer%'
        AND LOWER(category) NOT LIKE '%dish%'
        AND LOWER(category) NOT LIKE '%dryer%'
        AND active = true
      ORDER BY manufacturer, model
    `);

    const dryersResult = await pool.query(`
      SELECT id, model, manufacturer, category, color, name
      FROM products
      WHERE LOWER(category) LIKE '%dryer%'
        AND LOWER(category) NOT LIKE '%washer%'
        AND active = true
      ORDER BY manufacturer, model
    `);

    const washers = washersResult.rows;
    const dryers = dryersResult.rows;

    console.log(`  Found ${washers.length} washers and ${dryers.length} dryers\n`);

    // Step 3: Build dryer lookup by brand and base model
    console.log('Step 3: Building dryer index...');
    const dryerIndex = {};

    for (const dryer of dryers) {
      const brand = (dryer.manufacturer || '').trim().toUpperCase();
      const baseModel = getBaseModel(dryer.model);
      const series = getModelSeries(dryer.model);
      const colorSuffix = getColorSuffix(dryer.model);

      if (!dryerIndex[brand]) dryerIndex[brand] = {};
      if (!dryerIndex[brand][series]) dryerIndex[brand][series] = [];

      dryerIndex[brand][series].push({
        ...dryer,
        baseModel,
        series,
        colorSuffix
      });
    }

    // Step 4: Match pairs with color matching
    console.log('Step 4: Matching pairs with color priority...\n');

    let pairsFound = 0;
    let exactColorMatches = 0;
    let fallbackMatches = 0;

    for (const washer of washers) {
      const brand = (washer.manufacturer || '').trim().toUpperCase();
      const washerSeries = getModelSeries(washer.model);
      const washerColorSuffix = getColorSuffix(washer.model);
      const washerBaseModel = getBaseModel(washer.model);

      if (!washerSeries) continue;

      // Find dryers of same brand and similar series
      const brandDryers = dryerIndex[brand] || {};
      let matchedDryer = null;
      let matchType = '';

      // Strategy 1: Exact series and color match
      const sameSeries = brandDryers[washerSeries] || [];
      for (const dryer of sameSeries) {
        if (dryer.colorSuffix === washerColorSuffix) {
          matchedDryer = dryer;
          matchType = 'exact';
          exactColorMatches++;
          break;
        }
      }

      // Strategy 2: Same series, similar color family
      if (!matchedDryer && sameSeries.length > 0) {
        const washerColorFamily = COLOR_SUFFIXES[washerColorSuffix] || 'unknown';
        for (const dryer of sameSeries) {
          const dryerColorFamily = COLOR_SUFFIXES[dryer.colorSuffix] || 'unknown';
          if (washerColorFamily === dryerColorFamily) {
            matchedDryer = dryer;
            matchType = 'family';
            break;
          }
        }
      }

      // Strategy 3: Same series, any color (last resort)
      if (!matchedDryer && sameSeries.length > 0) {
        matchedDryer = sameSeries[0];
        matchType = 'series';
        fallbackMatches++;
      }

      // Strategy 4: Adjacent series numbers (e.g., 5605 washer -> 5605 dryer)
      if (!matchedDryer) {
        for (const [series, dryerList] of Object.entries(brandDryers)) {
          // Check if series numbers are within 10 of each other
          const washerNum = parseInt(washerSeries) || 0;
          const dryerNum = parseInt(series) || 0;
          if (Math.abs(washerNum - dryerNum) <= 10) {
            // Prefer same color
            for (const dryer of dryerList) {
              if (dryer.colorSuffix === washerColorSuffix) {
                matchedDryer = dryer;
                matchType = 'adjacent-exact';
                exactColorMatches++;
                break;
              }
            }
            if (!matchedDryer && dryerList.length > 0) {
              matchedDryer = dryerList[0];
              matchType = 'adjacent';
              fallbackMatches++;
            }
            if (matchedDryer) break;
          }
        }
      }

      if (matchedDryer) {
        pairsFound++;

        const colorMatch = matchedDryer.colorSuffix === washerColorSuffix ? '✓' : '⚠';
        console.log(`  ${colorMatch} PAIR [${matchType}]: ${washer.model} <-> ${matchedDryer.model} (${brand})`);

        // Update both products with paired_product_id
        await pool.query(
          'UPDATE products SET paired_product_id = $1 WHERE id = $2',
          [matchedDryer.id, washer.id]
        );
        await pool.query(
          'UPDATE products SET paired_product_id = $1 WHERE id = $2',
          [washer.id, matchedDryer.id]
        );
      }
    }

    console.log(`\n=== SUMMARY ===`);
    console.log(`Total pairs: ${pairsFound}`);
    console.log(`Exact color matches: ${exactColorMatches}`);
    console.log(`Fallback matches: ${fallbackMatches}`);

    // Step 5: Verify color-matched pairs
    console.log('\nStep 5: Sample pairs with color info...');
    const verifyResult = await pool.query(`
      SELECT
        p1.model as washer_model,
        p1.manufacturer as brand,
        p2.model as dryer_model,
        p1.color as washer_color,
        p2.color as dryer_color
      FROM products p1
      JOIN products p2 ON p1.paired_product_id = p2.id
      WHERE LOWER(p1.category) LIKE '%washer%'
        AND LOWER(p1.category) NOT LIKE '%dryer%'
      LIMIT 15
    `);

    console.log('\nVerified pairs:');
    verifyResult.rows.forEach(row => {
      const wSuffix = getColorSuffix(row.washer_model);
      const dSuffix = getColorSuffix(row.dryer_model);
      const match = wSuffix === dSuffix ? '✓' : '⚠';
      console.log(`  ${match} ${row.brand}: ${row.washer_model} (${wSuffix}) <-> ${row.dryer_model} (${dSuffix})`);
    });

    console.log('\n=== MIGRATION COMPLETE ===\n');

  } catch (err) {
    console.error('Migration error:', err);
    throw err;
  } finally {
    await pool.end();
  }
}

run().catch(console.error);
