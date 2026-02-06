/**
 * TeleTime POS - Promotions API Routes
 *
 * Endpoints for managing and applying POS promotions
 */

const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/auth');

/**
 * Initialize routes with services
 * @param {POSPromotionService} promotionService
 * @param {PromotionEngine} promotionEngine - Optional engine for cart operations
 */
module.exports = function (promotionService, promotionEngine = null) {
  // Apply authentication to all routes
  router.use(authenticate);
  // ============================================================================
  // PROMOTION CRUD
  // ============================================================================

  /**
   * GET /api/pos-promotions
   * List promotions with optional filters
   */
  router.get('/', async (req, res) => {
    try {
      const {
        status,
        promoType,
        autoApply,
        activeOnly,
        search,
        limit = 50,
        offset = 0,
      } = req.query;

      const promotions = await promotionService.listPromotions({
        status,
        promoType,
        autoApply: autoApply === 'true' ? true : autoApply === 'false' ? false : undefined,
        activeOnly: activeOnly === 'true',
        search,
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
      });

      res.json({
        success: true,
        data: promotions,
      });
    } catch (error) {
      console.error('[POS Promotions] List error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * GET /api/pos-promotions/active
   * Get all currently active promotions (summary view)
   */
  router.get('/active', async (req, res) => {
    try {
      const promotions = await promotionService.getActivePromotionsSummary();

      res.json({
        success: true,
        data: promotions,
      });
    } catch (error) {
      console.error('[POS Promotions] Active list error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * GET /api/pos-promotions/:id
   * Get promotion by ID
   */
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const promotion = await promotionService.getPromotionById(parseInt(id, 10));

      if (!promotion) {
        return res.status(404).json({
          success: false,
          error: 'Promotion not found',
        });
      }

      res.json({
        success: true,
        data: promotion,
      });
    } catch (error) {
      console.error('[POS Promotions] Get by ID error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * POST /api/pos-promotions
   * Create a new promotion (manager/admin only)
   */
  router.post('/', requireRole(['manager', 'admin']), async (req, res) => {
    try {
      const { products, rules, ...promotionData } = req.body;

      // Add created by from auth if available
      if (req.user?.id) {
        promotionData.createdBy = req.user.id;
      }

      // Create promotion
      const promotion = await promotionService.createPromotion(promotionData);

      // Add products if provided
      if (products && products.length > 0) {
        await promotionService.addPromotionProducts(promotion.id, products);
      }

      // Add rules if provided
      if (rules && rules.length > 0) {
        await promotionService.addPromotionRules(promotion.id, rules);
      }

      // Fetch complete promotion with products and rules
      const completePromotion = await promotionService.getPromotionById(promotion.id);

      res.status(201).json({
        success: true,
        data: completePromotion,
      });
    } catch (error) {
      console.error('[POS Promotions] Create error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * PUT /api/pos-promotions/:id
   * Update a promotion (manager/admin only)
   */
  router.put('/:id', requireRole(['manager', 'admin']), async (req, res) => {
    try {
      const { id } = req.params;
      const { products, rules, ...updates } = req.body;

      const promotion = await promotionService.updatePromotion(parseInt(id, 10), updates);

      if (!promotion) {
        return res.status(404).json({
          success: false,
          error: 'Promotion not found',
        });
      }

      // Replace products if provided
      if (products !== undefined) {
        await promotionService.replacePromotionProducts(promotion.id, products);
      }

      // Fetch updated promotion
      const updatedPromotion = await promotionService.getPromotionById(promotion.id);

      res.json({
        success: true,
        data: updatedPromotion,
      });
    } catch (error) {
      console.error('[POS Promotions] Update error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * DELETE /api/pos-promotions/:id
   * Delete a promotion (manager/admin only)
   */
  router.delete('/:id', requireRole(['manager', 'admin']), async (req, res) => {
    try {
      const { id } = req.params;
      const deleted = await promotionService.deletePromotion(parseInt(id, 10));

      if (!deleted) {
        return res.status(404).json({
          success: false,
          error: 'Promotion not found',
        });
      }

      res.json({
        success: true,
        message: 'Promotion deleted',
      });
    } catch (error) {
      console.error('[POS Promotions] Delete error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  // ============================================================================
  // PROMO CODE VALIDATION
  // ============================================================================

  /**
   * POST /api/pos-promotions/validate-code
   * Validate a promo code
   */
  router.post('/validate-code', async (req, res) => {
    try {
      const { code, customerId, subtotalCents } = req.body;

      if (!code) {
        return res.status(400).json({
          success: false,
          error: 'Promo code is required',
        });
      }

      const result = await promotionService.validatePromoCode(
        code,
        customerId || null,
        subtotalCents || 0
      );

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('[POS Promotions] Validate code error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * GET /api/pos-promotions/code/:code
   * Get promotion by promo code
   */
  router.get('/code/:code', async (req, res) => {
    try {
      const { code } = req.params;
      const promotion = await promotionService.getPromotionByCode(code);

      if (!promotion) {
        return res.status(404).json({
          success: false,
          error: 'Invalid promo code',
        });
      }

      res.json({
        success: true,
        data: promotion,
      });
    } catch (error) {
      console.error('[POS Promotions] Get by code error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  // ============================================================================
  // CART CALCULATIONS
  // ============================================================================

  /**
   * POST /api/pos-promotions/applicable
   * Get all applicable promotions for a cart
   */
  router.post('/applicable', async (req, res) => {
    try {
      const { customerId, items, subtotalCents } = req.body;

      if (!items || !Array.isArray(items)) {
        return res.status(400).json({
          success: false,
          error: 'Cart items are required',
        });
      }

      const promotions = await promotionService.getApplicablePromotions({
        customerId,
        items,
        subtotalCents: subtotalCents || items.reduce(
          (sum, item) => sum + (item.quantity * (item.unitPriceCents || item.unitPrice * 100)),
          0
        ),
      });

      res.json({
        success: true,
        data: promotions,
      });
    } catch (error) {
      console.error('[POS Promotions] Get applicable error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * POST /api/pos-promotions/calculate
   * Calculate discount for a specific promotion
   */
  router.post('/calculate', async (req, res) => {
    try {
      const { promotionId, items, subtotalCents } = req.body;

      if (!promotionId) {
        return res.status(400).json({
          success: false,
          error: 'Promotion ID is required',
        });
      }

      if (!items || !Array.isArray(items)) {
        return res.status(400).json({
          success: false,
          error: 'Cart items are required',
        });
      }

      const result = await promotionService.calculateDiscount(promotionId, {
        items,
        subtotalCents: subtotalCents || items.reduce(
          (sum, item) => sum + (item.quantity * (item.unitPriceCents || item.unitPrice * 100)),
          0
        ),
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      console.error('[POS Promotions] Calculate error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * POST /api/pos-promotions/calculate-multiple
   * Calculate discounts for multiple promotions
   */
  router.post('/calculate-multiple', async (req, res) => {
    try {
      const { promotionIds, items, subtotalCents } = req.body;

      if (!promotionIds || !Array.isArray(promotionIds)) {
        return res.status(400).json({
          success: false,
          error: 'Promotion IDs are required',
        });
      }

      const cart = {
        items,
        subtotalCents: subtotalCents || items.reduce(
          (sum, item) => sum + (item.quantity * (item.unitPriceCents || item.unitPrice * 100)),
          0
        ),
      };

      const results = await Promise.all(
        promotionIds.map((id) => promotionService.calculateDiscount(id, cart))
      );

      // Calculate combined discount (respecting stacking rules)
      const successful = results.filter((r) => r.success);
      const totalDiscountCents = successful.reduce((sum, r) => sum + r.discountCents, 0);

      res.json({
        success: true,
        data: {
          promotions: results,
          totalDiscountCents,
          totalDiscountDollars: totalDiscountCents / 100,
        },
      });
    } catch (error) {
      console.error('[POS Promotions] Calculate multiple error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  // ============================================================================
  // APPLY & VOID PROMOTIONS
  // ============================================================================

  /**
   * POST /api/pos-promotions/apply
   * Apply a promotion to a transaction or quote
   */
  router.post('/apply', async (req, res) => {
    try {
      const {
        promotionId,
        transactionId,
        quotationId,
        customerId,
        discountCents,
        itemsAffected,
        codeEntered,
      } = req.body;

      if (!promotionId) {
        return res.status(400).json({
          success: false,
          error: 'Promotion ID is required',
        });
      }

      if (!transactionId && !quotationId) {
        return res.status(400).json({
          success: false,
          error: 'Transaction ID or Quotation ID is required',
        });
      }

      const result = await promotionService.applyPromotion({
        promotionId,
        transactionId,
        quotationId,
        customerId,
        userId: req.user?.id,
        discountCents,
        itemsAffected,
        codeEntered,
      });

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: result.error,
        });
      }

      res.json({
        success: true,
        data: {
          usageId: result.usageId,
        },
      });
    } catch (error) {
      console.error('[POS Promotions] Apply error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * POST /api/pos-promotions/void/:usageId
   * Void a promotion usage
   */
  router.post('/void/:usageId', async (req, res) => {
    try {
      const { usageId } = req.params;
      const { reason } = req.body;

      const success = await promotionService.voidPromotionUsage(
        parseInt(usageId, 10),
        req.user?.id,
        reason
      );

      if (!success) {
        return res.status(404).json({
          success: false,
          error: 'Usage record not found or already voided',
        });
      }

      res.json({
        success: true,
        message: 'Promotion usage voided',
      });
    } catch (error) {
      console.error('[POS Promotions] Void error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  // ============================================================================
  // USAGE & ANALYTICS
  // ============================================================================

  /**
   * GET /api/pos-promotions/:id/usage
   * Get usage history for a promotion
   */
  router.get('/:id/usage', async (req, res) => {
    try {
      const { id } = req.params;
      const { limit = 50, offset = 0, status } = req.query;

      const usage = await promotionService.getPromotionUsage(parseInt(id, 10), {
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
        status,
      });

      res.json({
        success: true,
        data: usage,
      });
    } catch (error) {
      console.error('[POS Promotions] Get usage error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * GET /api/pos-promotions/:id/performance
   * Get performance metrics for a promotion
   */
  router.get('/:id/performance', async (req, res) => {
    try {
      const { id } = req.params;
      const performance = await promotionService.getPromotionPerformance(parseInt(id, 10));

      if (!performance) {
        return res.status(404).json({
          success: false,
          error: 'Promotion not found',
        });
      }

      res.json({
        success: true,
        data: performance,
      });
    } catch (error) {
      console.error('[POS Promotions] Get performance error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * GET /api/pos-promotions/customer/:customerId/usage
   * Get customer's promotion usage
   */
  router.get('/customer/:customerId/usage', async (req, res) => {
    try {
      const { customerId } = req.params;
      const { promotionId } = req.query;

      if (promotionId) {
        const count = await promotionService.getCustomerUsageCount(
          parseInt(promotionId, 10),
          parseInt(customerId, 10)
        );

        return res.json({
          success: true,
          data: { usageCount: count },
        });
      }

      // TODO: Get all promotion usage for customer
      res.json({
        success: true,
        data: { message: 'Use promotionId query param for specific usage count' },
      });
    } catch (error) {
      console.error('[POS Promotions] Get customer usage error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  // ============================================================================
  // QUICK ACTIONS
  // ============================================================================

  /**
   * POST /api/pos-promotions/:id/pause
   * Pause a promotion (manager/admin only)
   */
  router.post('/:id/pause', requireRole(['manager', 'admin']), async (req, res) => {
    try {
      const { id } = req.params;
      const promotion = await promotionService.updatePromotion(parseInt(id, 10), {
        status: 'paused',
      });

      res.json({
        success: true,
        data: promotion,
      });
    } catch (error) {
      console.error('[POS Promotions] Pause error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * POST /api/pos-promotions/:id/activate
   * Activate a promotion (manager/admin only)
   */
  router.post('/:id/activate', requireRole(['manager', 'admin']), async (req, res) => {
    try {
      const { id } = req.params;
      const promotion = await promotionService.updatePromotion(parseInt(id, 10), {
        status: 'active',
      });

      res.json({
        success: true,
        data: promotion,
      });
    } catch (error) {
      console.error('[POS Promotions] Activate error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * POST /api/pos-promotions/:id/archive
   * Archive a promotion (manager/admin only)
   */
  router.post('/:id/archive', requireRole(['manager', 'admin']), async (req, res) => {
    try {
      const { id } = req.params;
      const promotion = await promotionService.updatePromotion(parseInt(id, 10), {
        status: 'archived',
      });

      res.json({
        success: true,
        data: promotion,
      });
    } catch (error) {
      console.error('[POS Promotions] Archive error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  // ============================================================================
  // PROMOTION ENGINE ENDPOINTS (Cart Operations)
  // ============================================================================

  /**
   * POST /api/pos-promotions/engine/check
   * Check cart for all applicable promotions with near-miss detection
   * Returns: autoApplied, available codes, nearMiss promotions
   * Optimized for frequent calls (debounce on frontend recommended)
   */
  router.post('/engine/check', async (req, res) => {
    if (!promotionEngine) {
      return res.status(503).json({
        success: false,
        error: 'Promotion engine not available',
      });
    }

    try {
      const { items, customer, subtotalCents, appliedPromotionId } = req.body;

      // Allow empty cart check (returns empty results)
      const cart = {
        items: items || [],
        customer: customer || null,
        subtotalCents: subtotalCents || 0,
        appliedPromotionId: appliedPromotionId || null,
      };

      const result = await promotionEngine.checkCartPromotions(cart);

      if (!result.success) {
        return res.status(500).json({
          success: false,
          error: result.error,
          data: result.data, // Still return empty data structure
        });
      }

      res.json({
        success: true,
        data: result.data,
      });
    } catch (error) {
      console.error('[POS Promotions Engine] Check error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
        data: {
          autoApplied: [],
          available: [],
          nearMiss: [],
          bestAutoApply: null,
          totalAutoDiscountCents: 0,
          summary: {
            hasAutoApply: false,
            hasAvailableCodes: false,
            hasNearMiss: false,
          },
        },
      });
    }
  });

  /**
   * POST /api/pos-promotions/engine/find-applicable
   * Find all applicable auto-apply promotions for a cart using PromotionEngine
   * Returns promotions sorted by discount amount (best first)
   */
  router.post('/engine/find-applicable', async (req, res) => {
    if (!promotionEngine) {
      return res.status(503).json({
        success: false,
        error: 'Promotion engine not available',
      });
    }

    try {
      const { items, customer, subtotalCents } = req.body;

      if (!items || !Array.isArray(items)) {
        return res.status(400).json({
          success: false,
          error: 'Cart items are required',
        });
      }

      const cart = {
        items,
        customer: customer || null,
        subtotalCents: subtotalCents || 0,
      };

      const promotions = await promotionEngine.findApplicablePromotions(cart);

      res.json({
        success: true,
        data: {
          promotions,
          count: promotions.length,
          bestPromotion: promotions.length > 0 ? promotions[0] : null,
        },
      });
    } catch (error) {
      console.error('[POS Promotions Engine] Find applicable error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * POST /api/pos-promotions/engine/apply-code
   * Validate and apply a promo code to a cart using PromotionEngine
   * Returns promotion details and discount if valid, or error if invalid
   */
  router.post('/engine/apply-code', async (req, res) => {
    if (!promotionEngine) {
      return res.status(503).json({
        success: false,
        error: 'Promotion engine not available',
      });
    }

    try {
      const { items, customer, subtotalCents, code } = req.body;

      if (!code) {
        return res.status(400).json({
          success: false,
          error: 'Promo code is required',
          errorCode: 'MISSING_CODE',
        });
      }

      if (!items || !Array.isArray(items)) {
        return res.status(400).json({
          success: false,
          error: 'Cart items are required',
        });
      }

      const cart = {
        items,
        customer: customer || null,
        subtotalCents: subtotalCents || 0,
      };

      const result = await promotionEngine.applyPromoCode(cart, code);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: result.error,
          errorCode: result.errorCode,
        });
      }

      res.json({
        success: true,
        data: {
          promotion: result.promotion,
          discountCents: result.discountCents,
          discountDollars: result.discountCents / 100,
        },
      });
    } catch (error) {
      console.error('[POS Promotions Engine] Apply code error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * POST /api/pos-promotions/engine/best-combination
   * Get the optimal combination of promotions for a cart
   * Handles stacking rules: one promo code max, auto-apply can stack with code
   */
  router.post('/engine/best-combination', async (req, res) => {
    if (!promotionEngine) {
      return res.status(503).json({
        success: false,
        error: 'Promotion engine not available',
      });
    }

    try {
      const { items, customer, subtotalCents, promoCode } = req.body;

      if (!items || !Array.isArray(items)) {
        return res.status(400).json({
          success: false,
          error: 'Cart items are required',
        });
      }

      const cart = {
        items,
        customer: customer || null,
        subtotalCents: subtotalCents || 0,
      };

      const result = await promotionEngine.getBestPromotionCombination(cart, promoCode || null);

      res.json({
        success: true,
        data: {
          promotions: result.promotions,
          promoCodeApplied: result.promoCodeApplied,
          autoApplyPromotions: result.autoApplyPromotions,
          totalDiscountCents: result.totalDiscountCents,
          totalDiscountDollars: result.totalDiscountCents / 100,
          breakdown: result.breakdown,
        },
      });
    } catch (error) {
      console.error('[POS Promotions Engine] Best combination error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * POST /api/pos-promotions/engine/calculate-discount
   * Calculate discount for a specific promotion against a cart
   */
  router.post('/engine/calculate-discount', async (req, res) => {
    if (!promotionEngine) {
      return res.status(503).json({
        success: false,
        error: 'Promotion engine not available',
      });
    }

    try {
      const { items, customer, subtotalCents, promotionId } = req.body;

      if (!promotionId) {
        return res.status(400).json({
          success: false,
          error: 'Promotion ID is required',
        });
      }

      if (!items || !Array.isArray(items)) {
        return res.status(400).json({
          success: false,
          error: 'Cart items are required',
        });
      }

      const cart = {
        items,
        customer: customer || null,
        subtotalCents: subtotalCents || 0,
      };

      // Fetch the promotion
      const promotion = await promotionService.getPromotionById(promotionId);
      if (!promotion) {
        return res.status(404).json({
          success: false,
          error: 'Promotion not found',
        });
      }

      const discountCents = await promotionEngine.calculateDiscount(cart, promotion);

      res.json({
        success: true,
        data: {
          promotionId,
          promotionName: promotion.name,
          discountCents,
          discountDollars: discountCents / 100,
        },
      });
    } catch (error) {
      console.error('[POS Promotions Engine] Calculate discount error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * POST /api/pos-promotions/engine/validate
   * Validate a promotion against a cart without applying
   */
  router.post('/engine/validate', async (req, res) => {
    if (!promotionEngine) {
      return res.status(503).json({
        success: false,
        error: 'Promotion engine not available',
      });
    }

    try {
      const { items, customer, subtotalCents, promotionId } = req.body;

      if (!promotionId) {
        return res.status(400).json({
          success: false,
          error: 'Promotion ID is required',
        });
      }

      const cart = {
        items: items || [],
        customer: customer || null,
        subtotalCents: subtotalCents || 0,
      };

      // Fetch the promotion
      const promotion = await promotionService.getPromotionById(promotionId);
      if (!promotion) {
        return res.status(404).json({
          success: false,
          error: 'Promotion not found',
        });
      }

      const result = await promotionEngine.validatePromotion(promotion, cart);

      res.json({
        success: true,
        data: {
          isValid: result.isValid,
          errors: result.errors,
          promotion: {
            id: promotion.id,
            name: promotion.name,
            promoType: promotion.promo_type,
          },
        },
      });
    } catch (error) {
      console.error('[POS Promotions Engine] Validate error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * POST /api/pos-promotions/engine/record-usage
   * Record promotion usage after a transaction is completed
   */
  router.post('/engine/record-usage', async (req, res) => {
    if (!promotionEngine) {
      return res.status(503).json({
        success: false,
        error: 'Promotion engine not available',
      });
    }

    try {
      const { promotionId, customerId, orderId, discountCents, metadata } = req.body;

      if (!promotionId) {
        return res.status(400).json({
          success: false,
          error: 'Promotion ID is required',
        });
      }

      if (!orderId) {
        return res.status(400).json({
          success: false,
          error: 'Order ID (transaction_id or quotation_id) is required',
        });
      }

      if (discountCents === undefined || discountCents === null) {
        return res.status(400).json({
          success: false,
          error: 'Discount amount is required',
        });
      }

      const result = await promotionEngine.recordUsage(
        promotionId,
        customerId || null,
        orderId,
        discountCents,
        metadata || {}
      );

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: result.error,
          errorCode: result.errorCode,
        });
      }

      res.json({
        success: true,
        data: {
          usageId: result.usageId,
          promotionId,
          discountCents,
        },
      });
    } catch (error) {
      console.error('[POS Promotions Engine] Record usage error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  return router;
};
