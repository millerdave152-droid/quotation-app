/**
 * Subcategory Migration V3 - Final cleanup
 * Fix miscategorized products and add default subcategories
 */
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: { rejectUnauthorized: false }
});

const CATEGORIES = {
  REFRIGERATORS: 6,
  WASHERS: 7,
  DRYERS: 8,
  DISHWASHERS: 9,
  RANGES: 10,
  COOKTOPS: 11,
  WALL_OVENS: 12,
  MICROWAVES: 13,
  RANGE_HOODS: 14,
  SPECIALTY: 15
};

const SUBCATEGORIES = {
  FRENCH_DOOR: 32,
  SIDE_BY_SIDE: 33,
  TOP_FREEZER: 34,
  BOTTOM_FREEZER: 35,
  FRONT_LOAD_WASHER: 37,
  TOP_LOAD_WASHER: 38,
  ELECTRIC_DRYER: 39,
  GAS_DRYER: 40,
  HEAT_PUMP_DRYER: 41,
  ELECTRIC_RANGE: 42,
  GAS_RANGE: 43,
  DUAL_FUEL_RANGE: 44,
  INDUCTION_RANGE: 45,
  FREESTANDING_RANGE: 47,
  GAS_COOKTOP: 48,
  ELECTRIC_COOKTOP: 49,
  INDUCTION_COOKTOP: 50,
  SINGLE_WALL_OVEN: 51,
  COUNTERTOP_MW: 54,
  OTR_MW: 55,
  BUILTIN_MW: 56,
  UNDER_CABINET_HOOD: 58,
  WALL_MOUNT_HOOD: 59,
  BUILTIN_DISHWASHER: 71,
  DRAWER_DISHWASHER: 72,
  PORTABLE_DISHWASHER: 73
};

async function fixMiscategorizedRanges() {
  console.log('\n--- FIXING MISCATEGORIZED RANGES ---\n');

  // Jenn-Air "Jenn-Air" category contains cooktops - move to cooktops
  let result = await pool.query(`
    UPDATE products
    SET category_id = $1, subcategory_id = $2
    WHERE category_id = $3
      AND manufacturer = 'JENN-AIR'
      AND category = 'Jenn-Air'
      AND (model LIKE 'JEC%' OR model LIKE 'JGC%' OR model LIKE 'JIC%')
    RETURNING id
  `, [CATEGORIES.COOKTOPS, SUBCATEGORIES.GAS_COOKTOP, CATEGORIES.RANGES]);
  console.log(`Jenn-Air cooktops moved: ${result.rows.length}`);

  // Jenn-Air hoods
  result = await pool.query(`
    UPDATE products
    SET category_id = $1, subcategory_id = $2
    WHERE category_id = $3
      AND manufacturer = 'JENN-AIR'
      AND (model LIKE 'JVR%' OR model LIKE 'JVW%' OR model LIKE 'JXI%')
    RETURNING id
  `, [CATEGORIES.RANGE_HOODS, SUBCATEGORIES.WALL_MOUNT_HOOD, CATEGORIES.RANGES]);
  console.log(`Jenn-Air hoods moved: ${result.rows.length}`);

  // LG "Cooking" category - many are cooktops
  result = await pool.query(`
    UPDATE products
    SET category_id = $1, subcategory_id = $2
    WHERE category_id = $3
      AND manufacturer = 'LG'
      AND category = 'Cooking'
      AND (model LIKE 'CBGJ%' OR model LIKE 'CBEJ%' OR model LIKE 'CB%')
    RETURNING id
  `, [CATEGORIES.COOKTOPS, SUBCATEGORIES.GAS_COOKTOP, CATEGORIES.RANGES]);
  console.log(`LG cooktops moved: ${result.rows.length}`);

  // LG electric cooktops
  result = await pool.query(`
    UPDATE products
    SET category_id = $1, subcategory_id = $2
    WHERE category_id = $3
      AND manufacturer = 'LG'
      AND category = 'Cooking'
      AND model LIKE 'CBEW%'
    RETURNING id
  `, [CATEGORIES.COOKTOPS, SUBCATEGORIES.ELECTRIC_COOKTOP, CATEGORIES.RANGES]);
  console.log(`LG electric cooktops: ${result.rows.length}`);

  // LG induction cooktops
  result = await pool.query(`
    UPDATE products
    SET category_id = $1, subcategory_id = $2
    WHERE category_id = $3
      AND manufacturer = 'LG'
      AND category = 'Cooking'
      AND model LIKE 'CBIH%'
    RETURNING id
  `, [CATEGORIES.COOKTOPS, SUBCATEGORIES.INDUCTION_COOKTOP, CATEGORIES.RANGES]);
  console.log(`LG induction cooktops: ${result.rows.length}`);

  // Danby wine coolers in Range category
  result = await pool.query(`
    UPDATE products
    SET category_id = $1
    WHERE category_id = $2
      AND manufacturer = 'DANBY'
      AND (model LIKE 'DWC%' OR name ILIKE '%wine%')
    RETURNING id
  `, [CATEGORIES.SPECIALTY, CATEGORIES.RANGES]);
  console.log(`Danby wine coolers moved to Specialty: ${result.rows.length}`);

  // Danby microwaves in Range category
  result = await pool.query(`
    UPDATE products
    SET category_id = $1, subcategory_id = $2
    WHERE category_id = $3
      AND manufacturer = 'DANBY'
      AND (model LIKE 'DBMW%' OR name ILIKE '%microwave%')
    RETURNING id
  `, [CATEGORIES.MICROWAVES, SUBCATEGORIES.COUNTERTOP_MW, CATEGORIES.RANGES]);
  console.log(`Danby microwaves moved: ${result.rows.length}`);

  // Danby beverage centers in Range category
  result = await pool.query(`
    UPDATE products
    SET category_id = $1
    WHERE category_id = $2
      AND manufacturer = 'DANBY'
      AND (model LIKE 'DBC%' OR name ILIKE '%beverage%')
    RETURNING id
  `, [CATEGORIES.SPECIALTY, CATEGORIES.RANGES]);
  console.log(`Danby beverage centers moved: ${result.rows.length}`);
}

async function fixRemainingRanges() {
  console.log('\n--- FIXING REMAINING RANGES ---\n');

  // Café remaining ranges - detect fuel type from model
  let result = await pool.query(`
    UPDATE products SET subcategory_id = $1
    WHERE category_id = $2 AND subcategory_id IS NULL
      AND manufacturer = 'CAFÉ'
      AND category = 'RANGE'
      AND model NOT LIKE 'C%YS%'
    RETURNING id
  `, [SUBCATEGORIES.GAS_RANGE, CATEGORIES.RANGES]);
  console.log(`Café default to Gas: ${result.rows.length}`);

  // GE remaining ranges
  result = await pool.query(`
    UPDATE products SET subcategory_id = $1
    WHERE category_id = $2 AND subcategory_id IS NULL
      AND manufacturer IN ('GE', 'GE PROFILE')
      AND category = 'RANGE'
    RETURNING id
  `, [SUBCATEGORIES.ELECTRIC_RANGE, CATEGORIES.RANGES]);
  console.log(`GE default to Electric: ${result.rows.length}`);

  // Fulgor Milano - detect by model
  result = await pool.query(`
    UPDATE products SET subcategory_id = $1
    WHERE category_id = $2 AND subcategory_id IS NULL
      AND manufacturer = 'FULGOR MILANO'
      AND model LIKE 'F4%'
    RETURNING id
  `, [SUBCATEGORIES.GAS_RANGE, CATEGORIES.RANGES]);
  console.log(`Fulgor F4 series: ${result.rows.length}`);

  result = await pool.query(`
    UPDATE products SET subcategory_id = $1
    WHERE category_id = $2 AND subcategory_id IS NULL
      AND manufacturer = 'FULGOR MILANO'
      AND model LIKE 'F6%'
    RETURNING id
  `, [SUBCATEGORIES.DUAL_FUEL_RANGE, CATEGORIES.RANGES]);
  console.log(`Fulgor F6 series: ${result.rows.length}`);

  // Bertazzoni remaining - check for gas vs dual fuel
  result = await pool.query(`
    UPDATE products SET subcategory_id = $1
    WHERE category_id = $2 AND subcategory_id IS NULL
      AND manufacturer = 'BERTAZZONI'
      AND name ILIKE '%gas%'
    RETURNING id
  `, [SUBCATEGORIES.GAS_RANGE, CATEGORIES.RANGES]);
  console.log(`Bertazzoni Gas (name): ${result.rows.length}`);

  result = await pool.query(`
    UPDATE products SET subcategory_id = $1
    WHERE category_id = $2 AND subcategory_id IS NULL
      AND manufacturer = 'BERTAZZONI'
      AND (name ILIKE '%electric self%' OR name ILIKE '%induction%')
    RETURNING id
  `, [SUBCATEGORIES.DUAL_FUEL_RANGE, CATEGORIES.RANGES]);
  console.log(`Bertazzoni Dual Fuel (name): ${result.rows.length}`);

  // Jenn-Air remaining ranges
  result = await pool.query(`
    UPDATE products SET subcategory_id = $1
    WHERE category_id = $2 AND subcategory_id IS NULL
      AND manufacturer = 'JENN-AIR'
      AND (category LIKE '%Range%' OR model LIKE 'JD%' OR model LIKE 'JG%')
    RETURNING id
  `, [SUBCATEGORIES.GAS_RANGE, CATEGORIES.RANGES]);
  console.log(`Jenn-Air remaining: ${result.rows.length}`);

  // Silhouette wine coolers (not ranges)
  result = await pool.query(`
    UPDATE products
    SET category_id = $1
    WHERE category_id = $2
      AND manufacturer = 'SILHOUETTE'
      AND (model LIKE 'SRV%' OR name ILIKE '%wine%')
    RETURNING id
  `, [CATEGORIES.SPECIALTY, CATEGORIES.RANGES]);
  console.log(`Silhouette wine coolers moved: ${result.rows.length}`);

  // Moffat range
  result = await pool.query(`
    UPDATE products SET subcategory_id = $1
    WHERE category_id = $2 AND subcategory_id IS NULL
      AND manufacturer = 'MOFFAT'
    RETURNING id
  `, [SUBCATEGORIES.ELECTRIC_RANGE, CATEGORIES.RANGES]);
  console.log(`Moffat: ${result.rows.length}`);

  // Miele/Wolf remaining
  result = await pool.query(`
    UPDATE products SET subcategory_id = $1
    WHERE category_id = $2 AND subcategory_id IS NULL
      AND manufacturer IN ('MIELE', 'WOLF')
    RETURNING id
  `, [SUBCATEGORIES.DUAL_FUEL_RANGE, CATEGORIES.RANGES]);
  console.log(`Miele/Wolf: ${result.rows.length}`);
}

async function fixRemainingRangeHoods() {
  console.log('\n--- FIXING REMAINING RANGE HOODS ---\n');

  // Bosch ventilation
  let result = await pool.query(`
    UPDATE products SET subcategory_id = $1
    WHERE category_id = $2 AND subcategory_id IS NULL
      AND manufacturer = 'BOSCH'
    RETURNING id
  `, [SUBCATEGORIES.WALL_MOUNT_HOOD, CATEGORIES.RANGE_HOODS]);
  console.log(`Bosch hoods: ${result.rows.length}`);

  // Bertazzoni hoods
  result = await pool.query(`
    UPDATE products SET subcategory_id = $1
    WHERE category_id = $2 AND subcategory_id IS NULL
      AND manufacturer = 'BERTAZZONI'
    RETURNING id
  `, [SUBCATEGORIES.UNDER_CABINET_HOOD, CATEGORIES.RANGE_HOODS]);
  console.log(`Bertazzoni hoods: ${result.rows.length}`);

  // Electrolux hoods
  result = await pool.query(`
    UPDATE products SET subcategory_id = $1
    WHERE category_id = $2 AND subcategory_id IS NULL
      AND manufacturer = 'ELECTROLUX'
    RETURNING id
  `, [SUBCATEGORIES.WALL_MOUNT_HOOD, CATEGORIES.RANGE_HOODS]);
  console.log(`Electrolux hoods: ${result.rows.length}`);
}

async function fixDishwasherSubcategories() {
  console.log('\n--- FIXING DISHWASHER SUBCATEGORIES ---\n');

  // First, check if dishwasher subcategories exist
  const subcatCheck = await pool.query(`
    SELECT id, name FROM categories WHERE parent_id = 9 ORDER BY id
  `);
  console.log(`Dishwasher subcategories: ${subcatCheck.rows.map(r => r.name).join(', ') || 'NONE'}`);

  if (subcatCheck.rows.length === 0) {
    // Create dishwasher subcategories
    console.log('Creating dishwasher subcategories...');
    await pool.query(`
      INSERT INTO categories (parent_id, name, slug, level, display_order)
      VALUES
        (9, 'Built-In', 'built-in-dishwasher', 3, 1),
        (9, 'Drawer', 'drawer-dishwasher', 3, 2),
        (9, 'Portable', 'portable-dishwasher', 3, 3)
      ON CONFLICT (slug) DO NOTHING
    `);
  }

  // Get the subcategory IDs
  const subcats = await pool.query(`
    SELECT id, slug FROM categories WHERE parent_id = 9
  `);
  const subcatMap = {};
  subcats.rows.forEach(r => subcatMap[r.slug] = r.id);

  // Most dishwashers are built-in
  let result = await pool.query(`
    UPDATE products SET subcategory_id = $1
    WHERE category_id = 9 AND subcategory_id IS NULL
      AND name NOT ILIKE '%drawer%' AND name NOT ILIKE '%portable%'
      AND model NOT LIKE 'DD%'
    RETURNING id
  `, [subcatMap['built-in-dishwasher'] || SUBCATEGORIES.BUILTIN_DISHWASHER]);
  console.log(`Built-In dishwashers: ${result.rows.length}`);

  // Drawer dishwashers
  result = await pool.query(`
    UPDATE products SET subcategory_id = $1
    WHERE category_id = 9 AND subcategory_id IS NULL
      AND (name ILIKE '%drawer%' OR model LIKE 'DD%')
    RETURNING id
  `, [subcatMap['drawer-dishwasher'] || SUBCATEGORIES.DRAWER_DISHWASHER]);
  console.log(`Drawer dishwashers: ${result.rows.length}`);

  // Portable dishwashers
  result = await pool.query(`
    UPDATE products SET subcategory_id = $1
    WHERE category_id = 9 AND subcategory_id IS NULL
      AND name ILIKE '%portable%'
    RETURNING id
  `, [subcatMap['portable-dishwasher'] || SUBCATEGORIES.PORTABLE_DISHWASHER]);
  console.log(`Portable dishwashers: ${result.rows.length}`);
}

async function fixRemainingWashers() {
  console.log('\n--- FIXING REMAINING WASHERS ---\n');

  // LG stacking kits should stay in washers as front load (they're washer accessories)
  // Skip them for subcategory (they're accessories)

  // Bosch dryers mislabeled (WQB, WTG are dryers)
  let result = await pool.query(`
    UPDATE products
    SET category_id = $1, subcategory_id = $2
    WHERE category_id = $3
      AND manufacturer = 'BOSCH'
      AND (model LIKE 'WQB%' OR model LIKE 'WTG%')
    RETURNING id
  `, [CATEGORIES.DRYERS, SUBCATEGORIES.HEAT_PUMP_DRYER, CATEGORIES.WASHERS]);
  console.log(`Bosch dryers moved: ${result.rows.length}`);
}

async function migrate() {
  console.log('='.repeat(70));
  console.log('SUBCATEGORY MIGRATION V3 - FINAL CLEANUP');
  console.log('='.repeat(70));

  try {
    await fixMiscategorizedRanges();
    await fixRemainingRanges();
    await fixRemainingRangeHoods();
    await fixDishwasherSubcategories();
    await fixRemainingWashers();

    // Final summary
    console.log('\n' + '='.repeat(70));
    console.log('FINAL SUMMARY - PRODUCTS WITH SUBCATEGORY');
    console.log('='.repeat(70));

    const summary = await pool.query(`
      SELECT c.name as category,
             COUNT(*) as total,
             COUNT(p.subcategory_id) as with_subcategory,
             COUNT(*) - COUNT(p.subcategory_id) as without_subcategory
      FROM products p
      JOIN categories c ON p.category_id = c.id
      WHERE c.level = 2
      GROUP BY c.name
      ORDER BY without_subcategory DESC
    `);

    console.log('\nCategory                 | Total | With Subcat | Without');
    console.log('-'.repeat(60));
    for (const row of summary.rows) {
      const name = row.category.padEnd(24);
      const total = String(row.total).padStart(5);
      const withSub = String(row.with_subcategory).padStart(11);
      const without = String(row.without_subcategory).padStart(7);
      console.log(`${name} | ${total} | ${withSub} | ${without}`);
    }
  } finally {
    await pool.end();
  }
}

migrate().catch(e => {
  console.error('Migration error:', e);
  process.exit(1);
});
