'use strict';

/**
 * upc-web-lookup.js
 *
 * Looks up UPC codes by scraping upcitemdb.com search pages (no API quota).
 * Searches by model number and updates the database.
 *
 * Usage:
 *   node scripts/upc-web-lookup.js [--brand BRAND] [--limit N] [--dry-run]
 */

require('dotenv').config();
const https = require('https');
const fs = require('fs');
const path = require('path');
const pool = require('../db');

const PROGRESS_FILE = path.join(__dirname, 'upc-lookup-progress.json');
const DELAY_MS = 5000; // 5s between web requests to avoid rate limits

const PRIORITY_BRANDS = [
  'SAMSUNG', 'LG', 'KITCHENAID', 'WHIRLPOOL', 'BOSCH', 'FRIGIDAIRE',
  'GE', 'GE CAFE', 'GE PROFILE', 'MAYTAG', 'HISENSE', 'SONY',
  'PANASONIC', 'ELECTROLUX', 'JENNAIR', 'BROAN', 'DANBY',
  'NAPOLEON', 'KLIPSCH', 'SONOS', 'BLUESOUND', 'EPSON',
  'TRAEGER', 'YODER SMOKERS', 'TCL', 'THOR', 'BERTAZZONI',
  'HAIER', 'BLOMBERG', 'AMANA', 'SILHOUETTE', 'MARATHON',
  'MAXAIR', 'ELICA', 'KOBE', 'FABER', 'VENT-A-HOOD', 'BEST',
  'SANUS', 'ONKYO', 'POLK AUDIO', 'JVC', 'VESTA',
  'EVERYDROP', 'SOLUTIONS 2GO', 'SEALY', 'FRIGIDAIRE',
  'SKYWORTH', 'SLEEPKING'
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

function saveProgress(progress) {
  progress.last_run = new Date().toISOString();
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

/**
 * Fetch a web page via HTTPS and return the HTML body.
 */
function fetchPage(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    };
    const req = https.get(url, options, (res) => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchPage(res.headers.location).then(resolve).catch(reject);
      }

      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        resolve({ statusCode: res.statusCode, body });
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => req.destroy(new Error('Timeout')));
  });
}

/**
 * Extract UPC from upcitemdb.com search results page.
 * The page lists products with their UPC/EAN codes.
 */
function extractUPC(html, expectedModel, expectedBrand) {
  // Look for barcode numbers in the HTML - they appear as links like /upc/887276826868
  const upcPattern = /\/upc\/(\d{12,14})/g;
  const upcs = [];
  let match;
  while ((match = upcPattern.exec(html)) !== null) {
    upcs.push(match[1]);
  }

  if (upcs.length === 0) {
    // Try alternate pattern - sometimes shown as plain text
    const altPattern = /\b(0?\d{11,13})\b/g;
    while ((match = altPattern.exec(html)) !== null) {
      const num = match[1];
      // Filter to likely UPCs (12-14 digits, starts with common prefixes)
      if (num.length >= 12 && num.length <= 14) {
        upcs.push(num);
      }
    }
  }

  if (upcs.length === 0) return null;

  // Check if the page actually contains the model number
  const normModel = expectedModel.toUpperCase().replace(/[\s\-\/]/g, '');
  const htmlUpper = html.toUpperCase().replace(/[\s\-\/]/g, '');

  if (!htmlUpper.includes(normModel)) {
    return null; // Model not found on page
  }

  // Return the first UPC found (most relevant result)
  return upcs[0];
}

async function lookupModel(model, brand) {
  // Strip Canadian suffixes for search
  const searchModel = model
    .replace(/\/AC$/i, '')
    .replace(/\/ZC$/i, '')
    .replace(/\/AA$/i, '')
    .replace(/FXZC$/i, 'FXZC')
    .trim();

  const url = `https://www.upcitemdb.com/query?s=${encodeURIComponent(searchModel)}&type=2`;

  try {
    const { statusCode, body } = await fetchPage(url);

    if (statusCode === 429) {
      return { rateLimited: true };
    }

    if (statusCode !== 200) {
      return { error: true, status: statusCode };
    }

    const upc = extractUPC(body, searchModel, brand);
    if (upc) {
      // Extract title if available
      const titleMatch = body.match(/<a[^>]*>([^<]*(?:Samsung|LG|KitchenAid|Whirlpool|Bosch|Frigidaire|GE|Maytag|Hisense|Sony|Panasonic|Electrolux)[^<]*)<\/a>/i);
      const title = titleMatch ? titleMatch[1].trim() : '';
      return { found: true, upc, title };
    }

    return { found: false };
  } catch (err) {
    return { error: true, message: err.message };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const brandFilter = args.includes('--brand') ? args[args.indexOf('--brand') + 1]?.toUpperCase() : null;
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : 500;

  console.log('UPC Web Lookup Script');
  console.log(`  Limit: ${limit} lookups`);
  console.log(`  Dry run: ${dryRun}`);
  if (brandFilter) console.log(`  Brand filter: ${brandFilter}`);
  console.log('');

  const progress = loadProgress();
  console.log(`Previous progress: ${Object.keys(progress.looked_up).length} looked up, ${progress.updated.length} updated`);

  // Get products without UPC
  const { rows: products } = await pool.query(
    `SELECT id, name, model, sku, manufacturer
     FROM products
     WHERE (upc IS NULL OR upc = '')
       AND (model IS NOT NULL AND model != '')
     ORDER BY manufacturer, model`
  );

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
    console.log('No new candidates.');
    await pool.end();
    return;
  }

  let lookupCount = 0;
  let foundCount = 0;
  let notFoundCount = 0;
  let errorCount = 0;
  let rateLimitCount = 0;

  for (const product of candidates) {
    if (lookupCount >= limit) {
      console.log(`\nReached limit of ${limit}.`);
      break;
    }

    const model = (product.model || product.sku || '').trim();
    const brand = (product.manufacturer || '').trim();
    const key = `${brand.toUpperCase()}:${model.toUpperCase()}`;

    process.stdout.write(`[${lookupCount + 1}/${Math.min(candidates.length, limit)}] ${brand} ${model} ... `);

    const result = await lookupModel(model, brand);

    if (result.rateLimited) {
      rateLimitCount++;
      console.log('RATE LIMITED - waiting 30s...');
      await delay(30000);
      // Retry once
      const retry = await lookupModel(model, brand);
      if (retry.rateLimited) {
        console.log('Still rate limited - stopping.');
        break;
      }
      if (retry.found) {
        console.log(`FOUND (retry): ${retry.upc}`);
        foundCount++;
        if (!dryRun) {
          await pool.query('UPDATE products SET upc = $1 WHERE id = $2', [retry.upc, product.id]);
        }
        progress.looked_up[key] = { upc: retry.upc, found: true };
        progress.updated.push({ id: product.id, model, brand, upc: retry.upc });
      } else {
        console.log('NOT FOUND (after retry)');
        notFoundCount++;
        progress.looked_up[key] = { found: false };
        progress.not_found.push(key);
      }
    } else if (result.error) {
      console.log(`ERROR: ${result.status || result.message}`);
      errorCount++;
    } else if (result.found) {
      console.log(`FOUND: ${result.upc}${result.title ? ' (' + result.title.substring(0, 50) + ')' : ''}`);
      foundCount++;
      if (!dryRun) {
        await pool.query('UPDATE products SET upc = $1 WHERE id = $2', [result.upc, product.id]);
      }
      progress.looked_up[key] = { upc: result.upc, found: true };
      progress.updated.push({ id: product.id, model, brand, upc: result.upc });
    } else {
      console.log('NOT FOUND');
      notFoundCount++;
      progress.looked_up[key] = { found: false };
      progress.not_found.push(key);
    }

    lookupCount++;
    saveProgress(progress);
    await delay(DELAY_MS);
  }

  console.log('\n--- Summary ---');
  console.log(`Lookups: ${lookupCount}`);
  console.log(`Found & updated: ${foundCount}`);
  console.log(`Not found: ${notFoundCount}`);
  console.log(`Errors: ${errorCount}`);
  console.log(`Rate limited: ${rateLimitCount}`);
  console.log(`Total progress: ${Object.keys(progress.looked_up).length} looked up, ${progress.updated.length} updated`);

  saveProgress(progress);
  await pool.end();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
