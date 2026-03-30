'use strict';

/**
 * upc-lookup-batch.js
 *
 * Looks up UPC codes for products in the database using UPCitemdb API.
 * Searches by model number, validates brand match, and updates the DB.
 *
 * Usage:
 *   node scripts/upc-lookup-batch.js [--limit N] [--brand BRAND] [--dry-run]
 *
 * Free tier: 100 requests/day. Script saves progress to a JSON file
 * so it can resume across sessions.
 */

// Allow self-signed certs for local dev connecting to AWS RDS
if (!process.env.NODE_ENV || process.env.NODE_ENV === 'production') {
  process.env.NODE_ENV = 'development';
  process.env.DB_SSL_REJECT_UNAUTHORIZED = 'false';
}
require('dotenv').config({ override: false });
const https = require('https');
const fs = require('fs');
const path = require('path');
const pool = require('../db');

const PROGRESS_FILE = path.join(__dirname, 'upc-lookup-progress.json');
const DELAY_MS = 5000; // 5s between API requests
const DEFAULT_LIMIT = 95; // leave some headroom on the 100/day limit

// Brands to prioritize (electronics/appliances with high UPC coverage)
const PRIORITY_BRANDS = [
  'SAMSUNG', 'LG', 'KITCHENAID', 'WHIRLPOOL', 'BOSCH', 'FRIGIDAIRE',
  'GE', 'GE CAFE', 'GE PROFILE', 'MAYTAG', 'HISENSE', 'SONY',
  'PANASONIC', 'ELECTROLUX', 'JENNAIR', 'BROAN', 'DANBY',
  'NAPOLEON', 'KLIPSCH', 'SONOS', 'BLUESOUND', 'EPSON',
  'TRAEGER', 'YODER SMOKERS', 'TCL', 'THOR', 'BERTAZZONI',
  'HAIER', 'BLOMBERG', 'AMANA', 'SILHOUETTE', 'MARATHON',
  'MAXAIR', 'ELICA', 'KOBE', 'FABER', 'VENT-A-HOOD', 'BEST',
  'SANUS', 'ONKYO', 'POLK AUDIO', 'JVC', 'VESTA',
  'EVERYDROP', 'SOLUTIONS 2GO', 'SEALY'
];

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
    }
  } catch (e) {
    console.warn('Could not load progress file, starting fresh');
  }
  return { looked_up: {}, not_found: [], updated: [], last_run: null };
}

/**
 * Generate model variants to try (strips Canadian suffixes).
 * e.g. DVE54CG7550VAC -> [DVE54CG7550VAC, DVE54CG7550V, DVE54CG7550]
 */
function getModelVariants(model) {
  const variants = [model];
  // /AC, /ZC, /ZA, /XAA, /EXP suffixes
  if (/\/[A-Z]{2,3}$/.test(model)) variants.push(model.replace(/\/[A-Z]{2,3}$/, ''));
  // TAC, VAC suffix (Canadian models)
  if (/[TV]AC$/.test(model)) {
    variants.push(model.replace(/[TV]AC$/, ''));
    variants.push(model.replace(/AC$/, ''));
  }
  // AA suffix
  if (/AA$/.test(model) && model.length > 6) variants.push(model.replace(/AA$/, ''));
  // AFXZC, FXZC suffix
  if (/A?FXZC$/.test(model)) variants.push(model.replace(/A?FXZC$/, ''));
  // UC suffix (Bosch)
  if (/UC$/.test(model) && model.length > 6) variants.push(model.replace(/UC$/, ''));
  return [...new Set(variants)];
}

function saveProgress(progress) {
  progress.last_run = new Date().toISOString();
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

function searchUPCitemdb(query) {
  return new Promise((resolve, reject) => {
    const url = `https://api.upcitemdb.com/prod/trial/search?s=${encodeURIComponent(query)}&type=product`;
    const req = https.get(url, { headers: { 'Accept': 'application/json' } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString();
        if (res.statusCode === 429) {
          return resolve({ rateLimited: true, remaining: 0 });
        }
        if (res.statusCode !== 200) {
          return resolve({ error: true, status: res.statusCode, body: body.substring(0, 200) });
        }
        try {
          const data = JSON.parse(body);
          const remaining = parseInt(res.headers['x-ratelimit-remaining'] || '0', 10);
          resolve({ ...data, remaining });
        } catch (e) {
          resolve({ error: true, parseError: e.message });
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('Timeout')));
  });
}

/**
 * Find the best UPC match from search results.
 * Validates that the brand/model match the expected values.
 */
function findBestMatch(results, expectedModel, expectedBrand) {
  if (!results.items || results.items.length === 0) return null;

  const normModel = expectedModel.toUpperCase().replace(/[\s\-\/]/g, '');
  const normBrand = expectedBrand.toUpperCase();

  // Brand aliases for matching
  const brandAliases = {
    'GE CAFE': ['GE', 'CAFE', 'GE CAFE'],
    'GE PROFILE': ['GE', 'PROFILE', 'GE PROFILE'],
    'KITCHENAID': ['KITCHENAID', 'KITCHEN AID'],
    'LG': ['LG', 'LG ELECTRONICS'],
    'SAMSUNG': ['SAMSUNG'],
    'WHIRLPOOL': ['WHIRLPOOL'],
    'JENNAIR': ['JENNAIR', 'JENN-AIR', 'JENN AIR'],
    'FRIGIDAIRE': ['FRIGIDAIRE'],
    'ELECTROLUX': ['ELECTROLUX'],
    'BOSCH': ['BOSCH'],
    'MAYTAG': ['MAYTAG'],
    'HISENSE': ['HISENSE'],
    'SONY': ['SONY'],
    'PANASONIC': ['PANASONIC'],
  };

  const acceptableBrands = brandAliases[normBrand] || [normBrand];

  for (const item of results.items) {
    const itemModel = (item.model || '').toUpperCase().replace(/[\s\-\/]/g, '');
    const itemBrand = (item.brand || '').toUpperCase();
    const itemTitle = (item.title || '').toUpperCase().replace(/[\s\-\/]/g, '');

    // Model must match exactly OR appear in title (after normalization)
    const modelMatch = itemModel === normModel || itemTitle.includes(normModel);
    if (!modelMatch) continue;

    // Brand should be in acceptable list (check brand field and title)
    const brandOk = acceptableBrands.some((b) =>
      itemBrand.includes(b) || b.includes(itemBrand) ||
      (item.title || '').toUpperCase().includes(b)
    );
    if (!brandOk && itemBrand) continue;

    // Must have a valid UPC
    const upc = item.upc || item.ean;
    if (!upc || upc === 'undefined' || upc.length < 8) continue;

    return { upc, title: item.title, brand: item.brand, model: item.model };
  }

  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const brandFilter = args.includes('--brand') ? args[args.indexOf('--brand') + 1]?.toUpperCase() : null;
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : DEFAULT_LIMIT;

  console.log(`UPC Lookup Batch Script`);
  console.log(`  Limit: ${limit} lookups`);
  console.log(`  Dry run: ${dryRun}`);
  if (brandFilter) console.log(`  Brand filter: ${brandFilter}`);
  console.log('');

  const progress = loadProgress();
  console.log(`Previous progress: ${Object.keys(progress.looked_up).length} looked up, ${progress.updated.length} updated, ${progress.not_found.length} not found`);

  // Get products without UPC
  const { rows: products } = await pool.query(
    `SELECT id, name, model, sku, manufacturer
     FROM products
     WHERE (upc IS NULL OR upc = '')
       AND (model IS NOT NULL AND model != '')
     ORDER BY manufacturer, model`
  );

  console.log(`Products without UPC (with model): ${products.length}`);

  // Filter to priority brands (or specific brand)
  let candidates = products.filter((p) => {
    const mfr = (p.manufacturer || '').toUpperCase();
    if (brandFilter) return mfr.includes(brandFilter);
    return PRIORITY_BRANDS.some((b) => mfr.includes(b) || b.includes(mfr));
  });

  // Skip already looked up
  candidates = candidates.filter((p) => {
    const key = `${(p.manufacturer || '').toUpperCase()}:${(p.model || p.sku || '').toUpperCase()}`;
    return !progress.looked_up[key];
  });

  console.log(`Candidates to look up: ${candidates.length}`);
  console.log('');

  if (candidates.length === 0) {
    console.log('No new candidates to look up. All priority brands have been processed.');
    await pool.end();
    return;
  }

  let lookupCount = 0;
  let foundCount = 0;
  let notFoundCount = 0;

  for (const product of candidates) {
    if (lookupCount >= limit) {
      console.log(`\nReached limit of ${limit} lookups. Run again tomorrow for more.`);
      break;
    }

    const model = (product.model || product.sku || '').trim();
    const brand = (product.manufacturer || '').trim();
    const key = `${brand.toUpperCase()}:${model.toUpperCase()}`;

    process.stdout.write(`[${lookupCount + 1}/${Math.min(candidates.length, limit)}] ${brand} ${model} ... `);

    try {
      const variants = getModelVariants(model);
      let match = null;
      let lastResult = null;
      let rateLimited = false;

      for (const variant of variants) {
        const result = await searchUPCitemdb(variant);

        if (result.rateLimited) {
          console.log('RATE LIMITED - waiting 60s then retrying...');
          await delay(60000);
          const retry = await searchUPCitemdb(variant);
          if (retry.rateLimited || retry.error) {
            console.log('Still rate limited - stopping');
            rateLimited = true;
            break;
          }
          Object.assign(result, retry);
        }

        if (result.error) {
          // 404 means not found, try next variant
          if (result.status === 404) {
            lastResult = result;
            await delay(DELAY_MS);
            lookupCount++;
            continue;
          }
          lastResult = result;
          break;
        }

        lastResult = result;
        match = findBestMatch(result, variant, brand);
        if (match) break;

        lookupCount++;
        await delay(DELAY_MS);
      }

      if (rateLimited) break;

      if (match) {
        console.log(`FOUND: ${match.upc} (${match.title?.substring(0, 50)})`);
        foundCount++;

        if (!dryRun) {
          await pool.query('UPDATE products SET upc = $1 WHERE id = $2', [match.upc, product.id]);
        }

        progress.looked_up[key] = { upc: match.upc, found: true };
        progress.updated.push({ id: product.id, model, brand, upc: match.upc });
      } else {
        console.log(`NOT FOUND (${lastResult?.total || 0} results, no brand/model match)`);
        notFoundCount++;
        progress.looked_up[key] = { found: false };
        progress.not_found.push(key);
      }

      lookupCount++;
      saveProgress(progress);

      // Check remaining API calls
      if (result.remaining !== undefined && result.remaining <= 2) {
        console.log(`\nOnly ${result.remaining} API calls remaining. Stopping.`);
        break;
      }

      await delay(DELAY_MS);
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
      lookupCount++;
      await delay(DELAY_MS);
    }
  }

  console.log('\n--- Summary ---');
  console.log(`Lookups this run: ${lookupCount}`);
  console.log(`Found & updated: ${foundCount}`);
  console.log(`Not found: ${notFoundCount}`);
  console.log(`Total progress: ${Object.keys(progress.looked_up).length} looked up, ${progress.updated.length} updated`);

  saveProgress(progress);
  await pool.end();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
