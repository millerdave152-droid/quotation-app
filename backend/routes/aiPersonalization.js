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

// ==================== DYNAMIC PRICING ====================

/**
 * POST /api/ai/dynamic-pricing/calculate
 * Calculate dynamic price adjustment for a product
 */
router.post('/dynamic-pricing/calculate', authenticate, async (req, res) => {
  try {
    const { productId, quantity, customerId, quoteItems } = req.body;

    if (!productId) {
      return res.status(400).json({ error: 'Product ID is required' });
    }

    const adjustment = await aiService.calculateDynamicPriceAdjustment(productId, {
      quantity,
      customerId,
      quoteItems
    });

    res.json(adjustment);
  } catch (error) {
    console.error('Error calculating dynamic pricing:', error);
    res.status(500).json({ error: 'Failed to calculate dynamic pricing' });
  }
});

/**
 * GET /api/ai/dynamic-pricing/rules
 * Get all dynamic pricing rules
 */
router.get('/dynamic-pricing/rules', authenticate, async (req, res) => {
  try {
    const { isActive, ruleType } = req.query;

    const rules = await aiService.getDynamicPricingRules({
      isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
      ruleType
    });

    res.json(rules);
  } catch (error) {
    console.error('Error fetching dynamic pricing rules:', error);
    res.status(500).json({ error: 'Failed to fetch dynamic pricing rules' });
  }
});

// ==================== UPSELLING ====================

/**
 * GET /api/ai/upsell/recommendations/:productId
 * Get upsell recommendations for a product
 */
router.get('/upsell/recommendations/:productId', authenticate, async (req, res) => {
  try {
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
  } catch (error) {
    console.error('Error fetching upsell recommendations:', error);
    res.status(500).json({ error: 'Failed to fetch upsell recommendations' });
  }
});

/**
 * POST /api/ai/upsell/for-quote
 * Get upsell recommendations for all items in a quote
 */
router.post('/upsell/for-quote', authenticate, async (req, res) => {
  try {
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
  } catch (error) {
    console.error('Error fetching quote upsell recommendations:', error);
    res.status(500).json({ error: 'Failed to fetch recommendations' });
  }
});

// ==================== SMART SUGGESTIONS ====================

/**
 * POST /api/ai/suggestions/quote
 * Get smart suggestions for the current quote
 */
router.post('/suggestions/quote', authenticate, async (req, res) => {
  try {
    const { quoteItems, customerId } = req.body;

    const suggestions = await aiService.getSmartQuoteSuggestions(
      quoteItems || [],
      customerId
    );

    res.json(suggestions);
  } catch (error) {
    console.error('Error fetching smart suggestions:', error);
    res.status(500).json({ error: 'Failed to fetch smart suggestions' });
  }
});

// ==================== CUSTOMER BEHAVIOR ====================

/**
 * POST /api/ai/behavior/track
 * Track customer behavior event
 */
router.post('/behavior/track', authenticate, async (req, res) => {
  try {
    const { customerId, eventType, productId, category, manufacturer, sessionId, eventData } = req.body;

    if (!customerId || !eventType) {
      return res.status(400).json({ error: 'Customer ID and event type are required' });
    }

    await aiService.trackBehavior(customerId, eventType, {
      productId,
      category,
      manufacturer,
      sessionId,
      eventData
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error tracking behavior:', error);
    res.status(500).json({ error: 'Failed to track behavior' });
  }
});

/**
 * POST /api/ai/recommendations/interact
 * Record recommendation interaction (view/accept)
 */
router.post('/recommendations/interact', authenticate, async (req, res) => {
  try {
    const { recommendationId, accepted } = req.body;

    if (!recommendationId) {
      return res.status(400).json({ error: 'Recommendation ID is required' });
    }

    await aiService.recordRecommendationInteraction(recommendationId, accepted || false);

    res.json({ success: true });
  } catch (error) {
    console.error('Error recording recommendation interaction:', error);
    res.status(500).json({ error: 'Failed to record interaction' });
  }
});

// ==================== ADMIN: PRODUCT AFFINITY ====================

/**
 * GET /api/ai/affinity/:productId
 * Get product affinities
 */
router.get('/affinity/:productId', authenticate, async (req, res) => {
  try {
    const affinities = await aiService.getProductAffinities(parseInt(req.params.productId));
    res.json(affinities);
  } catch (error) {
    console.error('Error fetching product affinities:', error);
    res.status(500).json({ error: 'Failed to fetch product affinities' });
  }
});

/**
 * POST /api/ai/affinity
 * Create/update product affinity
 */
router.post('/affinity', authenticate, async (req, res) => {
  try {
    const { sourceProductId, targetProductId, affinityType, score } = req.body;

    if (!sourceProductId || !targetProductId) {
      return res.status(400).json({ error: 'Source and target product IDs are required' });
    }

    const affinity = await aiService.setProductAffinity(
      sourceProductId,
      targetProductId,
      affinityType || 'frequently_bought_together',
      score || 0.5,
      true
    );

    res.json(affinity);
  } catch (error) {
    console.error('Error setting product affinity:', error);
    res.status(500).json({ error: 'Failed to set product affinity' });
  }
});

// ==================== ADMIN: UPSELL RULES ====================

/**
 * GET /api/ai/upsell/rules
 * Get all upsell rules
 */
router.get('/upsell/rules', authenticate, async (req, res) => {
  try {
    const rules = await aiService.getUpsellRules();
    res.json(rules);
  } catch (error) {
    console.error('Error fetching upsell rules:', error);
    res.status(500).json({ error: 'Failed to fetch upsell rules' });
  }
});

/**
 * POST /api/ai/upsell/rules
 * Create upsell rule
 */
router.post('/upsell/rules', authenticate, async (req, res) => {
  try {
    const rule = await aiService.createUpsellRule(req.body);
    res.status(201).json(rule);
  } catch (error) {
    console.error('Error creating upsell rule:', error);
    res.status(500).json({ error: 'Failed to create upsell rule' });
  }
});

/**
 * PUT /api/ai/upsell/rules/:id
 * Update upsell rule
 */
router.put('/upsell/rules/:id', authenticate, async (req, res) => {
  try {
    const rule = await aiService.updateUpsellRule(req.params.id, req.body);

    if (!rule) {
      return res.status(404).json({ error: 'Upsell rule not found' });
    }

    res.json(rule);
  } catch (error) {
    console.error('Error updating upsell rule:', error);
    res.status(500).json({ error: 'Failed to update upsell rule' });
  }
});

/**
 * DELETE /api/ai/upsell/rules/:id
 * Delete upsell rule
 */
router.delete('/upsell/rules/:id', authenticate, async (req, res) => {
  try {
    const deleted = await aiService.deleteUpsellRule(req.params.id);

    if (!deleted) {
      return res.status(404).json({ error: 'Upsell rule not found' });
    }

    res.json({ message: 'Upsell rule deleted successfully' });
  } catch (error) {
    console.error('Error deleting upsell rule:', error);
    res.status(500).json({ error: 'Failed to delete upsell rule' });
  }
});

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
router.post('/quote-builder/suggestions', authenticate, async (req, res) => {
  try {
    const { quoteItems, customerId, options } = req.body;

    if (!quoteBuilderService) {
      return res.status(500).json({ error: 'Quote builder service not initialized' });
    }

    const suggestions = await quoteBuilderService.getQuoteSuggestions(
      quoteItems || [],
      customerId,
      options || {}
    );

    res.json(suggestions);
  } catch (error) {
    console.error('Error getting quote builder suggestions:', error);
    res.status(500).json({ error: 'Failed to get suggestions' });
  }
});

/**
 * POST /api/ai/quote-builder/bundles
 * Get bundle suggestions for quote items
 */
router.post('/quote-builder/bundles', authenticate, async (req, res) => {
  try {
    const { quoteItems } = req.body;

    if (!quoteBuilderService) {
      return res.status(500).json({ error: 'Quote builder service not initialized' });
    }

    const bundles = await quoteBuilderService.getBundleSuggestions(quoteItems || []);
    res.json(bundles);
  } catch (error) {
    console.error('Error getting bundle suggestions:', error);
    res.status(500).json({ error: 'Failed to get bundle suggestions' });
  }
});

/**
 * POST /api/ai/quote-builder/cross-sells
 * Get cross-sell suggestions
 */
router.post('/quote-builder/cross-sells', authenticate, async (req, res) => {
  try {
    const { quoteItems } = req.body;

    if (!quoteBuilderService) {
      return res.status(500).json({ error: 'Quote builder service not initialized' });
    }

    const crossSells = await quoteBuilderService.getCrossSellSuggestions(quoteItems || []);
    res.json(crossSells);
  } catch (error) {
    console.error('Error getting cross-sell suggestions:', error);
    res.status(500).json({ error: 'Failed to get cross-sell suggestions' });
  }
});

/**
 * POST /api/ai/quote-builder/discount-recommendations
 * Get discount recommendations for quote
 */
router.post('/quote-builder/discount-recommendations', authenticate, async (req, res) => {
  try {
    const { quoteItems, customerId } = req.body;

    if (!quoteBuilderService) {
      return res.status(500).json({ error: 'Quote builder service not initialized' });
    }

    const recommendations = await quoteBuilderService.getDiscountRecommendations(
      quoteItems || [],
      customerId
    );
    res.json(recommendations);
  } catch (error) {
    console.error('Error getting discount recommendations:', error);
    res.status(500).json({ error: 'Failed to get discount recommendations' });
  }
});

/**
 * GET /api/ai/quote-builder/customer-preferences/:customerId
 * Get customer preferences and buying patterns
 */
router.get('/quote-builder/customer-preferences/:customerId', authenticate, async (req, res) => {
  try {
    const { customerId } = req.params;

    if (!quoteBuilderService) {
      return res.status(500).json({ error: 'Quote builder service not initialized' });
    }

    const preferences = await quoteBuilderService.getCustomerPreferences(parseInt(customerId));
    res.json(preferences || {});
  } catch (error) {
    console.error('Error getting customer preferences:', error);
    res.status(500).json({ error: 'Failed to get customer preferences' });
  }
});

/**
 * GET /api/ai/quote-builder/quick-add
 * Get quick add suggestions based on search
 */
router.get('/quote-builder/quick-add', authenticate, async (req, res) => {
  try {
    const { search, quoteItems } = req.query;
    const items = quoteItems ? JSON.parse(quoteItems) : [];

    if (!quoteBuilderService) {
      return res.status(500).json({ error: 'Quote builder service not initialized' });
    }

    const suggestions = await quoteBuilderService.getQuickAddSuggestions(search, items);
    res.json(suggestions);
  } catch (error) {
    console.error('Error getting quick add suggestions:', error);
    res.status(500).json({ error: 'Failed to get quick add suggestions' });
  }
});

module.exports = { router, initQuoteBuilderService };
