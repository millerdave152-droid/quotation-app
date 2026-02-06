/**
 * Hub Promotions Routes
 * CRUD, scheduling, and lifecycle management for promotions/sale pricing.
 * @module routes/hub-promotions
 */

const express = require('express');
const { authenticate } = require('../middleware/auth');
const { checkPermission } = require('../middleware/checkPermission');

const VALID_TYPES = ['percentage_off', 'fixed_amount_off', 'fixed_price', 'bogo', 'bundle'];
const VALID_SCOPES = ['all', 'category', 'brand', 'product', 'collection'];
const VALID_STATUSES = ['draft', 'scheduled', 'active', 'paused', 'ended', 'cancelled'];

function init({ pool }) {
  const router = express.Router();

  // ---------- Helpers ----------

  function determineStatus(startDate, endDate) {
    const now = new Date();
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (end < now) return 'ended';
    if (start <= now) return 'active';
    return 'scheduled';
  }

  function validatePromotion(body) {
    const errors = [];
    if (!body.name || !body.name.trim()) errors.push('name is required');
    if (!body.promotion_type || !VALID_TYPES.includes(body.promotion_type)) {
      errors.push(`promotion_type must be one of: ${VALID_TYPES.join(', ')}`);
    }
    if (!body.applies_to || !VALID_SCOPES.includes(body.applies_to)) {
      errors.push(`applies_to must be one of: ${VALID_SCOPES.join(', ')}`);
    }
    if (!body.start_date) errors.push('start_date is required');
    if (!body.end_date) errors.push('end_date is required');
    if (body.start_date && body.end_date && new Date(body.end_date) <= new Date(body.start_date)) {
      errors.push('end_date must be after start_date');
    }

    // Validate discount values based on type
    if (body.promotion_type === 'percentage_off') {
      const pct = parseFloat(body.discount_percentage);
      if (isNaN(pct) || pct <= 0 || pct > 100) errors.push('discount_percentage must be between 0 and 100');
    } else if (body.promotion_type === 'fixed_amount_off') {
      const amt = parseInt(body.discount_amount, 10);
      if (isNaN(amt) || amt <= 0) errors.push('discount_amount must be a positive integer (cents)');
    } else if (body.promotion_type === 'fixed_price') {
      const fp = parseInt(body.fixed_price, 10);
      if (isNaN(fp) || fp <= 0) errors.push('fixed_price must be a positive integer (cents)');
    }

    // Scope validation
    if (body.applies_to === 'product' && (!body.product_ids || !Array.isArray(body.product_ids) || body.product_ids.length === 0)) {
      errors.push('product_ids required when applies_to is "product"');
    }
    if (body.applies_to === 'category' && (!body.category_ids || !Array.isArray(body.category_ids) || body.category_ids.length === 0)) {
      errors.push('category_ids required when applies_to is "category"');
    }
    if (body.applies_to === 'brand' && (!body.brand_ids || !Array.isArray(body.brand_ids) || body.brand_ids.length === 0)) {
      errors.push('brand_ids required when applies_to is "brand"');
    }

    return errors;
  }

  // ==========================================================================
  // POST /api/promotions
  // ==========================================================================
  router.post(
    '/',
    authenticate,
    checkPermission('hub.products.edit'),
    async (req, res, next) => {
      try {
        const errors = validatePromotion(req.body);
        if (errors.length > 0) {
          return res.status(400).json({ success: false, message: 'Validation failed', errors });
        }

        const {
          name, code, description, promotion_type,
          discount_percentage, discount_amount, fixed_price,
          applies_to, category_ids, brand_ids, product_ids, collection_id,
          min_quantity, min_purchase_amount, max_uses_total, max_uses_per_customer,
          is_stackable, priority, start_date, end_date,
        } = req.body;

        // Check code uniqueness if provided
        if (code) {
          const existing = await pool.query('SELECT id FROM promotions WHERE code = $1', [code]);
          if (existing.rows.length > 0) {
            return res.status(409).json({ success: false, message: `Promotion code '${code}' already exists` });
          }
        }

        const status = determineStatus(start_date, end_date);

        const result = await pool.query(
          `INSERT INTO promotions (
             name, code, description, promotion_type,
             discount_percentage, discount_amount, fixed_price,
             applies_to, category_ids, brand_ids, product_ids, collection_id,
             min_quantity, min_purchase_amount, max_uses_total, max_uses_per_customer,
             is_stackable, priority, start_date, end_date, status, created_by
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
             $13, $14, $15, $16, $17, $18, $19, $20, $21, $22
           ) RETURNING *`,
          [
            name.trim(), code || null, description || null, promotion_type,
            discount_percentage || null, discount_amount || null, fixed_price || null,
            applies_to, category_ids || null, brand_ids || null, product_ids || null, collection_id || null,
            min_quantity || 1, min_purchase_amount || null, max_uses_total || null, max_uses_per_customer || null,
            is_stackable || false, priority || 0, start_date, end_date, status, req.user.id,
          ]
        );

        res.status(201).json({ success: true, promotion: result.rows[0] });
      } catch (err) {
        next(err);
      }
    }
  );

  // ==========================================================================
  // GET /api/promotions
  // ==========================================================================
  router.get(
    '/',
    authenticate,
    checkPermission('hub.products.edit'),
    async (req, res, next) => {
      try {
        const { status, applies_to, active_on_date, search, page = 1, limit = 25 } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
        const offset = (pageNum - 1) * pageSize;

        const conditions = [];
        const params = [];
        let pi = 1;

        if (status) {
          conditions.push(`p.status = $${pi++}`);
          params.push(status);
        }
        if (applies_to) {
          conditions.push(`p.applies_to = $${pi++}`);
          params.push(applies_to);
        }
        if (active_on_date) {
          conditions.push(`p.start_date <= $${pi}::timestamp AND p.end_date >= $${pi}::timestamp`);
          params.push(active_on_date);
          pi++;
        }
        if (search) {
          conditions.push(`(p.name ILIKE $${pi} OR p.code ILIKE $${pi})`);
          params.push(`%${search}%`);
          pi++;
        }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const countResult = await pool.query(
          `SELECT COUNT(*)::int FROM promotions p ${where}`, params
        );

        const result = await pool.query(
          `SELECT p.*,
                  u.first_name || ' ' || u.last_name AS created_by_name,
                  (SELECT COUNT(*)::int FROM promotion_usage pu WHERE pu.promotion_id = p.id) AS usage_count
           FROM promotions p
           LEFT JOIN users u ON p.created_by = u.id
           ${where}
           ORDER BY p.created_at DESC
           LIMIT $${pi++} OFFSET $${pi++}`,
          [...params, pageSize, offset]
        );

        res.json({
          success: true,
          promotions: result.rows,
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
  // GET /api/promotions/active
  // ==========================================================================
  router.get(
    '/active',
    authenticate,
    async (req, res, next) => {
      try {
        const result = await pool.query(
          `SELECT p.*
           FROM promotions p
           WHERE p.status = 'active'
             AND p.start_date <= NOW()
             AND p.end_date >= NOW()
             AND (p.max_uses_total IS NULL OR p.times_used < p.max_uses_total)
           ORDER BY p.priority DESC, p.start_date`
        );

        res.json({ success: true, promotions: result.rows });
      } catch (err) {
        next(err);
      }
    }
  );

  // ==========================================================================
  // GET /api/promotions/:id
  // ==========================================================================
  router.get(
    '/:id',
    authenticate,
    checkPermission('hub.products.edit'),
    async (req, res, next) => {
      try {
        const { id } = req.params;

        const result = await pool.query(
          `SELECT p.*,
                  u.first_name || ' ' || u.last_name AS created_by_name
           FROM promotions p
           LEFT JOIN users u ON p.created_by = u.id
           WHERE p.id = $1`,
          [id]
        );
        if (result.rows.length === 0) {
          return res.status(404).json({ success: false, message: 'Promotion not found' });
        }

        const promotion = result.rows[0];

        // Usage stats
        const usageResult = await pool.query(
          `SELECT
             COUNT(*)::int AS total_uses,
             COUNT(DISTINCT customer_id)::int AS unique_customers,
             COALESCE(SUM(discount_applied), 0)::int AS total_discount_given
           FROM promotion_usage
           WHERE promotion_id = $1`,
          [id]
        );

        // Recent usage
        const recentResult = await pool.query(
          `SELECT pu.*, c.name AS customer_name
           FROM promotion_usage pu
           LEFT JOIN customers c ON pu.customer_id = c.id
           WHERE pu.promotion_id = $1
           ORDER BY pu.created_at DESC
           LIMIT 10`,
          [id]
        );

        res.json({
          success: true,
          promotion: {
            ...promotion,
            usage_stats: usageResult.rows[0],
            recent_usage: recentResult.rows,
          },
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // ==========================================================================
  // PUT /api/promotions/:id
  // ==========================================================================
  router.put(
    '/:id',
    authenticate,
    checkPermission('hub.products.edit'),
    async (req, res, next) => {
      try {
        const { id } = req.params;

        // Fetch current
        const current = await pool.query('SELECT * FROM promotions WHERE id = $1', [id]);
        if (current.rows.length === 0) {
          return res.status(404).json({ success: false, message: 'Promotion not found' });
        }
        const promo = current.rows[0];

        // Restrict edits on completed/cancelled
        if (['ended', 'cancelled'].includes(promo.status)) {
          return res.status(400).json({
            success: false,
            message: `Cannot edit a promotion with status '${promo.status}'`,
          });
        }

        // Merge with existing values for validation
        const merged = { ...promo, ...req.body };
        const errors = validatePromotion(merged);
        if (errors.length > 0) {
          return res.status(400).json({ success: false, message: 'Validation failed', errors });
        }

        // Check code uniqueness if changed
        if (req.body.code && req.body.code !== promo.code) {
          const dup = await pool.query('SELECT id FROM promotions WHERE code = $1 AND id != $2', [req.body.code, id]);
          if (dup.rows.length > 0) {
            return res.status(409).json({ success: false, message: `Promotion code '${req.body.code}' already exists` });
          }
        }

        const {
          name, code, description, promotion_type,
          discount_percentage, discount_amount, fixed_price,
          applies_to, category_ids, brand_ids, product_ids, collection_id,
          min_quantity, min_purchase_amount, max_uses_total, max_uses_per_customer,
          is_stackable, priority, start_date, end_date,
        } = merged;

        // Recalculate status if dates changed
        const newStatus = (req.body.start_date || req.body.end_date)
          ? determineStatus(start_date, end_date)
          : promo.status;

        const result = await pool.query(
          `UPDATE promotions SET
             name = $1, code = $2, description = $3, promotion_type = $4,
             discount_percentage = $5, discount_amount = $6, fixed_price = $7,
             applies_to = $8, category_ids = $9, brand_ids = $10, product_ids = $11, collection_id = $12,
             min_quantity = $13, min_purchase_amount = $14, max_uses_total = $15, max_uses_per_customer = $16,
             is_stackable = $17, priority = $18, start_date = $19, end_date = $20,
             status = $21, updated_at = NOW()
           WHERE id = $22
           RETURNING *`,
          [
            name, code || null, description || null, promotion_type,
            discount_percentage || null, discount_amount || null, fixed_price || null,
            applies_to, category_ids || null, brand_ids || null, product_ids || null, collection_id || null,
            min_quantity || 1, min_purchase_amount || null, max_uses_total || null, max_uses_per_customer || null,
            is_stackable || false, priority || 0, start_date, end_date,
            newStatus, id,
          ]
        );

        res.json({ success: true, promotion: result.rows[0] });
      } catch (err) {
        next(err);
      }
    }
  );

  // ==========================================================================
  // DELETE /api/promotions/:id
  // ==========================================================================
  router.delete(
    '/:id',
    authenticate,
    checkPermission('hub.products.edit'),
    async (req, res, next) => {
      try {
        const { id } = req.params;

        const result = await pool.query('SELECT id, status FROM promotions WHERE id = $1', [id]);
        if (result.rows.length === 0) {
          return res.status(404).json({ success: false, message: 'Promotion not found' });
        }

        await pool.query(
          "UPDATE promotions SET status = 'cancelled', updated_at = NOW() WHERE id = $1",
          [id]
        );

        res.json({ success: true, message: 'Promotion cancelled' });
      } catch (err) {
        next(err);
      }
    }
  );

  // ==========================================================================
  // POST /api/promotions/:id/pause
  // ==========================================================================
  router.post(
    '/:id/pause',
    authenticate,
    checkPermission('hub.products.edit'),
    async (req, res, next) => {
      try {
        const { id } = req.params;

        const result = await pool.query('SELECT id, status FROM promotions WHERE id = $1', [id]);
        if (result.rows.length === 0) {
          return res.status(404).json({ success: false, message: 'Promotion not found' });
        }
        if (result.rows[0].status !== 'active') {
          return res.status(400).json({
            success: false,
            message: `Can only pause active promotions. Current status: '${result.rows[0].status}'`,
          });
        }

        const updated = await pool.query(
          "UPDATE promotions SET status = 'paused', updated_at = NOW() WHERE id = $1 RETURNING *",
          [id]
        );

        res.json({ success: true, promotion: updated.rows[0] });
      } catch (err) {
        next(err);
      }
    }
  );

  // ==========================================================================
  // POST /api/promotions/:id/resume
  // ==========================================================================
  router.post(
    '/:id/resume',
    authenticate,
    checkPermission('hub.products.edit'),
    async (req, res, next) => {
      try {
        const { id } = req.params;

        const result = await pool.query('SELECT id, status, start_date, end_date FROM promotions WHERE id = $1', [id]);
        if (result.rows.length === 0) {
          return res.status(404).json({ success: false, message: 'Promotion not found' });
        }
        if (result.rows[0].status !== 'paused') {
          return res.status(400).json({
            success: false,
            message: `Can only resume paused promotions. Current status: '${result.rows[0].status}'`,
          });
        }

        // Check if end_date has passed while paused
        const promo = result.rows[0];
        if (new Date(promo.end_date) < new Date()) {
          await pool.query("UPDATE promotions SET status = 'ended', updated_at = NOW() WHERE id = $1", [id]);
          return res.status(400).json({
            success: false,
            message: 'Cannot resume — promotion end date has passed. Update end_date first.',
          });
        }

        const updated = await pool.query(
          "UPDATE promotions SET status = 'active', updated_at = NOW() WHERE id = $1 RETURNING *",
          [id]
        );

        res.json({ success: true, promotion: updated.rows[0] });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}

module.exports = { init };
