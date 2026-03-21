#!/usr/bin/env node
/**
 * UPC Enrichment via Barcode Lookup API only — batch-friendly with longer delays.
 * Skips products already enriched. Uses 2-second delay between requests to avoid rate limiting.
 *
 * Usage:
 *   node scripts/enrich-upc-barcode-batch.js                # Dry run, 100 products
 *   node scripts/enrich-upc-barcode-batch.js --apply        # Update DB
 *   node scripts/enrich-upc-barcode-batch.js --limit 200    # Process 200
 *   node scripts/enrich-upc-barcode-batch.js --brand LG     # One brand
 *   node scripts/enrich-upc-barcode-batch.js --delay 3000   # 3s between requests
 */
require('dotenv').config();
const https = require('https');
const pool = require('../db');

const API_KEY = process.env.BARCODE_LOOKUP_API_KEY;
if (!API_KEY) { console.error('BARCODE_LOOKUP_API_KEY not set'); process.exit(1); }

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function httpGet(url) {
  return new Promise((resolve) => {
    const req = https.get(url, { timeout: 10000 }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', (e) => resolve({ status: 0, error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, error: 'timeout' }); });
  });
}

// Generate model variants to handle Canadian suffixes
function getVariants(model) {
  const v = [model];
  if (/\/[A-Z]{2,3}$/.test(model)) v.push(model.replace(/\/[A-Z]{2,3}$/, ''));
  if (/[TV]AC$/.test(model)) { v.push(model.replace(/[TV]AC$/, '')); v.push(model.replace(/AC$/, '')); }
  if (/AA$/.test(model) && model.length > 6) v.push(model.replace(/AA$/, ''));
  if (/A?FXZC$/.test(model)) v.push(model.replace(/A?FXZC$/, ''));
  if (/UC$/.test(model) && model.length > 6) v.push(model.replace(/UC$/, ''));
  return [...new Set(v)];
}

async function lookupMPN(mpn, manufacturer) {
  const url = `https://api.barcodelookup.com/v3/products?mpn=${encodeURIComponent(mpn)}&formatted=y&key=${API_KEY}`;
  const { status, body, error } = await httpGet(url);

  if (status === 429) return { found: false, rateLimited: true };
  if (status !== 200) return { found: false };

  try {
    const json = JSON.parse(body);
    const products = json.products || [];
    const mfrLower = manufacturer.toLowerCase();
    // Prefer match from same manufacturer
    const match = products.find(p =>
      p.manufacturer?.toLowerCase().includes(mfrLower) ||
      p.title?.toLowerCase().includes(mfrLower)
    ) || products[0];

    if (match?.barcode_number && /^\d{8,14}$/.test(match.barcode_number)) {
      return { found: true, upc: match.barcode_number, title: match.title };
    }
  } catch (e) { /* parse error */ }
  return { found: false };
}

async function run() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--apply');
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1]) : 100;
  const brandIdx = args.indexOf('--brand');
  const brandFilter = brandIdx >= 0 ? args[brandIdx + 1].toUpperCase() : null;
  const delayIdx = args.indexOf('--delay');
  const delay = delayIdx >= 0 ? parseInt(args[delayIdx + 1]) : 2000;

  console.log('=== Barcode Lookup UPC Enrichment (Batch) ===');
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'APPLYING'}`);
  console.log(`Limit: ${limit} | Delay: ${delay}ms`);
  if (brandFilter) console.log(`Brand: ${brandFilter}`);
  console.log('');

  let query, params;
  if (brandFilter) {
    query = `SELECT id, sku, model, manufacturer FROM products
             WHERE (upc IS NULL OR upc = '') AND model IS NOT NULL AND model != ''
             AND UPPER(manufacturer) = $1 ORDER BY manufacturer, model LIMIT $2`;
    params = [brandFilter, limit];
  } else {
    query = `SELECT id, sku, model, manufacturer FROM products
             WHERE (upc IS NULL OR upc = '') AND model IS NOT NULL AND model != ''
             ORDER BY manufacturer, model LIMIT $1`;
    params = [limit];
  }

  const { rows: products } = await pool.query(query, params);
  console.log(`Found ${products.length} products to enrich\n`);

  let found = 0, notFound = 0, updated = 0, rateLimitHits = 0;

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const variants = getVariants(p.model);
    let result = { found: false };

    for (const mpn of variants) {
      result = await lookupMPN(mpn, p.manufacturer);

      if (result.rateLimited) {
        rateLimitHits++;
        console.log(`[${i + 1}/${products.length}] ⏳ ${p.manufacturer} ${p.model} -> rate limited, waiting 10s...`);
        await sleep(10000);
        // Retry once after waiting
        result = await lookupMPN(mpn, p.manufacturer);
        if (result.rateLimited) {
          console.log('  Still rate limited. Skipping.');
          break;
        }
      }

      if (result.found) break;
      await sleep(delay);
    }

    if (result.found) {
      found++;
      console.log(`[${i + 1}/${products.length}] ✓ ${p.manufacturer} ${p.model} -> ${result.upc}`);
      if (!dryRun) {
        await pool.query('UPDATE products SET upc = $1 WHERE id = $2', [result.upc, p.id]);
        updated++;
      }
    } else {
      notFound++;
      console.log(`[${i + 1}/${products.length}] - ${p.manufacturer} ${p.model}`);
    }

    await sleep(delay);
  }

  console.log('\n=== SUMMARY ===');
  console.log(`Processed: ${products.length}`);
  console.log(`Found: ${found} (${Math.round(found / products.length * 100)}%)`);
  console.log(`Not found: ${notFound}`);
  console.log(`Rate limit hits: ${rateLimitHits}`);
  if (!dryRun) console.log(`DB updated: ${updated}`);
  else console.log('\nDRY RUN — use --apply to update the database.');

  // Show remaining count
  const remaining = await pool.query("SELECT COUNT(*) as c FROM products WHERE upc IS NULL OR upc = ''");
  console.log(`\nProducts still missing UPC: ${remaining.rows[0].c}`);

  process.exit(0);
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
