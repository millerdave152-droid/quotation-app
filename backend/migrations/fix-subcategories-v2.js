/**
 * Subcategory Migration V2 - Targeted fixes for remaining products
 * Handles miscategorized items and specific manufacturer patterns
 */
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

// Category and subcategory IDs
const CATEGORIES = {
  REFRIGERATORS: 6,
  WASHERS: 7,
  DRYERS: 8,
  DISHWASHERS: 9,
  RANGES: 10,
  COOKTOPS: 11,
  WALL_OVENS: 12,
  MICROWAVES: 13,
  RANGE_HOODS: 14
};

const SUBCATEGORIES = {
  // Refrigerators
  FRENCH_DOOR: 32,
  SIDE_BY_SIDE: 33,
  TOP_FREEZER: 34,
  BOTTOM_FREEZER: 35,
  COUNTER_DEPTH: 36,
  // Washers
  FRONT_LOAD_WASHER: 37,
  TOP_LOAD_WASHER: 38,
  // Dryers
  ELECTRIC_DRYER: 39,
  GAS_DRYER: 40,
  HEAT_PUMP_DRYER: 41,
  // Ranges
  ELECTRIC_RANGE: 42,
  GAS_RANGE: 43,
  DUAL_FUEL_RANGE: 44,
  INDUCTION_RANGE: 45,
  SLIDE_IN_RANGE: 46,
  FREESTANDING_RANGE: 47,
  // Cooktops
  GAS_COOKTOP: 48,
  ELECTRIC_COOKTOP: 49,
  INDUCTION_COOKTOP: 50,
  // Wall Ovens
  SINGLE_WALL_OVEN: 51,
  DOUBLE_WALL_OVEN: 52,
  COMBO_WALL_OVEN: 53,
  // Microwaves
  COUNTERTOP_MW: 54,
  OTR_MW: 55,
  BUILTIN_MW: 56,
  DRAWER_MW: 57,
  // Range Hoods
  UNDER_CABINET_HOOD: 58,
  WALL_MOUNT_HOOD: 59,
  ISLAND_MOUNT_HOOD: 60,
  DOWNDRAFT_HOOD: 61
};

async function fixMiscategorizedProducts() {
  console.log('\n--- FIXING MISCATEGORIZED PRODUCTS ---\n');

  // 1. LG "W/M" category contains dryers - move them to Dryers
  const lgDryers = await pool.query(`
    UPDATE products
    SET category_id = $1, subcategory_id = $2
    WHERE category_id = $3
      AND subcategory_id IS NULL
      AND (model LIKE 'DL%' OR model LIKE 'DLGX%' OR model LIKE 'DLG%')
    RETURNING id, model
  `, [CATEGORIES.DRYERS, SUBCATEGORIES.GAS_DRYER, CATEGORIES.WASHERS]);
  console.log(`Fixed ${lgDryers.rows.length} LG dryers from W/M category`);

  // 2. LG DLE models are electric dryers
  const lgElectricDryers = await pool.query(`
    UPDATE products
    SET subcategory_id = $1
    WHERE category_id = $2
      AND model LIKE 'DLE%'
    RETURNING id
  `, [SUBCATEGORIES.ELECTRIC_DRYER, CATEGORIES.DRYERS]);
  console.log(`Fixed ${lgElectricDryers.rows.length} LG electric dryer subcategories`);

  // 3. Samsung DVE = Electric, DVG = Gas
  await pool.query(`
    UPDATE products SET subcategory_id = $1
    WHERE category_id = $2 AND subcategory_id IS NULL AND model LIKE 'DVE%'
  `, [SUBCATEGORIES.ELECTRIC_DRYER, CATEGORIES.DRYERS]);

  await pool.query(`
    UPDATE products SET subcategory_id = $1
    WHERE category_id = $2 AND subcategory_id IS NULL AND model LIKE 'DVG%'
  `, [SUBCATEGORIES.GAS_DRYER, CATEGORIES.DRYERS]);
}

async function fixRefrigeratorSubcategories() {
  console.log('\n--- FIXING REFRIGERATOR SUBCATEGORIES ---\n');

  // GE bottom freezer
  let result = await pool.query(`
    UPDATE products SET subcategory_id = $1
    WHERE category_id = $2 AND subcategory_id IS NULL
      AND manufacturer = 'GE'
      AND (model LIKE 'GDE%' OR model LIKE 'GBE%')
    RETURNING id
  `, [SUBCATEGORIES.BOTTOM_FREEZER, CATEGORIES.REFRIGERATORS]);
  console.log(`GE Bottom Freezer: ${result.rows.length}`);

  // Café french door (most Café fridges are French Door)
  result = await pool.query(`
    UPDATE products SET subcategory_id = $1
    WHERE category_id = $2 AND subcategory_id IS NULL
      AND manufacturer = 'CAFÉ'
      AND category = 'REFRIGERATOR'
    RETURNING id
  `, [SUBCATEGORIES.FRENCH_DOOR, CATEGORIES.REFRIGERATORS]);
  console.log(`Café French Door: ${result.rows.length}`);

  // Jenn-Air built-in are mostly French Door/Counter Depth
  result = await pool.query(`
    UPDATE products SET subcategory_id = $1
    WHERE category_id = $2 AND subcategory_id IS NULL
      AND manufacturer = 'JENN-AIR'
      AND category LIKE '%Built-In Refrigeration%'
    RETURNING id
  `, [SUBCATEGORIES.FRENCH_DOOR, CATEGORIES.REFRIGERATORS]);
  console.log(`Jenn-Air Built-In: ${result.rows.length}`);

  // Danby compact fridges - bottom freezer is most common
  result = await pool.query(`
    UPDATE products SET subcategory_id = $1
    WHERE category_id = $2 AND subcategory_id IS NULL
      AND manufacturer = 'DANBY'
      AND category = 'Refrigerator'
      AND name NOT LIKE '%Wine%' AND name NOT LIKE '%Beverage%'
    RETURNING id
  `, [SUBCATEGORIES.BOTTOM_FREEZER, CATEGORIES.REFRIGERATORS]);
  console.log(`Danby Compact: ${result.rows.length}`);

  // Hisense fridges - detect by model
  result = await pool.query(`
    UPDATE products SET subcategory_id = $1
    WHERE category_id = $2 AND subcategory_id IS NULL
      AND manufacturer = 'HISENSE'
      AND (category LIKE '%Fridge%' AND category NOT LIKE '%Wine%')
    RETURNING id
  `, [SUBCATEGORIES.BOTTOM_FREEZER, CATEGORIES.REFRIGERATORS]);
  console.log(`Hisense Fridges: ${result.rows.length}`);

  // Thermador built-in
  result = await pool.query(`
    UPDATE products SET subcategory_id = $1
    WHERE category_id = $2 AND subcategory_id IS NULL
      AND manufacturer = 'THERMADOR'
    RETURNING id
  `, [SUBCATEGORIES.FRENCH_DOOR, CATEGORIES.REFRIGERATORS]);
  console.log(`Thermador: ${result.rows.length}`);

  // Thor Kitchen fridges
  result = await pool.query(`
    UPDATE products SET subcategory_id = $1
    WHERE category_id = $2 AND subcategory_id IS NULL
      AND manufacturer = 'THOR KITCHEN'
      AND category LIKE '%Refrigerator%'
    RETURNING id
  `, [SUBCATEGORIES.FRENCH_DOOR, CATEGORIES.REFRIGERATORS]);
  console.log(`Thor Kitchen: ${result.rows.length}`);

  // Bosch built-in column refrigerators (24" FS are bottom freezer)
  result = await pool.query(`
    UPDATE products SET subcategory_id = $1
    WHERE category_id = $2 AND subcategory_id IS NULL
      AND manufacturer = 'BOSCH'
      AND category LIKE '%24" FS%'
    RETURNING id
  `, [SUBCATEGORIES.BOTTOM_FREEZER, CATEGORIES.REFRIGERATORS]);
  console.log(`Bosch 24" FS: ${result.rows.length}`);

  // LG remaining refrigerators
  result = await pool.query(`
    UPDATE products SET subcategory_id = $1
    WHERE category_id = $2 AND subcategory_id IS NULL
      AND manufacturer = 'LG'
      AND category = 'REF'
      AND model NOT LIKE 'LK%'
    RETURNING id
  `, [SUBCATEGORIES.FRENCH_DOOR, CATEGORIES.REFRIGERATORS]);
  console.log(`LG REF: ${result.rows.length}`);
}

async function fixRangeSubcategories() {
  console.log('\n--- FIXING RANGE SUBCATEGORIES ---\n');

  // MVP ranges - detect fuel type from name
  let result = await pool.query(`
    UPDATE products SET subcategory_id = $1
    WHERE category_id = $2 AND subcategory_id IS NULL
      AND manufacturer = 'MVP'
      AND (name ILIKE '%gas%' OR name ILIKE '%propane%')
    RETURNING id
  `, [SUBCATEGORIES.GAS_RANGE, CATEGORIES.RANGES]);
  console.log(`MVP Gas Ranges: ${result.rows.length}`);

  result = await pool.query(`
    UPDATE products SET subcategory_id = $1
    WHERE category_id = $2 AND subcategory_id IS NULL
      AND manufacturer = 'MVP'
      AND (name ILIKE '%electric%' OR name ILIKE '%induction%')
    RETURNING id
  `, [SUBCATEGORIES.ELECTRIC_RANGE, CATEGORIES.RANGES]);
  console.log(`MVP Electric Ranges: ${result.rows.length}`);

  // MVP remaining (assume gas for professional ranges)
  result = await pool.query(`
    UPDATE products SET subcategory_id = $1
    WHERE category_id = $2 AND subcategory_id IS NULL
      AND manufacturer = 'MVP'
    RETURNING id
  `, [SUBCATEGORIES.GAS_RANGE, CATEGORIES.RANGES]);
  console.log(`MVP Remaining: ${result.rows.length}`);

  // Café ranges - detect by model prefix
  result = await pool.query(`
    UPDATE products SET subcategory_id = $1
    WHERE category_id = $2 AND subcategory_id IS NULL
      AND manufacturer = 'CAFÉ'
      AND (model LIKE 'CGY%' OR model LIKE 'CGB%' OR model LIKE 'CGS%')
    RETURNING id
  `, [SUBCATEGORIES.GAS_RANGE, CATEGORIES.RANGES]);
  console.log(`Café Gas Ranges: ${result.rows.length}`);

  result = await pool.query(`
    UPDATE products SET subcategory_id = $1
    WHERE category_id = $2 AND subcategory_id IS NULL
      AND manufacturer = 'CAFÉ'
      AND (model LIKE 'CES%' OR model LIKE 'CEP%' OR model LIKE 'CHS%')
    RETURNING id
  `, [SUBCATEGORIES.ELECTRIC_RANGE, CATEGORIES.RANGES]);
  console.log(`Café Electric Ranges: ${result.rows.length}`);

  result = await pool.query(`
    UPDATE products SET subcategory_id = $1
    WHERE category_id = $2 AND subcategory_id IS NULL
      AND manufacturer = 'CAFÉ'
      AND model LIKE 'C2Y%'
    RETURNING id
  `, [SUBCATEGORIES.DUAL_FUEL_RANGE, CATEGORIES.RANGES]);
  console.log(`Café Dual Fuel: ${result.rows.length}`);

  // GE ranges
  result = await pool.query(`
    UPDATE products SET subcategory_id = $1
    WHERE category_id = $2 AND subcategory_id IS NULL
      AND manufacturer IN ('GE', 'GE PROFILE')
      AND (model LIKE 'JB%' OR model LIKE 'JS%' OR model LIKE 'PB%' OR model LIKE 'PS%')
      AND model NOT LIKE 'JBS%G%' AND model NOT LIKE 'JGS%'
    RETURNING id
  `, [SUBCATEGORIES.ELECTRIC_RANGE, CATEGORIES.RANGES]);
  console.log(`GE Electric: ${result.rows.length}`);

  result = await pool.query(`
    UPDATE products SET subcategory_id = $1
    WHERE category_id = $2 AND subcategory_id IS NULL
      AND manufacturer IN ('GE', 'GE PROFILE')
      AND (model LIKE 'JGB%' OR model LIKE 'JGS%' OR model LIKE 'PGS%' OR model LIKE 'PGB%')
    RETURNING id
  `, [SUBCATEGORIES.GAS_RANGE, CATEGORIES.RANGES]);
  console.log(`GE Gas: ${result.rows.length}`);

  // Jenn-Air ranges - JDRP/JGRP = Gas, JDSP = Dual Fuel
  result = await pool.query(`
    UPDATE products SET subcategory_id = $1
    WHERE category_id = $2 AND subcategory_id IS NULL
      AND manufacturer = 'JENN-AIR'
      AND (model LIKE 'JDRP%' OR model LIKE 'JGRP%')
    RETURNING id
  `, [SUBCATEGORIES.GAS_RANGE, CATEGORIES.RANGES]);
  console.log(`Jenn-Air Gas: ${result.rows.length}`);

  result = await pool.query(`
    UPDATE products SET subcategory_id = $1
    WHERE category_id = $2 AND subcategory_id IS NULL
      AND manufacturer = 'JENN-AIR'
      AND model LIKE 'JDSP%'
    RETURNING id
  `, [SUBCATEGORIES.DUAL_FUEL_RANGE, CATEGORIES.RANGES]);
  console.log(`Jenn-Air Dual Fuel: ${result.rows.length}`);

  // Fulgor Milano - detect by model
  result = await pool.query(`
    UPDATE products SET subcategory_id = $1
    WHERE category_id = $2 AND subcategory_id IS NULL
      AND manufacturer = 'FULGOR MILANO'
      AND (model LIKE '%DF%' OR model LIKE '%DFMX%')
    RETURNING id
  `, [SUBCATEGORIES.DUAL_FUEL_RANGE, CATEGORIES.RANGES]);
  console.log(`Fulgor Dual Fuel: ${result.rows.length}`);

  result = await pool.query(`
    UPDATE products SET subcategory_id = $1
    WHERE category_id = $2 AND subcategory_id IS NULL
      AND manufacturer = 'FULGOR MILANO'
      AND (model LIKE '%G%MX%' OR model LIKE 'F4G%' OR model LIKE 'F6G%')
    RETURNING id
  `, [SUBCATEGORIES.GAS_RANGE, CATEGORIES.RANGES]);
  console.log(`Fulgor Gas: ${result.rows.length}`);

  // Bertazzoni - already have patterns but check for remaining
  result = await pool.query(`
    UPDATE products SET subcategory_id = $1
    WHERE category_id = $2 AND subcategory_id IS NULL
      AND manufacturer = 'BERTAZZONI'
      AND category = 'Cooking'
      AND (model LIKE '%GM%' OR model LIKE '%GAM%')
    RETURNING id
  `, [SUBCATEGORIES.GAS_RANGE, CATEGORIES.RANGES]);
  console.log(`Bertazzoni Gas: ${result.rows.length}`);

  result = await pool.query(`
    UPDATE products SET subcategory_id = $1
    WHERE category_id = $2 AND subcategory_id IS NULL
      AND manufacturer = 'BERTAZZONI'
      AND model LIKE '%FEP%'
    RETURNING id
  `, [SUBCATEGORIES.DUAL_FUEL_RANGE, CATEGORIES.RANGES]);
  console.log(`Bertazzoni Dual Fuel: ${result.rows.length}`);

  // Wolf/Miele/Thermador professional ranges (mostly dual fuel)
  result = await pool.query(`
    UPDATE products SET subcategory_id = $1
    WHERE category_id = $2 AND subcategory_id IS NULL
      AND manufacturer IN ('WOLF', 'MIELE', 'THERMADOR')
      AND model LIKE 'DF%'
    RETURNING id
  `, [SUBCATEGORIES.DUAL_FUEL_RANGE, CATEGORIES.RANGES]);
  console.log(`Premium Dual Fuel: ${result.rows.length}`);
}

async function fixRangeHoodSubcategories() {
  console.log('\n--- FIXING RANGE HOOD SUBCATEGORIES ---\n');

  // Falmec - detect by model patterns
  let result = await pool.query(`
    UPDATE products SET subcategory_id = $1
    WHERE category_id = $2 AND subcategory_id IS NULL
      AND manufacturer = 'FALMEC'
      AND (model LIKE 'FDLUM%' OR model LIKE '%LUM%')
    RETURNING id
  `, [SUBCATEGORIES.UNDER_CABINET_HOOD, CATEGORIES.RANGE_HOODS]);
  console.log(`Falmec Under Cabinet: ${result.rows.length}`);

  result = await pool.query(`
    UPDATE products SET subcategory_id = $1
    WHERE category_id = $2 AND subcategory_id IS NULL
      AND manufacturer = 'FALMEC'
      AND (model LIKE 'FDMIR%' OR model LIKE 'FDMOV%' OR model LIKE '%WALL%')
    RETURNING id
  `, [SUBCATEGORIES.WALL_MOUNT_HOOD, CATEGORIES.RANGE_HOODS]);
  console.log(`Falmec Wall Mount: ${result.rows.length}`);

  result = await pool.query(`
    UPDATE products SET subcategory_id = $1
    WHERE category_id = $2 AND subcategory_id IS NULL
      AND manufacturer = 'FALMEC'
      AND model LIKE '%ISL%'
    RETURNING id
  `, [SUBCATEGORIES.ISLAND_MOUNT_HOOD, CATEGORIES.RANGE_HOODS]);
  console.log(`Falmec Island: ${result.rows.length}`);

  // Falmec remaining (default to wall mount)
  result = await pool.query(`
    UPDATE products SET subcategory_id = $1
    WHERE category_id = $2 AND subcategory_id IS NULL
      AND manufacturer = 'FALMEC'
    RETURNING id
  `, [SUBCATEGORIES.WALL_MOUNT_HOOD, CATEGORIES.RANGE_HOODS]);
  console.log(`Falmec Remaining: ${result.rows.length}`);

  // Bosch ventilation
  result = await pool.query(`
    UPDATE products SET subcategory_id = $1
    WHERE category_id = $2 AND subcategory_id IS NULL
      AND manufacturer = 'BOSCH'
      AND (model LIKE 'DUH%' OR model LIKE 'DHL%')
    RETURNING id
  `, [SUBCATEGORIES.UNDER_CABINET_HOOD, CATEGORIES.RANGE_HOODS]);
  console.log(`Bosch Under Cabinet: ${result.rows.length}`);

  result = await pool.query(`
    UPDATE products SET subcategory_id = $1
    WHERE category_id = $2 AND subcategory_id IS NULL
      AND manufacturer = 'BOSCH'
      AND (model LIKE 'HCP%' OR model LIKE 'HCB%' OR model LIKE 'HCG%')
    RETURNING id
  `, [SUBCATEGORIES.WALL_MOUNT_HOOD, CATEGORIES.RANGE_HOODS]);
  console.log(`Bosch Wall Mount: ${result.rows.length}`);

  // Frigidaire hoods
  result = await pool.query(`
    UPDATE products SET subcategory_id = $1
    WHERE category_id = $2 AND subcategory_id IS NULL
      AND manufacturer IN ('FRIGIDAIRE', 'FRIGIDAIRE PROFESSIONAL')
      AND category LIKE '%Hood%'
    RETURNING id
  `, [SUBCATEGORIES.WALL_MOUNT_HOOD, CATEGORIES.RANGE_HOODS]);
  console.log(`Frigidaire Hoods: ${result.rows.length}`);

  // Fulgor Milano hoods
  result = await pool.query(`
    UPDATE products SET subcategory_id = $1
    WHERE category_id = $2 AND subcategory_id IS NULL
      AND manufacturer = 'FULGOR MILANO'
    RETURNING id
  `, [SUBCATEGORIES.WALL_MOUNT_HOOD, CATEGORIES.RANGE_HOODS]);
  console.log(`Fulgor Milano Hoods: ${result.rows.length}`);

  // KitchenAid hoods
  result = await pool.query(`
    UPDATE products SET subcategory_id = $1
    WHERE category_id = $2 AND subcategory_id IS NULL
      AND manufacturer = 'KITCHENAID'
      AND category LIKE '%Hood%' AND category NOT LIKE '%blower%'
    RETURNING id
  `, [SUBCATEGORIES.WALL_MOUNT_HOOD, CATEGORIES.RANGE_HOODS]);
  console.log(`KitchenAid Hoods: ${result.rows.length}`);

  // Thor Kitchen hoods
  result = await pool.query(`
    UPDATE products SET subcategory_id = $1
    WHERE category_id = $2 AND subcategory_id IS NULL
      AND manufacturer = 'THOR KITCHEN'
    RETURNING id
  `, [SUBCATEGORIES.WALL_MOUNT_HOOD, CATEGORIES.RANGE_HOODS]);
  console.log(`Thor Kitchen Hoods: ${result.rows.length}`);

  // Danby hoods
  result = await pool.query(`
    UPDATE products SET subcategory_id = $1
    WHERE category_id = $2 AND subcategory_id IS NULL
      AND manufacturer = 'DANBY'
    RETURNING id
  `, [SUBCATEGORIES.UNDER_CABINET_HOOD, CATEGORIES.RANGE_HOODS]);
  console.log(`Danby Hoods: ${result.rows.length}`);

  // Miele hoods
  result = await pool.query(`
    UPDATE products SET subcategory_id = $1
    WHERE category_id = $2 AND subcategory_id IS NULL
      AND manufacturer = 'MIELE'
    RETURNING id
  `, [SUBCATEGORIES.WALL_MOUNT_HOOD, CATEGORIES.RANGE_HOODS]);
  console.log(`Miele Hoods: ${result.rows.length}`);
}

async function fixMicrowaveSubcategories() {
  console.log('\n--- FIXING MICROWAVE SUBCATEGORIES ---\n');

  // Thor Kitchen microwaves - OTR style
  let result = await pool.query(`
    UPDATE products SET subcategory_id = $1
    WHERE category_id = $2 AND subcategory_id IS NULL
      AND manufacturer = 'THOR KITCHEN'
    RETURNING id
  `, [SUBCATEGORIES.OTR_MW, CATEGORIES.MICROWAVES]);
  console.log(`Thor Kitchen OTR: ${result.rows.length}`);
}

async function fixWasherSubcategories() {
  console.log('\n--- FIXING WASHER SUBCATEGORIES ---\n');

  // Electrolux Laundry Tower (combo units) - front load
  let result = await pool.query(`
    UPDATE products SET subcategory_id = $1
    WHERE category_id = $2 AND subcategory_id IS NULL
      AND manufacturer = 'ELECTROLUX'
      AND category LIKE '%Laundry Tower%'
    RETURNING id
  `, [SUBCATEGORIES.FRONT_LOAD_WASHER, CATEGORIES.WASHERS]);
  console.log(`Electrolux Laundry Tower: ${result.rows.length}`);

  // Bosch washers - all front load
  result = await pool.query(`
    UPDATE products SET subcategory_id = $1
    WHERE category_id = $2 AND subcategory_id IS NULL
      AND manufacturer = 'BOSCH'
      AND (model LIKE 'WGA%' OR model LIKE 'WGB%' OR model LIKE 'WPA%')
    RETURNING id
  `, [SUBCATEGORIES.FRONT_LOAD_WASHER, CATEGORIES.WASHERS]);
  console.log(`Bosch Front Load: ${result.rows.length}`);

  // GE Profile washer
  result = await pool.query(`
    UPDATE products SET subcategory_id = $1
    WHERE category_id = $2 AND subcategory_id IS NULL
      AND manufacturer = 'GE PROFILE'
      AND model LIKE 'PFQ%'
    RETURNING id
  `, [SUBCATEGORIES.FRONT_LOAD_WASHER, CATEGORIES.WASHERS]);
  console.log(`GE Profile: ${result.rows.length}`);

  // Danby combo unit
  result = await pool.query(`
    UPDATE products SET subcategory_id = $1
    WHERE category_id = $2 AND subcategory_id IS NULL
      AND manufacturer = 'DANBY'
    RETURNING id
  `, [SUBCATEGORIES.FRONT_LOAD_WASHER, CATEGORIES.WASHERS]);
  console.log(`Danby: ${result.rows.length}`);
}

async function migrate() {
  console.log('='.repeat(70));
  console.log('SUBCATEGORY MIGRATION V2 - TARGETED FIXES');
  console.log('='.repeat(70));

  try {
    await fixMiscategorizedProducts();
    await fixRefrigeratorSubcategories();
    await fixRangeSubcategories();
    await fixRangeHoodSubcategories();
    await fixMicrowaveSubcategories();
    await fixWasherSubcategories();

    // Final summary
    console.log('\n' + '='.repeat(70));
    console.log('FINAL SUMMARY - REMAINING UNMAPPED');
    console.log('='.repeat(70));

    const summary = await pool.query(`
      SELECT c.name as category, COUNT(*) as unmapped
      FROM products p
      JOIN categories c ON p.category_id = c.id
      WHERE p.subcategory_id IS NULL
        AND c.level = 2
      GROUP BY c.name
      ORDER BY unmapped DESC
    `);

    for (const row of summary.rows) {
      console.log(`${row.category}: ${row.unmapped} unmapped`);
    }
  } finally {
    await pool.end();
  }
}

migrate().catch(e => {
  console.error('Migration error:', e);
  process.exit(1);
});
