/**
 * Coupon Code Routes
 * Generate, validate, apply, and list coupon codes for promotions.
 * @module routes/coupons
 */

const express = require('express');
const crypto = require('crypto');
const { authenticate } = require('../middleware/auth');
const { checkPermission } = require('../middleware/checkPermission');
const { ApiError } = require('../middleware/errorHandler');

function init({ pool }) {
  const router = express.Router();

  // ---------- Helpers ----------

  function generateCode(prefix, length = 6) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
    let random = '';
    const bytes = crypto.randomBytes(length);
    for (let i = 0; i < length; i++) {
      random += chars[bytes[i] % chars.length];
    }
    return prefix ? `${prefix}-${random}` : random;
  }

  /**
   * Resolve a code string to a promotion + optional promotion_codes row.
   * Checks promotions.code first, then promotion_codes.code.
   */
  async function resolveCode(code) {
    // 1. Direct promotion code match
    const promoResult = await pool.query(
      `SELECT * FROM promotions
       WHERE code = $1 AND requires_code = true`,
      [code.toUpperCase()]
    );
    if (promoResult.rows.length > 0) {
      return { promotion: promoResult.rows[0], promoCode: null };
    }

    // 2. Unique / generated code match
    const codeResult = await pool.query(
      `SELECT pc.*, p.*,
              pc.id AS code_id, pc.code AS pc_code,
              pc.is_used AS code_is_used, pc.used_at AS code_used_at,
              pc.expires_at AS code_expires_at,
              pc.assigned_to_customer_id, pc.used_by_customer_id AS code_used_by
       FROM promotion_codes pc
       JOIN promotions p ON pc.promotion_id = p.id
       WHERE pc.code = $1`,
      [code.toUpperCase()]
    );
    if (codeResult.rows.length > 0) {
      const row = codeResult.rows[0];
      // Split into promotion and promoCode objects
      const promoCode = {
        id: row.code_id,
        code: row.pc_code,
        is_used: row.code_is_used,
        used_at: row.code_used_at,
        expires_at: row.code_expires_at,
        assigned_to_customer_id: row.assigned_to_customer_id,
        used_by_customer_id: row.code_used_by,
      };
      // Re-fetch clean promotion
      const pResult = await pool.query('SELECT * FROM promotions WHERE id = $1', [row.promotion_id]);
      return { promotion: pResult.rows[0], promoCode };
    }

    return null;
  }

  /**
   * Validate a resolved promotion + code against business rules.
   * Returns { valid, error? }
   */
  function validateResolved(promotion, promoCode, customerId) {
    const now = new Date();

    if (!promotion) return { valid: false, error: 'Promotion not found' };
    if (promotion.status !== 'active') return { valid: false, error: `Promotion is ${promotion.status}` };
    if (new Date(promotion.start_date) > now) return { valid: false, error: 'Promotion has not started yet' };
    if (new Date(promotion.end_date) < now) return { valid: false, error: 'Promotion has expired' };
    if (promotion.max_uses_total && promotion.times_used >= promotion.max_uses_total) {
      return { valid: false, error: 'Promotion has reached maximum uses' };
    }

    // Unique code checks
    if (promoCode) {
      if (promoCode.is_used) return { valid: false, error: 'This code has already been used' };
      if (promoCode.expires_at && new Date(promoCode.expires_at) < now) {
        return { valid: false, error: 'This code has expired' };
      }
      if (promoCode.assigned_to_customer_id && customerId &&
          promoCode.assigned_to_customer_id !== customerId) {
        return { valid: false, error: 'This code is assigned to a different customer' };
      }
    }

    return { valid: true };
  }

  /**
   * Calculate estimated savings for a promotion against a cart.
   */
  async function estimateSavings(promotion, cartItems) {
    if (!cartItems || cartItems.length === 0) return 0;

    // Get product prices
    const productIds = cartItems.map(i => i.product_id);
    const prodResult = await pool.query(
      'SELECT id, price, category_id, brand_id FROM products WHERE id = ANY($1)',
      [productIds]
    );
    const prodMap = {};
    for (const p of prodResult.rows) prodMap[p.id] = p;

    let totalSavings = 0;

    for (const item of cartItems) {
      const product = prodMap[item.product_id];
      if (!product) continue;

      // Check if promotion applies to this product
      const applies =
        promotion.applies_to === 'all' ||
        (promotion.applies_to === 'product' && promotion.product_ids && promotion.product_ids.includes(item.product_id)) ||
        (promotion.applies_to === 'category' && promotion.category_ids && promotion.category_ids.includes(product.category_id)) ||
        (promotion.applies_to === 'brand' && promotion.brand_ids && promotion.brand_ids.includes(product.brand_id));

      if (!applies) continue;

      const priceCents = Math.round(parseFloat(product.price) * 100);
      const qty = item.quantity || 1;
      let discount = 0;

      switch (promotion.promotion_type) {
        case 'percentage_off':
          discount = Math.round(priceCents * (parseFloat(promotion.discount_percentage) / 100));
          break;
        case 'fixed_amount_off':
          discount = Math.min(promotion.discount_amount, priceCents);
          break;
        case 'fixed_price':
          discount = Math.max(0, priceCents - promotion.fixed_price);
          break;
      }

      totalSavings += discount * qty;
    }

    return totalSavings;
  }

  // ==========================================================================
  // POST /api/hub-promotions/:id/generate-codes
  // ==========================================================================
  router.post(
    '/hub-promotions/:id/generate-codes',
    authenticate,
    checkPermission('hub.products.edit'),
    async (req, res, next) => {
      try {
        const { id } = req.params;
        const { quantity = 10, prefix = '', expires_at = null } = req.body;
        const count = Math.min(Math.max(1, parseInt(quantity, 10) || 10), 5000);

        // Verify promotion exists
        const promoResult = await pool.query('SELECT id, name, code_type FROM promotions WHERE id = $1', [id]);
        if (promoResult.rows.length === 0) {
          throw ApiError.notFound('Promotion');
        }

        // Mark promotion as requiring code with unique type if not already set
        await pool.query(
          `UPDATE promotions SET requires_code = true, code_type = COALESCE(code_type, 'unique') WHERE id = $1`,
          [id]
        );

        const codes = [];
        const maxAttempts = count * 3;
        let attempts = 0;

        while (codes.length < count && attempts < maxAttempts) {
          attempts++;
          const code = generateCode(prefix.toUpperCase(), 6);
          try {
            await pool.query(
              `INSERT INTO promotion_codes (promotion_id, code, expires_at)
               VALUES ($1, $2, $3)`,
              [id, code, expires_at || null]
            );
            codes.push(code);
          } catch (e) {
            // Unique violation — retry
            if (e.code === '23505') continue;
            throw e;
          }
        }

        res.status(201).json({
          success: true,
          generated: codes.length,
          sample_codes: codes.slice(0, 10),
          all_codes: codes.length <= 50 ? codes : undefined,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // ==========================================================================
  // GET /api/hub-promotions/:id/codes
  // ==========================================================================
  router.get(
    '/hub-promotions/:id/codes',
    authenticate,
    checkPermission('hub.products.edit'),
    async (req, res, next) => {
      try {
        const { id } = req.params;
        const { used, page = 1, limit = 50 } = req.query;
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const pageSize = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
        const offset = (pageNum - 1) * pageSize;

        const conditions = ['pc.promotion_id = $1'];
        const params = [id];
        let pi = 2;

        if (used === 'true') {
          conditions.push('pc.is_used = true');
        } else if (used === 'false') {
          conditions.push('pc.is_used = false');
        }

        const where = conditions.join(' AND ');

        const countResult = await pool.query(
          `SELECT COUNT(*)::int FROM promotion_codes pc WHERE ${where}`, params
        );

        const result = await pool.query(
          `SELECT pc.*,
                  c1.name AS assigned_to_name,
                  c2.name AS used_by_name
           FROM promotion_codes pc
           LEFT JOIN customers c1 ON pc.assigned_to_customer_id = c1.id
           LEFT JOIN customers c2 ON pc.used_by_customer_id = c2.id
           WHERE ${where}
           ORDER BY pc.created_at DESC
           LIMIT $${pi++} OFFSET $${pi++}`,
          [...params, pageSize, offset]
        );

        // Summary stats
        const statsResult = await pool.query(
          `SELECT
             COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE is_used)::int AS used,
             COUNT(*) FILTER (WHERE NOT is_used)::int AS available,
             COUNT(*) FILTER (WHERE expires_at IS NOT NULL AND expires_at < NOW() AND NOT is_used)::int AS expired
           FROM promotion_codes WHERE promotion_id = $1`,
          [id]
        );

        res.json({
          success: true,
          codes: result.rows,
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
  // POST /api/coupons/validate
  // ==========================================================================
  router.post(
    '/coupons/validate',
    authenticate,
    async (req, res, next) => {
      try {
        const { code, customer_id, cart_items } = req.body;
        if (!code || !code.trim()) {
          throw ApiError.badRequest('Code is required');
        }

        const resolved = await resolveCode(code.trim());
        if (!resolved) {
          return res.json({ success: true, valid: false, error: 'Invalid coupon code' });
        }

        const { promotion, promoCode } = resolved;
        const validation = validateResolved(promotion, promoCode, customer_id ? parseInt(customer_id, 10) : null);
        if (!validation.valid) {
          return res.json({ success: true, valid: false, error: validation.error });
        }

        // Per-customer check for non-unique codes
        if (!promoCode && promotion.max_uses_per_customer && customer_id) {
          const usageResult = await pool.query(
            'SELECT COUNT(*)::int AS count FROM promotion_usage WHERE promotion_id = $1 AND customer_id = $2',
            [promotion.id, customer_id]
          );
          if (usageResult.rows[0].count >= promotion.max_uses_per_customer) {
            return res.json({ success: true, valid: false, error: 'You have already used this coupon the maximum number of times' });
          }
        }

        const estimatedSavings = await estimateSavings(promotion, cart_items || []);

        res.json({
          success: true,
          valid: true,
          promotion_id: promotion.id,
          promotion_name: promotion.name,
          discount_preview: {
            type: promotion.promotion_type,
            value: promotion.promotion_type === 'percentage_off'
              ? parseFloat(promotion.discount_percentage)
              : promotion.promotion_type === 'fixed_amount_off'
                ? promotion.discount_amount
                : promotion.fixed_price,
            estimated_savings: estimatedSavings,
          },
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // ==========================================================================
  // POST /api/coupons/apply
  // ==========================================================================
  router.post(
    '/coupons/apply',
    authenticate,
    async (req, res, next) => {
      const client = await pool.connect();
      try {
        const { code, order_id, customer_id } = req.body;
        if (!code || !order_id) {
          throw ApiError.badRequest('code and order_id are required');
        }

        await client.query('BEGIN');

        const resolved = await resolveCode(code.trim());
        if (!resolved) {
          throw ApiError.badRequest('Invalid coupon code');
        }

        const { promotion, promoCode } = resolved;
        const custId = customer_id ? parseInt(customer_id, 10) : null;
        const validation = validateResolved(promotion, promoCode, custId);
        if (!validation.valid) {
          throw ApiError.badRequest(validation.error);
        }

        // Get order to calculate actual discount
        const orderResult = await client.query(
          'SELECT id, total_amount FROM orders WHERE id = $1',
          [order_id]
        );
        if (orderResult.rows.length === 0) {
          // Try transactions table
          const txResult = await client.query(
            'SELECT id, total AS total_amount FROM transactions WHERE id = $1',
            [order_id]
          );
          if (txResult.rows.length === 0) {
            throw ApiError.notFound('Order');
          }
        }

        const order = orderResult.rows[0] || {};
        const orderTotal = order.total_amount ? Math.round(parseFloat(order.total_amount) * 100) : 0;

        // Calculate discount
        let discountApplied = 0;
        switch (promotion.promotion_type) {
          case 'percentage_off':
            discountApplied = Math.round(orderTotal * (parseFloat(promotion.discount_percentage) / 100));
            break;
          case 'fixed_amount_off':
            discountApplied = Math.min(promotion.discount_amount, orderTotal);
            break;
          case 'fixed_price':
            discountApplied = Math.max(0, orderTotal - promotion.fixed_price);
            break;
        }

        // Mark unique code as used
        if (promoCode) {
          await client.query(
            `UPDATE promotion_codes
             SET is_used = true, used_at = NOW(), used_by_customer_id = $1, used_on_order_id = $2
             WHERE id = $3`,
            [custId, order_id, promoCode.id]
          );
        }

        // Record usage
        await client.query(
          `INSERT INTO promotion_usage (promotion_id, order_id, customer_id, discount_applied, created_at)
           VALUES ($1, $2, $3, $4, NOW())`,
          [promotion.id, order_id, custId, discountApplied]
        );

        // Increment times_used
        await client.query(
          'UPDATE promotions SET times_used = COALESCE(times_used, 0) + 1 WHERE id = $1',
          [promotion.id]
        );

        await client.query('COMMIT');

        res.json({
          success: true,
          promotion_id: promotion.id,
          promotion_name: promotion.name,
          discount_applied: discountApplied,
          code_type: promoCode ? 'unique' : (promotion.code_type || 'single'),
        });
      } catch (err) {
        await client.query('ROLLBACK');
        next(err);
      } finally {
        client.release();
      }
    }
  );

  return router;
}

module.exports = { init };
