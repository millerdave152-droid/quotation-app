/**
 * Price History Routes
 * Product price audit trail and price change reporting.
 * @module routes/price-history
 */

const express = require('express');
const { ApiError } = require('../middleware/errorHandler');
const { authenticate } = require('../middleware/auth');
const { checkPermission } = require('../middleware/checkPermission');

function init({ pool }) {
  const router = express.Router();

  // ==========================================================================
  // GET /api/products/:id/price-history
  // ==========================================================================
  router.get(
    '/products/:id/price-history',
    authenticate,
    async (req, res, next) => {
      try {
        const { id } = req.params;
        const { date_from, date_to, page = 1, limit = 50 } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const pageSize = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
        const offset = (pageNum - 1) * pageSize;

        // Verify product exists
        const prodResult = await pool.query(
          'SELECT id, name, sku, model, cost, price FROM products WHERE id = $1',
          [id]
        );
        if (prodResult.rows.length === 0) {
          throw ApiError.notFound('Product');
        }
        const product = prodResult.rows[0];

        const conditions = ['pph.product_id = $1'];
        const params = [id];
        let paramIdx = 2;

        if (date_from) {
          conditions.push(`pph.effective_from >= $${paramIdx++}`);
          params.push(date_from);
        }
        if (date_to) {
          conditions.push(`(pph.effective_to IS NULL OR pph.effective_to <= $${paramIdx++})`);
          params.push(date_to);
        }

        const whereClause = conditions.join(' AND ');

        const countResult = await pool.query(
          `SELECT COUNT(*)::int FROM product_price_history pph WHERE ${whereClause}`,
          params
        );
        const totalCount = countResult.rows[0].count;

        const result = await pool.query(
          `SELECT
             pph.id,
             pph.product_id,
             pph.cost,
             pph.retail_price,
             pph.promo_price,
             pph.previous_cost,
             pph.new_cost,
             pph.previous_price,
             pph.new_price,
             pph.source,
             pph.source_id,
             pph.effective_from,
             pph.effective_to,
             pph.created_by,
             pph.created_at,
             u.first_name || ' ' || u.last_name AS created_by_name,
             CASE pph.source
               WHEN 'import' THEN pli.filename
               ELSE NULL
             END AS source_filename,
             CASE pph.source
               WHEN 'import' THEN v.name
               ELSE NULL
             END AS source_vendor_name
           FROM product_price_history pph
           LEFT JOIN users u ON pph.created_by = u.id
           LEFT JOIN price_list_imports pli ON pph.source = 'import' AND pph.source_id = pli.id
           LEFT JOIN vendors v ON pli.vendor_id = v.id
           WHERE ${whereClause}
           ORDER BY pph.effective_from DESC, pph.created_at DESC
           LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
          [...params, pageSize, offset]
        );

        res.json({
          success: true,
          product: {
            id: product.id,
            name: product.name,
            sku: product.sku,
            model: product.model,
            current_cost: product.cost,
            current_price: product.price,
          },
          history: result.rows,
          pagination: {
            page: pageNum,
            limit: pageSize,
            total: totalCount,
            total_pages: Math.ceil(totalCount / pageSize),
          },
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // ==========================================================================
  // GET /api/price-changes
  // ==========================================================================
  router.get(
    '/price-changes',
    authenticate,
    checkPermission('hub.products.view'),
    async (req, res, next) => {
      try {
        const {
          date,
          date_from,
          date_to,
          vendor_id,
          change_type,
          source,
          page = 1,
          limit = 50,
        } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const pageSize = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
        const offset = (pageNum - 1) * pageSize;

        const conditions = [];
        const params = [];
        let paramIdx = 1;

        // Date filters
        if (date) {
          conditions.push(`pph.effective_from = $${paramIdx++}`);
          params.push(date);
        } else {
          if (date_from) {
            conditions.push(`pph.effective_from >= $${paramIdx++}`);
            params.push(date_from);
          }
          if (date_to) {
            conditions.push(`pph.effective_from <= $${paramIdx++}`);
            params.push(date_to);
          }
        }

        // Vendor filter (only for import-sourced changes)
        if (vendor_id) {
          conditions.push(`pli.vendor_id = $${paramIdx++}`);
          params.push(parseInt(vendor_id, 10));
        }

        // Source filter
        if (source) {
          conditions.push(`pph.source = $${paramIdx++}`);
          params.push(source);
        }

        // Change type filter
        if (change_type === 'increase') {
          conditions.push('pph.cost > ROUND(pph.previous_cost * 100)');
        } else if (change_type === 'decrease') {
          conditions.push('pph.cost < ROUND(pph.previous_cost * 100)');
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        // Count
        const countResult = await pool.query(
          `SELECT COUNT(*)::int
           FROM product_price_history pph
           LEFT JOIN price_list_imports pli ON pph.source = 'import' AND pph.source_id = pli.id
           ${whereClause}`,
          params
        );
        const totalCount = countResult.rows[0].count;

        // Fetch
        const result = await pool.query(
          `SELECT
             pph.id,
             pph.product_id,
             p.name AS product_name,
             p.sku AS product_sku,
             p.model AS product_model,
             pph.cost,
             pph.retail_price,
             pph.promo_price,
             pph.previous_cost,
             pph.new_cost,
             pph.previous_price,
             pph.new_price,
             pph.source,
             pph.source_id,
             pph.effective_from,
             pph.effective_to,
             pph.created_at,
             u.first_name || ' ' || u.last_name AS created_by_name,
             pli.filename AS import_filename,
             v.name AS vendor_name,
             v.code AS vendor_code,
             CASE
               WHEN pph.previous_cost IS NOT NULL AND pph.previous_cost > 0
                 THEN ROUND(((pph.new_cost - pph.previous_cost) / pph.previous_cost) * 100, 1)
               ELSE NULL
             END AS cost_change_percent
           FROM product_price_history pph
           JOIN products p ON pph.product_id = p.id
           LEFT JOIN users u ON pph.created_by = u.id
           LEFT JOIN price_list_imports pli ON pph.source = 'import' AND pph.source_id = pli.id
           LEFT JOIN vendors v ON pli.vendor_id = v.id
           ${whereClause}
           ORDER BY pph.created_at DESC
           LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
          [...params, pageSize, offset]
        );

        // Summary stats
        const summaryResult = await pool.query(
          `SELECT
             COUNT(*)::int AS total_changes,
             COUNT(*) FILTER (WHERE pph.new_cost > pph.previous_cost)::int AS increases,
             COUNT(*) FILTER (WHERE pph.new_cost < pph.previous_cost)::int AS decreases,
             COUNT(*) FILTER (WHERE pph.new_cost = pph.previous_cost)::int AS unchanged,
             COUNT(DISTINCT pph.product_id)::int AS products_affected
           FROM product_price_history pph
           LEFT JOIN price_list_imports pli ON pph.source = 'import' AND pph.source_id = pli.id
           ${whereClause}`,
          params
        );

        res.json({
          success: true,
          summary: summaryResult.rows[0],
          changes: result.rows,
          pagination: {
            page: pageNum,
            limit: pageSize,
            total: totalCount,
            total_pages: Math.ceil(totalCount / pageSize),
          },
        });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}

module.exports = { init };
