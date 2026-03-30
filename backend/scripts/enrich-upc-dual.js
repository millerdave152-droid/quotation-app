#!/usr/bin/env node
/**
 * UPC Enrichment via Barcode Lookup API + Icecat (dual source)
 * Tries Barcode Lookup first (better coverage), falls back to Icecat.
 *
 * Usage:
 *   node scripts/enrich-upc-dual.js                # Dry run
 *   node scripts/enrich-upc-dual.js --apply        # Update DB
 *   node scripts/enrich-upc-dual.js --limit 50     # Process 50 products
 *   node scripts/enrich-upc-dual.js --brand LG     # Only one brand
 */
// Allow self-signed certs for local dev connecting to AWS RDS
if (!process.env.NODE_ENV || process.env.NODE_ENV === 'production') {
  process.env.NODE_ENV = 'development';
  process.env.DB_SSL_REJECT_UNAUTHORIZED = 'false';
}
require('dotenv').config({ override: false });
const https = require('https');
const pool = require('../db');

const BARCODE_API_KEY = process.env.BARCODE_LOOKUP_API_KEY;
const ICECAT_SHOPNAME = process.env.ICECAT_SHOPNAME || process.env.ICECAT_USERNAME || 'openIcecat-live';

// Icecat brand name mapping
const ICECAT_BRAND_MAP = {
  'SAMSUNG': 'Samsung', 'LG': 'LG', 'WHIRLPOOL': 'Whirlpool',
  'KITCHENAID': 'KitchenAid', 'BOSCH': 'Bosch', 'JENNAIR': 'Jenn-Air',
  'NAPOLEON': 'Napoleon', 'MAYTAG': 'Maytag', 'FRIGIDAIRE': 'Frigidaire',
  'GE': 'GE', 'GE CAFÃ': 'Café', 'GE CAFE': 'Café', 'GE PROFILE': 'GE Profile',
  'SONY': 'Sony', 'DANBY': 'Danby', 'BREVILLE': 'Breville',
  'HISENSE': 'Hisense', 'PANASONIC': 'Panasonic', 'ELECTROLUX': 'Electrolux',
  'TCL': 'TCL', 'BLOMBERG': 'Blomberg', 'BERTAZZONI': 'Bertazzoni',
  'BROAN': 'Broan', 'SONOS': 'Sonos',
};

// All supported brands (case-insensitive keys)
const ALL_BRANDS = new Set([
  ...Object.keys(ICECAT_BRAND_MAP),
  'ASHLEY', 'SOFA BY FANCY', 'KWALITY', 'VESTA', 'SLEEP IN MATTRESS',
  'MATRIX', 'VFI', 'FAIRFIELD', 'BRASSEX', 'MAZIN', 'HIGH CLASS',
  'ELICA', 'MAXAIR', 'KLIPSCH', 'BLUESOUND', 'SANUS', 'JBL',
  'EPSON', 'TRAEGER', 'YODER SMOKERS',
]);

const RATE_LIMIT_MS = 350;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function httpGet(url, timeoutMs = 10000) {
  return new Promise((resolve) => {
    const req = https.get(url, { timeout: timeoutMs }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', (e) => resolve({ status: 0, body: '', error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: '', error: 'timeout' }); });
  });
}

// Get model variants to try (handles Canadian suffixes)
function getModelVariants(model) {
  const variants = [model];
  // /AC, /ZC, /ZA, /XAA, /EXP
  if (/\/[A-Z]{2,3}$/.test(model)) variants.push(model.replace(/\/[A-Z]{2,3}$/, ''));
  // TAC, VAC suffix
  if (/[TV]AC$/.test(model)) { variants.push(model.replace(/[TV]AC$/, '')); variants.push(model.replace(/AC$/, '')); }
  // AA suffix
  if (/AA$/.test(model) && model.length > 6) variants.push(model.replace(/AA$/, ''));
  // AFXZC, FXZC suffix
  if (/A?FXZC$/.test(model)) variants.push(model.replace(/A?FXZC$/, ''));
  // UC suffix (Bosch)
  if (/UC$/.test(model) && model.length > 6) variants.push(model.replace(/UC$/, ''));
  return [...new Set(variants)];
}

// Barcode Lookup API — search by MPN (manufacturer part number)
async function tryBarcodeLookup(model, manufacturer) {
  if (!BARCODE_API_KEY) return null;

  const variants = getModelVariants(model);
  for (const mpn of variants) {
    const url = `https://api.barcodelookup.com/v3/products?mpn=${encodeURIComponent(mpn)}&formatted=y&key=${BARCODE_API_KEY}`;
    const { status, body } = await httpGet(url);

    if (status === 200) {
      try {
        const json = JSON.parse(body);
        const products = json.products || [];
        // Find best match — prefer same manufacturer
        const mfrLower = manufacturer.toLowerCase();
        const match = products.find(p =>
          p.manufacturer?.toLowerCase().includes(mfrLower) ||
          p.title?.toLowerCase().includes(mfrLower)
        ) || products[0];

        if (match?.barcode_number && /^\d{8,14}$/.test(match.barcode_number)) {
          return { upc: match.barcode_number, source: 'barcode_lookup', title: match.title };
        }
      } catch (e) { /* parse error, continue */ }
    } else if (status === 429) {
      console.log('  [rate limited — waiting 5s]');
      await sleep(5000);
    }
    // 404 = not found, try next variant
    await sleep(RATE_LIMIT_MS);
  }
  return null;
}

// Icecat API — search by brand + product code
async function tryIcecat(model, manufacturer) {
  const brand = ICECAT_BRAND_MAP[manufacturer] || ICECAT_BRAND_MAP[manufacturer.toUpperCase()];
  if (!brand) return null;

  const variants = getModelVariants(model);
  for (const code of variants) {
    const url = `https://live.icecat.biz/api/?shopname=${encodeURIComponent(ICECAT_SHOPNAME)}&Language=en&Brand=${encodeURIComponent(brand)}&ProductCode=${encodeURIComponent(code)}`;
    const { status, body } = await httpGet(url);

    if (status === 200) {
      try {
        const json = JSON.parse(body);
        const gtins = json.data?.GeneralInfo?.GTIN || [];
        const gtinList = Array.isArray(gtins) ? gtins : [gtins];
        const valid = gtinList.find(g => g && /^\d{8,14}$/.test(g.toString().trim()));
        if (valid) {
          return { upc: valid.toString().trim(), source: 'icecat', title: json.data?.GeneralInfo?.Title };
        }
      } catch (e) { /* parse error */ }
    }
    await sleep(RATE_LIMIT_MS);
  }
  return null;
}

async function run() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--apply');
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1]) : 9999;
  const brandIdx = args.indexOf('--brand');
  const brandFilter = brandIdx >= 0 ? args[brandIdx + 1].toUpperCase() : null;

  console.log('=== Dual-Source UPC Enrichment ===');
  console.log(`Mode: ${dryRun ? 'DRY RUN (use --apply to update DB)' : 'APPLYING UPDATES'}`);
  console.log(`Barcode Lookup API: ${BARCODE_API_KEY ? 'configured' : 'NOT configured'}`);
  console.log(`Icecat: ${ICECAT_SHOPNAME}`);
  console.log(`Limit: ${limit}`);
  if (brandFilter) console.log(`Brand: ${brandFilter}`);
  console.log('');

  let query, params;
  if (brandFilter) {
    query = `SELECT id, sku, model, manufacturer FROM products
             WHERE (upc IS NULL OR upc = '') AND model IS NOT NULL AND model != ''
             AND UPPER(manufacturer) = $1 ORDER BY model LIMIT $2`;
    params = [brandFilter, limit];
  } else {
    query = `SELECT id, sku, model, manufacturer FROM products
             WHERE (upc IS NULL OR upc = '') AND model IS NOT NULL AND model != ''
             ORDER BY manufacturer, model LIMIT $1`;
    params = [limit];
  }

  const { rows: products } = await pool.query(query, params);
  console.log(`Found ${products.length} products to enrich\n`);

  const stats = { total: 0, barcode_lookup: 0, icecat: 0, not_found: 0, updated: 0 };

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    stats.total++;

    // Try Barcode Lookup API first
    let result = await tryBarcodeLookup(p.model, p.manufacturer);

    // Fall back to Icecat
    if (!result) {
      result = await tryIcecat(p.model, p.manufacturer);
    }

    if (result) {
      stats[result.source]++;
      console.log(`[${i + 1}/${products.length}] ✓ ${p.manufacturer} ${p.model} -> ${result.upc} (${result.source})`);

      if (!dryRun) {
        await pool.query('UPDATE products SET upc = $1 WHERE id = $2', [result.upc, p.id]);
        stats.updated++;
      }
    } else {
      stats.not_found++;
      console.log(`[${i + 1}/${products.length}] - ${p.manufacturer} ${p.model} -> not found`);
    }
  }

  console.log('\n=== SUMMARY ===');
  console.log(`Total processed: ${stats.total}`);
  console.log(`Found via Barcode Lookup: ${stats.barcode_lookup}`);
  console.log(`Found via Icecat: ${stats.icecat}`);
  console.log(`Total found: ${stats.barcode_lookup + stats.icecat} (${Math.round((stats.barcode_lookup + stats.icecat) / stats.total * 100)}%)`);
  console.log(`Not found: ${stats.not_found}`);
  if (!dryRun) {
    console.log(`DB updated: ${stats.updated}`);
  } else {
    console.log('\nThis was a DRY RUN. Run with --apply to update the database.');
  }

  process.exit(0);
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
