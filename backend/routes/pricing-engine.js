/**
 * Pricing Calculation Engine
 * Resolves promotional pricing for products based on active promotions.
 * @module routes/pricing-engine
 */

const express = require('express');
const { ApiError } = require('../middleware/errorHandler');
const { authenticate } = require('../middleware/auth');

function init({ pool }) {
  const router = express.Router();

  // ---------- Core engine ----------

  async function calculatePromotionalPrice(productId, quantity = 1, customerId = null, cartTotal = 0) {
    // Get product
    const prodResult = await pool.query(
      'SELECT id, name, price, cost, category_id, brand_id FROM products WHERE id = $1',
      [productId]
    );
    if (prodResult.rows.length === 0) {
      return { error: `Product ${productId} not found` };
    }
    const product = prodResult.rows[0];
    const retailPrice = Math.round(parseFloat(product.price) * 100); // dollars → cents

    // Get all applicable active promotions
    const promoResult = await pool.query(
      `SELECT * FROM promotions
       WHERE status = 'active'
         AND start_date <= NOW()
         AND end_date >= NOW()
         AND (max_uses_total IS NULL OR times_used < max_uses_total)
         AND (
           applies_to = 'all'
           OR (applies_to = 'product'  AND $1 = ANY(product_ids))
           OR (applies_to = 'category' AND $2 = ANY(category_ids))
           OR (applies_to = 'brand'    AND $3 = ANY(brand_ids))
         )
       ORDER BY priority DESC, created_at ASC`,
      [productId, product.category_id || 0, product.brand_id || 0]
    );

    let finalPrice = retailPrice;
    const appliedPromotions = [];
    let totalDiscount = 0;

    for (const promo of promoResult.rows) {
      // Condition checks
      if (promo.min_quantity && quantity < promo.min_quantity) continue;
      if (promo.min_purchase_amount && cartTotal < promo.min_purchase_amount) continue;

      // Per-customer limit
      if (promo.max_uses_per_customer && customerId) {
        const usageResult = await pool.query(
          'SELECT COUNT(*)::int AS count FROM promotion_usage WHERE promotion_id = $1 AND customer_id = $2',
          [promo.id, customerId]
        );
        if (usageResult.rows.length > 0 && usageResult.rows[0].count >= promo.max_uses_per_customer) continue;
      }

      // Calculate discount (all in cents)
      let discount = 0;
      switch (promo.promotion_type) {
        case 'percentage_off': {
          const pct = parseFloat(promo.discount_percentage);
          discount = Math.round(finalPrice * (pct / 100));
          break;
        }
        case 'fixed_amount_off':
          discount = Math.min(promo.discount_amount, finalPrice);
          break;
        case 'fixed_price':
          discount = Math.max(0, finalPrice - promo.fixed_price);
          break;
      }

      if (discount > 0) {
        finalPrice -= discount;
        totalDiscount += discount;
        appliedPromotions.push({
          promotion_id: promo.id,
          name: promo.name,
          code: promo.code || null,
          type: promo.promotion_type,
          discount,
        });

        // Stop after first if not stackable
        if (!promo.is_stackable) break;
      }
    }

    return {
      product_id: productId,
      product_name: product.name,
      original_price: retailPrice,
      final_price: finalPrice,
      total_discount: totalDiscount,
      applied_promotions: appliedPromotions,
    };
  }

  // ==========================================================================
  // POST /api/pricing/calculate
  // ==========================================================================
  router.post(
    '/calculate',
    authenticate,
    async (req, res, next) => {
      try {
        const { items, customer_id } = req.body;

        if (!items || !Array.isArray(items) || items.length === 0) {
          throw ApiError.badRequest('items array is required');
        }
        if (items.length > 200) {
          throw ApiError.badRequest('Maximum 200 items per request');
        }

        // First pass: sum original prices for cart total (needed for min_purchase_amount checks)
        const productIds = items.map(i => i.product_id);
        const priceResult = await pool.query(
          'SELECT id, price FROM products WHERE id = ANY($1)',
          [productIds]
        );
        const priceMap = {};
        for (const row of priceResult.rows) {
          priceMap[row.id] = Math.round(parseFloat(row.price) * 100);
        }
        let cartTotal = 0;
        for (const item of items) {
          const unitPrice = priceMap[item.product_id] || 0;
          cartTotal += unitPrice * (item.quantity || 1);
        }

        // Second pass: calculate promotional pricing per item
        const results = [];
        let subtotal = 0;
        let totalDiscount = 0;
        let finalSubtotal = 0;

        for (const item of items) {
          const qty = item.quantity || 1;
          const calc = await calculatePromotionalPrice(
            item.product_id, qty, customer_id || null, cartTotal
          );

          if (calc.error) {
            results.push({
              product_id: item.product_id,
              quantity: qty,
              error: calc.error,
            });
            continue;
          }

          const lineOriginal = calc.original_price * qty;
          const lineFinal = calc.final_price * qty;
          const lineDiscount = calc.total_discount * qty;

          subtotal += lineOriginal;
          totalDiscount += lineDiscount;
          finalSubtotal += lineFinal;

          results.push({
            product_id: item.product_id,
            product_name: calc.product_name,
            quantity: qty,
            original_price: calc.original_price,
            unit_price: calc.final_price,
            line_total: lineFinal,
            line_discount: lineDiscount,
            applied_promotions: calc.applied_promotions,
          });
        }

        res.json({
          success: true,
          items: results,
          subtotal,
          total_discount: totalDiscount,
          final_subtotal: finalSubtotal,
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // ==========================================================================
  // GET /api/pricing/check/:productId
  // Quick single-product check
  // ==========================================================================
  router.get(
    '/check/:productId',
    authenticate,
    async (req, res, next) => {
      try {
        const { productId } = req.params;
        const quantity = parseInt(req.query.quantity, 10) || 1;
        const customerId = req.query.customer_id || null;

        const result = await calculatePromotionalPrice(
          parseInt(productId, 10), quantity, customerId ? parseInt(customerId, 10) : null, 0
        );

        if (result.error) {
          throw ApiError.notFound(result.error);
        }

        res.json({ success: true, pricing: result });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}

module.exports = { init };
