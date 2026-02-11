/**
 * Multi-Location Inventory Routes
 * Query, adjust, and track inventory across locations.
 * @module routes/location-inventory
 */

const express = require('express');
const { ApiError } = require('../middleware/errorHandler');
const { authenticate } = require('../middleware/auth');
const { checkPermission } = require('../middleware/checkPermission');

function init({ pool }) {
  const router = express.Router();

  // ==========================================================================
  // GET /api/inventory
  // ==========================================================================
  router.get(
    '/',
    authenticate,
    async (req, res, next) => {
      try {
        const { location_id, product_id, low_stock, out_of_stock, search, page = 1, limit = 50 } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const pageSize = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
        const offset = (pageNum - 1) * pageSize;

        const conditions = [];
        const params = [];
        let pi = 1;

        if (location_id) {
          conditions.push(`li.location_id = $${pi++}`);
          params.push(parseInt(location_id, 10));
        }
        if (product_id) {
          conditions.push(`li.product_id = $${pi++}`);
          params.push(parseInt(product_id, 10));
        }
        if (out_of_stock === 'true') {
          conditions.push('(li.quantity_on_hand - li.quantity_reserved) <= 0');
        } else if (low_stock === 'true') {
          conditions.push('li.reorder_point IS NOT NULL AND (li.quantity_on_hand - li.quantity_reserved) <= li.reorder_point');
        }
        if (search) {
          conditions.push(`(p.name ILIKE $${pi} OR p.sku ILIKE $${pi} OR p.model ILIKE $${pi})`);
          params.push(`%${search}%`);
          pi++;
        }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const countResult = await pool.query(
          `SELECT COUNT(*)::int FROM location_inventory li JOIN products p ON li.product_id = p.id ${where}`,
          params
        );

        const result = await pool.query(
          `SELECT li.*,
                  p.name AS product_name, p.sku AS product_sku, p.model AS product_model,
                  p.price AS product_price, p.cost AS product_cost,
                  l.name AS location_name, l.code AS location_code
           FROM location_inventory li
           JOIN products p ON li.product_id = p.id
           JOIN locations l ON li.location_id = l.id
           ${where}
           ORDER BY p.name, l.name
           LIMIT $${pi++} OFFSET $${pi++}`,
          [...params, pageSize, offset]
        );

        res.json({
          success: true,
          inventory: result.rows,
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
  // GET /api/inventory/product/:productId
  // ==========================================================================
  router.get(
    '/product/:productId',
    authenticate,
    async (req, res, next) => {
      try {
        const { productId } = req.params;

        const prodResult = await pool.query(
          'SELECT id, name, sku, model, price, cost, quantity_in_stock FROM products WHERE id = $1',
          [productId]
        );
        if (prodResult.rows.length === 0) {
          throw ApiError.notFound('Product');
        }

        const invResult = await pool.query(
          `SELECT li.*,
                  l.name AS location_name, l.code AS location_code,
                  u.first_name || ' ' || u.last_name AS counted_by_name
           FROM location_inventory li
           JOIN locations l ON li.location_id = l.id
           LEFT JOIN users u ON li.last_counted_by = u.id
           WHERE li.product_id = $1
           ORDER BY l.name`,
          [productId]
        );

        // Summary
        const summaryResult = await pool.query(
          'SELECT * FROM product_inventory_summary WHERE product_id = $1',
          [productId]
        );

        // Recent adjustments
        const adjResult = await pool.query(
          `SELECT ia.*, l.name AS location_name,
                  u.first_name || ' ' || u.last_name AS adjusted_by_name
           FROM inventory_adjustments ia
           JOIN locations l ON ia.location_id = l.id
           LEFT JOIN users u ON ia.adjusted_by = u.id
           WHERE ia.product_id = $1
           ORDER BY ia.created_at DESC
           LIMIT 20`,
          [productId]
        );

        res.json({
          success: true,
          product: prodResult.rows[0],
          locations: invResult.rows,
          summary: summaryResult.rows[0] || { total_on_hand: 0, total_reserved: 0, total_available: 0, locations_stocked: 0 },
          recent_adjustments: adjResult.rows,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // ==========================================================================
  // GET /api/inventory/location/:locationId
  // ==========================================================================
  router.get(
    '/location/:locationId',
    authenticate,
    async (req, res, next) => {
      try {
        const { locationId } = req.params;
        const { search, low_stock, out_of_stock, page = 1, limit = 50 } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const pageSize = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
        const offset = (pageNum - 1) * pageSize;

        const locResult = await pool.query('SELECT * FROM locations WHERE id = $1', [locationId]);
        if (locResult.rows.length === 0) {
          throw ApiError.notFound('Location');
        }

        const conditions = ['li.location_id = $1'];
        const params = [locationId];
        let pi = 2;

        if (out_of_stock === 'true') {
          conditions.push('(li.quantity_on_hand - li.quantity_reserved) <= 0');
        } else if (low_stock === 'true') {
          conditions.push('li.reorder_point IS NOT NULL AND (li.quantity_on_hand - li.quantity_reserved) <= li.reorder_point');
        }
        if (search) {
          conditions.push(`(p.name ILIKE $${pi} OR p.sku ILIKE $${pi} OR p.model ILIKE $${pi})`);
          params.push(`%${search}%`);
          pi++;
        }

        const where = conditions.join(' AND ');

        const countResult = await pool.query(
          `SELECT COUNT(*)::int FROM location_inventory li JOIN products p ON li.product_id = p.id WHERE ${where}`,
          params
        );

        const result = await pool.query(
          `SELECT li.*,
                  p.name AS product_name, p.sku AS product_sku, p.model AS product_model,
                  p.price AS product_price, p.cost AS product_cost
           FROM location_inventory li
           JOIN products p ON li.product_id = p.id
           WHERE ${where}
           ORDER BY p.name
           LIMIT $${pi++} OFFSET $${pi++}`,
          [...params, pageSize, offset]
        );

        // Summary stats for this location
        const statsResult = await pool.query(
          `SELECT
             COUNT(*)::int AS total_products,
             SUM(quantity_on_hand)::int AS total_on_hand,
             SUM(quantity_reserved)::int AS total_reserved,
             SUM(quantity_on_hand - quantity_reserved)::int AS total_available,
             COUNT(*) FILTER (WHERE reorder_point IS NOT NULL AND (quantity_on_hand - quantity_reserved) <= reorder_point)::int AS low_stock_count,
             COUNT(*) FILTER (WHERE (quantity_on_hand - quantity_reserved) <= 0)::int AS out_of_stock_count
           FROM location_inventory
           WHERE location_id = $1`,
          [locationId]
        );

        res.json({
          success: true,
          location: locResult.rows[0],
          inventory: result.rows,
          stats: statsResult.rows[0],
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
  // PUT /api/inventory/:locationId/:productId
  // ==========================================================================
  router.put(
    '/:locationId/:productId',
    authenticate,
    checkPermission('hub.inventory.adjust'),
    async (req, res, next) => {
      const client = await pool.connect();
      try {
        const locationId = parseInt(req.params.locationId, 10);
        const productId = parseInt(req.params.productId, 10);
        const { quantity_on_hand, bin_location, reorder_point, reorder_quantity, reason } = req.body;

        if (quantity_on_hand === undefined && bin_location === undefined && reorder_point === undefined && reorder_quantity === undefined) {
          throw ApiError.badRequest('No fields to update');
        }

        await client.query('BEGIN');

        // Verify location and product exist
        const locCheck = await client.query('SELECT id FROM locations WHERE id = $1', [locationId]);
        if (locCheck.rows.length === 0) {
          await client.query('ROLLBACK');
          throw ApiError.notFound('Location');
        }
        const prodCheck = await client.query('SELECT id FROM products WHERE id = $1', [productId]);
        if (prodCheck.rows.length === 0) {
          await client.query('ROLLBACK');
          throw ApiError.notFound('Product');
        }

        // Upsert location_inventory row
        const existing = await client.query(
          'SELECT * FROM location_inventory WHERE location_id = $1 AND product_id = $2',
          [locationId, productId]
        );

        let previousQty = 0;
        if (existing.rows.length > 0) {
          previousQty = existing.rows[0].quantity_on_hand;
        }

        const newQty = quantity_on_hand !== undefined ? parseInt(quantity_on_hand, 10) : previousQty;
        const newBin = bin_location !== undefined ? bin_location : (existing.rows[0]?.bin_location || null);
        const newReorderPt = reorder_point !== undefined ? (reorder_point === null ? null : parseInt(reorder_point, 10)) : (existing.rows[0]?.reorder_point || null);
        const newReorderQty = reorder_quantity !== undefined ? (reorder_quantity === null ? null : parseInt(reorder_quantity, 10)) : (existing.rows[0]?.reorder_quantity || null);

        let result;
        if (existing.rows.length > 0) {
          result = await client.query(
            `UPDATE location_inventory SET
               quantity_on_hand = $1, bin_location = $2,
               reorder_point = $3, reorder_quantity = $4,
               updated_at = NOW()
             WHERE location_id = $5 AND product_id = $6
             RETURNING *`,
            [newQty, newBin, newReorderPt, newReorderQty, locationId, productId]
          );
        } else {
          result = await client.query(
            `INSERT INTO location_inventory (location_id, product_id, quantity_on_hand, bin_location, reorder_point, reorder_quantity)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [locationId, productId, newQty, newBin, newReorderPt, newReorderQty]
          );
        }

        // Log adjustment if quantity changed
        if (quantity_on_hand !== undefined && newQty !== previousQty) {
          await client.query(
            `INSERT INTO inventory_adjustments
               (location_id, product_id, adjustment_type, quantity_change, quantity_before, quantity_after, reason, adjusted_by)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [locationId, productId, 'manual', newQty - previousQty, previousQty, newQty, reason || null, req.user.id]
          );
        }

        await client.query('COMMIT');

        res.json({ success: true, inventory: result.rows[0] });
      } catch (err) {
        await client.query('ROLLBACK');
        next(err);
      } finally {
        client.release();
      }
    }
  );

  // ==========================================================================
  // GET /api/inventory/summary
  // ==========================================================================
  router.get(
    '/summary',
    authenticate,
    async (req, res, next) => {
      try {
        const { low_stock, page = 1, limit = 50 } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const pageSize = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
        const offset = (pageNum - 1) * pageSize;

        let extra = '';
        if (low_stock === 'true') {
          extra = 'HAVING SUM(li.quantity_on_hand - li.quantity_reserved) <= COALESCE(MIN(li.reorder_point), 0)';
        }

        const result = await pool.query(
          `SELECT li.product_id,
                  p.name AS product_name, p.sku AS product_sku, p.model AS product_model,
                  SUM(li.quantity_on_hand)::int AS total_on_hand,
                  SUM(li.quantity_reserved)::int AS total_reserved,
                  SUM(li.quantity_on_hand - li.quantity_reserved)::int AS total_available,
                  COUNT(DISTINCT li.location_id)::int AS locations_stocked
           FROM location_inventory li
           JOIN products p ON li.product_id = p.id
           GROUP BY li.product_id, p.name, p.sku, p.model
           ${extra}
           ORDER BY p.name
           LIMIT $1 OFFSET $2`,
          [pageSize, offset]
        );

        res.json({ success: true, products: result.rows });
      } catch (err) {
        next(err);
      }
    }
  );

  // ==========================================================================
  // GET /api/inventory/adjustments
  // ==========================================================================
  router.get(
    '/adjustments',
    authenticate,
    async (req, res, next) => {
      try {
        const { location_id, product_id, type, from_date, to_date, page = 1, limit = 50 } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const pageSize = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
        const offset = (pageNum - 1) * pageSize;

        const conditions = [];
        const params = [];
        let pi = 1;

        if (location_id) { conditions.push(`ia.location_id = $${pi++}`); params.push(parseInt(location_id, 10)); }
        if (product_id) { conditions.push(`ia.product_id = $${pi++}`); params.push(parseInt(product_id, 10)); }
        if (type) { conditions.push(`ia.adjustment_type = $${pi++}`); params.push(type); }
        if (from_date) { conditions.push(`ia.created_at >= $${pi++}::timestamp`); params.push(from_date); }
        if (to_date) { conditions.push(`ia.created_at <= $${pi++}::timestamp`); params.push(to_date); }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const countResult = await pool.query(
          `SELECT COUNT(*)::int FROM inventory_adjustments ia ${where}`, params
        );

        const result = await pool.query(
          `SELECT ia.*,
                  p.name AS product_name, p.sku AS product_sku,
                  l.name AS location_name,
                  u.first_name || ' ' || u.last_name AS adjusted_by_name
           FROM inventory_adjustments ia
           JOIN products p ON ia.product_id = p.id
           JOIN locations l ON ia.location_id = l.id
           LEFT JOIN users u ON ia.adjusted_by = u.id
           ${where}
           ORDER BY ia.created_at DESC
           LIMIT $${pi++} OFFSET $${pi++}`,
          [...params, pageSize, offset]
        );

        res.json({
          success: true,
          adjustments: result.rows,
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

  return router;
}

module.exports = { init };
