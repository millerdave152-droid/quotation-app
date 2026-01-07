/**
 * Manufacturer Normalization Migration
 *
 * Fixes:
 * - Trim whitespace
 * - Merge duplicates
 * - Fix obvious errors
 * - Infer manufacturer from model/name patterns
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

// Normalization rules: map variations to canonical names
const MANUFACTURER_MAP = {
  // Duplicates with spaces
  'ELECTROLUX  ': 'ELECTROLUX',
  '912000479  ': null,  // Remove junk
  'FRPARC2 ': null,     // Part number, not manufacturer

  // Junk data (part numbers, not manufacturers)
  '912000479': null,
  'FHTC103WA1': null,
  'FHTC123WA1': null,
  'FRPARAC10': null,
  'FRPARAC11': null,
  'FRPARAC5': null,
  'FRPARAC7': null,
  'FRPARAC8': null,
  'FRPARC1': null,
  'FRPARC6': null,
  'GHWQ085WD1': null,
  'GHWQ105WD1': null,
  'GHWQ125WD1': null,

  // Test data
  'TEST_BRAND': null,
  'TESTCO': null,
};

// Model prefix patterns to infer manufacturer
const MODEL_TO_MANUFACTURER = [
  // Samsung patterns
  { pattern: /^(RF|RS|RH|RB|RT|WF|WA|WH|WD|DV|DVE|DVG|NE|NX|NZ|NK|ME|MC|MG|QN|Q[6-9][0-9]|UN|HW|MX|SP|BN)/i, manufacturer: 'SAMSUNG' },

  // LG patterns
  { pattern: /^(LF|LM|LR|LS|LT|LW|WM|WT|WK|DL|DT|DF|LDF|LRMF|LRSXS|LRFX|LRE|LSR|LSD|OLED|NANO|QNED)/i, manufacturer: 'LG' },

  // GE patterns
  { pattern: /^(GFE|GFW|GNE|GSS|GTE|GTS|GTW|GTD|GFD|GUD|GNW|GSE|JB|JGS|JT|JBS|JGC|PT|PF|PV|PB|PD|PK|PH|PG|PS|PP|PC)/i, manufacturer: 'GE' },

  // Whirlpool patterns
  { pattern: /^(WF|WR|WT|WE|WD|WG|WOD|WOS|WOC|MH|ME|MG|MW|MFF|MFI|MS|MT)/i, manufacturer: 'WHIRLPOOL' },

  // KitchenAid patterns
  { pattern: /^(KR|KF|KA|KS|KD|KB|KC|KO|KU|KI|KT|KM|KE|KX|KY|KRFC|KRFF|KRMF|KDTE|KDFE|KDTM|KOSE|KOCE)/i, manufacturer: 'KITCHENAID' },

  // Bosch patterns
  { pattern: /^(B[36][0-9]|HB|HD|HG|HM|HC|NG|SH|SP|SL)/i, manufacturer: 'BOSCH' },

  // Electrolux/Frigidaire patterns
  { pattern: /^(EL|EI|EW|EIFL|ELFE|ELFW|ELFG|EPCH|EPIC|EWFLS|EWFL|FFSS|FGHD|FGH|FFT|FRS|FPBM|FPG)/i, manufacturer: 'ELECTROLUX' },

  // Maytag patterns
  { pattern: /^(MH|ME|MG|MA|MF|MS|MT|MV|MC|MW|MY)/i, manufacturer: 'MAYTAG' },

  // Jenn-Air patterns
  { pattern: /^(JA|JB|JD|JE|JF|JG|JI|JJ|JM|JO|JS|JU|JW|JX|JGC|JGS|JIC|JIS|JFC|JFS|JDS|JJW)/i, manufacturer: 'JENN-AIR' },
];

async function normalize() {
  console.log('');
  console.log('═'.repeat(70));
  console.log('  MANUFACTURER NORMALIZATION MIGRATION');
  console.log('═'.repeat(70));
  console.log('');

  const stats = {
    trimmed: 0,
    mapped: 0,
    inferred: 0,
    removed: 0
  };

  // Step 1: Trim all manufacturer names
  console.log('Step 1: Trimming whitespace...');
  const trimResult = await pool.query(`
    UPDATE products
    SET manufacturer = TRIM(manufacturer)
    WHERE manufacturer != TRIM(manufacturer)
  `);
  stats.trimmed = trimResult.rowCount;
  console.log(`   Trimmed: ${stats.trimmed} products`);

  // Step 2: Apply manufacturer mapping
  console.log('\nStep 2: Applying manufacturer mappings...');
  for (const [from, to] of Object.entries(MANUFACTURER_MAP)) {
    const trimmedFrom = from.trim();
    if (to === null) {
      // Set to NULL for junk data
      const result = await pool.query(`
        UPDATE products SET manufacturer = NULL WHERE manufacturer = $1
      `, [trimmedFrom]);
      if (result.rowCount > 0) {
        console.log(`   Removed "${trimmedFrom}": ${result.rowCount} products`);
        stats.removed += result.rowCount;
      }
    } else {
      // Map to canonical name
      const result = await pool.query(`
        UPDATE products SET manufacturer = $1 WHERE manufacturer = $2
      `, [to, trimmedFrom]);
      if (result.rowCount > 0) {
        console.log(`   Mapped "${trimmedFrom}" -> "${to}": ${result.rowCount} products`);
        stats.mapped += result.rowCount;
      }
    }
  }

  // Step 3: Infer manufacturer from model patterns for products with missing manufacturer
  console.log('\nStep 3: Inferring manufacturer from model patterns...');
  const missingMfr = await pool.query(`
    SELECT id, model, name, category
    FROM products
    WHERE (manufacturer IS NULL OR manufacturer = '')
      AND model IS NOT NULL AND model != ''
  `);

  for (const product of missingMfr.rows) {
    const model = product.model || '';
    let inferredMfr = null;

    for (const rule of MODEL_TO_MANUFACTURER) {
      if (rule.pattern.test(model)) {
        inferredMfr = rule.manufacturer;
        break;
      }
    }

    if (inferredMfr) {
      await pool.query(`
        UPDATE products SET manufacturer = $1 WHERE id = $2
      `, [inferredMfr, product.id]);
      stats.inferred++;
    }
  }
  console.log(`   Inferred: ${stats.inferred} products`);

  // Step 4: Try to infer from product name
  console.log('\nStep 4: Inferring from product name...');
  const stillMissing = await pool.query(`
    SELECT id, model, name
    FROM products
    WHERE (manufacturer IS NULL OR manufacturer = '')
      AND name IS NOT NULL AND name != ''
    LIMIT 500
  `);

  const brandPatterns = [
    { pattern: /\bsamsung\b/i, manufacturer: 'SAMSUNG' },
    { pattern: /\blg\b/i, manufacturer: 'LG' },
    { pattern: /\bwhirlpool\b/i, manufacturer: 'WHIRLPOOL' },
    { pattern: /\bkitchenaid\b/i, manufacturer: 'KITCHENAID' },
    { pattern: /\bmaytag\b/i, manufacturer: 'MAYTAG' },
    { pattern: /\bge profile\b/i, manufacturer: 'GE PROFILE' },
    { pattern: /\bge\b/i, manufacturer: 'GE' },
    { pattern: /\bbosch\b/i, manufacturer: 'BOSCH' },
    { pattern: /\belectrolux\b/i, manufacturer: 'ELECTROLUX' },
    { pattern: /\bfrigidaire\b/i, manufacturer: 'FRIGIDAIRE' },
    { pattern: /\bjenn-?air\b/i, manufacturer: 'JENN-AIR' },
    { pattern: /\bcaf[eé]\b/i, manufacturer: 'CAFÉ' },
    { pattern: /\bsony\b/i, manufacturer: 'SONY' },
    { pattern: /\bhisense\b/i, manufacturer: 'HISENSE' },
    { pattern: /\btcl\b/i, manufacturer: 'TCL' },
  ];

  let inferredFromName = 0;
  for (const product of stillMissing.rows) {
    const name = product.name || '';
    for (const rule of brandPatterns) {
      if (rule.pattern.test(name)) {
        await pool.query(`
          UPDATE products SET manufacturer = $1 WHERE id = $2
        `, [rule.manufacturer, product.id]);
        inferredFromName++;
        break;
      }
    }
  }
  console.log(`   Inferred from name: ${inferredFromName} products`);

  // Final summary
  console.log('');
  console.log('═'.repeat(70));
  console.log('  SUMMARY');
  console.log('═'.repeat(70));
  console.log(`  Trimmed whitespace: ${stats.trimmed}`);
  console.log(`  Mapped to canonical: ${stats.mapped}`);
  console.log(`  Removed junk: ${stats.removed}`);
  console.log(`  Inferred from model: ${stats.inferred}`);
  console.log(`  Inferred from name: ${inferredFromName}`);
  console.log('');

  // Final counts
  const finalCounts = await pool.query(`
    SELECT
      COUNT(DISTINCT manufacturer) as unique_manufacturers,
      COUNT(*) FILTER (WHERE manufacturer IS NOT NULL AND manufacturer != '') as with_manufacturer,
      COUNT(*) FILTER (WHERE manufacturer IS NULL OR manufacturer = '') as without_manufacturer
    FROM products
  `);

  console.log('Final Status:');
  console.log(`  Unique manufacturers: ${finalCounts.rows[0].unique_manufacturers}`);
  console.log(`  Products with manufacturer: ${finalCounts.rows[0].with_manufacturer}`);
  console.log(`  Products without manufacturer: ${finalCounts.rows[0].without_manufacturer}`);
  console.log('═'.repeat(70));

  await pool.end();
}

normalize().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
