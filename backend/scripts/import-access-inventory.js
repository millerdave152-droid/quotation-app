/**
 * Access POS Inventory Import Script
 * Imports ~2,942 products from a legacy Microsoft Access POS export (Excel)
 * into the existing PostgreSQL products table.
 *
 * Three run modes:
 *   --dry-run   Preview only (default)
 *   --apply     Execute import inside a transaction (rollback on error)
 *   --report    Generate unified CSV report
 *
 * Match logic: case-insensitive model number comparison
 * - MATCHED: update qty, fill manufacturer/category if NULL (never overwrite existing, never touch price)
 * - NEW: INSERT with price=0 placeholder, is_active=true
 * - CONFLICT: brand/category mismatch logged but not overwritten
 *
 * Note: Prices are NOT in this export. Products imported with price=0 as placeholder.
 *       Zero-stock products are still imported (valid catalog items).
 *       Existing product prices are NEVER overwritten by this import.
 *
 * Usage:
 *   node backend/scripts/import-access-inventory.js <path-to-xlsx> --dry-run
 *   node backend/scripts/import-access-inventory.js <path-to-xlsx> --apply
 *   node backend/scripts/import-access-inventory.js <path-to-xlsx> --report
 */

const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const pool = require('../db');

const DEFAULT_PATH = path.join(__dirname, '..', '..', 'Inventory_WD_260207.xlsx');
const OUTPUT_DIR = path.join(__dirname, 'output');

// ── Brand name corrections (Access POS typos + aliases) ────────────────
const BRAND_MAP = {
  // Typos
  'ASHELY': 'ASHLEY',
  'KITCEHNAID': 'KITCHENAID',
  'KITCHENIAD': 'KITCHENAID',
  'KITCHNEAID': 'KITCHENAID',
  'KITCHEAID': 'KITCHENAID',
  'KITCEHENAID': 'KITCHENAID',
  'KICHEN AID': 'KITCHENAID',
  'SAMSNG': 'SAMSUNG',
  'SAMUNG': 'SAMSUNG',
  'SAMSUMG': 'SAMSUNG',
  'FRIGIDARE': 'FRIGIDAIRE',
  'FRIGIDIAR': 'FRIGIDAIRE',
  'FRIDGIDAIRE': 'FRIGIDAIRE',
  'WHIBRLPOOL': 'WHIRLPOOL',
  'WHIRPOOL': 'WHIRLPOOL',
  'WHRILPOOL': 'WHIRLPOOL',
  'WHIRLP0OL': 'WHIRLPOOL',
  'MAYTGA': 'MAYTAG',
  'MATAG': 'MAYTAG',
  'BOSH': 'BOSCH',
  'BONAPART': 'NAPOLEON',
  'NAPOLEAON': 'NAPOLEON',
  'NAPOLEAN': 'NAPOLEON',
  'ELECTROLX': 'ELECTROLUX',
  'ELECTRLUX': 'ELECTROLUX',
  'GE APLIANCES': 'GE',
  'GE APPIANCES': 'GE',
  // Aliases / formatting
  'JENNAIR': 'JENN-AIR',
  'JENN AIR': 'JENN-AIR',
  'KITCHEN AID': 'KITCHENAID',
  'KITCHEN-AID': 'KITCHENAID',
  'GE CAF\u00C9': 'CAF\u00C9',        // GE CAFÉ → CAFÉ (encoding fix)
  'GE CAF\u00C3': 'CAF\u00C9',        // GE CAFÃ (mojibake) → CAFÉ
  'GE CAFE': 'CAF\u00C9',             // GE CAFE → CAFÉ
  'CAFE': 'CAF\u00C9',                // CAFE → CAFÉ
  'THOR': 'THOR KITCHEN',
  'YODER SMOKERS': 'YODER',
  'NEPOLEON': 'NAPOLEON',
  'GALLERY': 'FRIGIDAIRE GALLERY',
};

// ── Category name corrections (Access POS typos + aliases) ─────────────
const CATEGORY_MAP = {
  // Typos
  'HOOD': 'RANGE HOOD',
  'REFREGIRATOR': 'REFRIGERATOR',
  'REFERIGERATOR': 'REFRIGERATOR',
  'REFRIDGERATOR': 'REFRIGERATOR',
  'REFRIDGEARTOR': 'REFRIGERATOR',
  'REFRIGEATOR': 'REFRIGERATOR',
  'REFRIGATOR': 'REFRIGERATOR',
  'REFRIGETATOR': 'REFRIGERATOR',
  'WAHSER': 'WASHER',
  'WSHER': 'WASHER',
  'DRYR': 'DRYER',
  'DRYERR': 'DRYER',
  'DREYER': 'DRYER',
  'DISHWAHSER': 'DISHWASHER',
  'DISHWASHR': 'DISHWASHER',
  'DISH WASHER': 'DISHWASHER',
  'MICORWAVE': 'MICROWAVE',
  'MIRCOWAVE': 'MICROWAVE',
  'MICOWAVE': 'MICROWAVE',
  'MICOWAVE OVEN': 'MICROWAVE',
  'COOKOTP': 'COOKTOP',
  'COOKTOP GAS': 'GAS COOKTOP',
  'RNAGE': 'RANGE',
  'RAGEN': 'RANGE',
  'RANE': 'RANGE',
  'FIREPACE': 'FIREPLACE',
  'FIRPLACE': 'FIREPLACE',
  'PEDASTAL': 'PEDESTAL',
  'SOUNBAR': 'SOUNDBAR',
  'HAND BLANDER': 'HAND BLENDER',
  // Concatenated words (no space)
  'RANGEHOOD': 'RANGE HOOD',
  'RANEGHOOD': 'RANGE HOOD',
  'TVQLED': 'QLED TV',
  'WALLOVEN': 'WALL OVEN',
  'WALLOVEN COMBO': 'WALL OVEN COMBO',
  'TRIMKIT': 'TRIM KIT',
  'WINDSCREENKIT': 'WINDSCREEN KIT',
  // Aliases (Access short labels → canonical)
  'BUILTIN DISHWASHER': 'DISHWASHER',
  'BUILT IN MICROWAVE': 'MICROWAVE',
  'OTR': 'OTR MICROWAVE',
  'OTR MICROWAVE': 'OTR MICROWAVE',
  'COUNTERTOP MICROWAVE': 'MICROWAVE',
  'ELECTRC RANGE': 'ELECTRIC RANGE',
  'HOOD FAN': 'RANGE HOOD',
  'VENT HOOD': 'RANGE HOOD',
  'WALL VENT HOOD': 'RANGE HOOD',
  'INSERT HOOD': 'RANGE HOOD',
  'BBQ': 'GRILL',
  'BBQ COVER': 'GRILL COVER',
  'BUILT IN BBQ': 'BUILT-IN GRILL',
  'FRENCH DOOR': 'REFRIGERATOR',
  'UNDER COUNTER FRIDGE': 'REFRIGERATOR',
  'BEVERAGE CENTER': 'BEVERAGE CENTER',
  'BEVERAGE CENTRE': 'BEVERAGE CENTER',
  'WINE COLLER': 'WINE CELLAR',
  'LAUNDRY CENTER': 'LAUNDRY CENTER',
  'WASH TOWER': 'LAUNDRY CENTER',
  'STACKABLE WASHER/DRYER': 'LAUNDRY CENTER',
  'WASHER\\DRYER': 'LAUNDRY CENTER',
  'WASHING MACHINE': 'WASHER',
  'BUILT IN OVEN': 'WALL OVEN',
  'BUILT IN WALL OVEN': 'WALL OVEN',
  'DOUBLE WALL OVEN': 'WALL OVEN',
  'COMBINATION WALL OVEN': 'WALL OVEN COMBO',
  'WALL OVEN COMBO': 'WALL OVEN COMBO',
  'STEAM OVEN': 'WALL OVEN',
  'DOWNDRAFT COOKTOP': 'COOKTOP',
  'INDUCTION COOKTOP': 'COOKTOP',
  'GAS COOKTOP': 'COOKTOP',
  'ELECTRIC COOKTOP': 'COOKTOP',
  'RANGE TOP': 'RANGETOP',
  'COFFE GRINDER': 'COFFEE GRINDER',
  'BLOOR MOTER': 'BLOWER MOTOR',
  'BLOWER MOTOR': 'BLOWER MOTOR',
  'GRYDDLE CAST IRON': 'GRIDDLE',
  'GRASE SHEILD': 'GREASE SHIELD',
  'AASM KIT HANDEL': 'HANDLE KIT',
  'KIT HANDEL': 'HANDLE KIT',
  'DOOR PANELKIT': 'DOOR PANEL',
  'STACKING KIT': 'STACK KIT',
  // TVs
  '4K TV': 'TV',
  '4K UHD TV': 'TV',
  'TV 4K': 'TV',
  'TV 4K UHD': 'TV',
  'UHD 4K TV': 'TV',
  'UHD 4K': 'TV',
  'OLED 4 K UHD': 'TV',
  'QLED 4K': 'TV',
  'QLED 4K TV': 'TV',
  'QLED 4K SMART TV': 'TV',
  'TV QLED': 'TV',
  'FRAME TV': 'TV',
  'FRAME QLED 4K': 'TV',
  'TELEVISION': 'TV',
  '285XCOVER': 'GRILL COVER',
  'PRO285 COVER': 'GRILL COVER',
  'ROASTERKIT': 'ROTISSERIE KIT',
};

function normalizeBrand(raw) {
  if (!raw) return '';
  const upper = raw.toString().toUpperCase().trim();
  if (BRAND_MAP[upper]) return BRAND_MAP[upper];
  // Catch any GE CAF* encoding variants (mojibake)
  if (upper.startsWith('GE CAF')) return 'CAF\u00C9';
  return upper;
}

function normalizeCategory(raw) {
  if (!raw) return '';
  const upper = raw.toString().toUpperCase().trim();
  return CATEGORY_MAP[upper] || upper;
}

/**
 * Check if two brands belong to the same corporate family.
 * E.g., FRIGIDAIRE & ELECTROLUX are both Electrolux group;
 *       GE, GE PROFILE, CAFÉ are all Haier/GE Appliances;
 *       WHIRLPOOL, KITCHENAID, MAYTAG, EVERYDROP are all Whirlpool Corp.
 */
function brandsRelated(a, b) {
  const BRAND_FAMILIES = [
    ['WHIRLPOOL', 'KITCHENAID', 'MAYTAG', 'EVERYDROP', 'JENN-AIR', 'AMANA'],
    ['GE', 'GE PROFILE', 'CAF\u00C9', 'HAIER', 'HOTPOINT', 'UNIVERSAL'],
    ['ELECTROLUX', 'FRIGIDAIRE', 'FRIGIDAIRE GALLERY', 'FRIGIDAIRE PROFESSIONAL'],
    ['SAMSUNG', 'BESPOKE'],
    ['LG', 'LG SIGNATURE'],
    ['NAPOLEON', 'YODER'],
    ['BOSCH', 'THERMADOR', 'GAGGENAU'],
    ['BERTAZZONI'],
    ['THOR KITCHEN'],
  ];
  for (const family of BRAND_FAMILIES) {
    const aIn = family.some(f => a === f || a.includes(f) || f.includes(a));
    const bIn = family.some(f => b === f || b.includes(f) || f.includes(b));
    if (aIn && bIn) return true;
  }
  return false;
}

/** Normalize a category string for comparison: uppercase, hyphens→spaces, collapse whitespace */
function normCat(s) {
  return s.toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * DB categories that are too generic / non-specific to meaningfully conflict.
 * If DB has one of these, the Access category is always considered "better" — no conflict.
 */
const GENERIC_DB_CATEGORIES = [
  'GLOBAL PRODUCTS', 'UNCATEGORIZED', 'APPLIANCE', 'PRODUCTS',
];

/**
 * Brand names that sometimes appear as DB categories (e.g., "Jenn-Air", "Napoleon - Grill Accessory").
 * If the DB category starts with a brand prefix, it's a manufacturer bucket, not a real category.
 */
const BRAND_CATEGORY_PREFIXES = [
  'JENN AIR', 'JENNAIR', 'NAPOLEON', 'YODER', 'BOSCH',
  'ELECTROLUX', 'FRIGIDAIRE', 'SAMSUNG', 'LG', 'WHIRLPOOL',
  'GE PROFILE', 'KITCHENAID', 'MAYTAG', 'THERMADOR',
  'CAFE', 'BESPOKE', 'S SERIES', 'MUSIC FRAME',
];

/**
 * Smart category comparison for conflict detection.
 * Returns true if the two category strings are "close enough" (not a real conflict).
 * Handles: generic DB categories, brand-as-category, exact match, substring,
 * stem matching, generic parent terms, and semantic equivalences.
 */
function categoriesMatch(accessCat, dbCat) {
  if (!accessCat || !dbCat) return true; // can't conflict if one is empty
  const a = normCat(accessCat);
  const b = normCat(dbCat);

  // Exact match
  if (a === b) return true;

  // Generic DB categories — Access is always more specific
  if (GENERIC_DB_CATEGORIES.some(g => b === normCat(g) || b.includes(normCat(g)))) return true;

  // Brand-as-category in DB (e.g., "Jenn-Air", "Napoleon - Grill Accessory")
  if (BRAND_CATEGORY_PREFIXES.some(p => { const np = normCat(p); return b === np || b.startsWith(np + ' '); })) return true;

  // "COOKING" in DB is a generic parent — any cooking-related Access category matches
  if (b === 'COOKING' || b.startsWith('COOKING ')) return true;

  // Substring match (either direction)
  if (b.includes(a) || a.includes(b)) return true;

  // Stem matching: REFRIGERATOR ↔ REFRIGERATION, COOK ↔ COOKING, etc.
  const stemA = a.replace(/(TION|TOR|ING|ERS|ER|S)$/g, '');
  const stemB = b.replace(/(TION|TOR|ING|ERS|ER|S)$/g, '');
  if (stemA.length >= 4 && stemB.length >= 4 && (stemB.includes(stemA) || stemA.includes(stemB))) return true;

  // Split DB verbose category by delimiters and check if Access term appears in any segment
  const dbParts = b.split(/\s+/).filter(p => p.length >= 3);
  const accessWords = a.split(/\s+/).filter(w => w.length >= 3);
  // If ALL significant words from Access appear somewhere in DB string
  if (accessWords.length > 0 && accessWords.every(w => dbParts.some(p => p.includes(w) || w.includes(p)))) return true;

  // Semantic equivalence groups — if both sides map to the same group, not a conflict
  // NOTE: terms are normalized via normCat() before comparison
  const EQUIV = [
    // Cooking - grills & outdoor
    ['GRILL', 'BBQ', 'BARBECUE', 'GAS GRILL', 'CHARCOAL GRILL', 'PELLET GRILL', 'BURNER', 'BUILT IN GRILL', 'GRIDDLE'],
    ['GRILL COVER', 'COVER', 'GRILL ACCESSORY', 'SMOKER COVER'],
    ['SMOKER', 'SMOKER BOX', 'SMOKER TRAY'],
    ['ROTISSERIE KIT', 'ROTISSERIE', 'ROASTERKIT'],
    ['PIZZA OVEN', 'ROCKING PIZZA', 'BAKING STONE', 'BAKING STONE SET', 'WOOD FRIED OVEN'],
    // Cooking - hoods & ventilation
    ['RANGE HOOD', 'RANGE HOODS', 'HOOD', 'VENTILATION', 'VENT', 'HOOD AND VENT', 'VENTILLATION', 'HOOD LINER', 'BLOWER MOTOR', 'IN LINE BLOWER', 'DUCT COVER'],
    // Cooking - ranges, cooktops, ovens
    ['COOKTOP', 'COOK TOP', 'GAS COOKTOP', 'ELECTRIC COOKTOP', 'INDUCTION COOKTOP', 'DOWNDRAFT COOKTOP', 'HOB', 'BUILT IN HOB', 'RANGETOP'],
    ['RANGE', 'STOVE', 'SLIDE IN', 'SLIDE IN ELECTRIC', 'SLIDE IN GAS', 'SLIDEIN ELECTRIC', 'SLIDEIN GAS', 'FREESTANDING', 'FRONT CONTROL', 'DUAL FUEL', 'ELECTRIC RANGE', 'GAS RANGE', 'RADIANT'],
    ['WALL OVEN', 'BUILT IN OVEN', 'BUILT IN COOKING', 'SINGLE OVEN', 'DOUBLE OVEN', 'WALL OVEN COMBO', 'COMBINATION WALL OVEN', 'MICRO COMBO', 'STEAM OVEN', 'FOOD PREPARATION BUILT IN OVEN'],
    ['WARMING DRAWER', 'BUILT IN COOKING'],
    ['MICROWAVE', 'OTR MICROWAVE', 'COUNTERTOP MICROWAVE', 'CMO'],
    // Refrigeration
    ['REFRIGERATOR', 'FRIDGE', 'REFRIGERATION', 'FDR', 'FRENCH DOOR', 'SIDE BY SIDE', 'FOOD PRESERVATION', '4DFLEX', '4DR', 'FHUB', 'MULTIDOOR', 'BESPOKE'],
    ['BEVERAGE CENTER', 'BEVERAGE CENTRE', 'WINE CELLAR', 'WINE COOLER', 'WINE CABINET', 'UNDERCOUNTER BEVERAGE', 'BUILT IN REFRIGERATION', 'BEVERAGES', 'BUILT IN BEVERAGES'],
    ['FREEZER', 'CHEST FREEZER', 'UPRIGHT FREEZER'],
    ['WATER FILTER', 'FILTER', 'REFRIGERATION'],
    ['ICE MAKER', 'ICE MAKERS'],
    // Laundry — broad group (W/M is a department, not just washer)
    ['WASHER', 'WASHING MACHINE', 'FABRIC CARE', 'LAUNDRY', 'W M', 'WM', 'DRYER', 'TUMBLE DRY',
     'LAUNDRY CENTER', 'WASH TOWER', 'WASHER DRYER COMBO',
     'STACK KIT', 'STACKING KIT', 'CONVERSION KIT', 'PEDESTAL', 'PEDASTAL'],
    // Cleaning
    ['DISHWASHER', 'DISH WASHER', 'DISH CARE', 'CLEANUP', 'DW ROTARY'],
    ['COMPACTOR', 'TRASH COMPACTOR'],
    // Electronics
    ['TV', 'TELEVISION', 'QLED', 'OLED', 'UHD', 'LED TV', 'SMART TV', 'ULED'],
    ['SOUNDBAR', 'SPEAKER', 'AUDIO', 'HOME THEATRE', 'HOME THEATER', 'RECEIVER'],
    // Small appliances
    ['BLENDER', 'IMMERSION BLENDER', 'HAND BLENDER', 'BLENDER JAR', 'GLASS BLENDER JAR', 'PERSONAL BLENDER JAR', 'PORTABLE ACCESSORIES'],
    ['COFFEE MAKER', 'COFFEE', 'ESPRESSO', 'ESPRESSO MAKER', 'COFFEE MAKER DRIP', 'COFFEE GRINDER'],
    ['STAND MIXER', 'MIXER', 'STAND MIXERS'],
    ['HAND MIXER', 'MIXER'],
    ['FOOD PROCESSOR', 'MINI FOOD PROCESSOR', 'FOOD CHOPPER'],
    ['SLICER', 'VEGETABLE CUTTER', 'STAND MIXERS ATTACHMENTS', 'ATTACHMENTS'],
    ['SMALL BATCH JAR', 'PORTABLE ACCESSORIES'],
    // Accessories & parts
    ['ACCESSORIES', 'ACCESSORY', 'KIT', 'PANEL KIT', 'TRIM KIT', 'HANDLE KIT',
     'DOOR PANEL', 'UPPER PANEL', 'LOWER PANEL', 'MIDDRAWER DOOR PANEL', 'BESPOKE PANEL',
     'DECOR SET GAS KNOBS', 'CONVERSION KIT', 'EXTENSION KIT', 'PRESS KIT', 'POWER CORD JUNCTION BOX',
     'UPPER DOOR PANEL WHITE', 'REFERENCE THEATER PACK', 'FILTER'],
    // Grill accessories (Napoleon/Yoder specific)
    ['GRILL GRATE', 'GRILL LIFTER', 'GRID SCRAPER', 'COOKING GRATE', 'GRILLING TOOLS',
     'CAST IRON', 'BRUSH', 'BRASS BRUSH', 'SS BRISTLE FREE BRUSH', 'KNIFE',
     'SS PAN SET', 'SS LID', 'GRACE TRAY', 'TRAY', 'GRILLING WOK', 'GRILL MAT',
     'GREASE SHIELD', 'SLIP ON FRONT SHEILD', 'WINDSCREEN KIT',
     'PATIO FLAME LINEAR', 'PATIO FLAME TABLE', 'ISLAND MODULE',
     'BUILT COMPONENT TWO DOOR', 'GRILL ACCESSORY',
     'CUTTING BOARD', 'CUTTING BOARD SET', 'BAKING STONE', 'ROTISSERIE KIT'],
  ];

  for (const group of EQUIV) {
    // Normalize EQUIV terms the same way as inputs (strip hyphens, collapse spaces)
    const normGroup = group.map(t => normCat(t));
    const aInGroup = normGroup.some(term => a.includes(term) || term.includes(a));
    const bInGroup = normGroup.some(term => b.includes(term) || term.includes(b));
    if (aInGroup && bInGroup) return true;
  }

  return false;
}

/**
 * Match a product string against categories' legacy_patterns JSONB arrays.
 * Returns { id, name } or null.
 */
function matchCategoryByPatterns(productStr, categories) {
  if (!productStr) return null;
  const lower = productStr.toLowerCase().trim();

  // Try level 2 categories first (more specific), then level 1
  const sorted = [...categories].sort((a, b) => b.level - a.level);

  for (const cat of sorted) {
    if (!cat.legacy_patterns || !Array.isArray(cat.legacy_patterns)) continue;
    for (const pattern of cat.legacy_patterns) {
      if (lower.includes(pattern.toLowerCase())) {
        return { id: cat.id, name: cat.name };
      }
    }
  }
  return null;
}

/** CSV-escape a field */
function csvEscape(v) {
  const s = (v == null ? '' : v).toString();
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

/** Write rows to CSV file */
function writeCsv(filePath, headers, rows) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const content = headers.join(',') + '\n' +
    rows.map(row => row.map(csvEscape).join(',')).join('\n') + '\n';
  fs.writeFileSync(filePath, content, 'utf8');
}

/** Format number with commas */
function fmt(n) {
  return n.toLocaleString('en-US');
}

// ── Main ───────────────────────────────────────────────────────────────

async function importAccessInventory() {
  const args = process.argv.slice(2);
  const filePath = args.find(a => !a.startsWith('--')) || DEFAULT_PATH;

  // Parse mode
  let mode = 'dry-run';
  if (args.includes('--apply')) mode = 'apply';
  else if (args.includes('--report')) mode = 'report';
  else if (args.includes('--dry-run')) mode = 'dry-run';

  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   Access POS Inventory Import                ║');
  console.log('╚══════════════════════════════════════════════╝\n');
  console.log(`File:  ${filePath}`);
  console.log(`Mode:  ${mode.toUpperCase()}`);
  console.log(`Date:  ${new Date().toISOString()}\n`);

  // ── Step 1: Read Excel ──────────────────────────────────────────────
  if (!fs.existsSync(filePath)) {
    console.error(`ERROR: File not found: ${filePath}`);
    process.exit(1);
  }

  console.log('[1/7] Reading Excel file...');
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(worksheet);

  console.log(`  ${fmt(data.length)} rows found`);
  if (data.length > 0) {
    console.log(`  Columns: ${Object.keys(data[0]).join(', ')}`);
  }

  // ── Step 2: Normalize brands & categories ───────────────────────────
  console.log('\n[2/7] Normalizing brands and categories...');

  let brandFixCount = 0;
  let categoryFixCount = 0;
  const brandFixDetails = {};
  const categoryFixDetails = {};

  for (const row of data) {
    const rawBrand = (row.Brand || '').toString().toUpperCase().trim();
    const normalizedBrand = normalizeBrand(row.Brand);
    if (rawBrand && rawBrand !== normalizedBrand) {
      brandFixCount++;
      brandFixDetails[rawBrand] = normalizedBrand;
    }
    const rawCat = (row.Product || '').toString().toUpperCase().trim();
    const normalizedCat = normalizeCategory(row.Product);
    if (rawCat && rawCat !== normalizedCat) {
      categoryFixCount++;
      categoryFixDetails[rawCat] = normalizedCat;
    }
  }

  console.log(`  Brand names fixed:    ${fmt(brandFixCount)} rows (${Object.keys(brandFixDetails).length} unique corrections)`);
  console.log(`  Category names fixed: ${fmt(categoryFixCount)} rows (${Object.keys(categoryFixDetails).length} unique corrections)`);

  if (Object.keys(brandFixDetails).length > 0) {
    for (const [from, to] of Object.entries(brandFixDetails)) {
      console.log(`    ${from} → ${to}`);
    }
  }
  if (Object.keys(categoryFixDetails).length > 0) {
    for (const [from, to] of Object.entries(categoryFixDetails)) {
      console.log(`    ${from} → ${to}`);
    }
  }

  // ── Step 3: Load DB products ────────────────────────────────────────
  console.log('\n[3/7] Fetching products from database...');
  const dbResult = await pool.query(`
    SELECT id, model, name, manufacturer, category, category_id, qty_on_hand
    FROM products
    WHERE model IS NOT NULL AND model != ''
  `);
  const dbProducts = dbResult.rows;
  console.log(`  ${fmt(dbProducts.length)} products with models in DB`);

  // ── Step 4: Load categories for pattern matching ────────────────────
  console.log('\n[4/7] Fetching categories...');
  const catResult = await pool.query(`
    SELECT id, name, slug, level, legacy_patterns
    FROM categories
    WHERE is_active = true
  `);
  const categories = catResult.rows;
  console.log(`  ${categories.length} active categories loaded`);

  // ── Step 5: Build model lookup map ──────────────────────────────────
  console.log('\n[5/7] Building model lookup map...');
  const modelToProduct = new Map();
  for (const product of dbProducts) {
    if (product.model) {
      const key = product.model.toUpperCase().trim();
      // If duplicate model in DB, prefer the one with category_id set
      if (!modelToProduct.has(key) || (!modelToProduct.get(key).category_id && product.category_id)) {
        modelToProduct.set(key, product);
      }
    }
  }
  console.log(`  ${fmt(modelToProduct.size)} unique models in lookup`);

  // ── Step 6: Match, classify, detect conflicts ───────────────────────
  console.log('\n[6/7] Matching Excel rows to DB products...');

  const matched = [];     // Existing products to update
  const newProducts = []; // Products to insert
  const conflicts = [];   // Brand/category mismatches
  const skipped = [];     // Rows without model

  for (const row of data) {
    const excelModel = row.Model;
    const qty = parseInt(row['Qty in Hand']) || 0;
    const brand = normalizeBrand(row.Brand);
    const product = normalizeCategory(row.Product);

    if (!excelModel) {
      skipped.push({ reason: 'no model', brand, product, qty });
      continue;
    }

    const normalizedModel = excelModel.toString().toUpperCase().trim();
    const dbProduct = modelToProduct.get(normalizedModel);

    if (dbProduct) {
      // ── Conflict detection ──────────────────────────────────────
      // Brand: normalize both sides through BRAND_MAP before comparing
      const accessBrandNorm = normalizeBrand(brand).toUpperCase();
      const dbBrandNorm = normalizeBrand(dbProduct.manufacturer || '').toUpperCase();
      // Check exact, substring, and corporate family equivalences
      const brandConflict = accessBrandNorm && dbBrandNorm &&
        accessBrandNorm !== dbBrandNorm &&
        !dbBrandNorm.includes(accessBrandNorm) &&
        !accessBrandNorm.includes(dbBrandNorm) &&
        !brandsRelated(accessBrandNorm, dbBrandNorm);

      // Category: smart matching with stems + equivalences
      const accessCatNorm = normCat(normalizeCategory(product));
      const dbCatNorm = normCat(dbProduct.category || '');
      const catConflict = accessCatNorm && dbCatNorm && !categoriesMatch(accessCatNorm, dbCatNorm);

      // ── Build match record (always — conflicts are flagged, not separated)
      const prevQty = dbProduct.qty_on_hand || 0;
      const qtyChanged = prevQty !== qty;

      const match = {
        id: dbProduct.id,
        model: dbProduct.model,
        name: dbProduct.name,
        manufacturer: dbProduct.manufacturer,
        category: dbProduct.category,
        categoryId: dbProduct.category_id,
        prevQty,
        excelModel: excelModel,
        excelBrand: brand,
        excelProduct: product,
        qty,
        qtyChanged,
        action: qtyChanged ? `Updated qty ${prevQty} → ${qty}` : 'Already current',
        conflictType: [],
        conflictDetails: []
      };

      // Record conflicts on the match record (not a separate array)
      if (brandConflict) {
        match.conflictType.push('brand');
        match.conflictDetails.push(`Access says ${brand} but DB says ${dbProduct.manufacturer}`);
      }
      if (catConflict) {
        match.conflictType.push('category');
        match.conflictDetails.push(`Access says ${product} but DB says ${dbProduct.category}`);
      }
      if (match.conflictType.length > 0) {
        conflicts.push(match);
      }

      // Fill manufacturer if currently NULL or empty (don't overwrite existing)
      if ((!dbProduct.manufacturer || dbProduct.manufacturer.trim() === '') && brand) {
        match.updateManufacturer = brand;
        match.action += ', +manufacturer';
      }

      // Fill category_id if currently NULL (don't overwrite existing)
      if (!dbProduct.category_id && product) {
        const catMatch = matchCategoryByPatterns(product, categories);
        if (catMatch) {
          match.updateCategoryId = catMatch.id;
          match.updateCategoryName = catMatch.name;
          match.action += ', +category';
        }
      }

      matched.push(match);
    } else {
      // ── New product (not in PostgreSQL) ─────────────────────────
      newProducts.push({
        model: excelModel.toString().trim(),
        brand,
        product,
        qty,
        description: [brand, product, excelModel].filter(Boolean).join(' / ')
      });
    }
  }

  // ── Step 7: Compute stats ───────────────────────────────────────────
  const totalWithModel = data.length - skipped.length;
  const updatedQty = matched.filter(m => m.qtyChanged).length;
  const alreadyCurrent = matched.filter(m => !m.qtyChanged).length;
  const mfgFills = matched.filter(m => m.updateManufacturer).length;
  const catFills = matched.filter(m => m.updateCategoryId).length;

  // ── Print summary (matches user's exact format) ─────────────────────
  console.log('');
  console.log('=== ACCESS INVENTORY IMPORT SUMMARY ===');
  console.log(`Total in Excel:       ${fmt(data.length)}`);
  console.log(`Brand names fixed:    ${fmt(brandFixCount)}`);
  console.log(`Category names fixed: ${fmt(categoryFixCount)}`);
  console.log('');
  console.log(`Matched (existing):   ${fmt(matched.length)}`);
  console.log(`  - Updated qty:      ${fmt(updatedQty)}`);
  console.log(`  - Already current:  ${fmt(alreadyCurrent)}`);
  console.log(`  - Fill mfg:         ${fmt(mfgFills)}`);
  console.log(`  - Fill category:    ${fmt(catFills)}`);
  console.log(`New products:         ${fmt(newProducts.length)}`);
  console.log(`Conflicts:            ${fmt(conflicts.length)}`);
  console.log(`Skipped (no model):   ${fmt(skipped.length)}`);
  console.log(`Match rate:           ${totalWithModel > 0 ? ((matched.length / totalWithModel) * 100).toFixed(1) : 0}%`);

  // ── Log conflicts ───────────────────────────────────────────────────
  if (conflicts.length > 0) {
    console.log('');
    console.log(`--- CONFLICTS (${conflicts.length}) - not overwritten ---`);
    for (const c of conflicts.slice(0, 30)) {
      for (const detail of c.conflictDetails) {
        console.log(`  CONFLICT: Model ${c.model} - ${detail}`);
      }
    }
    if (conflicts.length > 30) {
      console.log(`  ... and ${conflicts.length - 30} more conflicts`);
    }
  }

  // ── Execute based on mode ───────────────────────────────────────────

  if (mode === 'dry-run') {
    // ── DRY-RUN: Preview only ─────────────────────────────────────
    console.log('');
    console.log('--- DRY-RUN PREVIEW ---');

    if (matched.length > 0) {
      console.log(`\nMatched products (first 25):`);
      for (const m of matched.slice(0, 25)) {
        console.log(`  MATCHED: Model ${m.model} - ${m.action}`);
      }
      if (matched.length > 25) console.log(`  ... and ${matched.length - 25} more`);
    }

    if (newProducts.length > 0) {
      console.log(`\nNew products to insert (first 25):`);
      for (const n of newProducts.slice(0, 25)) {
        console.log(`  NEW: ${n.brand} / ${n.product} / Model ${n.model} - qty: ${n.qty}`);
      }
      if (newProducts.length > 25) console.log(`  ... and ${newProducts.length - 25} more`);
    }

    console.log('\nReady to apply? Run with --apply flag');
    console.log('Want a CSV report? Run with --report flag');

  } else if (mode === 'apply') {
    // ── APPLY: Execute inside a transaction ────────────────────────
    console.log('');
    console.log('--- APPLYING CHANGES (transaction) ---');

    const client = await pool.connect();
    let updated = 0;
    let inserted = 0;

    try {
      await client.query('BEGIN');
      console.log('  Transaction started.');

      // ── Update matched products ─────────────────────────────────
      console.log(`\n  Updating ${fmt(matched.length)} matched products...`);
      for (const match of matched) {
        const setClauses = [
          'qty_on_hand = $1',
          'in_stock = $2',
          'stock_status = $3',
          'last_stock_sync = NOW()',
          "stock_sync_source = 'Access POS Import'",
          "import_source = 'Access POS Import'",
          'import_date = NOW()'
        ];
        const params = [
          match.qty,
          match.qty > 0,
          match.qty > 0 ? 'in_stock' : 'out_of_stock'
        ];
        let paramIdx = 4;

        if (match.updateManufacturer) {
          setClauses.push(`manufacturer = $${paramIdx}`);
          params.push(match.updateManufacturer);
          paramIdx++;
        }

        if (match.updateCategoryId) {
          setClauses.push(`category_id = $${paramIdx}`);
          params.push(match.updateCategoryId);
          paramIdx++;
        }

        params.push(match.id);

        await client.query(
          `UPDATE products SET ${setClauses.join(', ')} WHERE id = $${paramIdx}`,
          params
        );
        updated++;

        if (match.qtyChanged) {
          console.log(`    MATCHED: Model ${match.model} - updated qty from ${match.prevQty} to ${match.qty}`);
        }
      }

      console.log(`  Updates complete: ${fmt(updated)}`);

      // ── Insert new products ─────────────────────────────────────
      if (newProducts.length > 0) {
        console.log(`\n  Inserting ${fmt(newProducts.length)} new products...`);
        for (const np of newProducts) {
          const catMatch = matchCategoryByPatterns(np.product, categories);

          await client.query(`
            INSERT INTO products (
              manufacturer, category, model, name, description,
              price, is_active, qty_on_hand, in_stock, stock_status,
              import_source, import_date, last_stock_sync, stock_sync_source,
              category_id
            ) VALUES (
              $1, $2, $3, $4, $5,
              0, true, $6, $7, $8,
              'Access POS Import', NOW(), NOW(), 'Access POS Import',
              $9
            )
          `, [
            np.brand || 'Unknown',
            np.product || 'Uncategorized',  // category is NOT NULL
            np.model,
            np.description,
            np.description,
            np.qty,
            np.qty > 0,
            np.qty > 0 ? 'in_stock' : 'out_of_stock',
            catMatch ? catMatch.id : null
          ]);
          inserted++;

          console.log(`    NEW: ${np.brand} / ${np.product} / Model ${np.model} - inserted`);
        }

        console.log(`  Inserts complete: ${fmt(inserted)}`);
      }

      // ── Commit ──────────────────────────────────────────────────
      await client.query('COMMIT');
      console.log('\n  Transaction COMMITTED successfully.');
      console.log(`  Updated: ${fmt(updated)} | Inserted: ${fmt(inserted)} | Conflicts: ${fmt(conflicts.length)} (skipped)`);

    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`\n  Transaction ROLLED BACK due to error: ${err.message}`);
      throw err;
    } finally {
      client.release();
    }

  } else if (mode === 'report') {
    // ── REPORT: Generate unified CSV ──────────────────────────────
    console.log('');
    console.log('--- GENERATING REPORT ---');

    const reportPath = path.join(OUTPUT_DIR, 'import_report.csv');
    const headers = ['Model', 'Brand_Access', 'Brand_DB', 'Category_Access', 'Category_DB', 'Qty_Access', 'Qty_DB', 'Status', 'Action'];

    const rows = [];

    // Matched products (conflicts flagged inline, not as separate rows)
    for (const m of matched) {
      const status = m.conflictType.length > 0 ? 'CONFLICT' : 'MATCHED';
      const action = m.conflictType.length > 0
        ? m.action + ' | ' + m.conflictDetails.join('; ')
        : m.action;
      rows.push([
        m.model,
        m.excelBrand,
        m.manufacturer || '',
        m.excelProduct,
        m.category || '',
        m.qty,
        m.prevQty,
        status,
        action
      ]);
    }

    // New products
    for (const n of newProducts) {
      rows.push([
        n.model,
        n.brand,
        '',
        n.product,
        '',
        n.qty,
        '',
        'NEW',
        `Insert with price=0, qty=${n.qty}`
      ]);
    }

    writeCsv(reportPath, headers, rows);
    console.log(`  Report written: ${reportPath}`);
    console.log(`  Total rows: ${fmt(rows.length)} (${fmt(matched.length - conflicts.length)} matched, ${fmt(conflicts.length)} conflicts, ${fmt(newProducts.length)} new)`);
  }

  // ── Brand & category breakdown (always shown) ───────────────────────
  console.log('');
  console.log('=== BRAND BREAKDOWN ===');

  const brandStatsMatched = {};
  const brandStatsNew = {};
  for (const m of matched) {
    const b = m.excelBrand || 'Unknown';
    brandStatsMatched[b] = (brandStatsMatched[b] || 0) + 1;
  }
  for (const n of newProducts) {
    const b = n.brand || 'Unknown';
    brandStatsNew[b] = (brandStatsNew[b] || 0) + 1;
  }

  const allBrands = new Set([...Object.keys(brandStatsMatched), ...Object.keys(brandStatsNew)]);
  const brandRows = [...allBrands].map(b => ({
    brand: b,
    matched: brandStatsMatched[b] || 0,
    new: brandStatsNew[b] || 0,
    total: (brandStatsMatched[b] || 0) + (brandStatsNew[b] || 0)
  })).sort((a, b) => b.total - a.total);

  console.log(`${'Brand'.padEnd(22)} ${'Matched'.padStart(8)} ${'New'.padStart(8)} ${'Total'.padStart(8)}`);
  console.log('─'.repeat(48));
  for (const r of brandRows.slice(0, 20)) {
    console.log(`${r.brand.padEnd(22)} ${String(r.matched).padStart(8)} ${String(r.new).padStart(8)} ${String(r.total).padStart(8)}`);
  }
  if (brandRows.length > 20) console.log(`... and ${brandRows.length - 20} more brands`);

  console.log('');
  console.log('=== CATEGORY BREAKDOWN ===');

  const catStatsMatched = {};
  const catStatsNew = {};
  for (const m of matched) {
    const c = m.excelProduct || 'Unknown';
    catStatsMatched[c] = (catStatsMatched[c] || 0) + 1;
  }
  for (const n of newProducts) {
    const c = n.product || 'Unknown';
    catStatsNew[c] = (catStatsNew[c] || 0) + 1;
  }

  const allCats = new Set([...Object.keys(catStatsMatched), ...Object.keys(catStatsNew)]);
  const catRows = [...allCats].map(c => ({
    cat: c,
    matched: catStatsMatched[c] || 0,
    new: catStatsNew[c] || 0,
    total: (catStatsMatched[c] || 0) + (catStatsNew[c] || 0)
  })).sort((a, b) => b.total - a.total);

  console.log(`${'Category'.padEnd(22)} ${'Matched'.padStart(8)} ${'New'.padStart(8)} ${'Total'.padStart(8)}`);
  console.log('─'.repeat(48));
  for (const r of catRows.slice(0, 20)) {
    console.log(`${r.cat.padEnd(22)} ${String(r.matched).padStart(8)} ${String(r.new).padStart(8)} ${String(r.total).padStart(8)}`);
  }
  if (catRows.length > 20) console.log(`... and ${catRows.length - 20} more categories`);

  // ── Quantity summary ────────────────────────────────────────────────
  const totalQtyMatched = matched.reduce((sum, m) => sum + m.qty, 0);
  const totalQtyNew = newProducts.reduce((sum, n) => sum + n.qty, 0);
  const zeroStockMatched = matched.filter(m => m.qty === 0).length;
  const zeroStockNew = newProducts.filter(n => n.qty === 0).length;

  console.log('');
  console.log('=== QUANTITY SUMMARY ===');
  console.log(`Matched:  ${fmt(totalQtyMatched)} units across ${fmt(matched.length)} products`);
  console.log(`New:      ${fmt(totalQtyNew)} units across ${fmt(newProducts.length)} products`);
  console.log(`Total:    ${fmt(totalQtyMatched + totalQtyNew)} units across ${fmt(matched.length + newProducts.length)} products`);
  console.log(`Zero-stock (valid catalog items): ${fmt(zeroStockMatched + zeroStockNew)} (${fmt(zeroStockMatched)} matched, ${fmt(zeroStockNew)} new)`);

  console.log('\nDone.\n');

  return {
    total: data.length,
    matched: matched.length,
    updatedQty,
    alreadyCurrent,
    new: newProducts.length,
    conflicts: conflicts.length,
    skipped: skipped.length,
    brandFixed: brandFixCount,
    categoryFixed: categoryFixCount,
    matchRate: totalWithModel > 0 ? ((matched.length / totalWithModel) * 100).toFixed(1) + '%' : '0%',
    mode
  };
}

// Run
importAccessInventory()
  .then(result => {
    console.log('Final:', JSON.stringify(result, null, 2));
    process.exit(0);
  })
  .catch(err => {
    console.error('Import failed:', err);
    process.exit(1);
  });
