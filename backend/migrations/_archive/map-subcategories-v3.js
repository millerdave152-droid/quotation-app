/**
 * Subcategory Mapping Migration v3
 *
 * Uses model number patterns for manufacturer-specific mapping:
 * - GE/Samsung dryers: E=Electric, G=Gas in model
 * - Washer model prefixes: WFW/MHW=Front Load, WTW/MVW/NTW=Top Load
 * - Refrigerator model patterns for style detection
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

// Model number patterns by manufacturer
const MODEL_PATTERNS = {
  dryers: {
    'electric-dryer': [
      // Samsung: DVE = Electric
      /^DVE/i,
      // GE/GE Profile: E in position 5-6 (GTD__EB, PTD__EB, GFD__ES)
      /^(GTD|PTD|GFD)\d{2}E/i,
      /^GFT\d{2}/i,  // GE compact
      /^PCVH/i,     // GE portable
      // Electrolux: ELFE
      /^ELFE/i,
      // Whirlpool/Maytag: WED, YWED, YMED, YWEE
      /^Y?WED/i,
      /^Y?MED/i,
      /^YWEE/i,
      /^YWSES/i,
      /^LDR/i,
      // KitchenAid: KSEG, YKSEB
      /^Y?KSE[BG]/i,
    ],
    'gas-dryer': [
      // Samsung: DVG = Gas
      /^DVG/i,
      // GE/GE Profile: G in position 5-6 (GTD__GB)
      /^(GTD|PTD|GFD)\d{2}G/i,
      // Electrolux: ELFG
      /^ELFG/i,
      // Bosch: HGS = gas
      /^HGS/i,
      // Whirlpool/Maytag: WGD, MGD
      /^Y?WGD/i,
      /^Y?MGD/i,
    ]
  },
  washers: {
    'front-load-washer': [
      // Samsung: WF = front load
      /^WF\d/i,
      /^WH\d/i,  // Hub
      // GE: GFW, PFW
      /^[GP]FW/i,
      /^GFR/i,
      // Whirlpool/Maytag: WFW, MHW
      /^WFW/i,
      /^MHW/i,
      // Electrolux: ELFW
      /^ELFW/i,
      // LG: WM
      /^WM\d/i,
      // Bosch: WAW, WAT
      /^WA[WT]/i,
    ],
    'top-load-washer': [
      // Samsung: WA = top load
      /^WA\d/i,
      // GE: GTW, PTW
      /^[GP]TW/i,
      // Whirlpool/Maytag: WTW, MVW, NTW
      /^WTW/i,
      /^MVW/i,
      /^NTW/i,
      // LG: WT
      /^WT\d/i,
      // Frigidaire: FFTW
      /^FFTW/i,
    ]
  },
  refrigerators: {
    'french-door': [
      // Samsung: RF = French door
      /^RF\d/i,
      // GE: GNE, PNE, GYE, PYE, CFE, CVE, CWE, CYE
      /^[GP]NE/i,
      /^[GP]YE/i,
      /^C[VWFY]E/i,
      // LG: LF, LRMF
      /^LF/i,
      /^LRMF/i,
      /^LRFX/i,
      // Whirlpool: WRF
      /^WRF/i,
      // Bertazzoni: REF.*FD
      /REF.*FD/i,
    ],
    'side-by-side': [
      // Samsung: RS = side by side
      /^RS\d/i,
      // GE: GSS, PSS
      /^[GP]SS/i,
      // LG: LSX, LRSXS
      /^L[RS]S/i,
      /^LRSXS/i,
      // Whirlpool: WRS
      /^WRS/i,
    ],
    'top-freezer': [
      // GE: GTS, GTE
      /^GT[SE]/i,
      // Whirlpool: WRT
      /^WRT/i,
      // LG: LT
      /^LT\d/i,
      // Frigidaire: FFTR
      /^FFTR/i,
    ],
    'bottom-freezer': [
      // GE: GBE
      /^GBE/i,
      // Whirlpool: WRB
      /^WRB/i,
      // LG: LBN, LBNC
      /^LBN/i,
    ]
  }
};

// Additional category text patterns
const TEXT_PATTERNS = {
  dryers: {
    'electric-dryer': ['electric', 'elec', '240v'],
    'gas-dryer': ['gas', 'natural gas', 'propane', 'lp'],
    'heat-pump-dryer': ['heat pump', 'ventless']
  },
  washers: {
    'front-load-washer': ['front load', 'fl washer', 'fl compact'],
    'top-load-washer': ['top load', 'tl washer']
  }
};

async function mapSubcategories() {
  console.log('');
  console.log('═'.repeat(70));
  console.log('  SUBCATEGORY MAPPING v3 - MODEL NUMBER PATTERNS');
  console.log('═'.repeat(70));

  const categoriesResult = await pool.query(`
    SELECT id, slug, name FROM categories WHERE is_active = true
  `);
  const categoryBySlug = {};
  for (const cat of categoriesResult.rows) {
    categoryBySlug[cat.slug] = cat;
  }

  const stats = { total: 0, mapped: 0, byCategory: {} };

  // Process each category with model patterns
  for (const [parentSlug, subcatRules] of Object.entries(MODEL_PATTERNS)) {
    const parentCat = categoryBySlug[parentSlug];
    if (!parentCat) continue;

    console.log(`\n📁 Processing ${parentCat.name}...`);
    stats.byCategory[parentSlug] = { total: 0, mapped: 0, subcats: {} };

    // Get unmapped products
    const products = await pool.query(`
      SELECT p.id, p.model, p.name, p.category, p.manufacturer
      FROM products p
      WHERE p.category_id = $1 AND p.subcategory_id IS NULL
    `, [parentCat.id]);

    stats.byCategory[parentSlug].total = products.rows.length;
    stats.total += products.rows.length;

    for (const product of products.rows) {
      let matchedSubcat = null;
      const model = (product.model || '').trim();
      const searchText = [product.category || '', product.name || ''].join(' ').toLowerCase();

      // Try model pattern matching first
      for (const [subcatSlug, patterns] of Object.entries(subcatRules)) {
        const subcat = categoryBySlug[subcatSlug];
        if (!subcat) continue;

        // Check model patterns
        for (const pattern of patterns) {
          if (pattern.test(model)) {
            matchedSubcat = subcat;
            break;
          }
        }
        if (matchedSubcat) break;
      }

      // If no model match, try text patterns
      if (!matchedSubcat && TEXT_PATTERNS[parentSlug]) {
        for (const [subcatSlug, patterns] of Object.entries(TEXT_PATTERNS[parentSlug])) {
          const subcat = categoryBySlug[subcatSlug];
          if (!subcat) continue;

          for (const pattern of patterns) {
            if (searchText.includes(pattern.toLowerCase())) {
              matchedSubcat = subcat;
              break;
            }
          }
          if (matchedSubcat) break;
        }
      }

      if (matchedSubcat) {
        await pool.query(`
          UPDATE products SET subcategory_id = $1 WHERE id = $2
        `, [matchedSubcat.id, product.id]);

        stats.mapped++;
        stats.byCategory[parentSlug].mapped++;
        stats.byCategory[parentSlug].subcats[matchedSubcat.name] =
          (stats.byCategory[parentSlug].subcats[matchedSubcat.name] || 0) + 1;
      }
    }

    const catStats = stats.byCategory[parentSlug];
    console.log(`   Total: ${catStats.total}, Mapped: ${catStats.mapped}`);
    for (const [subName, count] of Object.entries(catStats.subcats)) {
      console.log(`     - ${subName}: ${count}`);
    }
  }

  // Final summary
  console.log('');
  console.log('═'.repeat(70));
  console.log('  MIGRATION SUMMARY');
  console.log('═'.repeat(70));
  console.log(`  Products processed: ${stats.total}`);
  console.log(`  Products mapped: ${stats.mapped}`);
  console.log('');

  const finalStatus = await pool.query(`
    SELECT
      COUNT(*) as total,
      COUNT(category_id) as with_category,
      COUNT(subcategory_id) as with_subcategory
    FROM products
  `);

  console.log('Final Database Status:');
  console.log(`  Total products: ${finalStatus.rows[0].total}`);
  console.log(`  With category: ${finalStatus.rows[0].with_category}`);
  console.log(`  With subcategory: ${finalStatus.rows[0].with_subcategory}`);
  console.log('═'.repeat(70));

  await pool.end();
}

mapSubcategories().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
