/**
 * Advanced Pricing Routes
 *
 * Endpoints for:
 * - Volume discount rules management
 * - Promotions management
 * - Price calculation
 */

const express = require('express');
const router = express.Router();
const advancedPricingService = require('../services/AdvancedPricingService');

// ==================== VOLUME DISCOUNT RULES ====================

/**
 * GET /api/pricing/volume-rules
 * Get all volume discount rules
 */
router.get('/volume-rules', async (req, res) => {
  try {
    const { isActive, scopeType, includeExpired } = req.query;

    const rules = await advancedPricingService.getVolumeDiscountRules({
      isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
      scopeType,
      includeExpired: includeExpired === 'true'
    });

    res.json(rules);
  } catch (error) {
    console.error('Error fetching volume discount rules:', error);
    res.status(500).json({ error: 'Failed to fetch volume discount rules' });
  }
});

/**
 * GET /api/pricing/volume-rules/:id
 * Get a single volume discount rule
 */
router.get('/volume-rules/:id', async (req, res) => {
  try {
    const rule = await advancedPricingService.getVolumeDiscountRuleById(req.params.id);

    if (!rule) {
      return res.status(404).json({ error: 'Volume discount rule not found' });
    }

    res.json(rule);
  } catch (error) {
    console.error('Error fetching volume discount rule:', error);
    res.status(500).json({ error: 'Failed to fetch volume discount rule' });
  }
});

/**
 * POST /api/pricing/volume-rules
 * Create a new volume discount rule
 */
router.post('/volume-rules', async (req, res) => {
  try {
    const {
      name,
      description,
      scope_type,
      scope_product_id,
      scope_category,
      scope_manufacturer,
      discount_type,
      is_active,
      valid_from,
      valid_until,
      priority,
      can_stack,
      stacking_group,
      tiers
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Rule name is required' });
    }

    if (!tiers || tiers.length === 0) {
      return res.status(400).json({ error: 'At least one discount tier is required' });
    }

    // Validate tiers
    for (const tier of tiers) {
      if (tier.min_quantity === undefined || tier.discount_value === undefined) {
        return res.status(400).json({ error: 'Each tier must have min_quantity and discount_value' });
      }
    }

    const rule = await advancedPricingService.createVolumeDiscountRule({
      name,
      description,
      scope_type,
      scope_product_id,
      scope_category,
      scope_manufacturer,
      discount_type,
      is_active,
      valid_from,
      valid_until,
      priority,
      can_stack,
      stacking_group,
      tiers
    });

    res.status(201).json(rule);
  } catch (error) {
    console.error('Error creating volume discount rule:', error);
    res.status(500).json({ error: 'Failed to create volume discount rule' });
  }
});

/**
 * PUT /api/pricing/volume-rules/:id
 * Update a volume discount rule
 */
router.put('/volume-rules/:id', async (req, res) => {
  try {
    const rule = await advancedPricingService.updateVolumeDiscountRule(req.params.id, req.body);

    if (!rule) {
      return res.status(404).json({ error: 'Volume discount rule not found' });
    }

    res.json(rule);
  } catch (error) {
    console.error('Error updating volume discount rule:', error);
    res.status(500).json({ error: 'Failed to update volume discount rule' });
  }
});

/**
 * DELETE /api/pricing/volume-rules/:id
 * Delete a volume discount rule
 */
router.delete('/volume-rules/:id', async (req, res) => {
  try {
    const deleted = await advancedPricingService.deleteVolumeDiscountRule(req.params.id);

    if (!deleted) {
      return res.status(404).json({ error: 'Volume discount rule not found' });
    }

    res.json({ message: 'Volume discount rule deleted successfully' });
  } catch (error) {
    console.error('Error deleting volume discount rule:', error);
    res.status(500).json({ error: 'Failed to delete volume discount rule' });
  }
});

/**
 * GET /api/pricing/volume-rules/applicable/:productId
 * Get applicable volume discount rules for a product
 */
router.get('/volume-rules/applicable/:productId', async (req, res) => {
  try {
    const { category, manufacturer } = req.query;

    const rules = await advancedPricingService.getApplicableVolumeRules(
      req.params.productId,
      category,
      manufacturer
    );

    res.json(rules);
  } catch (error) {
    console.error('Error fetching applicable volume rules:', error);
    res.status(500).json({ error: 'Failed to fetch applicable volume rules' });
  }
});

// ==================== PROMOTIONS ====================

/**
 * GET /api/pricing/promotions
 * Get all promotions
 */
router.get('/promotions', async (req, res) => {
  try {
    const { isActive, promoType, includeExpired } = req.query;

    const promotions = await advancedPricingService.getPromotions({
      isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
      promoType,
      includeExpired: includeExpired === 'true'
    });

    res.json(promotions);
  } catch (error) {
    console.error('Error fetching promotions:', error);
    res.status(500).json({ error: 'Failed to fetch promotions' });
  }
});

/**
 * GET /api/pricing/promotions/active
 * Get currently active auto-apply promotions
 */
router.get('/promotions/active', async (req, res) => {
  try {
    const { productIds, customerId } = req.query;

    const productIdArray = productIds ? productIds.split(',').map(id => parseInt(id)) : [];
    const promotions = await advancedPricingService.getActivePromotions(productIdArray, customerId);

    res.json(promotions);
  } catch (error) {
    console.error('Error fetching active promotions:', error);
    res.status(500).json({ error: 'Failed to fetch active promotions' });
  }
});

/**
 * POST /api/pricing/promotions
 * Create a new promotion
 */
router.post('/promotions', async (req, res) => {
  try {
    const {
      promo_code,
      promo_name,
      description,
      promo_type,
      scope_type,
      scope_value,
      discount_type,
      discount_value,
      start_date,
      end_date,
      auto_activate,
      max_uses_total,
      max_uses_per_customer,
      min_purchase_cents,
      max_discount_cents,
      min_quantity,
      can_stack,
      stacking_group
    } = req.body;

    if (!promo_name) {
      return res.status(400).json({ error: 'Promotion name is required' });
    }

    if (!discount_type || discount_value === undefined) {
      return res.status(400).json({ error: 'Discount type and value are required' });
    }

    if (!start_date || !end_date) {
      return res.status(400).json({ error: 'Start and end dates are required' });
    }

    const promotion = await advancedPricingService.createPromotion({
      promo_code,
      promo_name,
      description,
      promo_type,
      scope_type,
      scope_value,
      discount_type,
      discount_value,
      start_date,
      end_date,
      auto_activate,
      max_uses_total,
      max_uses_per_customer,
      min_purchase_cents,
      max_discount_cents,
      min_quantity,
      can_stack,
      stacking_group
    });

    res.status(201).json(promotion);
  } catch (error) {
    console.error('Error creating promotion:', error);
    if (error.code === '23505') { // Unique violation
      return res.status(400).json({ error: 'A promotion with this code already exists' });
    }
    res.status(500).json({ error: 'Failed to create promotion' });
  }
});

/**
 * PUT /api/pricing/promotions/:id
 * Update a promotion
 */
router.put('/promotions/:id', async (req, res) => {
  try {
    const promotion = await advancedPricingService.updatePromotion(req.params.id, req.body);

    if (!promotion) {
      return res.status(404).json({ error: 'Promotion not found' });
    }

    res.json(promotion);
  } catch (error) {
    console.error('Error updating promotion:', error);
    res.status(500).json({ error: 'Failed to update promotion' });
  }
});

/**
 * DELETE /api/pricing/promotions/:id
 * Delete a promotion
 */
router.delete('/promotions/:id', async (req, res) => {
  try {
    const deleted = await advancedPricingService.deletePromotion(req.params.id);

    if (!deleted) {
      return res.status(404).json({ error: 'Promotion not found' });
    }

    res.json({ message: 'Promotion deleted successfully' });
  } catch (error) {
    console.error('Error deleting promotion:', error);
    res.status(500).json({ error: 'Failed to delete promotion' });
  }
});

/**
 * POST /api/pricing/promotions/validate-code
 * Validate a promo code
 */
router.post('/promotions/validate-code', async (req, res) => {
  try {
    const { code, customerId, cartTotal, cartItems } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Promo code is required' });
    }

    const validation = await advancedPricingService.validatePromoCode(
      code,
      customerId,
      cartTotal || 0,
      cartItems || []
    );

    res.json(validation);
  } catch (error) {
    console.error('Error validating promo code:', error);
    res.status(500).json({ error: 'Failed to validate promo code' });
  }
});

/**
 * GET /api/pricing/promotions/:id/usage
 * Get promotion usage history
 */
router.get('/promotions/:id/usage', async (req, res) => {
  try {
    const usage = await advancedPricingService.getPromotionUsage(req.params.id);
    res.json(usage);
  } catch (error) {
    console.error('Error fetching promotion usage:', error);
    res.status(500).json({ error: 'Failed to fetch promotion usage' });
  }
});

// ==================== PRICE CALCULATION ====================

/**
 * POST /api/pricing/calculate
 * Calculate price for a single product
 */
router.post('/calculate', async (req, res) => {
  try {
    const { productId, quantity, customerId, promoCode } = req.body;

    if (!productId || !quantity) {
      return res.status(400).json({ error: 'Product ID and quantity are required' });
    }

    const calculation = await advancedPricingService.calculateProductPrice(
      productId,
      quantity,
      customerId,
      { promoCode }
    );

    res.json(calculation);
  } catch (error) {
    console.error('Error calculating price:', error);
    res.status(500).json({ error: 'Failed to calculate price' });
  }
});

/**
 * POST /api/pricing/calculate-quote
 * Calculate totals for a quote
 */
router.post('/calculate-quote', async (req, res) => {
  try {
    const { items, customerId, promoCode } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'At least one item is required' });
    }

    // Validate items
    for (const item of items) {
      if (!item.productId || !item.quantity) {
        return res.status(400).json({ error: 'Each item must have productId and quantity' });
      }
    }

    const calculation = await advancedPricingService.calculateQuoteTotals(
      items,
      customerId,
      promoCode
    );

    res.json(calculation);
  } catch (error) {
    console.error('Error calculating quote totals:', error);
    res.status(500).json({ error: 'Failed to calculate quote totals' });
  }
});

/**
 * GET /api/pricing/stacking-policy
 * Get the active stacking policy
 */
router.get('/stacking-policy', async (req, res) => {
  try {
    const policy = await advancedPricingService.getStackingPolicy();
    res.json(policy);
  } catch (error) {
    console.error('Error fetching stacking policy:', error);
    res.status(500).json({ error: 'Failed to fetch stacking policy' });
  }
});

module.exports = router;
