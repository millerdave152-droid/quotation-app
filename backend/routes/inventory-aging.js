/**
 * Inventory Aging, Stuck Inventory & Turnover Reports
 * @module routes/inventory-aging
 */

const express = require('express');
const { authenticate } = require('../middleware/auth');
const { checkPermission } = require('../middleware/checkPermission');
const { ApiError } = require('../middleware/errorHandler');

function init({ pool }) {
  const router = express.Router();

  // ---------- Helpers ----------

  function suggestAction(daysInStock, daysSinceSale, unitsSold90d, qty) {
    if (daysSinceSale === null && daysInStock > 180) return 'dispose';
    if (daysSinceSale > 180 || (daysSinceSale === null && daysInStock > 120)) return 'clearance';
    if (daysSinceSale > 90 && qty > 5) return 'markdown';
    if (unitsSold90d === 0 && daysInStock > 60) return 'transfer';
    if (daysInStock > 90 && unitsSold90d < qty * 0.1) return 'markdown';
    return 'hold';
  }

  // ==========================================================================
  // GET /api/inventory/reports/aging
  // ==========================================================================
  router.get(
    '/reports/aging',
    authenticate,
    async (req, res, next) => {
      try {
        const { location_id, age_bucket, min_value, category, manufacturer, search, page = 1, limit = 50 } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const pageSize = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
        const offset = (pageNum - 1) * pageSize;

        const conditions = [];
        const params = [];
        let pi = 1;

        if (location_id) { conditions.push(`a.location_id = $${pi++}`); params.push(parseInt(location_id, 10)); }
        if (age_bucket) { conditions.push(`a.age_bucket = $${pi++}`); params.push(age_bucket); }
        if (min_value) { conditions.push(`a.inventory_value_cost >= $${pi++}`); params.push(parseFloat(min_value)); }
        if (category) { conditions.push(`a.category ILIKE $${pi++}`); params.push(`%${category}%`); }
        if (manufacturer) { conditions.push(`a.manufacturer ILIKE $${pi++}`); params.push(`%${manufacturer}%`); }
        if (search) {
          conditions.push(`(a.name ILIKE $${pi} OR a.sku ILIKE $${pi} OR a.model ILIKE $${pi})`);
          params.push(`%${search}%`);
          pi++;
        }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        // Summary by age bucket (unfiltered by bucket to always show all buckets)
        const bucketConditions = conditions.filter((_, i) => {
          // Remove age_bucket condition for summary
          return !(age_bucket && conditions[i].includes('age_bucket'));
        });
        const bucketWhere = bucketConditions.length > 0 ? `WHERE ${bucketConditions.join(' AND ')}` : '';
        const bucketParams = age_bucket
          ? params.filter((_, i) => i !== conditions.indexOf(`a.age_bucket = $${params.indexOf(age_bucket) + 1}`))
          : [...params];

        // Simpler approach: run summary without age_bucket filter
        const summaryParams = [];
        const summaryConditions = [];
        let spi = 1;
        if (location_id) { summaryConditions.push(`a.location_id = $${spi++}`); summaryParams.push(parseInt(location_id, 10)); }
        if (min_value) { summaryConditions.push(`a.inventory_value_cost >= $${spi++}`); summaryParams.push(parseFloat(min_value)); }
        if (category) { summaryConditions.push(`a.category ILIKE $${spi++}`); summaryParams.push(`%${category}%`); }
        if (manufacturer) { summaryConditions.push(`a.manufacturer ILIKE $${spi++}`); summaryParams.push(`%${manufacturer}%`); }
        if (search) {
          summaryConditions.push(`(a.name ILIKE $${spi} OR a.sku ILIKE $${spi} OR a.model ILIKE $${spi})`);
          summaryParams.push(`%${search}%`);
          spi++;
        }
        const summaryWhere = summaryConditions.length > 0 ? `WHERE ${summaryConditions.join(' AND ')}` : '';

        const summaryResult = await pool.query(
          `SELECT
             a.age_bucket,
             COUNT(*)::int AS count,
             SUM(a.quantity_on_hand)::int AS total_units,
             SUM(a.inventory_value_cost)::numeric(12,2) AS value_at_cost,
             SUM(a.inventory_value_retail)::numeric(12,2) AS value_at_retail
           FROM inventory_aging a
           ${summaryWhere}
           GROUP BY a.age_bucket
           ORDER BY
             CASE a.age_bucket
               WHEN '0-30' THEN 1
               WHEN '31-60' THEN 2
               WHEN '61-90' THEN 3
               WHEN '90+' THEN 4
             END`,
          summaryParams
        );

        const summary = {};
        for (const row of summaryResult.rows) {
          summary[row.age_bucket] = {
            count: row.count,
            total_units: row.total_units,
            value_at_cost: parseFloat(row.value_at_cost),
            value_at_retail: parseFloat(row.value_at_retail),
          };
        }
        // Ensure all buckets present
        for (const bucket of ['0-30', '31-60', '61-90', '90+']) {
          if (!summary[bucket]) summary[bucket] = { count: 0, total_units: 0, value_at_cost: 0, value_at_retail: 0 };
        }

        // Items count
        const countResult = await pool.query(
          `SELECT COUNT(*)::int FROM inventory_aging a ${where}`, params
        );

        // Items
        const itemsResult = await pool.query(
          `SELECT a.*,
                  l.name AS location_name, l.code AS location_code
           FROM inventory_aging a
           JOIN locations l ON a.location_id = l.id
           ${where}
           ORDER BY a.days_in_stock DESC, a.inventory_value_cost DESC
           LIMIT $${pi++} OFFSET $${pi++}`,
          [...params, pageSize, offset]
        );

        const items = itemsResult.rows.map(row => ({
          ...row,
          inventory_value_cost: parseFloat(row.inventory_value_cost),
          inventory_value_retail: parseFloat(row.inventory_value_retail),
          suggested_action: suggestAction(
            row.days_in_stock,
            row.days_since_last_sale,
            row.units_sold_90d,
            row.quantity_on_hand
          ),
        }));

        res.json({
          success: true,
          summary,
          items,
          pagination: {
            page: pageNum,
            limit: pageSize,
            total: countResult.rows[0].count,
            total_pages: Math.ceil(countResult.rows[0].count / pageSize),
          },
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // ==========================================================================
  // GET /api/inventory/reports/stuck
  // ==========================================================================
  router.get(
    '/reports/stuck',
    authenticate,
    async (req, res, next) => {
      try {
        const { days_threshold = 90, min_quantity = 1, location_id, category, page = 1, limit = 50 } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const pageSize = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
        const offset = (pageNum - 1) * pageSize;
        const daysThresh = parseInt(days_threshold, 10) || 90;
        const minQty = parseInt(min_quantity, 10) || 1;

        const conditions = [
          `li.quantity_on_hand >= $1`,
          `p.id NOT IN (
            SELECT DISTINCT oi.product_id FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            WHERE o.created_at > NOW() - INTERVAL '1 day' * $2
          )`,
        ];
        const params = [minQty, daysThresh];
        let pi = 3;

        if (location_id) { conditions.push(`li.location_id = $${pi++}`); params.push(parseInt(location_id, 10)); }
        if (category) { conditions.push(`p.category ILIKE $${pi++}`); params.push(`%${category}%`); }

        const where = conditions.join(' AND ');

        const countResult = await pool.query(
          `SELECT COUNT(*)::int
           FROM location_inventory li
           JOIN products p ON li.product_id = p.id
           WHERE ${where}`,
          params
        );

        const result = await pool.query(
          `SELECT li.product_id, li.location_id, li.quantity_on_hand,
                  (li.quantity_on_hand - li.quantity_reserved) AS quantity_available,
                  p.name, p.sku, p.model, p.manufacturer, p.category,
                  p.cost, p.price,
                  (li.quantity_on_hand * p.cost)::numeric(12,2) AS value_at_cost,
                  l.name AS location_name,
                  li.created_at AS in_stock_since,
                  EXTRACT(DAY FROM NOW() - li.created_at)::int AS days_in_stock,
                  (SELECT MAX(o.created_at) FROM order_items oi
                   JOIN orders o ON o.id = oi.order_id
                   WHERE oi.product_id = li.product_id) AS last_sale_date,
                  p.is_clearance,
                  p.clearance_price_cents
           FROM location_inventory li
           JOIN products p ON li.product_id = p.id
           JOIN locations l ON li.location_id = l.id
           WHERE ${where}
           ORDER BY (li.quantity_on_hand * p.cost) DESC
           LIMIT $${pi++} OFFSET $${pi++}`,
          [...params, pageSize, offset]
        );

        // Summary
        const summaryResult = await pool.query(
          `SELECT
             COUNT(DISTINCT li.product_id)::int AS unique_products,
             SUM(li.quantity_on_hand)::int AS total_units,
             SUM(li.quantity_on_hand * p.cost)::numeric(12,2) AS total_value_cost,
             SUM(li.quantity_on_hand * p.price)::numeric(12,2) AS total_value_retail,
             SUM(li.quantity_on_hand * (p.price - p.cost))::numeric(12,2) AS unrealized_margin
           FROM location_inventory li
           JOIN products p ON li.product_id = p.id
           WHERE ${where}`,
          params
        );

        res.json({
          success: true,
          days_threshold: daysThresh,
          summary: summaryResult.rows[0],
          products: result.rows.map(r => ({
            ...r,
            value_at_cost: parseFloat(r.value_at_cost),
            suggested_action: suggestAction(
              r.days_in_stock, null, 0, r.quantity_on_hand
            ),
          })),
          pagination: {
            page: pageNum,
            limit: pageSize,
            total: countResult.rows[0].count,
            total_pages: Math.ceil(countResult.rows[0].count / pageSize),
          },
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // ==========================================================================
  // GET /api/inventory/reports/turnover
  // ==========================================================================
  router.get(
    '/reports/turnover',
    authenticate,
    async (req, res, next) => {
      try {
        const { date_from, date_to, category_id, category, location_id, page = 1, limit = 50 } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const pageSize = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
        const offset = (pageNum - 1) * pageSize;

        // Default: last 90 days
        const endDate = date_to || new Date().toISOString().split('T')[0];
        const startDate = date_from || new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0];
        const periodDays = Math.max(1, Math.round((new Date(endDate) - new Date(startDate)) / 86400000));

        const conditions = [];
        const params = [startDate, endDate];
        let pi = 3;

        if (category_id) { conditions.push(`p.category_id = $${pi++}`); params.push(parseInt(category_id, 10)); }
        if (category) { conditions.push(`p.category ILIKE $${pi++}`); params.push(`%${category}%`); }
        if (location_id) { conditions.push(`li.location_id = $${pi++}`); params.push(parseInt(location_id, 10)); }

        const extraWhere = conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';

        const result = await pool.query(
          `WITH sales AS (
            SELECT oi.product_id,
                   SUM(oi.quantity)::int AS units_sold,
                   SUM(oi.unit_cost_cents * oi.quantity)::int AS cogs_cents
            FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            WHERE o.created_at >= $1::date AND o.created_at <= $2::date + INTERVAL '1 day'
            GROUP BY oi.product_id
          ),
          current_inv AS (
            SELECT product_id,
                   SUM(quantity_on_hand)::int AS ending_inventory
            FROM location_inventory li
            WHERE 1=1 ${location_id ? `AND li.location_id = $${params.indexOf(parseInt(location_id, 10)) + 1}` : ''}
            GROUP BY product_id
          )
          SELECT
            p.id AS product_id, p.sku, p.name, p.model, p.manufacturer, p.category,
            p.cost, p.price,
            COALESCE(s.units_sold, 0) AS units_sold,
            COALESCE(s.cogs_cents, 0) AS cogs_cents,
            COALESCE(ci.ending_inventory, 0) AS ending_inventory,
            -- Estimate beginning inventory = ending + sold
            COALESCE(ci.ending_inventory, 0) + COALESCE(s.units_sold, 0) AS beginning_inventory,
            -- Average inventory
            ((COALESCE(ci.ending_inventory, 0) + COALESCE(s.units_sold, 0)) + COALESCE(ci.ending_inventory, 0))::numeric / 2 AS average_inventory,
            -- Turnover rate = COGS / average inventory value
            CASE
              WHEN COALESCE(ci.ending_inventory, 0) > 0 THEN
                ROUND(
                  COALESCE(s.units_sold, 0)::numeric /
                  NULLIF(((COALESCE(ci.ending_inventory, 0) + COALESCE(s.units_sold, 0)) + COALESCE(ci.ending_inventory, 0))::numeric / 2, 0),
                  2
                )
              ELSE 0
            END AS turnover_rate,
            -- Days to sell = period_days / turnover_rate
            CASE
              WHEN COALESCE(s.units_sold, 0) > 0 THEN
                ROUND(
                  ${periodDays}::numeric /
                  (COALESCE(s.units_sold, 0)::numeric /
                   NULLIF(((COALESCE(ci.ending_inventory, 0) + COALESCE(s.units_sold, 0)) + COALESCE(ci.ending_inventory, 0))::numeric / 2, 0)),
                  0
                )::int
              ELSE NULL
            END AS days_to_sell
          FROM products p
          LEFT JOIN sales s ON s.product_id = p.id
          LEFT JOIN current_inv ci ON ci.product_id = p.id
          WHERE (COALESCE(s.units_sold, 0) > 0 OR COALESCE(ci.ending_inventory, 0) > 0)
            ${extraWhere}
          ORDER BY turnover_rate DESC
          LIMIT $${pi++} OFFSET $${pi++}`,
          [...params, pageSize, offset]
        );

        // Count
        const countResult = await pool.query(
          `WITH sales AS (
            SELECT DISTINCT product_id FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            WHERE o.created_at >= $1::date AND o.created_at <= $2::date + INTERVAL '1 day'
          ),
          current_inv AS (
            SELECT DISTINCT product_id FROM location_inventory li
            WHERE quantity_on_hand > 0
            ${location_id ? `AND li.location_id = $${params.indexOf(parseInt(location_id, 10)) + 1}` : ''}
          )
          SELECT COUNT(*)::int FROM products p
          LEFT JOIN sales s ON s.product_id = p.id
          LEFT JOIN current_inv ci ON ci.product_id = p.id
          WHERE (s.product_id IS NOT NULL OR ci.product_id IS NOT NULL)
            ${extraWhere}`,
          params
        );

        // Summary
        const items = result.rows;
        const turnoverRates = items.filter(i => parseFloat(i.turnover_rate) > 0).map(i => parseFloat(i.turnover_rate));
        const avgTurnover = turnoverRates.length > 0
          ? (turnoverRates.reduce((a, b) => a + b, 0) / turnoverRates.length).toFixed(2)
          : '0.00';

        const totalCogs = items.reduce((sum, i) => sum + (i.cogs_cents || 0), 0);
        const slowCount = items.filter(i => parseFloat(i.turnover_rate) < 0.5 && i.ending_inventory > 0).length;
        const fastCount = items.filter(i => parseFloat(i.turnover_rate) >= 2).length;

        res.json({
          success: true,
          period: { from: startDate, to: endDate, days: periodDays },
          summary: {
            average_turnover_rate: parseFloat(avgTurnover),
            total_cogs_cents: totalCogs,
            slow_moving_count: slowCount,
            fast_moving_count: fastCount,
            total_products: countResult.rows[0].count,
          },
          items: items.map(i => ({
            ...i,
            turnover_rate: parseFloat(i.turnover_rate),
            average_inventory: parseFloat(i.average_inventory),
            speed: parseFloat(i.turnover_rate) >= 2 ? 'fast' : parseFloat(i.turnover_rate) >= 0.5 ? 'normal' : 'slow',
          })),
          pagination: {
            page: pageNum,
            limit: pageSize,
            total: countResult.rows[0].count,
            total_pages: Math.ceil(countResult.rows[0].count / pageSize),
          },
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // ==========================================================================
  // POST /api/inventory/mark-clearance
  // ==========================================================================
  router.post(
    '/mark-clearance',
    authenticate,
    checkPermission('hub.inventory.adjust'),
    async (req, res, next) => {
      const client = await pool.connect();
      try {
        const { product_ids, clearance_percentage, reason } = req.body;

        if (!product_ids || !Array.isArray(product_ids) || product_ids.length === 0) {
          throw ApiError.badRequest('product_ids array is required');
        }
        const pct = parseFloat(clearance_percentage);
        if (isNaN(pct) || pct <= 0 || pct > 100) {
          throw ApiError.badRequest('clearance_percentage must be between 0 and 100');
        }
        if (product_ids.length > 500) {
          throw ApiError.badRequest('Maximum 500 products per batch');
        }

        await client.query('BEGIN');

        const updated = [];

        for (const productId of product_ids) {
          // Get current price
          const prodResult = await client.query(
            'SELECT id, name, price FROM products WHERE id = $1',
            [productId]
          );
          if (prodResult.rows.length === 0) continue;

          const product = prodResult.rows[0];
          const originalPriceCents = Math.round(parseFloat(product.price) * 100);
          const clearancePriceCents = Math.round(originalPriceCents * (1 - pct / 100));

          await client.query(
            `UPDATE products SET
               is_clearance = true,
               clearance_price_cents = $1,
               clearance_start_date = CURRENT_DATE,
               clearance_reason = $2,
               updated_at = NOW()
             WHERE id = $3`,
            [clearancePriceCents, reason || `${pct}% markdown`, productId]
          );

          updated.push({
            product_id: productId,
            product_name: product.name,
            original_price_cents: originalPriceCents,
            clearance_price_cents: clearancePriceCents,
            discount_percentage: pct,
          });
        }

        await client.query('COMMIT');

        res.json({
          success: true,
          message: `${updated.length} products marked for clearance`,
          updated,
        });
      } catch (err) {
        await client.query('ROLLBACK');
        next(err);
      } finally {
        client.release();
      }
    }
  );

  // ==========================================================================
  // POST /api/inventory/remove-clearance
  // ==========================================================================
  router.post(
    '/remove-clearance',
    authenticate,
    checkPermission('hub.inventory.adjust'),
    async (req, res, next) => {
      try {
        const { product_ids } = req.body;
        if (!product_ids || !Array.isArray(product_ids) || product_ids.length === 0) {
          throw ApiError.badRequest('product_ids array is required');
        }

        const result = await pool.query(
          `UPDATE products SET
             is_clearance = false,
             clearance_price_cents = NULL,
             clearance_start_date = NULL,
             clearance_reason = NULL,
             updated_at = NOW()
           WHERE id = ANY($1)
           RETURNING id, name`,
          [product_ids]
        );

        res.json({
          success: true,
          message: `${result.rows.length} products removed from clearance`,
          products: result.rows,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}

module.exports = { init };
