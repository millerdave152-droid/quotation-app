/**
 * AI Personalization Routes
 *
 * Endpoints for:
 * - Dynamic pricing calculations
 * - Upsell recommendations
 * - Smart quote suggestions
 * - Customer behavior tracking
 * - Admin management
 */

const express = require('express');
const router = express.Router();
const aiService = require('../services/AIPersonalizationService');
const { authenticate } = require('../middleware/auth');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');

// ==================== DYNAMIC PRICING ====================

/**
 * POST /api/ai/dynamic-pricing/calculate
 * Calculate dynamic price adjustment for a product
 */
router.post('/dynamic-pricing/calculate', authenticate, asyncHandler(async (req, res) => {
  const { productId, quantity, customerId, quoteItems } = req.body;

  if (!productId) {
    throw ApiError.badRequest('Product ID is required');
  }

  const adjustment = await aiService.calculateDynamicPriceAdjustment(productId, {
    quantity,
    customerId,
    quoteItems
  });

  res.json(adjustment);
}));

/**
 * GET /api/ai/dynamic-pricing/rules
 * Get all dynamic pricing rules
 */
router.get('/dynamic-pricing/rules', authenticate, asyncHandler(async (req, res) => {
  const { isActive, ruleType } = req.query;

  const rules = await aiService.getDynamicPricingRules({
    isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
    ruleType
  });

  res.json(rules);
}));

// ==================== UPSELLING ====================

/**
 * GET /api/ai/upsell/recommendations/:productId
 * Get upsell recommendations for a product
 */
router.get('/upsell/recommendations/:productId', authenticate, asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const { customerId, limit } = req.query;
  const quoteItems = req.query.quoteItems ? JSON.parse(req.query.quoteItems) : [];

  const recommendations = await aiService.getUpsellRecommendations(
    parseInt(productId),
    {
      customerId: customerId ? parseInt(customerId) : null,
      quoteItems,
      limit: limit ? parseInt(limit) : 5
    }
  );

  res.json(recommendations);
}));

/**
 * POST /api/ai/upsell/for-quote
 * Get upsell recommendations for all items in a quote
 */
router.post('/upsell/for-quote', authenticate, asyncHandler(async (req, res) => {
  const { quoteItems, customerId, limit = 3 } = req.body;

  if (!quoteItems || quoteItems.length === 0) {
    return res.json([]);
  }

  const allRecommendations = [];
  const seenProducts = new Set(quoteItems.map(item => item.id));

  for (const item of quoteItems) {
    const recs = await aiService.getUpsellRecommendations(item.id, {
      customerId,
      quoteItems,
      limit: 3
    });

    for (const rec of recs) {
      if (!seenProducts.has(rec.productId)) {
        seenProducts.add(rec.productId);
        allRecommendations.push({
          ...rec,
          sourceProduct: item.name || item.model
        });
      }
    }
  }

  // Sort by confidence and limit
  const topRecs = allRecommendations
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, limit);

  res.json(topRecs);
}));

// ==================== SMART SUGGESTIONS ====================

/**
 * POST /api/ai/suggestions/quote
 * Get smart suggestions for the current quote
 */
router.post('/suggestions/quote', authenticate, asyncHandler(async (req, res) => {
  const { quoteItems, customerId } = req.body;

  const suggestions = await aiService.getSmartQuoteSuggestions(
    quoteItems || [],
    customerId
  );

  res.json(suggestions);
}));

// ==================== CUSTOMER BEHAVIOR ====================

/**
 * POST /api/ai/behavior/track
 * Track customer behavior event
 */
router.post('/behavior/track', authenticate, asyncHandler(async (req, res) => {
  const { customerId, eventType, productId, category, manufacturer, sessionId, eventData } = req.body;

  if (!customerId || !eventType) {
    throw ApiError.badRequest('Customer ID and event type are required');
  }

  await aiService.trackBehavior(customerId, eventType, {
    productId,
    category,
    manufacturer,
    sessionId,
    eventData
  });

  res.json({ success: true });
}));

/**
 * POST /api/ai/recommendations/interact
 * Record recommendation interaction (view/accept)
 */
router.post('/recommendations/interact', authenticate, asyncHandler(async (req, res) => {
  const { recommendationId, accepted } = req.body;

  if (!recommendationId) {
    throw ApiError.badRequest('Recommendation ID is required');
  }

  await aiService.recordRecommendationInteraction(recommendationId, accepted || false);

  res.json({ success: true });
}));

// ==================== ADMIN: PRODUCT AFFINITY ====================

/**
 * GET /api/ai/affinity/:productId
 * Get product affinities
 */
router.get('/affinity/:productId', authenticate, asyncHandler(async (req, res) => {
  const affinities = await aiService.getProductAffinities(parseInt(req.params.productId));
  res.json(affinities);
}));

/**
 * POST /api/ai/affinity
 * Create/update product affinity
 */
router.post('/affinity', authenticate, asyncHandler(async (req, res) => {
  const { sourceProductId, targetProductId, affinityType, score } = req.body;

  if (!sourceProductId || !targetProductId) {
    throw ApiError.badRequest('Source and target product IDs are required');
  }

  const affinity = await aiService.setProductAffinity(
    sourceProductId,
    targetProductId,
    affinityType || 'frequently_bought_together',
    score || 0.5,
    true
  );

  res.json(affinity);
}));

// ==================== ADMIN: UPSELL RULES ====================

/**
 * GET /api/ai/upsell/rules
 * Get all upsell rules
 */
router.get('/upsell/rules', authenticate, asyncHandler(async (req, res) => {
  const rules = await aiService.getUpsellRules();
  res.json(rules);
}));

/**
 * POST /api/ai/upsell/rules
 * Create upsell rule
 */
router.post('/upsell/rules', authenticate, asyncHandler(async (req, res) => {
  const rule = await aiService.createUpsellRule(req.body);
  res.status(201).json(rule);
}));

/**
 * PUT /api/ai/upsell/rules/:id
 * Update upsell rule
 */
router.put('/upsell/rules/:id', authenticate, asyncHandler(async (req, res) => {
  const rule = await aiService.updateUpsellRule(req.params.id, req.body);

  if (!rule) {
    throw ApiError.notFound('Upsell rule');
  }

  res.json(rule);
}));

/**
 * DELETE /api/ai/upsell/rules/:id
 * Delete upsell rule
 */
router.delete('/upsell/rules/:id', authenticate, asyncHandler(async (req, res) => {
  const deleted = await aiService.deleteUpsellRule(req.params.id);

  if (!deleted) {
    throw ApiError.notFound('Upsell rule');
  }

  res.json({ message: 'Upsell rule deleted successfully' });
}));

// ==================== AI QUOTE BUILDER ====================
// Module-level service instance for quote builder
const AIQuoteBuilderService = require('../services/AIQuoteBuilderService');
let quoteBuilderService = null;

/**
 * Initialize AI Quote Builder service
 */
const initQuoteBuilderService = (pool, cache) => {
  if (!quoteBuilderService) {
    quoteBuilderService = new AIQuoteBuilderService(pool, cache);
  }
  return quoteBuilderService;
};

/**
 * POST /api/ai/quote-builder/suggestions
 * Get comprehensive AI suggestions for current quote
 */
router.post('/quote-builder/suggestions', authenticate, asyncHandler(async (req, res) => {
  const { quoteItems, customerId, options } = req.body;

  if (!quoteBuilderService) {
    throw ApiError.serviceUnavailable('Quote builder service');
  }

  const suggestions = await quoteBuilderService.getQuoteSuggestions(
    quoteItems || [],
    customerId,
    options || {}
  );

  res.json(suggestions);
}));

/**
 * POST /api/ai/quote-builder/bundles
 * Get bundle suggestions for quote items
 */
router.post('/quote-builder/bundles', authenticate, asyncHandler(async (req, res) => {
  const { quoteItems } = req.body;

  if (!quoteBuilderService) {
    throw ApiError.serviceUnavailable('Quote builder service');
  }

  const bundles = await quoteBuilderService.getBundleSuggestions(quoteItems || []);
  res.json(bundles);
}));

/**
 * POST /api/ai/quote-builder/cross-sells
 * Get cross-sell suggestions
 */
router.post('/quote-builder/cross-sells', authenticate, asyncHandler(async (req, res) => {
  const { quoteItems } = req.body;

  if (!quoteBuilderService) {
    throw ApiError.serviceUnavailable('Quote builder service');
  }

  const crossSells = await quoteBuilderService.getCrossSellSuggestions(quoteItems || []);
  res.json(crossSells);
}));

/**
 * POST /api/ai/quote-builder/discount-recommendations
 * Get discount recommendations for quote
 */
router.post('/quote-builder/discount-recommendations', authenticate, asyncHandler(async (req, res) => {
  const { quoteItems, customerId } = req.body;

  if (!quoteBuilderService) {
    throw ApiError.serviceUnavailable('Quote builder service');
  }

  const recommendations = await quoteBuilderService.getDiscountRecommendations(
    quoteItems || [],
    customerId
  );
  res.json(recommendations);
}));

/**
 * GET /api/ai/quote-builder/customer-preferences/:customerId
 * Get customer preferences and buying patterns
 */
router.get('/quote-builder/customer-preferences/:customerId', authenticate, asyncHandler(async (req, res) => {
  const { customerId } = req.params;

  if (!quoteBuilderService) {
    throw ApiError.serviceUnavailable('Quote builder service');
  }

  const preferences = await quoteBuilderService.getCustomerPreferences(parseInt(customerId));
  res.json(preferences || {});
}));

/**
 * GET /api/ai/quote-builder/quick-add
 * Get quick add suggestions based on search
 */
router.get('/quote-builder/quick-add', authenticate, asyncHandler(async (req, res) => {
  const { search, quoteItems } = req.query;
  const items = quoteItems ? JSON.parse(quoteItems) : [];

  if (!quoteBuilderService) {
    throw ApiError.serviceUnavailable('Quote builder service');
  }

  const suggestions = await quoteBuilderService.getQuickAddSuggestions(search, items);
  res.json(suggestions);
}));

module.exports = { router, initQuoteBuilderService };
