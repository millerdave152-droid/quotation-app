/**
 * Product Bundles & Kits Routes
 * CRUD, pricing calculation, and item management for bundles.
 * @module routes/bundles
 */

const express = require('express');
const { authenticate } = require('../middleware/auth');
const { checkPermission } = require('../middleware/checkPermission');
const { ApiError } = require('../middleware/errorHandler');

const VALID_PRICING_TYPES = ['fixed', 'percentage_discount', 'sum_minus_discount'];

function init({ pool }) {
  const router = express.Router();

  // ---------- Helpers ----------

  async function calculateBundlePrice(bundleId) {
    const bundleResult = await pool.query('SELECT * FROM bundles WHERE id = $1', [bundleId]);
    if (bundleResult.rows.length === 0) return null;
    const bundle = bundleResult.rows[0];

    const itemsResult = await pool.query(
      `SELECT bi.*, p.name AS product_name, p.price AS product_price, p.sku AS product_sku,
              p.quantity_in_stock
       FROM bundle_items bi
       JOIN products p ON bi.product_id = p.id
       WHERE bi.bundle_id = $1
       ORDER BY bi.sort_order, bi.id`,
      [bundleId]
    );
    const items = itemsResult.rows;

    // Sum component prices (products.price is dollars NUMERIC → convert to cents)
    let componentSum = 0;
    for (const item of items) {
      componentSum += Math.round(parseFloat(item.product_price) * 100) * item.quantity;
    }

    let bundlePrice;
    switch (bundle.pricing_type) {
      case 'fixed':
        bundlePrice = bundle.fixed_price || 0;
        break;
      case 'percentage_discount':
        bundlePrice = Math.round(componentSum * (1 - parseFloat(bundle.discount_percentage || 0) / 100));
        break;
      case 'sum_minus_discount':
        bundlePrice = Math.max(0, componentSum - (bundle.discount_amount || 0));
        break;
      default:
        bundlePrice = componentSum;
    }

    const savings = componentSum - bundlePrice;

    return {
      component_total: componentSum,
      bundle_price: bundlePrice,
      savings,
      savings_percentage: componentSum > 0 ? ((savings / componentSum) * 100).toFixed(1) : '0.0',
      items: items.map(i => ({
        id: i.id,
        product_id: i.product_id,
        product_name: i.product_name,
        product_sku: i.product_sku,
        product_price: Math.round(parseFloat(i.product_price) * 100),
        quantity: i.quantity,
        is_required: i.is_required,
        alternatives: i.alternatives,
        sort_order: i.sort_order,
        in_stock: i.quantity_in_stock >= i.quantity,
      })),
    };
  }

  function validateBundle(body) {
    const errors = [];
    if (!body.sku || !body.sku.trim()) errors.push('sku is required');
    if (!body.name || !body.name.trim()) errors.push('name is required');
    if (!body.pricing_type || !VALID_PRICING_TYPES.includes(body.pricing_type)) {
      errors.push(`pricing_type must be one of: ${VALID_PRICING_TYPES.join(', ')}`);
    }
    if (body.pricing_type === 'fixed') {
      const fp = parseInt(body.fixed_price, 10);
      if (isNaN(fp) || fp <= 0) errors.push('fixed_price must be a positive integer (cents)');
    }
    if (body.pricing_type === 'percentage_discount') {
      const pct = parseFloat(body.discount_percentage);
      if (isNaN(pct) || pct <= 0 || pct > 100) errors.push('discount_percentage must be between 0 and 100');
    }
    if (body.pricing_type === 'sum_minus_discount') {
      const amt = parseInt(body.discount_amount, 10);
      if (isNaN(amt) || amt <= 0) errors.push('discount_amount must be a positive integer (cents)');
    }
    return errors;
  }

  // ==========================================================================
  // POST /api/bundles
  // ==========================================================================
  router.post(
    '/',
    authenticate,
    checkPermission('hub.products.edit'),
    async (req, res, next) => {
      const client = await pool.connect();
      try {
        const errors = validateBundle(req.body);
        if (errors.length > 0) {
          throw ApiError.badRequest('Validation failed', errors);
        }

        const {
          sku, name, description, pricing_type,
          fixed_price, discount_percentage, discount_amount,
          image_url, is_featured, is_active,
          available_from, available_to, track_component_inventory,
          items,
        } = req.body;

        // SKU uniqueness
        const existing = await client.query('SELECT id FROM bundles WHERE sku = $1', [sku.trim().toUpperCase()]);
        if (existing.rows.length > 0) {
          throw ApiError.conflict(`Bundle SKU '${sku}' already exists`);
        }

        await client.query('BEGIN');

        const bundleResult = await client.query(
          `INSERT INTO bundles (
             sku, name, description, pricing_type,
             fixed_price, discount_percentage, discount_amount,
             image_url, is_featured, is_active,
             available_from, available_to, track_component_inventory,
             created_by
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
           RETURNING *`,
          [
            sku.trim().toUpperCase(), name.trim(), description || null, pricing_type,
            fixed_price || null, discount_percentage || null, discount_amount || null,
            image_url || null, is_featured || false, is_active !== false,
            available_from || null, available_to || null, track_component_inventory !== false,
            req.user.id,
          ]
        );
        const bundle = bundleResult.rows[0];

        // Insert items
        if (items && Array.isArray(items) && items.length > 0) {
          for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (!item.product_id) continue;
            await client.query(
              `INSERT INTO bundle_items (bundle_id, product_id, quantity, is_required, alternatives, sort_order)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [
                bundle.id,
                item.product_id,
                item.quantity || 1,
                item.is_required !== false,
                item.alternatives ? JSON.stringify(item.alternatives) : null,
                item.sort_order ?? i,
              ]
            );
          }
        }

        await client.query('COMMIT');

        const pricing = await calculateBundlePrice(bundle.id);

        res.status(201).json({
          success: true,
          bundle: { ...bundle, pricing },
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
  // GET /api/bundles
  // ==========================================================================
  router.get(
    '/',
    authenticate,
    async (req, res, next) => {
      try {
        const { active, featured, search, page = 1, limit = 25 } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
        const offset = (pageNum - 1) * pageSize;

        const conditions = [];
        const params = [];
        let pi = 1;

        if (active === 'true') {
          conditions.push('b.is_active = true');
          conditions.push('(b.available_from IS NULL OR b.available_from <= CURRENT_DATE)');
          conditions.push('(b.available_to IS NULL OR b.available_to >= CURRENT_DATE)');
        } else if (active === 'false') {
          conditions.push('b.is_active = false');
        }
        if (featured === 'true') {
          conditions.push('b.is_featured = true');
        }
        if (search) {
          conditions.push(`(b.name ILIKE $${pi} OR b.sku ILIKE $${pi})`);
          params.push(`%${search}%`);
          pi++;
        }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const countResult = await pool.query(
          `SELECT COUNT(*)::int FROM bundles b ${where}`, params
        );

        const result = await pool.query(
          `SELECT b.*,
                  (SELECT COUNT(*)::int FROM bundle_items bi WHERE bi.bundle_id = b.id) AS item_count
           FROM bundles b
           ${where}
           ORDER BY b.created_at DESC
           LIMIT $${pi++} OFFSET $${pi++}`,
          [...params, pageSize, offset]
        );

        // Calculate pricing for each bundle
        const bundles = [];
        for (const row of result.rows) {
          const pricing = await calculateBundlePrice(row.id);
          bundles.push({ ...row, pricing });
        }

        res.json({
          success: true,
          bundles,
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
  // GET /api/bundles/:id
  // ==========================================================================
  router.get(
    '/:id',
    authenticate,
    async (req, res, next) => {
      try {
        const { id } = req.params;

        const result = await pool.query(
          `SELECT b.*, u.first_name || ' ' || u.last_name AS created_by_name
           FROM bundles b
           LEFT JOIN users u ON b.created_by = u.id
           WHERE b.id = $1`,
          [id]
        );
        if (result.rows.length === 0) {
          throw ApiError.notFound('Bundle');
        }

        const pricing = await calculateBundlePrice(parseInt(id, 10));

        res.json({
          success: true,
          bundle: { ...result.rows[0], pricing },
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // ==========================================================================
  // PUT /api/bundles/:id
  // ==========================================================================
  router.put(
    '/:id',
    authenticate,
    checkPermission('hub.products.edit'),
    async (req, res, next) => {
      try {
        const { id } = req.params;

        const current = await pool.query('SELECT * FROM bundles WHERE id = $1', [id]);
        if (current.rows.length === 0) {
          throw ApiError.notFound('Bundle');
        }

        const merged = { ...current.rows[0], ...req.body };
        const errors = validateBundle(merged);
        if (errors.length > 0) {
          throw ApiError.badRequest('Validation failed', errors);
        }

        // SKU uniqueness if changed
        if (req.body.sku && req.body.sku.trim().toUpperCase() !== current.rows[0].sku) {
          const dup = await pool.query('SELECT id FROM bundles WHERE sku = $1 AND id != $2', [req.body.sku.trim().toUpperCase(), id]);
          if (dup.rows.length > 0) {
            throw ApiError.conflict(`Bundle SKU '${req.body.sku}' already exists`);
          }
        }

        const {
          sku, name, description, pricing_type,
          fixed_price, discount_percentage, discount_amount,
          image_url, is_featured, is_active,
          available_from, available_to, track_component_inventory,
        } = merged;

        const result = await pool.query(
          `UPDATE bundles SET
             sku = $1, name = $2, description = $3, pricing_type = $4,
             fixed_price = $5, discount_percentage = $6, discount_amount = $7,
             image_url = $8, is_featured = $9, is_active = $10,
             available_from = $11, available_to = $12, track_component_inventory = $13,
             updated_at = NOW()
           WHERE id = $14
           RETURNING *`,
          [
            sku, name, description || null, pricing_type,
            fixed_price || null, discount_percentage || null, discount_amount || null,
            image_url || null, is_featured || false, is_active !== false,
            available_from || null, available_to || null, track_component_inventory !== false,
            id,
          ]
        );

        const pricing = await calculateBundlePrice(parseInt(id, 10));

        res.json({ success: true, bundle: { ...result.rows[0], pricing } });
      } catch (err) {
        next(err);
      }
    }
  );

  // ==========================================================================
  // DELETE /api/bundles/:id
  // ==========================================================================
  router.delete(
    '/:id',
    authenticate,
    checkPermission('hub.products.edit'),
    async (req, res, next) => {
      try {
        const { id } = req.params;
        const result = await pool.query('SELECT id FROM bundles WHERE id = $1', [id]);
        if (result.rows.length === 0) {
          throw ApiError.notFound('Bundle');
        }

        await pool.query('UPDATE bundles SET is_active = false, updated_at = NOW() WHERE id = $1', [id]);
        res.json({ success: true, message: 'Bundle deactivated' });
      } catch (err) {
        next(err);
      }
    }
  );

  // ==========================================================================
  // POST /api/bundles/:id/items
  // ==========================================================================
  router.post(
    '/:id/items',
    authenticate,
    checkPermission('hub.products.edit'),
    async (req, res, next) => {
      try {
        const { id } = req.params;

        const bundle = await pool.query('SELECT id FROM bundles WHERE id = $1', [id]);
        if (bundle.rows.length === 0) {
          throw ApiError.notFound('Bundle');
        }

        const { product_id, quantity, is_required, alternatives, sort_order } = req.body;
        if (!product_id) {
          throw ApiError.badRequest('product_id is required');
        }

        // Verify product exists
        const prod = await pool.query('SELECT id FROM products WHERE id = $1', [product_id]);
        if (prod.rows.length === 0) {
          throw ApiError.notFound('Product');
        }

        // Get max sort_order
        const maxSort = await pool.query(
          'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM bundle_items WHERE bundle_id = $1', [id]
        );

        const result = await pool.query(
          `INSERT INTO bundle_items (bundle_id, product_id, quantity, is_required, alternatives, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          [
            id, product_id, quantity || 1, is_required !== false,
            alternatives ? JSON.stringify(alternatives) : null,
            sort_order ?? maxSort.rows[0].next,
          ]
        );

        await pool.query('UPDATE bundles SET updated_at = NOW() WHERE id = $1', [id]);

        const pricing = await calculateBundlePrice(parseInt(id, 10));

        res.status(201).json({ success: true, item: result.rows[0], pricing });
      } catch (err) {
        next(err);
      }
    }
  );

  // ==========================================================================
  // DELETE /api/bundles/:id/items/:itemId
  // ==========================================================================
  router.delete(
    '/:id/items/:itemId',
    authenticate,
    checkPermission('hub.products.edit'),
    async (req, res, next) => {
      try {
        const { id, itemId } = req.params;

        const result = await pool.query(
          'DELETE FROM bundle_items WHERE id = $1 AND bundle_id = $2 RETURNING id',
          [itemId, id]
        );
        if (result.rows.length === 0) {
          throw ApiError.notFound('Bundle item');
        }

        await pool.query('UPDATE bundles SET updated_at = NOW() WHERE id = $1', [id]);

        const pricing = await calculateBundlePrice(parseInt(id, 10));

        res.json({ success: true, message: 'Item removed', pricing });
      } catch (err) {
        next(err);
      }
    }
  );

  // ==========================================================================
  // GET /api/products/:productId/bundles
  // ==========================================================================
  router.get(
    '/by-product/:productId',
    authenticate,
    async (req, res, next) => {
      try {
        const { productId } = req.params;

        const result = await pool.query(
          `SELECT DISTINCT b.*
           FROM bundles b
           JOIN bundle_items bi ON bi.bundle_id = b.id
           WHERE bi.product_id = $1
             AND b.is_active = true
             AND (b.available_from IS NULL OR b.available_from <= CURRENT_DATE)
             AND (b.available_to IS NULL OR b.available_to >= CURRENT_DATE)
           ORDER BY b.created_at DESC`,
          [productId]
        );

        const bundles = [];
        for (const row of result.rows) {
          const pricing = await calculateBundlePrice(row.id);
          bundles.push({ ...row, pricing });
        }

        res.json({ success: true, bundles });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}

module.exports = { init };
