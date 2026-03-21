#!/usr/bin/env node
/**
 * UPC Enrichment via Icecat API
 * Fetches GTIN/EAN data for products missing UPC values.
 *
 * Usage:
 *   node scripts/enrich-upc-icecat.js              # Dry run (default)
 *   node scripts/enrich-upc-icecat.js --apply       # Actually update DB
 *   node scripts/enrich-upc-icecat.js --limit 10    # Process only 10 products
 *   node scripts/enrich-upc-icecat.js --brand LG    # Only one brand
 */
require('dotenv').config();
const https = require('https');
const pool = require('../db');

// Icecat brand name mapping (our DB name -> Icecat brand name)
const BRAND_MAP = {
  'SAMSUNG': 'Samsung',
  'Samsung': 'Samsung',
  'LG': 'LG',
  'WHIRLPOOL': 'Whirlpool',
  'KITCHENAID': 'KitchenAid',
  'BOSCH': 'Bosch',
  'JENNAIR': 'Jenn-Air',
  'NAPOLEON': 'Napoleon',
  'MAYTAG': 'Maytag',
  'FRIGIDAIRE': 'Frigidaire',
  'GE': 'GE',
  'GE CAFÃ': 'Café',
  'GE CAFE': 'Café',
  'GE PROFILE': 'GE Profile',
  'SONY': 'Sony',
  'Sony': 'Sony',
  'DANBY': 'Danby',
  'BREVILLE': 'Breville',
  'Breville': 'Breville',
  'HISENSE': 'Hisense',
  'PANASONIC': 'Panasonic',
  'ELECTROLUX': 'Electrolux',
  'TCL': 'TCL',
  'BLOMBERG': 'Blomberg',
  'BERTAZZONI': 'Bertazzoni',
  'BROAN': 'Broan',
  'SONOS': 'Sonos',
  'Sonos': 'Sonos',
};

const RATE_LIMIT_MS = 600; // 600ms between requests to avoid rate limiting

function fetchIcecat(brand, productCode) {
  return new Promise((resolve) => {
    const shopname = process.env.ICECAT_SHOPNAME || process.env.ICECAT_USERNAME || 'openIcecat-live';
    const url = `https://live.icecat.biz/api/?shopname=${encodeURIComponent(shopname)}&Language=en&Brand=${encodeURIComponent(brand)}&ProductCode=${encodeURIComponent(productCode)}`;

    const req = https.get(url, { timeout: 10000 }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        if (res.statusCode === 200) {
          try {
            const json = JSON.parse(data);
            const gi = json.data?.GeneralInfo || {};
            const gtins = gi.GTIN || [];
            // GTIN can be array of strings or single string
            const gtinList = Array.isArray(gtins) ? gtins : [gtins];
            // Filter to valid UPC/EAN (12 or 13 digits)
            const validGtins = gtinList.filter(g => g && /^\d{12,14}$/.test(g.toString().trim()));
            resolve({
              found: true,
              gtins: validGtins,
              title: gi.Title || null,
              brandName: gi.BrandInfo?.BrandName || brand,
            });
          } catch (e) {
            resolve({ found: false, error: 'parse_error' });
          }
        } else {
          resolve({ found: false, error: `http_${res.statusCode}` });
        }
      });
    });

    req.on('error', (e) => resolve({ found: false, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ found: false, error: 'timeout' }); });
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Try multiple product code variations to handle Canadian model suffixes
function getCodeVariants(model) {
  const variants = [model];

  // Remove trailing country suffix like /AC, /ZC, /ZA, /AA, /XAA
  if (/\/[A-Z]{2,3}$/.test(model)) {
    variants.push(model.replace(/\/[A-Z]{2,3}$/, ''));
  }
  // Samsung Canadian: DW80B7070AP/AC -> DW80B7070AP
  // Also try without last 2 chars if they look like country code (AC, ZC)
  if (/[A-Z]{2}$/.test(model) && model.length > 6) {
    variants.push(model.slice(0, -2));
  }
  // Remove color suffix like -SS, -WH, -BK, -AP
  if (/-[A-Z]{2,3}$/.test(model)) {
    variants.push(model.replace(/-[A-Z]{2,3}$/, ''));
  }
  // Samsung Canadian models: FXZC, AFXZC suffixes
  if (/A?FXZC$/.test(model)) {
    variants.push(model.replace(/A?FXZC$/, ''));
  }
  // Samsung: remove AA suffix (e.g., DW80CG4021SRAA -> DW80CG4021SR)
  if (/AA$/.test(model) && model.length > 6) {
    variants.push(model.replace(/AA$/, ''));
  }
  // Samsung washer/dryer Canadian: DVE45B6305P -> try base without last letter
  // LG Canadian: OLED65C4PUA -> OLED65C4P
  if (/[A-Z]$/.test(model) && model.length > 6) {
    variants.push(model.slice(0, -1));
  }
  // Samsung TAC suffix (e.g., DVE53BB8900TAC -> DVE53BB8900T or DVE53BB8900)
  if (/TAC$/.test(model)) {
    variants.push(model.replace(/TAC$/, ''));
    variants.push(model.replace(/TAC$/, 'T'));
  }
  // Samsung VAC suffix
  if (/VAC$/.test(model)) {
    variants.push(model.replace(/VAC$/, ''));
    variants.push(model.replace(/VAC$/, 'V'));
  }
  // Bosch Canadian: HBL5451UC -> HBL5451U or HBL5451
  if (/UC$/.test(model)) {
    variants.push(model.replace(/UC$/, ''));
    variants.push(model.replace(/UC$/, 'U'));
  }
  // Generic: try without last 2 and 3 chars for regional suffixes
  if (model.length > 8) {
    variants.push(model.slice(0, -2));
    variants.push(model.slice(0, -3));
  }

  return [...new Set(variants)];
}

async function run() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--apply');
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1]) : 9999;
  const brandIdx = args.indexOf('--brand');
  const brandFilter = brandIdx >= 0 ? args[brandIdx + 1].toUpperCase() : null;

  console.log(`=== Icecat UPC Enrichment ===`);
  console.log(`Mode: ${dryRun ? 'DRY RUN (use --apply to update DB)' : 'APPLYING UPDATES'}`);
  console.log(`Limit: ${limit}`);
  if (brandFilter) console.log(`Brand filter: ${brandFilter}`);
  console.log('');

  // Get products to enrich
  let query = `
    SELECT id, sku, model, manufacturer
    FROM products
    WHERE (upc IS NULL OR upc = '')
      AND model IS NOT NULL AND model != ''
      AND UPPER(manufacturer) IN (${Object.keys(BRAND_MAP).map((_, i) => `$${i + 1}`).join(', ')})
  `;
  let params = Object.keys(BRAND_MAP).map(k => k);

  if (brandFilter) {
    query = `
      SELECT id, sku, model, manufacturer
      FROM products
      WHERE (upc IS NULL OR upc = '')
        AND model IS NOT NULL AND model != ''
        AND UPPER(manufacturer) = $1
    `;
    params = [brandFilter];
  }

  query += ` ORDER BY manufacturer, model LIMIT ${limit}`;

  const { rows: products } = await pool.query(query, params);
  console.log(`Found ${products.length} products to enrich\n`);

  let found = 0;
  let notFound = 0;
  let errors = 0;
  let updated = 0;
  const results = [];

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const icecatBrand = BRAND_MAP[p.manufacturer] || p.manufacturer;
    const variants = getCodeVariants(p.model);

    let result = null;
    for (const code of variants) {
      result = await fetchIcecat(icecatBrand, code);
      if (result.found && result.gtins.length > 0) break;
      await sleep(RATE_LIMIT_MS);
    }

    if (result.found && result.gtins.length > 0) {
      const upc = result.gtins[0]; // Use first valid GTIN
      found++;
      console.log(`[${i + 1}/${products.length}] ✓ ${p.manufacturer} ${p.model} -> UPC: ${upc}`);

      if (!dryRun) {
        await pool.query('UPDATE products SET upc = $1 WHERE id = $2', [upc, p.id]);
        updated++;
      }

      results.push({ id: p.id, manufacturer: p.manufacturer, model: p.model, upc, status: 'found' });
    } else {
      notFound++;
      const reason = result.error || 'not_in_icecat';
      if (reason !== 'http_404') {
        errors++;
        console.log(`[${i + 1}/${products.length}] ✗ ${p.manufacturer} ${p.model} -> ${reason}`);
      } else {
        console.log(`[${i + 1}/${products.length}] - ${p.manufacturer} ${p.model} -> not found`);
      }
      results.push({ id: p.id, manufacturer: p.manufacturer, model: p.model, status: reason });
    }

    await sleep(RATE_LIMIT_MS);
  }

  console.log('\n=== SUMMARY ===');
  console.log(`Total processed: ${products.length}`);
  console.log(`UPC found: ${found} (${Math.round(found / products.length * 100)}%)`);
  console.log(`Not found: ${notFound}`);
  console.log(`Errors: ${errors}`);
  if (!dryRun) {
    console.log(`DB updated: ${updated}`);
  } else {
    console.log(`\nThis was a DRY RUN. Run with --apply to update the database.`);
  }

  process.exit(0);
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
