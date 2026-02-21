'use strict';

/**
 * CE Pricing Routes
 *
 * GET /api/pricing/ce/:upc
 *   On-demand competitor pricing for Consumer Electronics products
 *   via PricesAPI.io, with 4-hour database cache.
 */

const express = require('express');
const router = express.Router();
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate } = require('../middleware/auth');
const pricesApi = require('../services/pricesApiService');

// Module-level dependencies (injected via init)
let pool = null;

const CACHE_TTL_HOURS = 4;

/**
 * Initialize the router with dependencies.
 * @param {object} deps
 * @param {Pool}   deps.pool - PostgreSQL connection pool
 * @returns {Router}
 */
const init = (deps) => {
  pool = deps.pool;
  return router;
};

// ── Cache helpers ───────────────────────────────────────────

/**
 * Look up a product_id from the products table by UPC.
 * Returns null if not found.
 */
async function findProductIdByUpc(upc) {
  const result = await pool.query(
    'SELECT id FROM products WHERE upc = $1 LIMIT 1',
    [upc]
  );
  return result.rows.length > 0 ? result.rows[0].id : null;
}

/**
 * Check competitor_prices for a fresh PricesAPI cache (< 4 hours old).
 * Returns the structured competitor_pricing object, or null if stale/missing.
 */
async function getCachedPricing(productId) {
  const result = await pool.query(`
    SELECT competitor_name, competitor_price, last_fetched_at, is_lower,
           competitor_url, currency
    FROM competitor_prices
    WHERE product_id = $1
      AND pricing_source = 'pricesapi'
      AND last_fetched_at > NOW() - INTERVAL '${CACHE_TTL_HOURS} hours'
    ORDER BY competitor_price ASC NULLS LAST
  `, [productId]);

  if (result.rows.length === 0) return null;

  // Rebuild the JSONB shape the CompetitorPricingPanel expects
  const pricing = {};
  let lowestPrice = null;

  for (const row of result.rows) {
    const price = row.competitor_price ? Math.round(parseFloat(row.competitor_price)) : 0;
    pricing[row.competitor_name] = {
      price,
      last_updated: row.last_fetched_at ? row.last_fetched_at.toISOString() : null,
    };
    if (price > 0 && (lowestPrice === null || price < lowestPrice)) {
      lowestPrice = price;
    }
  }

  if (lowestPrice !== null) {
    pricing.lowest_price = lowestPrice;
  }

  return {
    competitorPricing: pricing,
    lastFetchedAt: result.rows[0].last_fetched_at,
  };
}

/**
 * Check global_skulytics_products for a fresh PricesAPI cache as fallback.
 */
async function getSkulyticsCachedPricing(upc) {
  const result = await pool.query(`
    SELECT competitor_pricing, last_fetched_at
    FROM global_skulytics_products
    WHERE upc = $1
      AND pricing_source = 'pricesapi'
      AND last_fetched_at > NOW() - INTERVAL '${CACHE_TTL_HOURS} hours'
    LIMIT 1
  `, [upc]);

  if (result.rows.length === 0) return null;

  return {
    competitorPricing: result.rows[0].competitor_pricing,
    lastFetchedAt: result.rows[0].last_fetched_at,
  };
}

/**
 * Get any stale pricing we have (for fallback when rate-limited).
 */
async function getStalePricing(productId, upc) {
  // Try competitor_prices first
  if (productId) {
    const result = await pool.query(`
      SELECT competitor_name, competitor_price, last_fetched_at
      FROM competitor_prices
      WHERE product_id = $1 AND pricing_source = 'pricesapi'
      ORDER BY competitor_price ASC NULLS LAST
    `, [productId]);

    if (result.rows.length > 0) {
      const pricing = {};
      let lowestPrice = null;
      for (const row of result.rows) {
        const price = row.competitor_price ? Math.round(parseFloat(row.competitor_price)) : 0;
        pricing[row.competitor_name] = {
          price,
          last_updated: row.last_fetched_at ? row.last_fetched_at.toISOString() : null,
        };
        if (price > 0 && (lowestPrice === null || price < lowestPrice)) {
          lowestPrice = price;
        }
      }
      if (lowestPrice !== null) pricing.lowest_price = lowestPrice;
      return { competitorPricing: pricing, lastFetchedAt: result.rows[0].last_fetched_at };
    }
  }

  // Fallback to global_skulytics_products
  const result = await pool.query(`
    SELECT competitor_pricing, last_fetched_at
    FROM global_skulytics_products
    WHERE upc = $1 AND pricing_source = 'pricesapi'
    LIMIT 1
  `, [upc]);

  if (result.rows.length > 0) {
    return {
      competitorPricing: result.rows[0].competitor_pricing,
      lastFetchedAt: result.rows[0].last_fetched_at,
    };
  }

  return null;
}

/**
 * Persist competitor pricing to both competitor_prices rows and
 * global_skulytics_products JSONB.
 */
async function persistPricing(productId, upc, competitorPricing, rawOffers) {
  const now = new Date();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Upsert individual rows into competitor_prices (if product exists)
    //    No unique constraint on (product_id, competitor_name) — use delete+insert
    if (productId) {
      // Remove stale pricesapi rows for this product
      await client.query(
        `DELETE FROM competitor_prices
         WHERE product_id = $1 AND pricing_source = 'pricesapi'`,
        [productId]
      );

      // Get TeleTime's price for comparison (once, outside loop)
      const productRow = await client.query(
        'SELECT msrp_cents FROM products WHERE id = $1',
        [productId]
      );
      const ttPrice = productRow.rows[0]?.msrp_cents
        ? parseFloat(productRow.rows[0].msrp_cents) / 100
        : null;

      for (const [key, val] of Object.entries(competitorPricing)) {
        if (key === 'lowest_price') continue;
        if (typeof val !== 'object' || val === null) continue;

        const price = val.price || 0;
        const priceDiff = ttPrice && price > 0 ? (ttPrice - price) : null;
        const isLower = price > 0 && ttPrice ? price < ttPrice : false;

        await client.query(`
          INSERT INTO competitor_prices (
            product_id, competitor_name, competitor_price, currency,
            price_difference, is_lower, pricing_source, last_fetched_at,
            last_checked, updated_at
          ) VALUES ($1, $2, $3, 'CAD', $4, $5, 'pricesapi',
                    $6::timestamptz, $6::timestamp, $6::timestamp)
        `, [productId, key, price, priceDiff, isLower, now.toISOString()]);
      }
    }

    // 2. Upsert into global_skulytics_products (by UPC)
    const existingGlobal = await client.query(
      'SELECT id FROM global_skulytics_products WHERE upc = $1 LIMIT 1',
      [upc]
    );

    if (existingGlobal.rows.length > 0) {
      await client.query(`
        UPDATE global_skulytics_products SET
          competitor_pricing = $1,
          pricing_source     = 'pricesapi',
          last_fetched_at    = $2,
          raw_json           = COALESCE($3, raw_json),
          updated_at         = $2
        WHERE upc = $4
      `, [JSON.stringify(competitorPricing), now, JSON.stringify(rawOffers), upc]);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    // Non-fatal: log but don't fail the response
    console.error('[ce-pricing] Failed to persist pricing:', err.message);
  } finally {
    client.release();
  }
}

// ── Route ───────────────────────────────────────────────────

/**
 * GET /api/pricing/ce/:upc
 *
 * Returns competitor pricing in the same shape CompetitorPricingPanel expects:
 * {
 *   upc, competitor_pricing, is_in_stock, pricing_source, last_fetched_at, cached
 * }
 */
router.get('/:upc', authenticate, asyncHandler(async (req, res) => {
  const upc = req.params.upc?.trim();
  if (!upc || upc.length < 5) {
    throw new ApiError('Valid UPC is required', 400);
  }

  const productId = await findProductIdByUpc(upc);

  // ── 1. Check fresh cache in competitor_prices ─────────
  if (productId) {
    const cached = await getCachedPricing(productId);
    if (cached) {
      return res.success({
        upc,
        competitor_pricing: cached.competitorPricing,
        is_in_stock: Object.values(cached.competitorPricing).some(
          v => typeof v === 'object' && v?.price > 0
        ),
        pricing_source: 'pricesapi',
        last_fetched_at: cached.lastFetchedAt,
        cached: true,
      });
    }
  }

  // ── 2. Check fresh cache in global_skulytics_products ─
  const skulyticsCache = await getSkulyticsCachedPricing(upc);
  if (skulyticsCache) {
    return res.success({
      upc,
      competitor_pricing: skulyticsCache.competitorPricing,
      is_in_stock: Object.values(skulyticsCache.competitorPricing || {}).some(
        v => typeof v === 'object' && v?.price > 0
      ),
      pricing_source: 'pricesapi',
      last_fetched_at: skulyticsCache.lastFetchedAt,
      cached: true,
    });
  }

  // ── 3. Fetch live from PricesAPI ──────────────────────
  try {
    // Step A: Search by UPC to get a PricesAPI product ID
    const search = await pricesApi.searchByUPC(upc);

    if (!search.found || !search.productId) {
      return res.success({
        upc,
        competitor_pricing: null,
        is_in_stock: false,
        pricing_source: 'pricesapi',
        last_fetched_at: null,
        cached: false,
        message: 'Product not found in PricesAPI',
      });
    }

    // Step B: Get retailer offers
    const { offers } = await pricesApi.getOffers(search.productId);

    if (!offers || offers.length === 0) {
      return res.success({
        upc,
        competitor_pricing: null,
        is_in_stock: false,
        pricing_source: 'pricesapi',
        last_fetched_at: new Date().toISOString(),
        cached: false,
        message: 'No retailer offers found',
      });
    }

    // Step C: Normalize into the CompetitorPricingPanel shape
    const { competitorPricing, isInStock, rawOffers } = pricesApi.extractRetailerPrices(offers);

    // Step D: Persist to database (non-blocking)
    persistPricing(productId, upc, competitorPricing, rawOffers).catch(err => {
      console.error('[ce-pricing] Background persist error:', err.message);
    });

    return res.success({
      upc,
      competitor_pricing: competitorPricing,
      is_in_stock: isInStock,
      pricing_source: 'pricesapi',
      last_fetched_at: new Date().toISOString(),
      cached: false,
    });

  } catch (err) {
    // Rate-limited or API error — fall back to stale cache
    if (err.statusCode === 429) {
      const stale = await getStalePricing(productId, upc);
      if (stale) {
        return res.success({
          upc,
          competitor_pricing: stale.competitorPricing,
          is_in_stock: Object.values(stale.competitorPricing || {}).some(
            v => typeof v === 'object' && v?.price > 0
          ),
          pricing_source: 'pricesapi',
          last_fetched_at: stale.lastFetchedAt,
          cached: true,
          stale: true,
          message: 'Rate limited — returning stale cached data',
        });
      }
    }
    throw err;
  }
}));

module.exports = { router, init };
