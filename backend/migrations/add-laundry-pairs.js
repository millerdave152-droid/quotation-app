/**
 * Migration: Add Laundry Pairs
 *
 * Adds paired_product_id column to products table and populates it with
 * detected washer-dryer pairs based on model number patterns.
 *
 * Usage: node migrations/add-laundry-pairs.js
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

// Brand-specific pairing rules
const BRAND_PAIRING_RULES = {
  // GE/GE Profile: GTW491 -> GTD49, GFW550 -> GFD55
  'GE': {
    washerTodryer: (washerModel) => {
      // GTW491BMRDG -> GTD49
      // GFW550SMNWW -> GFD55
      // Replace W with D in position 2-3, truncate last digit of number
      const match = washerModel.match(/^(G[A-Z])(W)(\d{2,3})(\d)(.*)$/);
      if (match) {
        const prefix = match[1];
        const numbers = match[3]; // First 2-3 digits
        return `${prefix}D${numbers}`;
      }
      return null;
    }
  },
  'GE PROFILE': {
    washerTodryer: (washerModel) => {
      // PTW600BPRDG -> PTD60
      // PFW870SPVRS -> PFD87
      const match = washerModel.match(/^(P[A-Z])(W)(\d{2,3})(\d?)(.*)$/);
      if (match) {
        const prefix = match[1];
        const numbers = match[3];
        return `${prefix}D${numbers}`;
      }
      return null;
    }
  },
  'SAMSUNG': {
    washerTodryer: (washerModel) => {
      // WF45R6100AW -> DVE45R6100
      // Pattern: WF -> DVE/DVG, or WA -> DV
      if (washerModel.startsWith('WF')) {
        return 'DV' + washerModel.substring(2, 10);
      }
      if (washerModel.startsWith('WA')) {
        return 'DV' + washerModel.substring(2, 10);
      }
      return null;
    }
  },
  'LG': {
    washerTodryer: (washerModel) => {
      // WM3900HBA -> DLEX3900
      // Pattern: WM -> DLEX/DLE
      if (washerModel.startsWith('WM')) {
        return 'DLEX' + washerModel.substring(2, 6);
      }
      return null;
    }
  },
  'WHIRLPOOL': {
    washerTodryer: (washerModel) => {
      // WTW5000DW -> WED5000
      // WFW5605MW -> WED5605
      if (washerModel.startsWith('WTW')) {
        return 'WED' + washerModel.substring(3, 7);
      }
      if (washerModel.startsWith('WFW')) {
        return 'WED' + washerModel.substring(3, 7);
      }
      return null;
    }
  },
  'MAYTAG': {
    washerTodryer: (washerModel) => {
      // MTW -> MED, MVW -> MED, MHW -> MED
      const match = washerModel.match(/^M([A-Z])W(\d{4})(.*)$/);
      if (match) {
        return `MED${match[2]}`;
      }
      return null;
    }
  },
  'ELECTROLUX': {
    washerTodryer: (washerModel) => {
      // ELFW7638AW -> ELFE7637
      // Pattern: ELFW -> ELFE, similar numbers
      if (washerModel.startsWith('ELFW')) {
        return 'ELFE' + washerModel.substring(4, 8);
      }
      return null;
    }
  },
  'MOFFAT': {
    washerTodryer: (washerModel) => {
      // MTW201 -> MTX22 (approximate)
      const match = washerModel.match(/^MTW(\d{3})(.*)$/);
      if (match) {
        return `MTX${match[1].substring(0, 2)}`;
      }
      return null;
    }
  }
};

async function run() {
  console.log('=== LAUNDRY PAIRS MIGRATION ===\n');

  try {
    // Step 1: Add paired_product_id column if not exists
    console.log('Step 1: Adding paired_product_id column...');
    await pool.query(`
      ALTER TABLE products
      ADD COLUMN IF NOT EXISTS paired_product_id INTEGER REFERENCES products(id)
    `);
    console.log('  Column added (or already exists)\n');

    // Step 2: Fetch all washers and dryers
    console.log('Step 2: Fetching laundry products...');

    const washersResult = await pool.query(`
      SELECT id, model, manufacturer, category
      FROM products
      WHERE LOWER(category) LIKE '%washer%'
        AND LOWER(category) NOT LIKE '%dish%'
        AND LOWER(category) NOT LIKE '%dryer%'
        AND active = true
    `);

    const dryersResult = await pool.query(`
      SELECT id, model, manufacturer, category
      FROM products
      WHERE LOWER(category) LIKE '%dryer%'
        AND LOWER(category) NOT LIKE '%washer%'
        AND active = true
    `);

    const washers = washersResult.rows;
    const dryers = dryersResult.rows;

    console.log(`  Found ${washers.length} washers and ${dryers.length} dryers\n`);

    // Step 3: Match pairs using brand-specific rules
    console.log('Step 3: Detecting pairs using model patterns...\n');

    let pairsFound = 0;
    let pairsUpdated = 0;

    for (const washer of washers) {
      const brand = (washer.manufacturer || '').trim().toUpperCase();
      const washerModel = washer.model || '';

      // Try brand-specific rule first
      let matchedDryer = null;
      const brandRule = BRAND_PAIRING_RULES[brand];

      if (brandRule) {
        const dryerPattern = brandRule.washerTodryer(washerModel);
        if (dryerPattern) {
          // Find dryer that starts with the pattern
          matchedDryer = dryers.find(d =>
            d.manufacturer?.toUpperCase() === brand &&
            d.model?.toUpperCase().startsWith(dryerPattern.toUpperCase())
          );
        }
      }

      // Fallback: Generic number matching
      if (!matchedDryer) {
        const washerNumbers = washerModel.replace(/[^0-9]/g, '');
        if (washerNumbers.length >= 4) {
          matchedDryer = dryers.find(d => {
            if (d.manufacturer?.toUpperCase() !== brand) return false;
            const dryerNumbers = (d.model || '').replace(/[^0-9]/g, '');
            return dryerNumbers.length >= 4 && washerNumbers === dryerNumbers;
          });
        }
      }

      // Fallback: Model suffix matching (last 6 chars similar)
      if (!matchedDryer) {
        const washerSuffix = washerModel.slice(-6).toUpperCase();
        matchedDryer = dryers.find(d => {
          if (d.manufacturer?.toUpperCase() !== brand) return false;
          const dryerSuffix = (d.model || '').slice(-6).toUpperCase();
          return washerSuffix === dryerSuffix;
        });
      }

      if (matchedDryer) {
        pairsFound++;
        console.log(`  PAIR: ${washer.model} <-> ${matchedDryer.model} (${brand})`);

        // Update both products with paired_product_id
        await pool.query(
          'UPDATE products SET paired_product_id = $1 WHERE id = $2',
          [matchedDryer.id, washer.id]
        );
        await pool.query(
          'UPDATE products SET paired_product_id = $1 WHERE id = $2',
          [washer.id, matchedDryer.id]
        );
        pairsUpdated += 2;
      }
    }

    console.log(`\n=== SUMMARY ===`);
    console.log(`Pairs detected: ${pairsFound}`);
    console.log(`Products updated: ${pairsUpdated}`);

    // Step 4: Verify the pairs
    console.log('\nStep 4: Verifying pairs...');
    const verifyResult = await pool.query(`
      SELECT
        p1.model as washer_model,
        p1.manufacturer as washer_brand,
        p2.model as dryer_model,
        p2.manufacturer as dryer_brand
      FROM products p1
      JOIN products p2 ON p1.paired_product_id = p2.id
      WHERE LOWER(p1.category) LIKE '%washer%'
        AND LOWER(p1.category) NOT LIKE '%dryer%'
      LIMIT 10
    `);

    console.log('\nSample pairs in database:');
    verifyResult.rows.forEach(row => {
      console.log(`  ${row.washer_brand} ${row.washer_model} <-> ${row.dryer_model}`);
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
