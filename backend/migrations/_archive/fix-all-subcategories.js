/**
 * Comprehensive Subcategory Migration Script
 * Fixes all products missing subcategory_id across all categories
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

// Subcategory IDs from database
const SUBCATEGORIES = {
  // Refrigerators (parent_id: 6)
  FRENCH_DOOR: 32,
  SIDE_BY_SIDE: 33,
  TOP_FREEZER: 34,
  BOTTOM_FREEZER: 35,
  COUNTER_DEPTH: 36,

  // Washers (parent_id: 7)
  FRONT_LOAD_WASHER: 37,
  TOP_LOAD_WASHER: 38,

  // Dryers (parent_id: 8)
  ELECTRIC_DRYER: 39,
  GAS_DRYER: 40,
  HEAT_PUMP_DRYER: 41,

  // Ranges (parent_id: 10)
  ELECTRIC_RANGE: 42,
  GAS_RANGE: 43,
  DUAL_FUEL_RANGE: 44,
  INDUCTION_RANGE: 45,
  SLIDE_IN_RANGE: 46,
  FREESTANDING_RANGE: 47,

  // Cooktops (parent_id: 11)
  GAS_COOKTOP: 48,
  ELECTRIC_COOKTOP: 49,
  INDUCTION_COOKTOP: 50,

  // Wall Ovens (parent_id: 12)
  SINGLE_WALL_OVEN: 51,
  DOUBLE_WALL_OVEN: 52,
  COMBO_WALL_OVEN: 53,

  // Microwaves (parent_id: 13)
  COUNTERTOP_MW: 54,
  OTR_MW: 55,
  BUILTIN_MW: 56,
  DRAWER_MW: 57,

  // Range Hoods (parent_id: 14)
  UNDER_CABINET_HOOD: 58,
  WALL_MOUNT_HOOD: 59,
  ISLAND_MOUNT_HOOD: 60,
  DOWNDRAFT_HOOD: 61,

  // Grills (parent_id: 16)
  GAS_GRILL: 62,
  CHARCOAL_GRILL: 63,
  PELLET_GRILL: 64,
  GRIDDLE: 65,

  // Televisions (parent_id: 27)
  OLED_TV: 66,
  QLED_TV: 67,
  MINI_LED_TV: 68,
  LED_LCD_TV: 69,
  PROJECTOR: 70
};

// Mapping rules for each category
const MAPPING_RULES = {
  // REFRIGERATORS
  refrigerators: {
    category_id: 6,
    rules: [
      // French Door patterns
      { subcategory_id: SUBCATEGORIES.FRENCH_DOOR, patterns: ['french door', 'french-door', 'multidoor', '4-door', '4dr', 'fdr', 'quad door', '3-door', 'multi-door'] },
      // Side-by-Side patterns
      { subcategory_id: SUBCATEGORIES.SIDE_BY_SIDE, patterns: ['side-by-side', 'side by side', 'sxs', 's-b-s'] },
      // Top Freezer patterns
      { subcategory_id: SUBCATEGORIES.TOP_FREEZER, patterns: ['top freezer', 'top-freezer', 'tmf', 'top mount'] },
      // Bottom Freezer patterns
      { subcategory_id: SUBCATEGORIES.BOTTOM_FREEZER, patterns: ['bottom freezer', 'bottom-freezer', 'bmf', 'bottom mount', 'bottom-mount'] },
      // Counter Depth (check this first for all types)
      { subcategory_id: SUBCATEGORIES.COUNTER_DEPTH, patterns: ['counter depth', 'counter-depth', 'counterdepth'] }
    ],
    modelPatterns: [
      // Samsung French Door models
      { subcategory_id: SUBCATEGORIES.FRENCH_DOOR, patterns: [/^RF2[4-9]/i, /^RF3[0-9]/i, /^RF4[0-9]/i] },
      // Samsung Side-by-Side
      { subcategory_id: SUBCATEGORIES.SIDE_BY_SIDE, patterns: [/^RS2[0-9]/i, /^RS3[0-9]/i] },
      // LG French Door
      { subcategory_id: SUBCATEGORIES.FRENCH_DOOR, patterns: [/^LF/i, /^LRMV/i, /^LRM/i] },
      // GE French Door
      { subcategory_id: SUBCATEGORIES.FRENCH_DOOR, patterns: [/^GFE/i, /^GNE/i, /^GYE/i, /^PFE/i, /^PVD/i, /^PWE/i] },
      // GE Side-by-Side
      { subcategory_id: SUBCATEGORIES.SIDE_BY_SIDE, patterns: [/^GSE/i, /^GSS/i, /^PSE/i, /^PSS/i] },
      // GE Top Freezer
      { subcategory_id: SUBCATEGORIES.TOP_FREEZER, patterns: [/^GTE/i, /^GTS/i, /^GPE/i] },
      // GE Bottom Freezer
      { subcategory_id: SUBCATEGORIES.BOTTOM_FREEZER, patterns: [/^GBE/i, /^GDE/i] }
    ],
    // Skip non-refrigerator items (freezers, wine coolers, etc.)
    skipPatterns: ['freezer column', 'wine column', 'wine cellar', 'wine cooler', 'beverage', 'chest', 'upright freezer', 'column - stainl', 'ice maker']
  },

  // WASHERS
  washers: {
    category_id: 7,
    rules: [
      { subcategory_id: SUBCATEGORIES.FRONT_LOAD_WASHER, patterns: ['front load', 'front-load', 'fl washer', 'fl '] },
      { subcategory_id: SUBCATEGORIES.TOP_LOAD_WASHER, patterns: ['top load', 'top-load', 'tl washer', 'tl ', 'agitator'] }
    ],
    modelPatterns: [
      // Samsung Front Load
      { subcategory_id: SUBCATEGORIES.FRONT_LOAD_WASHER, patterns: [/^WF[0-9]/i] },
      // Samsung Top Load
      { subcategory_id: SUBCATEGORIES.TOP_LOAD_WASHER, patterns: [/^WA[0-9]/i] },
      // LG Front Load
      { subcategory_id: SUBCATEGORIES.FRONT_LOAD_WASHER, patterns: [/^WM[0-9]/i, /^LG.?WM/i] },
      // LG Top Load
      { subcategory_id: SUBCATEGORIES.TOP_LOAD_WASHER, patterns: [/^WT[0-9]/i, /^LG.?WT/i] },
      // GE Front Load
      { subcategory_id: SUBCATEGORIES.FRONT_LOAD_WASHER, patterns: [/^GFW/i, /^PFW/i, /^UFW/i] },
      // GE Top Load
      { subcategory_id: SUBCATEGORIES.TOP_LOAD_WASHER, patterns: [/^GTW/i, /^PTW/i] },
      // Whirlpool/Maytag Front Load
      { subcategory_id: SUBCATEGORIES.FRONT_LOAD_WASHER, patterns: [/^WFW/i, /^MHW/i] },
      // Whirlpool/Maytag Top Load
      { subcategory_id: SUBCATEGORIES.TOP_LOAD_WASHER, patterns: [/^WTW/i, /^MVW/i] },
      // Electrolux Front Load
      { subcategory_id: SUBCATEGORIES.FRONT_LOAD_WASHER, patterns: [/^ELFW/i, /^EFLS/i] },
      // Bosch (all front load)
      { subcategory_id: SUBCATEGORIES.FRONT_LOAD_WASHER, patterns: [/^WGA/i, /^WGB/i, /^WPA/i] }
    ],
    skipPatterns: ['hose', 'kit', 'clamp', 'brush', 'cleaner', 'accessory', 'stacking']
  },

  // DRYERS
  dryers: {
    category_id: 8,
    rules: [
      { subcategory_id: SUBCATEGORIES.ELECTRIC_DRYER, patterns: ['electric dryer', 'electric'] },
      { subcategory_id: SUBCATEGORIES.GAS_DRYER, patterns: ['gas dryer', 'gas', 'natural gas', 'propane'] },
      { subcategory_id: SUBCATEGORIES.HEAT_PUMP_DRYER, patterns: ['heat pump', 'ventless', 'condensing'] }
    ],
    modelPatterns: [
      // Samsung Electric
      { subcategory_id: SUBCATEGORIES.ELECTRIC_DRYER, patterns: [/^DVE/i, /^DV\d{2}[A-Z]/i] },
      // Samsung Gas
      { subcategory_id: SUBCATEGORIES.GAS_DRYER, patterns: [/^DVG/i] },
      // LG Electric
      { subcategory_id: SUBCATEGORIES.ELECTRIC_DRYER, patterns: [/^DLE[0-9]/i, /^DLGX/i] },
      // LG Gas
      { subcategory_id: SUBCATEGORIES.GAS_DRYER, patterns: [/^DLG[0-9]/i] },
      // GE Electric
      { subcategory_id: SUBCATEGORIES.ELECTRIC_DRYER, patterns: [/^G[FT]D\d+E/i, /^P[FT]D\d+E/i] },
      // GE Gas
      { subcategory_id: SUBCATEGORIES.GAS_DRYER, patterns: [/^G[FT]D\d+G/i, /^P[FT]D\d+G/i] },
      // Whirlpool Electric
      { subcategory_id: SUBCATEGORIES.ELECTRIC_DRYER, patterns: [/^WED/i, /^MED/i, /^YMED/i, /^YWED/i] },
      // Whirlpool Gas
      { subcategory_id: SUBCATEGORIES.GAS_DRYER, patterns: [/^WGD/i, /^MGD/i] },
      // Heat pump models
      { subcategory_id: SUBCATEGORIES.HEAT_PUMP_DRYER, patterns: [/^DLHC/i, /^WQB/i] }
    ],
    fuelTypeMap: {
      'electric': SUBCATEGORIES.ELECTRIC_DRYER,
      'gas': SUBCATEGORIES.GAS_DRYER,
      'heat_pump': SUBCATEGORIES.HEAT_PUMP_DRYER,
      'ventless': SUBCATEGORIES.HEAT_PUMP_DRYER
    }
  },

  // RANGES
  ranges: {
    category_id: 10,
    rules: [
      { subcategory_id: SUBCATEGORIES.INDUCTION_RANGE, patterns: ['induction'] },
      { subcategory_id: SUBCATEGORIES.DUAL_FUEL_RANGE, patterns: ['dual fuel', 'dual-fuel', 'dualfuel'] },
      { subcategory_id: SUBCATEGORIES.GAS_RANGE, patterns: ['gas range', 'gas oven', 'natural gas', 'propane', 'convection gas', ' gas '] },
      { subcategory_id: SUBCATEGORIES.ELECTRIC_RANGE, patterns: ['electric range', 'electric self', 'electric convection', 'radiant', 'smoothtop', 'ceramic'] },
      { subcategory_id: SUBCATEGORIES.SLIDE_IN_RANGE, patterns: ['slide-in', 'slide in', 'slidein'] },
      { subcategory_id: SUBCATEGORIES.FREESTANDING_RANGE, patterns: ['freestanding', 'free-standing', 'free standing'] }
    ],
    modelPatterns: [
      // Samsung Electric Ranges
      { subcategory_id: SUBCATEGORIES.ELECTRIC_RANGE, patterns: [/^NE[0-9]/i, /^NX60/i] },
      // Samsung Gas Ranges
      { subcategory_id: SUBCATEGORIES.GAS_RANGE, patterns: [/^NX58/i, /^NX30/i] },
      // LG Electric
      { subcategory_id: SUBCATEGORIES.ELECTRIC_RANGE, patterns: [/^LR[ES]/i, /^LS[RS]E/i] },
      // LG Gas
      { subcategory_id: SUBCATEGORIES.GAS_RANGE, patterns: [/^LRG/i, /^LSG/i] },
      // GE Electric
      { subcategory_id: SUBCATEGORIES.ELECTRIC_RANGE, patterns: [/^J[BS]S?[0-9]{3}/i, /^PB9/i, /^PS9/i, /^PHS9/i] },
      // GE Gas
      { subcategory_id: SUBCATEGORIES.GAS_RANGE, patterns: [/^JGB/i, /^JGBS/i, /^PGB/i, /^PGS9/i] },
      // GE Induction
      { subcategory_id: SUBCATEGORIES.INDUCTION_RANGE, patterns: [/^PHI9/i, /^PHS9.*I/i] },
      // Bertazzoni patterns
      { subcategory_id: SUBCATEGORIES.GAS_RANGE, patterns: [/^HER.*BCFGM/i, /^MAS.*GAM/i, /^PRO.*GAM/i] },
      { subcategory_id: SUBCATEGORIES.DUAL_FUEL_RANGE, patterns: [/^HER.*BCFE/i, /^MAS.*DFM/i, /^PRO.*DFM/i] },
      { subcategory_id: SUBCATEGORIES.INDUCTION_RANGE, patterns: [/^HER.*ICFE/i, /^MAS.*I/i, /^PRO.*I/i] },
      // Thor Kitchen patterns
      { subcategory_id: SUBCATEGORIES.GAS_RANGE, patterns: [/^HRG/i, /^LRG/i, /^TRG/i] },
      { subcategory_id: SUBCATEGORIES.DUAL_FUEL_RANGE, patterns: [/^HRD/i, /^LRD/i] }
    ],
    fuelTypeMap: {
      'gas': SUBCATEGORIES.GAS_RANGE,
      'electric': SUBCATEGORIES.ELECTRIC_RANGE,
      'dual_fuel': SUBCATEGORIES.DUAL_FUEL_RANGE,
      'induction': SUBCATEGORIES.INDUCTION_RANGE
    },
    skipPatterns: ['coffee', 'coffee machine', 'warming drawer', 'accessory', 'griddle']
  },

  // COOKTOPS
  cooktops: {
    category_id: 11,
    rules: [
      { subcategory_id: SUBCATEGORIES.INDUCTION_COOKTOP, patterns: ['induction'] },
      { subcategory_id: SUBCATEGORIES.GAS_COOKTOP, patterns: ['gas cooktop', 'gas burner', 'sealed burner', 'natural gas'] },
      { subcategory_id: SUBCATEGORIES.ELECTRIC_COOKTOP, patterns: ['electric cooktop', 'radiant', 'smoothtop', 'ceramic'] }
    ],
    modelPatterns: [
      // Induction patterns
      { subcategory_id: SUBCATEGORIES.INDUCTION_COOKTOP, patterns: [/^NZ/i, /^LECJ/i, /induction/i] },
      // Gas patterns
      { subcategory_id: SUBCATEGORIES.GAS_COOKTOP, patterns: [/^NA/i, /^LCGJ/i, /^CGP/i, /^JGP/i, /^PGP/i, /^MDD/i] },
      // Electric patterns
      { subcategory_id: SUBCATEGORIES.ELECTRIC_COOKTOP, patterns: [/^NZ3/i, /^JP3/i, /^PP9/i] }
    ],
    fuelTypeMap: {
      'gas': SUBCATEGORIES.GAS_COOKTOP,
      'electric': SUBCATEGORIES.ELECTRIC_COOKTOP,
      'induction': SUBCATEGORIES.INDUCTION_COOKTOP
    }
  },

  // WALL OVENS
  wall_ovens: {
    category_id: 12,
    rules: [
      { subcategory_id: SUBCATEGORIES.COMBO_WALL_OVEN, patterns: ['combo', 'combination', 'microwave oven', 'speed oven', 'advantium'] },
      { subcategory_id: SUBCATEGORIES.DOUBLE_WALL_OVEN, patterns: ['double', 'twin'] },
      { subcategory_id: SUBCATEGORIES.SINGLE_WALL_OVEN, patterns: ['single'] }
    ],
    modelPatterns: [
      // Samsung double
      { subcategory_id: SUBCATEGORIES.DOUBLE_WALL_OVEN, patterns: [/^NV51.*D/i, /^NQ70/i] },
      // Samsung single
      { subcategory_id: SUBCATEGORIES.SINGLE_WALL_OVEN, patterns: [/^NV51/i] },
      // GE double
      { subcategory_id: SUBCATEGORIES.DOUBLE_WALL_OVEN, patterns: [/^J[KT]D/i, /^P[KT]D/i] },
      // GE single
      { subcategory_id: SUBCATEGORIES.SINGLE_WALL_OVEN, patterns: [/^J[KT]S/i, /^P[KT]S/i] },
      // GE combo
      { subcategory_id: SUBCATEGORIES.COMBO_WALL_OVEN, patterns: [/^PSB/i, /^PWB/i] },
      // Bosch
      { subcategory_id: SUBCATEGORIES.DOUBLE_WALL_OVEN, patterns: [/^HBL8/i, /^HBN86/i] },
      { subcategory_id: SUBCATEGORIES.SINGLE_WALL_OVEN, patterns: [/^HBL5/i, /^HBN84/i, /^HSLP/i] },
      // Thor
      { subcategory_id: SUBCATEGORIES.SINGLE_WALL_OVEN, patterns: [/^HEW/i, /^TWO/i] },
      { subcategory_id: SUBCATEGORIES.DOUBLE_WALL_OVEN, patterns: [/^HEW.*D/i] }
    ],
    subtypeMap: {
      'single': SUBCATEGORIES.SINGLE_WALL_OVEN,
      'double': SUBCATEGORIES.DOUBLE_WALL_OVEN,
      'combination': SUBCATEGORIES.COMBO_WALL_OVEN,
      'combo': SUBCATEGORIES.COMBO_WALL_OVEN
    },
    skipPatterns: ['warming drawer', 'microwave', 'trim', 'accessory']
  },

  // MICROWAVES
  microwaves: {
    category_id: 13,
    rules: [
      { subcategory_id: SUBCATEGORIES.OTR_MW, patterns: ['over the range', 'over-the-range', 'otr', 'overhead'] },
      { subcategory_id: SUBCATEGORIES.BUILTIN_MW, patterns: ['built-in', 'built in', 'builtin', 'bi microwave'] },
      { subcategory_id: SUBCATEGORIES.DRAWER_MW, patterns: ['drawer'] },
      { subcategory_id: SUBCATEGORIES.COUNTERTOP_MW, patterns: ['countertop', 'counter top', 'portable'] }
    ],
    modelPatterns: [
      // OTR patterns
      { subcategory_id: SUBCATEGORIES.OTR_MW, patterns: [/^ME[0-9]/i, /^JVM/i, /^PVM/i, /^LMV/i, /^LMHM/i, /^WMH/i, /^MMV/i, /^YJMH/i] },
      // Built-in patterns
      { subcategory_id: SUBCATEGORIES.BUILTIN_MW, patterns: [/^JEB/i, /^PEB/i, /^CEB/i, /^HMB/i, /^LSMC/i] },
      // Drawer patterns
      { subcategory_id: SUBCATEGORIES.DRAWER_MW, patterns: [/^SMD/i, /^MW/i] },
      // Countertop patterns
      { subcategory_id: SUBCATEGORIES.COUNTERTOP_MW, patterns: [/^JES/i, /^PES/i, /^LMC/i, /^MC/i, /^DBMW/i] }
    ],
    subtypeMap: {
      'over_the_range': SUBCATEGORIES.OTR_MW,
      'otr': SUBCATEGORIES.OTR_MW,
      'built_in': SUBCATEGORIES.BUILTIN_MW,
      'drawer': SUBCATEGORIES.DRAWER_MW,
      'countertop': SUBCATEGORIES.COUNTERTOP_MW
    },
    skipPatterns: ['trim kit', 'kit for', 'filler', 'hanging kit', 'bump out']
  },

  // RANGE HOODS
  range_hoods: {
    category_id: 14,
    rules: [
      { subcategory_id: SUBCATEGORIES.ISLAND_MOUNT_HOOD, patterns: ['island', 'ceiling'] },
      { subcategory_id: SUBCATEGORIES.DOWNDRAFT_HOOD, patterns: ['downdraft', 'down draft', 'retractable'] },
      { subcategory_id: SUBCATEGORIES.WALL_MOUNT_HOOD, patterns: ['wall mount', 'wall-mount', 'chimney', 'pyramid', 'canopy'] },
      { subcategory_id: SUBCATEGORIES.UNDER_CABINET_HOOD, patterns: ['under cabinet', 'undercabinet', 'under-cabinet', 'undermount', 'telescopic'] }
    ],
    modelPatterns: [
      // Under cabinet
      { subcategory_id: SUBCATEGORIES.UNDER_CABINET_HOOD, patterns: [/^DUH/i, /^JVX/i, /^PVX/i, /^UVL/i, /^UVH/i, /^KU/i, /^KTV/i] },
      // Wall mount
      { subcategory_id: SUBCATEGORIES.WALL_MOUNT_HOOD, patterns: [/^HCP/i, /^NKV/i, /^JVW/i, /^PVW/i, /^KW/i, /^KIN/i] },
      // Island
      { subcategory_id: SUBCATEGORIES.ISLAND_MOUNT_HOOD, patterns: [/^HIB/i, /^KI/i, /^UVI/i] },
      // Downdraft
      { subcategory_id: SUBCATEGORIES.DOWNDRAFT_HOOD, patterns: [/^DD/i, /^CVW/i, /^UVD/i] }
    ],
    subtypeMap: {
      'under_cabinet': SUBCATEGORIES.UNDER_CABINET_HOOD,
      'wall_mount': SUBCATEGORIES.WALL_MOUNT_HOOD,
      'island': SUBCATEGORIES.ISLAND_MOUNT_HOOD,
      'downdraft': SUBCATEGORIES.DOWNDRAFT_HOOD
    },
    skipPatterns: ['blower', 'duct', 'filter', 'flue', 'extension', 'recirculation', 'charcoal']
  },

  // GRILLS
  grills: {
    category_id: 16,
    rules: [
      { subcategory_id: SUBCATEGORIES.PELLET_GRILL, patterns: ['pellet', 'smoker grill', 'wood fire'] },
      { subcategory_id: SUBCATEGORIES.CHARCOAL_GRILL, patterns: ['charcoal', 'kamado', 'ceramic'] },
      { subcategory_id: SUBCATEGORIES.GRIDDLE, patterns: ['griddle', 'flat top', 'flattop'] },
      { subcategory_id: SUBCATEGORIES.GAS_GRILL, patterns: ['gas grill', 'propane', 'natural gas', 'infrared', 'portable grill', 'built-in grill'] }
    ],
    modelPatterns: [
      // Napoleon patterns
      { subcategory_id: SUBCATEGORIES.GAS_GRILL, patterns: [/^BIP/i, /^BI[PL]/i, /^PRO/i, /^RSE/i, /^LE/i, /^TQ/i] },
      // Pellet
      { subcategory_id: SUBCATEGORIES.PELLET_GRILL, patterns: [/^YS/i] },
      // Charcoal
      { subcategory_id: SUBCATEGORIES.CHARCOAL_GRILL, patterns: [/^PRO22/i, /^DERA/i, /^ASG/i] }
    ],
    fuelTypeMap: {
      'gas': SUBCATEGORIES.GAS_GRILL,
      'charcoal': SUBCATEGORIES.CHARCOAL_GRILL,
      'pellet': SUBCATEGORIES.PELLET_GRILL,
      'electric': SUBCATEGORIES.GAS_GRILL  // Electric grills go with gas category
    },
    skipPatterns: ['cover', 'accessory', 'handle light', 'rotisserie', 'grill mat']
  },

  // TELEVISIONS
  televisions: {
    category_id: 27,
    rules: [
      { subcategory_id: SUBCATEGORIES.OLED_TV, patterns: ['oled'] },
      { subcategory_id: SUBCATEGORIES.QLED_TV, patterns: ['qled', 'neo qled', 'neo-qled'] },
      { subcategory_id: SUBCATEGORIES.MINI_LED_TV, patterns: ['mini led', 'miniled', 'mini-led', 'qned'] },
      { subcategory_id: SUBCATEGORIES.PROJECTOR, patterns: ['projector', 'laser tv', 'ust', 'ultra short throw'] },
      { subcategory_id: SUBCATEGORIES.LED_LCD_TV, patterns: ['led', 'lcd', 'uhd', '4k', '8k', 'crystal', 'nanocell', 'uhdtv'] }
    ],
    modelPatterns: [
      // Samsung OLED
      { subcategory_id: SUBCATEGORIES.OLED_TV, patterns: [/^QN.*OLED/i, /^S9[0-9].*OLED/i] },
      // Samsung QLED/Neo QLED
      { subcategory_id: SUBCATEGORIES.QLED_TV, patterns: [/^QN[0-9]/i, /^Q[EN][0-9]/i] },
      // Samsung Crystal UHD (LED)
      { subcategory_id: SUBCATEGORIES.LED_LCD_TV, patterns: [/^UN[0-9]/i, /^CU[0-9]/i, /^TU[0-9]/i, /^DU[0-9]/i] },
      // LG OLED
      { subcategory_id: SUBCATEGORIES.OLED_TV, patterns: [/^OLED/i, /OLED/i] },
      // LG QNED (Mini LED)
      { subcategory_id: SUBCATEGORIES.MINI_LED_TV, patterns: [/^QNED/i, /QNED/i] },
      // LG NanoCell
      { subcategory_id: SUBCATEGORIES.LED_LCD_TV, patterns: [/^NANO/i, /^[0-9]{2}NANO/i] },
      // Sony OLED
      { subcategory_id: SUBCATEGORIES.OLED_TV, patterns: [/^XR.*OLED/i, /^A[0-9].*OLED/i, /^KD.*A[89]/i] },
      // Sony LED
      { subcategory_id: SUBCATEGORIES.LED_LCD_TV, patterns: [/^XR[0-9]/i, /^KD[0-9]/i, /^X[0-9]/i] },
      // Hisense patterns
      { subcategory_id: SUBCATEGORIES.MINI_LED_TV, patterns: [/ULED/i, /^U[789]/i, /^UX/i] },
      { subcategory_id: SUBCATEGORIES.QLED_TV, patterns: [/^Q[0-9]/i] },
      // Projectors
      { subcategory_id: SUBCATEGORIES.PROJECTOR, patterns: [/^PL/i, /^PX/i, /^L[0-9]/i, /^C[12]/i, /laser/i, /projector/i] }
    ],
    // Default to LED/LCD if no match
    defaultSubcategory: SUBCATEGORIES.LED_LCD_TV
  }
};

async function mapProductToSubcategory(product, rules) {
  const searchText = [
    product.category || '',
    product.name || '',
    product.manufacturer || ''
  ].join(' ').toLowerCase();

  const model = (product.model || '').toUpperCase();

  // Check skip patterns first
  if (rules.skipPatterns) {
    for (const skip of rules.skipPatterns) {
      if (searchText.includes(skip.toLowerCase())) {
        return null; // Skip this product
      }
    }
  }

  // Check extended attributes
  if (rules.fuelTypeMap && product.fuel_type) {
    const mapped = rules.fuelTypeMap[product.fuel_type.toLowerCase()];
    if (mapped) return mapped;
  }

  if (rules.subtypeMap && product.subtype) {
    const mapped = rules.subtypeMap[product.subtype.toLowerCase()];
    if (mapped) return mapped;
  }

  // Check text patterns
  for (const rule of rules.rules || []) {
    for (const pattern of rule.patterns) {
      if (searchText.includes(pattern.toLowerCase())) {
        return rule.subcategory_id;
      }
    }
  }

  // Check model patterns
  for (const rule of rules.modelPatterns || []) {
    for (const pattern of rule.patterns) {
      if (pattern.test(model)) {
        return rule.subcategory_id;
      }
    }
  }

  // Default subcategory if specified
  if (rules.defaultSubcategory) {
    return rules.defaultSubcategory;
  }

  return null;
}

async function migrate() {
  console.log('='.repeat(70));
  console.log('COMPREHENSIVE SUBCATEGORY MIGRATION');
  console.log('='.repeat(70));

  let totalMapped = 0;
  let totalSkipped = 0;
  let totalFailed = 0;

  for (const [categoryName, rules] of Object.entries(MAPPING_RULES)) {
    console.log(`\n--- Processing ${categoryName.toUpperCase()} ---`);

    // Get products without subcategory_id
    const products = await pool.query(`
      SELECT p.id, p.model, p.manufacturer, p.name, p.category,
             pea.fuel_type, pea.subtype, pea.depth_type
      FROM products p
      LEFT JOIN product_extended_attributes pea ON p.id = pea.product_id
      WHERE p.category_id = $1
        AND p.subcategory_id IS NULL
    `, [rules.category_id]);

    console.log(`Found ${products.rows.length} products without subcategory`);

    let mapped = 0;
    let skipped = 0;
    let failed = 0;

    for (const product of products.rows) {
      const subcategoryId = await mapProductToSubcategory(product, rules);

      if (subcategoryId === null) {
        skipped++;
        continue;
      }

      try {
        await pool.query(
          'UPDATE products SET subcategory_id = $1 WHERE id = $2',
          [subcategoryId, product.id]
        );
        mapped++;
      } catch (err) {
        console.error(`Error updating product ${product.id}:`, err.message);
        failed++;
      }
    }

    console.log(`  Mapped: ${mapped}, Skipped: ${skipped}, Failed: ${failed}`);
    totalMapped += mapped;
    totalSkipped += skipped;
    totalFailed += failed;
  }

  console.log('\n' + '='.repeat(70));
  console.log(`TOTAL: Mapped ${totalMapped}, Skipped ${totalSkipped}, Failed ${totalFailed}`);
  console.log('='.repeat(70));

  await pool.end();
}

migrate().catch(e => {
  console.error('Migration error:', e);
  process.exit(1);
});
