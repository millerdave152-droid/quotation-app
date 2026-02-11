/**
 * Package Builder API Routes
 * Endpoints for the guided package builder wizard
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');

module.exports = function({ pool }) {
  const PackageBuilderService = require('../services/PackageBuilderService');
  const PackageSelectionEngine = require('../services/PackageSelectionEngine');

  const builderService = new PackageBuilderService(pool);
  const selectionEngine = new PackageSelectionEngine(pool);

  // ============================================
  // QUESTIONNAIRE ENDPOINTS
  // ============================================

  /**
   * List available questionnaires
   * GET /api/package-builder/questionnaires
   */
  router.get('/questionnaires', authenticate, asyncHandler(async (req, res) => {
    const questionnaires = await builderService.listQuestionnaires();
    res.json({
      success: true,
      data: questionnaires
    });
  }));

  /**
   * Get questionnaire by type with all questions
   * GET /api/package-builder/questionnaires/:type
   */
  router.get('/questionnaires/:type', authenticate, asyncHandler(async (req, res) => {
    const { type } = req.params;
    const questionnaire = await builderService.getQuestionnaire(type);

    if (!questionnaire) {
      throw ApiError.notFound(`Questionnaire for type: ${type}`);
    }

    res.json({
      success: true,
      data: questionnaire
    });
  }));

  // ============================================
  // SESSION ENDPOINTS
  // ============================================

  /**
   * Create a new package building session
   * POST /api/package-builder/sessions
   */
  router.post('/sessions', authenticate, asyncHandler(async (req, res) => {
    const { package_type, customer_id } = req.body;

    if (!package_type) {
      throw ApiError.badRequest('package_type is required (kitchen or laundry)');
    }

    const session = await builderService.createSession(package_type, customer_id);

    res.status(201).json({
      success: true,
      data: session,
      message: 'Package building session created'
    });
  }));

  /**
   * Get session by UUID
   * GET /api/package-builder/sessions/:uuid
   */
  router.get('/sessions/:uuid', authenticate, asyncHandler(async (req, res) => {
    const { uuid } = req.params;
    const session = await builderService.getSession(uuid);

    if (!session) {
      throw ApiError.notFound('Session');
    }

    res.json({
      success: true,
      data: session
    });
  }));

  /**
   * Update session answers
   * PUT /api/package-builder/sessions/:uuid/answers
   */
  router.put('/sessions/:uuid/answers', authenticate, asyncHandler(async (req, res) => {
    const { uuid } = req.params;
    const { answers } = req.body;

    if (!answers || typeof answers !== 'object') {
      throw ApiError.badRequest('answers object is required');
    }

    const session = await builderService.updateAnswers(uuid, answers);

    res.json({
      success: true,
      data: session,
      message: 'Answers updated'
    });
  }));

  /**
   * Generate package recommendations
   * POST /api/package-builder/sessions/:uuid/generate
   */
  router.post('/sessions/:uuid/generate', authenticate, asyncHandler(async (req, res) => {
    const { uuid } = req.params;

    // Get session with answers
    const session = await builderService.getSession(uuid);
    if (!session) {
      throw ApiError.notFound('Session');
    }

    // Get template for this package type
    const template = await builderService.getTemplate(session.package_type);
    if (!template) {
      throw ApiError.notFound(`Template for package type: ${session.package_type}`);
    }

    // Generate packages
    const packages = await selectionEngine.generatePackages(session.answers, template);

    // Store in session
    await builderService.storeGeneratedPackages(uuid, packages);

    // Increment template use count
    await builderService.incrementTemplateUse(template.id);

    res.json({
      success: true,
      data: {
        packages,
        template: {
          id: template.id,
          name: template.name,
          bundle_discount_percent: template.bundle_discount_percent
        }
      },
      message: 'Packages generated successfully'
    });
  }));

  /**
   * Get generated packages from session
   * GET /api/package-builder/sessions/:uuid/packages
   */
  router.get('/sessions/:uuid/packages', authenticate, asyncHandler(async (req, res) => {
    const { uuid } = req.params;
    const session = await builderService.getSession(uuid);

    if (!session) {
      throw ApiError.notFound('Session');
    }

    if (!session.generated_packages) {
      throw ApiError.badRequest('Packages not yet generated. Call POST /generate first.');
    }

    res.json({
      success: true,
      data: session.generated_packages
    });
  }));

  /**
   * Select a package tier
   * POST /api/package-builder/sessions/:uuid/select
   */
  router.post('/sessions/:uuid/select', authenticate, asyncHandler(async (req, res) => {
    const { uuid } = req.params;
    const { tier } = req.body;

    if (!tier || !['good', 'better', 'best'].includes(tier)) {
      throw ApiError.badRequest('tier must be one of: good, better, best');
    }

    const session = await builderService.completeSession(uuid, tier);

    res.json({
      success: true,
      data: session,
      message: `Selected ${tier} tier package`
    });
  }));

  /**
   * Add selected package to quote
   * POST /api/package-builder/sessions/:uuid/add-to-quote
   */
  router.post('/sessions/:uuid/add-to-quote', authenticate, asyncHandler(async (req, res) => {
    const { uuid } = req.params;
    const { quote_id } = req.body;

    const session = await builderService.getSession(uuid);
    if (!session) {
      throw ApiError.notFound('Session');
    }

    if (!session.selected_tier || !session.generated_packages) {
      throw ApiError.badRequest('Must select a package tier first');
    }

    // Get the selected package
    const generatedData = typeof session.generated_packages === 'string'
      ? JSON.parse(session.generated_packages)
      : session.generated_packages;

    // The generated data has structure: { packages: { good, better, best }, errors, warnings, ... }
    const packages = generatedData.packages || generatedData;

    // Normalize tier to lowercase in case it's stored as uppercase
    const tierKey = session.selected_tier?.toLowerCase();
    const selectedPackage = packages[tierKey];

    if (!selectedPackage) {
      throw ApiError.badRequest('Selected package not found');
    }

    // Transform to quote items format
    const quoteItems = selectedPackage.items.map(item => ({
      product_id: item.product.id,
      manufacturer: item.product.manufacturer,
      model: item.product.model,
      description: item.product.description || item.product.name,
      category: item.product.category,
      quantity: 1,
      cost_cents: item.product.cost_cents || 0,
      msrp_cents: item.product.msrp_cents || 0,
      sell_cents: item.product.msrp_cents || 0,
      item_notes: `Package: ${session.selected_tier.toUpperCase()} - ${item.slot_label}`
    }));

    // Calculate totals
    const subtotal_cents = quoteItems.reduce((sum, item) => sum + item.sell_cents, 0);
    const bundle_discount_cents = selectedPackage.bundle_savings_cents || 0;

    // Link session to quote if provided
    if (quote_id) {
      await builderService.linkToQuote(uuid, quote_id);
    }

    res.json({
      success: true,
      data: {
        items: quoteItems,
        subtotal_cents,
        bundle_discount_cents,
        tier: session.selected_tier,
        brand_cohesion_score: selectedPackage.brand_cohesion_score
      },
      message: 'Package items ready to add to quote'
    });
  }));

  // ============================================
  // PRODUCT ALTERNATIVES (for swapping)
  // ============================================

  /**
   * Find alternative products for a slot
   * GET /api/package-builder/alternatives/:productId
   */
  router.get('/alternatives/:productId', authenticate, asyncHandler(async (req, res) => {
    const { productId } = req.params;
    const { category, tier, session_uuid } = req.query;

    if (!category || !tier) {
      throw ApiError.badRequest('category and tier query params required');
    }

    let answers = {};
    if (session_uuid) {
      const session = await builderService.getSession(session_uuid);
      if (session) {
        answers = session.answers || {};
      }
    }

    const alternatives = await selectionEngine.findAlternatives(
      parseInt(productId),
      category,
      tier,
      answers
    );

    res.json({
      success: true,
      data: alternatives
    });
  }));

  // ============================================
  // BUNDLE DISCOUNT
  // ============================================

  /**
   * Calculate bundle discount for items
   * POST /api/package-builder/calculate-discount
   */
  router.post('/calculate-discount', authenticate, asyncHandler(async (req, res) => {
    const { items } = req.body;

    if (!Array.isArray(items)) {
      throw ApiError.badRequest('items array is required');
    }

    const discount = await builderService.calculateBundleDiscount(items);

    res.json({
      success: true,
      data: discount
    });
  }));

  // ============================================
  // STATISTICS
  // ============================================

  /**
   * Get package builder stats
   * GET /api/package-builder/stats
   */
  router.get('/stats', authenticate, asyncHandler(async (req, res) => {
    const stats = await builderService.getStats();

    res.json({
      success: true,
      data: stats
    });
  }));

  // ============================================
  // PRODUCT EXTENDED ATTRIBUTES
  // ============================================

  /**
   * Get extended attributes for a product
   * GET /api/package-builder/products/:productId/attributes
   */
  router.get('/products/:productId/attributes', authenticate, asyncHandler(async (req, res) => {
    const { productId } = req.params;
    const attributes = await builderService.getProductAttributes(parseInt(productId));

    res.json({
      success: true,
      data: attributes
    });
  }));

  /**
   * Update extended attributes for a product
   * PUT /api/package-builder/products/:productId/attributes
   */
  router.put('/products/:productId/attributes', authenticate, asyncHandler(async (req, res) => {
    const { productId } = req.params;
    const attributes = req.body;

    const result = await builderService.upsertProductAttributes(parseInt(productId), attributes);

    res.json({
      success: true,
      data: result,
      message: 'Product attributes updated'
    });
  }));

  /**
   * Bulk update product attributes
   * POST /api/package-builder/products/bulk-attributes
   */
  router.post('/products/bulk-attributes', authenticate, asyncHandler(async (req, res) => {
    const { attributes } = req.body;

    if (!Array.isArray(attributes)) {
      throw ApiError.badRequest('attributes array is required');
    }

    const result = await builderService.bulkUpdateAttributes(attributes);

    res.json({
      success: true,
      data: result,
      message: `Updated ${result.success} products, ${result.failed} failed`
    });
  }));

  return router;
};
