/**
 * TeleTime POS - Upsell Routes
 * API endpoints for upsell strategies and offers
 */

const express = require('express');
const router = express.Router();
const UpsellService = require('../services/UpsellService');
const db = require('../db');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');

// ============================================================================
// CUSTOMER-FACING ENDPOINTS
// ============================================================================

/**
 * POST /api/upsell/offers
 * Get upsell offers for a cart/customer context
 */
router.post('/offers', asyncHandler(async (req, res) => {
  const {
    cart,
    customer,
    location = 'checkout',
    sessionId,
    maxOffers,
    excludeShownOffers,
    searchHistory,
  } = req.body;

  if (!cart || !cart.items) {
    throw ApiError.badRequest('Cart data with items is required');
  }

  const result = await UpsellService.getUpsellOffers(cart, customer, {
    location,
    sessionId,
    maxOffers,
    excludeShownOffers,
    searchHistory,
  });

  res.json({
    success: true,
    ...result,
  });
}));

/**
 * POST /api/upsell/evaluate
 * Evaluate triggers without getting full offers (for debugging/preview)
 */
router.post('/evaluate', asyncHandler(async (req, res) => {
  const { cart, customer, location = 'checkout' } = req.body;

  if (!cart) {
    throw ApiError.badRequest('Cart data is required');
  }

  const strategies = await UpsellService.evaluateTriggers(cart, customer, { location });

  res.json({
    success: true,
    matchingStrategies: strategies.map(s => ({
      id: s.id,
      name: s.name,
      type: s.upsell_type,
      triggerType: s.trigger_type,
      priority: s.display_priority,
      matchScore: s.matchScore,
      matchReason: s.matchReason,
    })),
  });
}));

/**
 * GET /api/upsell/upgrade/:currentProductId/:upgradeProductId
 * Calculate upgrade value proposition
 */
router.get('/upgrade/:currentProductId/:upgradeProductId', asyncHandler(async (req, res) => {
  const { currentProductId, upgradeProductId } = req.params;

  const result = await UpsellService.calculateUpgradeValue(
    parseInt(currentProductId),
    parseInt(upgradeProductId)
  );

  if (!result.valid) {
    throw ApiError.badRequest(result.reason);
  }

  res.json({
    success: true,
    upgrade: result,
  });
}));

/**
 * POST /api/upsell/result
 * Record upsell result (accepted/declined/ignored)
 */
router.post('/result', asyncHandler(async (req, res) => {
  const {
    offerId,
    orderId,
    result,
    customerId,
    userId,
    sessionId,
    revenueAddedCents,
    marginAddedCents,
    declineReason,
    metadata,
  } = req.body;

  if (!offerId || !result) {
    throw ApiError.badRequest('offerId and result are required');
  }

  const validResults = ['accepted', 'declined', 'ignored', 'clicked'];
  if (!validResults.includes(result)) {
    throw ApiError.badRequest(`result must be one of: ${validResults.join(', ')}`);
  }

  const recordResult = await UpsellService.recordUpsellResult(offerId, orderId, result, {
    customerId,
    userId: userId || req.user?.id,
    sessionId,
    revenueAddedCents,
    marginAddedCents,
    declineReason,
    metadata,
  });

  res.json(recordResult);
}));

/**
 * GET /api/upsell/services
 * Get service recommendations for cart items
 */
router.get('/services', asyncHandler(async (req, res) => {
  const cartItems = req.query.items ? JSON.parse(req.query.items) : [];

  const services = await UpsellService.getServiceRecommendations(cartItems);

  res.json({
    success: true,
    services,
  });
}));

/**
 * POST /api/upsell/services
 * Get service recommendations (POST for larger payloads)
 */
router.post('/services', asyncHandler(async (req, res) => {
  const { cartItems } = req.body;

  const services = await UpsellService.getServiceRecommendations(cartItems || []);

  res.json({
    success: true,
    services,
  });
}));

/**
 * POST /api/upsell/membership-offers
 * Get membership offers for customer
 */
router.post('/membership-offers', asyncHandler(async (req, res) => {
  const { customer, cartValueCents } = req.body;

  const offers = await UpsellService.getMembershipOffers(customer, cartValueCents || 0);

  res.json({
    success: true,
    offers,
  });
}));

/**
 * GET /api/upsell/financing/:amountCents
 * Get financing options for a cart value
 */
router.get('/financing/:amountCents', asyncHandler(async (req, res) => {
  const amountCents = parseInt(req.params.amountCents);

  if (isNaN(amountCents) || amountCents <= 0) {
    throw ApiError.badRequest('Valid amount in cents is required');
  }

  const options = await UpsellService.getFinancingOptions(amountCents);

  res.json({
    success: true,
    options,
  });
}));

// ============================================================================
// ADMIN ENDPOINTS
// ============================================================================

/**
 * GET /api/upsell/admin/analytics
 * Get upsell analytics
 */
router.get('/admin/analytics', asyncHandler(async (req, res) => {
  const {
    startDate,
    endDate,
    strategyId,
    upsellType,
  } = req.query;

  const analytics = await UpsellService.getAnalytics({
    startDate: startDate ? new Date(startDate) : undefined,
    endDate: endDate ? new Date(endDate) : undefined,
    strategyId: strategyId ? parseInt(strategyId) : undefined,
    upsellType,
  });

  res.json({
    success: true,
    analytics,
  });
}));

/**
 * GET /api/upsell/admin/strategies
 * List all upsell strategies
 */
router.get('/admin/strategies', asyncHandler(async (req, res) => {
  const { type, active, page = 1, limit = 50 } = req.query;
  const offset = (page - 1) * limit;

  let query = `
    SELECT us.*,
           COUNT(uo.id) as offer_count,
           CASE WHEN us.total_impressions > 0
             THEN ROUND((us.total_conversions::decimal / us.total_impressions) * 100, 2)
             ELSE 0
           END as conversion_rate
    FROM upsell_strategies us
    LEFT JOIN upsell_offers uo ON uo.strategy_id = us.id AND uo.is_active = true
    WHERE 1=1
  `;
  const params = [];
  let paramIndex = 1;

  if (type) {
    query += ` AND us.upsell_type = $${paramIndex++}`;
    params.push(type);
  }

  if (active !== undefined) {
    query += ` AND us.is_active = $${paramIndex++}`;
    params.push(active === 'true');
  }

  query += ` GROUP BY us.id ORDER BY us.display_priority ASC, us.created_at DESC`;
  query += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
  params.push(parseInt(limit), offset);

  const result = await db.query(query, params);

  // Get total count
  let countQuery = 'SELECT COUNT(*) FROM upsell_strategies WHERE 1=1';
  const countParams = [];
  let countParamIndex = 1;

  if (type) {
    countQuery += ` AND upsell_type = $${countParamIndex++}`;
    countParams.push(type);
  }
  if (active !== undefined) {
    countQuery += ` AND is_active = $${countParamIndex++}`;
    countParams.push(active === 'true');
  }

  const countResult = await db.query(countQuery, countParams);
  const totalCount = parseInt(countResult.rows[0].count);

  res.json({
    success: true,
    strategies: result.rows.map(s => ({
      id: s.id,
      name: s.name,
      description: s.description,
      upsellType: s.upsell_type,
      triggerType: s.trigger_type,
      triggerValue: s.trigger_value,
      conditions: s.conditions,
      displayLocation: s.display_location,
      displayPriority: s.display_priority,
      startDate: s.start_date,
      endDate: s.end_date,
      isActive: s.is_active,
      offerCount: parseInt(s.offer_count) || 0,
      totalImpressions: s.total_impressions,
      totalConversions: s.total_conversions,
      conversionRate: parseFloat(s.conversion_rate) || 0,
      totalRevenue: s.total_revenue_cents / 100,
      createdAt: s.created_at,
    })),
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      totalCount,
      totalPages: Math.ceil(totalCount / limit),
    },
  });
}));

/**
 * GET /api/upsell/admin/strategies/:id
 * Get single strategy with offers
 */
router.get('/admin/strategies/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const strategyResult = await db.query(
    'SELECT * FROM upsell_strategies WHERE id = $1',
    [id]
  );

  if (strategyResult.rows.length === 0) {
    throw ApiError.notFound('Strategy');
  }

  const strategy = strategyResult.rows[0];

  // Get offers for this strategy
  const offersResult = await db.query(
    `SELECT * FROM upsell_offers
     WHERE strategy_id = $1
     ORDER BY display_order ASC`,
    [id]
  );

  res.json({
    success: true,
    strategy: {
      id: strategy.id,
      name: strategy.name,
      description: strategy.description,
      upsellType: strategy.upsell_type,
      triggerType: strategy.trigger_type,
      triggerValue: strategy.trigger_value,
      conditions: strategy.conditions,
      displayLocation: strategy.display_location,
      displayPriority: strategy.display_priority,
      maxDisplaysPerSession: strategy.max_displays_per_session,
      startDate: strategy.start_date,
      endDate: strategy.end_date,
      isActive: strategy.is_active,
      totalImpressions: strategy.total_impressions,
      totalConversions: strategy.total_conversions,
      totalRevenueCents: strategy.total_revenue_cents,
      createdAt: strategy.created_at,
      updatedAt: strategy.updated_at,
    },
    offers: offersResult.rows.map(o => ({
      id: o.id,
      title: o.offer_title,
      subtitle: o.offer_subtitle,
      description: o.offer_description,
      imageUrl: o.offer_image_url,
      offerType: o.offer_type,
      offerValueCents: o.offer_value_cents,
      offerValuePercent: o.offer_value_percent,
      targetType: o.target_type,
      targetProductId: o.target_product_id,
      targetServiceId: o.target_service_id,
      targetMembershipId: o.target_membership_id,
      targetFinancingId: o.target_financing_id,
      sourceProductIds: o.source_product_ids,
      sourceCategoryIds: o.source_category_ids,
      badgeText: o.badge_text,
      badgeColor: o.badge_color,
      ctaText: o.cta_text,
      urgencyText: o.urgency_text,
      validFrom: o.valid_from,
      validTo: o.valid_to,
      maxRedemptions: o.max_redemptions,
      currentRedemptions: o.current_redemptions,
      maxPerCustomer: o.max_per_customer,
      displayOrder: o.display_order,
      isActive: o.is_active,
    })),
  });
}));

/**
 * POST /api/upsell/admin/strategies
 * Create new upsell strategy
 */
router.post('/admin/strategies', asyncHandler(async (req, res) => {
  const {
    name,
    description,
    upsellType,
    triggerType,
    triggerValue,
    conditions,
    displayLocation = 'checkout',
    displayPriority = 100,
    maxDisplaysPerSession = 1,
    startDate,
    endDate,
    isActive = true,
  } = req.body;

  if (!name || !upsellType || !triggerType || !triggerValue) {
    throw ApiError.badRequest('name, upsellType, triggerType, and triggerValue are required');
  }

  const result = await db.query(
    `INSERT INTO upsell_strategies (
      name, description, upsell_type, trigger_type, trigger_value, conditions,
      display_location, display_priority, max_displays_per_session,
      start_date, end_date, is_active, created_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    RETURNING *`,
    [
      name, description, upsellType, triggerType,
      JSON.stringify(triggerValue), conditions ? JSON.stringify(conditions) : null,
      displayLocation, displayPriority, maxDisplaysPerSession,
      startDate, endDate, isActive, req.user?.id,
    ]
  );

  // Clear cache
  UpsellService.clearCache();

  res.status(201).json({
    success: true,
    strategy: result.rows[0],
  });
}));

/**
 * PUT /api/upsell/admin/strategies/:id
 * Update upsell strategy
 */
router.put('/admin/strategies/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    name,
    description,
    upsellType,
    triggerType,
    triggerValue,
    conditions,
    displayLocation,
    displayPriority,
    maxDisplaysPerSession,
    startDate,
    endDate,
    isActive,
  } = req.body;

  const result = await db.query(
    `UPDATE upsell_strategies SET
      name = COALESCE($1, name),
      description = COALESCE($2, description),
      upsell_type = COALESCE($3, upsell_type),
      trigger_type = COALESCE($4, trigger_type),
      trigger_value = COALESCE($5, trigger_value),
      conditions = COALESCE($6, conditions),
      display_location = COALESCE($7, display_location),
      display_priority = COALESCE($8, display_priority),
      max_displays_per_session = COALESCE($9, max_displays_per_session),
      start_date = $10,
      end_date = $11,
      is_active = COALESCE($12, is_active),
      updated_at = NOW()
    WHERE id = $13
    RETURNING *`,
    [
      name, description, upsellType, triggerType,
      triggerValue ? JSON.stringify(triggerValue) : null,
      conditions ? JSON.stringify(conditions) : null,
      displayLocation, displayPriority, maxDisplaysPerSession,
      startDate, endDate, isActive, id,
    ]
  );

  if (result.rows.length === 0) {
    throw ApiError.notFound('Strategy');
  }

  // Clear cache
  UpsellService.clearCache();

  res.json({
    success: true,
    strategy: result.rows[0],
  });
}));

/**
 * DELETE /api/upsell/admin/strategies/:id
 * Delete upsell strategy
 */
router.delete('/admin/strategies/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await db.query(
    'DELETE FROM upsell_strategies WHERE id = $1 RETURNING id',
    [id]
  );

  if (result.rows.length === 0) {
    throw ApiError.notFound('Strategy');
  }

  // Clear cache
  UpsellService.clearCache();

  res.json({
    success: true,
    deleted: true,
  });
}));

/**
 * POST /api/upsell/admin/offers
 * Create new upsell offer
 */
router.post('/admin/offers', asyncHandler(async (req, res) => {
  const {
    strategyId,
    offerTitle,
    offerSubtitle,
    offerDescription,
    offerImageUrl,
    offerType,
    offerValueCents,
    offerValuePercent,
    targetType,
    targetProductId,
    targetServiceId,
    targetMembershipId,
    targetFinancingId,
    sourceProductIds,
    sourceCategoryIds,
    badgeText,
    badgeColor,
    ctaText,
    urgencyText,
    validFrom,
    validTo,
    maxRedemptions,
    maxPerCustomer,
    displayOrder = 100,
    isActive = true,
  } = req.body;

  if (!strategyId || !offerTitle || !offerType || !targetType) {
    throw ApiError.badRequest('strategyId, offerTitle, offerType, and targetType are required');
  }

  const result = await db.query(
    `INSERT INTO upsell_offers (
      strategy_id, offer_title, offer_subtitle, offer_description, offer_image_url,
      offer_type, offer_value_cents, offer_value_percent,
      target_type, target_product_id, target_service_id, target_membership_id, target_financing_id,
      source_product_ids, source_category_ids,
      badge_text, badge_color, cta_text, urgency_text,
      valid_from, valid_to, max_redemptions, max_per_customer, display_order, is_active
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
    RETURNING *`,
    [
      strategyId, offerTitle, offerSubtitle, offerDescription, offerImageUrl,
      offerType, offerValueCents, offerValuePercent,
      targetType, targetProductId, targetServiceId, targetMembershipId, targetFinancingId,
      sourceProductIds, sourceCategoryIds,
      badgeText, badgeColor || '#10B981', ctaText || 'Add to Cart', urgencyText,
      validFrom, validTo, maxRedemptions, maxPerCustomer, displayOrder, isActive,
    ]
  );

  res.status(201).json({
    success: true,
    offer: result.rows[0],
  });
}));

/**
 * PUT /api/upsell/admin/offers/:id
 * Update upsell offer
 */
router.put('/admin/offers/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  // Build dynamic update query
  const fields = [];
  const values = [];
  let paramIndex = 1;

  const allowedFields = [
    'offer_title', 'offer_subtitle', 'offer_description', 'offer_image_url',
    'offer_type', 'offer_value_cents', 'offer_value_percent',
    'target_type', 'target_product_id', 'target_service_id', 'target_membership_id', 'target_financing_id',
    'source_product_ids', 'source_category_ids',
    'badge_text', 'badge_color', 'cta_text', 'urgency_text',
    'valid_from', 'valid_to', 'max_redemptions', 'max_per_customer', 'display_order', 'is_active',
  ];

  const fieldMapping = {
    offerTitle: 'offer_title',
    offerSubtitle: 'offer_subtitle',
    offerDescription: 'offer_description',
    offerImageUrl: 'offer_image_url',
    offerType: 'offer_type',
    offerValueCents: 'offer_value_cents',
    offerValuePercent: 'offer_value_percent',
    targetType: 'target_type',
    targetProductId: 'target_product_id',
    targetServiceId: 'target_service_id',
    targetMembershipId: 'target_membership_id',
    targetFinancingId: 'target_financing_id',
    sourceProductIds: 'source_product_ids',
    sourceCategoryIds: 'source_category_ids',
    badgeText: 'badge_text',
    badgeColor: 'badge_color',
    ctaText: 'cta_text',
    urgencyText: 'urgency_text',
    validFrom: 'valid_from',
    validTo: 'valid_to',
    maxRedemptions: 'max_redemptions',
    maxPerCustomer: 'max_per_customer',
    displayOrder: 'display_order',
    isActive: 'is_active',
  };

  for (const [key, value] of Object.entries(updates)) {
    const dbField = fieldMapping[key] || key;
    if (allowedFields.includes(dbField) && value !== undefined) {
      fields.push(`${dbField} = $${paramIndex++}`);
      values.push(value);
    }
  }

  if (fields.length === 0) {
    throw ApiError.badRequest('No valid fields to update');
  }

  values.push(id);
  const query = `UPDATE upsell_offers SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${paramIndex} RETURNING *`;

  const result = await db.query(query, values);

  if (result.rows.length === 0) {
    throw ApiError.notFound('Offer');
  }

  res.json({
    success: true,
    offer: result.rows[0],
  });
}));

/**
 * DELETE /api/upsell/admin/offers/:id
 * Delete upsell offer
 */
router.delete('/admin/offers/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;

  const result = await db.query(
    'DELETE FROM upsell_offers WHERE id = $1 RETURNING id',
    [id]
  );

  if (result.rows.length === 0) {
    throw ApiError.notFound('Offer');
  }

  res.json({
    success: true,
    deleted: true,
  });
}));

// ============================================================================
// SERVICES ADMIN ENDPOINTS
// ============================================================================

/**
 * GET /api/upsell/admin/services
 * List all services
 */
router.get('/admin/services', asyncHandler(async (req, res) => {
  const { type, active } = req.query;

  let query = 'SELECT * FROM services WHERE 1=1';
  const params = [];
  let paramIndex = 1;

  if (type) {
    query += ` AND service_type = $${paramIndex++}`;
    params.push(type);
  }

  if (active !== undefined) {
    query += ` AND is_active = $${paramIndex++}`;
    params.push(active === 'true');
  }

  query += ' ORDER BY display_order ASC, name ASC';

  const result = await db.query(query, params);

  res.json({
    success: true,
    services: result.rows.map(s => ({
      id: s.id,
      code: s.service_code,
      name: s.name,
      description: s.description,
      price: s.base_price_cents / 100,
      priceCents: s.base_price_cents,
      priceType: s.price_type,
      serviceType: s.service_type,
      categoryId: s.category_id,
      duration: s.duration_minutes,
      requiresScheduling: s.requires_scheduling,
      availableDays: s.available_days,
      eligibleCategories: s.eligible_categories,
      eligibleProducts: s.eligible_products,
      minCartValue: s.min_cart_value_cents / 100,
      showInCheckout: s.show_in_checkout,
      isActive: s.is_active,
    })),
  });
}));

/**
 * POST /api/upsell/admin/services
 * Create new service
 */
router.post('/admin/services', asyncHandler(async (req, res) => {
  const {
    serviceCode,
    name,
    description,
    basePriceCents,
    priceType = 'fixed',
    serviceType,
    categoryId,
    durationMinutes,
    requiresScheduling = false,
    availableDays,
    eligibleCategories,
    eligibleProducts,
    minCartValueCents = 0,
    showInCheckout = true,
    isActive = true,
  } = req.body;

  if (!serviceCode || !name || !serviceType) {
    throw ApiError.badRequest('serviceCode, name, and serviceType are required');
  }

  const result = await db.query(
    `INSERT INTO services (
      service_code, name, description, base_price_cents, price_type,
      service_type, category_id, duration_minutes, requires_scheduling,
      available_days, eligible_categories, eligible_products,
      min_cart_value_cents, show_in_checkout, is_active
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    RETURNING *`,
    [
      serviceCode, name, description, basePriceCents || 0, priceType,
      serviceType, categoryId, durationMinutes, requiresScheduling,
      availableDays ? JSON.stringify(availableDays) : null,
      eligibleCategories, eligibleProducts,
      minCartValueCents, showInCheckout, isActive,
    ]
  );

  res.status(201).json({
    success: true,
    service: result.rows[0],
  });
}));

/**
 * Clear strategy cache
 */
router.post('/admin/clear-cache', asyncHandler(async (req, res) => {
  UpsellService.clearCache();

  res.json({
    success: true,
    message: 'Cache cleared',
  });
}));

module.exports = router;
