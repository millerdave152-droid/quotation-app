#!/usr/bin/env node
'use strict';

/**
 * manual-sync.js
 *
 * Standalone CLI script for running Skulytics syncs on-demand.
 *
 * Usage:
 *   node scripts/manual-sync.js                  # incremental sync (default)
 *   node scripts/manual-sync.js --full            # full catalogue sync
 *   node scripts/manual-sync.js --sku=WH-DRY-4500 # single SKU refresh
 *   node scripts/manual-sync.js --discover-limits  # probe API limits & shape
 *
 * Environment:
 *   Reads DATABASE_URL (or DB_HOST/DB_USER/etc) and SKULYTICS_API_KEY
 *   from .env or environment variables.
 *
 * Exit codes:
 *   0 = success (completed or partial)
 *   1 = failure
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });

const { SkulyticsSyncService } = require('../services/skulytics/SkulyticsSyncService');
const { SkulyticsApiClient } = require('../services/skulytics/SkulyticsApiClient');
const { normalize } = require('../services/skulytics/normalizers');
const pool = require('../db');

// ── CLI arg parsing ─────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = { mode: 'incremental', sku: null };

  for (const arg of args) {
    if (arg === '--full') {
      parsed.mode = 'full';
    } else if (arg === '--discover-limits') {
      parsed.mode = 'discover_limits';
    } else if (arg.startsWith('--sku=')) {
      parsed.mode = 'manual_sku';
      parsed.sku = arg.slice('--sku='.length).trim();
      if (!parsed.sku) {
        console.error('Error: --sku requires a value (e.g. --sku=WH-DRY-4500)');
        process.exit(1);
      }
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${arg}`);
      printUsage();
      process.exit(1);
    }
  }

  return parsed;
}

function printUsage() {
  console.log(`
Skulytics Manual Sync

Usage:
  node scripts/manual-sync.js                    Incremental sync (default)
  node scripts/manual-sync.js --full             Full catalogue sync
  node scripts/manual-sync.js --sku=WH-DRY-4500  Single SKU refresh
  node scripts/manual-sync.js --discover-limits  Probe API: rate limits, pagination, response shape
  node scripts/manual-sync.js --help             Show this help

Environment variables:
  SKULYTICS_API_KEY       (required)
  SKULYTICS_API_BASE_URL  (optional, default: https://api.appliance-data.com)
  DB_HOST / DATABASE_URL  (required for sync modes, not for --discover-limits)
`.trim());
}

// ── Preflight checks ────────────────────────────────────────

function preflight(mode) {
  const missing = [];

  if (!process.env.SKULYTICS_API_KEY) missing.push('SKULYTICS_API_KEY');

  // DB not needed for discover-limits
  if (mode !== 'discover_limits') {
    const hasDbConfig = process.env.DATABASE_URL || process.env.DB_HOST;
    if (!hasDbConfig) missing.push('DATABASE_URL or DB_HOST');
  }

  if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(', ')}`);
    console.error('Set them in .env or export them before running this script.');
    process.exit(1);
  }
}

// ── Discover-limits mode ─────────────────────────────────────

async function discoverLimits() {
  const axios = require('axios');
  const baseUrl = process.env.SKULYTICS_API_BASE_URL || 'https://api.appliance-data.com';
  const apiKey = process.env.SKULYTICS_API_KEY;

  console.log('\n=== Skulytics API Discovery ===\n');
  console.log(`Base URL:  ${baseUrl}`);
  console.log(`API Key:   ${apiKey.slice(0, 8)}...${apiKey.slice(-4)}`);
  console.log('');

  const client = axios.create({
    baseURL: baseUrl.replace(/\/+$/, ''),
    timeout: 30_000,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'application/json',
    },
  });

  // ── 1. Probe page 1 ──────────────────────────────────────
  console.log('--- Page 1 probe ---');
  let page1;
  try {
    const res = await client.get('/products', { params: { page: 1, page_size: 5 } });
    page1 = res;

    // Response shape
    const body = res.data;
    console.log(`HTTP Status:     ${res.status}`);
    console.log(`Content-Type:    ${res.headers['content-type'] || 'n/a'}`);
    console.log(`Response keys:   ${Object.keys(body).join(', ')}`);

    // Product array detection
    const products = body.products || body.data || body.items || [];
    console.log(`Products key:    ${body.products ? 'products' : body.data ? 'data' : body.items ? 'items' : '(none found)'}`);
    console.log(`Products count:  ${products.length}`);

    if (products.length > 0) {
      const p = products[0];
      console.log(`\nFirst product keys: ${Object.keys(p).join(', ')}`);
      console.log(`  product_id:    ${p.product_id ?? p.id ?? '(missing)'}`);
      console.log(`  sku:           ${p.sku ?? '(missing)'}`);
      console.log(`  brand:         ${typeof p.brand === 'object' ? JSON.stringify(p.brand) : p.brand}`);
      console.log(`  status:        ${p.status ?? '(missing)'}`);
      console.log(`  price type:    ${typeof p.price === 'object' ? 'object' : typeof p.price}`);
      if (p.price) console.log(`  price keys:    ${Object.keys(p.price).join(', ')}`);

      // Try normalizing
      console.log('\n--- Normalizer test ---');
      try {
        const normalized = normalize(p);
        console.log(`  skulytics_id:  ${normalized.skulytics_id}`);
        console.log(`  brand:         ${normalized.brand}`);
        console.log(`  msrp:          ${normalized.msrp}`);
        console.log(`  category_slug: ${normalized.category_slug}`);
        console.log(`  category_path: ${JSON.stringify(normalized.category_path)}`);
        console.log(`  is_discontinued: ${normalized.is_discontinued}`);
        console.log(`  is_in_stock:   ${normalized.is_in_stock}`);
        console.log(`  warranty:      ${JSON.stringify(normalized.warranty)}`);
        console.log(`  images count:  ${normalized.images.length}`);
        console.log('  Normalizer:    OK');
      } catch (err) {
        console.log(`  Normalizer:    FAILED — ${err.message}`);
      }
    }

    // Rate limit headers
    console.log('\n--- Rate limit headers ---');
    const rlHeaders = ['x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset',
                       'ratelimit-limit', 'ratelimit-remaining', 'ratelimit-reset',
                       'retry-after', 'x-rate-limit-limit', 'x-rate-limit-remaining'];
    let foundRl = false;
    for (const h of rlHeaders) {
      if (res.headers[h]) {
        console.log(`  ${h}: ${res.headers[h]}`);
        foundRl = true;
      }
    }
    if (!foundRl) console.log('  (no rate limit headers detected)');

    // All response headers
    console.log('\n--- All response headers ---');
    for (const [k, v] of Object.entries(res.headers)) {
      console.log(`  ${k}: ${v}`);
    }
  } catch (err) {
    console.error(`Page 1 probe FAILED: ${err.message}`);
    if (err.response) {
      console.error(`  HTTP Status: ${err.response.status}`);
      console.error(`  Body: ${JSON.stringify(err.response.data).slice(0, 500)}`);
    }
    return { status: 'failed', error: err.message };
  }

  // ── 2. Pagination probe ───────────────────────────────────
  console.log('\n--- Pagination probe ---');
  const pageSizes = [1, 10, 50, 100, 200, 500];
  for (const ps of pageSizes) {
    try {
      const res = await client.get('/products', { params: { page: 1, page_size: ps } });
      const products = res.data.products || res.data.data || res.data.items || [];
      console.log(`  page_size=${String(ps).padStart(3)}: returned ${products.length} products`);
    } catch (err) {
      console.log(`  page_size=${String(ps).padStart(3)}: ERROR ${err.response?.status || err.message}`);
    }
  }

  // ── 3. Total catalogue size estimate ──────────────────────
  console.log('\n--- Catalogue size estimate ---');
  try {
    // Try a high page number to find the end
    let lo = 1, hi = 1000, total = 0;
    // First check page 1 with page_size=100
    const res1 = await client.get('/products', { params: { page: 1, page_size: 100 } });
    const count1 = (res1.data.products || res1.data.data || res1.data.items || []).length;
    if (count1 < 100) {
      total = count1;
      console.log(`  Total products: ~${total} (single page)`);
    } else {
      // Binary search for last page
      while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        try {
          const res = await client.get('/products', { params: { page: mid, page_size: 100 } });
          const products = res.data.products || res.data.data || res.data.items || [];
          if (products.length > 0) {
            lo = mid + 1;
          } else {
            hi = mid;
          }
        } catch (err) {
          hi = mid;
        }
      }
      total = (lo - 1) * 100;
      console.log(`  Estimated total: ~${total} products (${lo - 1} pages of 100)`);
    }

    // Check if API provides total count
    if (page1.data.total || page1.data.total_count || page1.data.meta?.total) {
      const apiTotal = page1.data.total || page1.data.total_count || page1.data.meta?.total;
      console.log(`  API reported total: ${apiTotal}`);
    }
  } catch (err) {
    console.log(`  Estimate failed: ${err.message}`);
  }

  console.log('\n=== Discovery complete ===\n');
  return { status: 'completed' };
}

// ── Main ────────────────────────────────────────────────────

async function main() {
  const { mode, sku } = parseArgs();
  preflight(mode);

  // Discover-limits doesn't need DB or SyncService
  if (mode === 'discover_limits') {
    return await discoverLimits();
  }

  const service = new SkulyticsSyncService();
  const triggeredBy = `manual:cli:${require('os').userInfo().username}`;

  console.log(`\nSkulytics ${mode} sync starting...`);
  console.log(`Triggered by: ${triggeredBy}`);
  if (sku) console.log(`Target SKU: ${sku}`);
  console.log('');

  const startTime = Date.now();
  let result;

  switch (mode) {
    case 'full':
      result = await service.runFullSync(triggeredBy);
      break;
    case 'manual_sku':
      result = await service.runManualSkuSync(sku, triggeredBy);
      break;
    case 'incremental':
    default:
      result = await service.runIncrementalSync(triggeredBy);
      break;
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('');
  console.log('─'.repeat(50));
  console.log(`Status:     ${result.status}`);
  if (result.processed != null) console.log(`Processed:  ${result.processed}`);
  if (result.created != null)   console.log(`Created:    ${result.created}`);
  if (result.updated != null)   console.log(`Updated:    ${result.updated}`);
  if (result.failed != null)    console.log(`Failed:     ${result.failed}`);
  if (result.outcome)           console.log(`Outcome:    ${result.outcome}`);
  if (result.error)             console.log(`Error:      ${result.error}`);
  console.log(`Run ID:     ${result.runId}`);
  console.log(`Duration:   ${durationSec}s`);
  console.log('─'.repeat(50));

  return result;
}

main()
  .then((result) => {
    const exitCode = (result.status === 'failed') ? 1 : 0;
    // Close the pool so the process can exit cleanly
    pool.end().then(() => process.exit(exitCode));
  })
  .catch((err) => {
    console.error(`\nFatal error: ${err.message}`);
    console.error(err.stack);
    pool.end().then(() => process.exit(1));
  });
