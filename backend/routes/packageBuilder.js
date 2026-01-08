/**
 * Package Builder API Routes
 * Endpoints for the guided package builder wizard
 */

const express = require('express');
const router = express.Router();

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
  router.get('/questionnaires', async (req, res) => {
    try {
      const questionnaires = await builderService.listQuestionnaires();
      res.json({
        success: true,
        data: questionnaires
      });
    } catch (err) {
      console.error('Error fetching questionnaires:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * Get questionnaire by type with all questions
   * GET /api/package-builder/questionnaires/:type
   */
  router.get('/questionnaires/:type', async (req, res) => {
    try {
      const { type } = req.params;
      const questionnaire = await builderService.getQuestionnaire(type);

      if (!questionnaire) {
        return res.status(404).json({
          success: false,
          error: `No active questionnaire found for type: ${type}`
        });
      }

      res.json({
        success: true,
        data: questionnaire
      });
    } catch (err) {
      console.error('Error fetching questionnaire:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ============================================
  // SESSION ENDPOINTS
  // ============================================

  /**
   * Create a new package building session
   * POST /api/package-builder/sessions
   */
  router.post('/sessions', async (req, res) => {
    try {
      const { package_type, customer_id } = req.body;

      if (!package_type) {
        return res.status(400).json({
          success: false,
          error: 'package_type is required (kitchen or laundry)'
        });
      }

      const session = await builderService.createSession(package_type, customer_id);

      res.status(201).json({
        success: true,
        data: session,
        message: 'Package building session created'
      });
    } catch (err) {
      console.error('Error creating session:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * Get session by UUID
   * GET /api/package-builder/sessions/:uuid
   */
  router.get('/sessions/:uuid', async (req, res) => {
    try {
      const { uuid } = req.params;
      const session = await builderService.getSession(uuid);

      if (!session) {
        return res.status(404).json({
          success: false,
          error: 'Session not found'
        });
      }

      res.json({
        success: true,
        data: session
      });
    } catch (err) {
      console.error('Error fetching session:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * Update session answers
   * PUT /api/package-builder/sessions/:uuid/answers
   */
  router.put('/sessions/:uuid/answers', async (req, res) => {
    try {
      const { uuid } = req.params;
      const { answers } = req.body;

      if (!answers || typeof answers !== 'object') {
        return res.status(400).json({
          success: false,
          error: 'answers object is required'
        });
      }

      const session = await builderService.updateAnswers(uuid, answers);

      res.json({
        success: true,
        data: session,
        message: 'Answers updated'
      });
    } catch (err) {
      console.error('Error updating answers:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * Generate package recommendations
   * POST /api/package-builder/sessions/:uuid/generate
   */
  router.post('/sessions/:uuid/generate', async (req, res) => {
    try {
      const { uuid } = req.params;

      // Get session with answers
      const session = await builderService.getSession(uuid);
      if (!session) {
        return res.status(404).json({
          success: false,
          error: 'Session not found'
        });
      }

      // Get template for this package type
      const template = await builderService.getTemplate(session.package_type);
      if (!template) {
        return res.status(404).json({
          success: false,
          error: `No template found for package type: ${session.package_type}`
        });
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
    } catch (err) {
      console.error('Error generating packages:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * Get generated packages from session
   * GET /api/package-builder/sessions/:uuid/packages
   */
  router.get('/sessions/:uuid/packages', async (req, res) => {
    try {
      const { uuid } = req.params;
      const session = await builderService.getSession(uuid);

      if (!session) {
        return res.status(404).json({
          success: false,
          error: 'Session not found'
        });
      }

      if (!session.generated_packages) {
        return res.status(400).json({
          success: false,
          error: 'Packages not yet generated. Call POST /generate first.'
        });
      }

      res.json({
        success: true,
        data: session.generated_packages
      });
    } catch (err) {
      console.error('Error fetching packages:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * Select a package tier
   * POST /api/package-builder/sessions/:uuid/select
   */
  router.post('/sessions/:uuid/select', async (req, res) => {
    try {
      const { uuid } = req.params;
      const { tier } = req.body;

      if (!tier || !['good', 'better', 'best'].includes(tier)) {
        return res.status(400).json({
          success: false,
          error: 'tier must be one of: good, better, best'
        });
      }

      const session = await builderService.completeSession(uuid, tier);

      res.json({
        success: true,
        data: session,
        message: `Selected ${tier} tier package`
      });
    } catch (err) {
      console.error('Error selecting tier:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * Add selected package to quote
   * POST /api/package-builder/sessions/:uuid/add-to-quote
   */
  router.post('/sessions/:uuid/add-to-quote', async (req, res) => {
    try {
      const { uuid } = req.params;
      const { quote_id } = req.body;

      const session = await builderService.getSession(uuid);
      if (!session) {
        return res.status(404).json({
          success: false,
          error: 'Session not found'
        });
      }

      if (!session.selected_tier || !session.generated_packages) {
        return res.status(400).json({
          success: false,
          error: 'Must select a package tier first'
        });
      }

      // Get the selected package
      const generatedData = typeof session.generated_packages === 'string'
        ? JSON.parse(session.generated_packages)
        : session.generated_packages;

      console.log('DEBUG add-to-quote:', {
        selected_tier: session.selected_tier,
        generatedDataType: typeof generatedData,
        generatedDataKeys: generatedData ? Object.keys(generatedData) : 'null',
        hasPackagesProp: generatedData?.packages ? 'yes' : 'no',
        packagesKeys: generatedData?.packages ? Object.keys(generatedData.packages) : 'N/A'
      });

      // The generated data has structure: { packages: { good, better, best }, errors, warnings, ... }
      const packages = generatedData.packages || generatedData;

      // Normalize tier to lowercase in case it's stored as uppercase
      const tierKey = session.selected_tier?.toLowerCase();
      const selectedPackage = packages[tierKey];

      if (!selectedPackage) {
        console.error('Selected package not found:', {
          selected_tier: session.selected_tier,
          tierKey,
          availableKeys: Object.keys(packages || {}),
          generatedDataKeys: Object.keys(generatedData || {}),
          packagesType: typeof packages
        });
        return res.status(400).json({
          success: false,
          error: 'Selected package not found',
          debug: {
            selected_tier: session.selected_tier,
            tierKey,
            availableKeys: Object.keys(packages || {}),
            generatedDataKeys: Object.keys(generatedData || {})
          }
        });
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
    } catch (err) {
      console.error('Error adding to quote:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ============================================
  // PRODUCT ALTERNATIVES (for swapping)
  // ============================================

  /**
   * Find alternative products for a slot
   * GET /api/package-builder/alternatives/:productId
   */
  router.get('/alternatives/:productId', async (req, res) => {
    try {
      const { productId } = req.params;
      const { category, tier, session_uuid } = req.query;

      if (!category || !tier) {
        return res.status(400).json({
          success: false,
          error: 'category and tier query params required'
        });
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
    } catch (err) {
      console.error('Error finding alternatives:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ============================================
  // BUNDLE DISCOUNT
  // ============================================

  /**
   * Calculate bundle discount for items
   * POST /api/package-builder/calculate-discount
   */
  router.post('/calculate-discount', async (req, res) => {
    try {
      const { items } = req.body;

      if (!Array.isArray(items)) {
        return res.status(400).json({
          success: false,
          error: 'items array is required'
        });
      }

      const discount = await builderService.calculateBundleDiscount(items);

      res.json({
        success: true,
        data: discount
      });
    } catch (err) {
      console.error('Error calculating discount:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ============================================
  // STATISTICS
  // ============================================

  /**
   * Get package builder stats
   * GET /api/package-builder/stats
   */
  router.get('/stats', async (req, res) => {
    try {
      const stats = await builderService.getStats();

      res.json({
        success: true,
        data: stats
      });
    } catch (err) {
      console.error('Error fetching stats:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ============================================
  // PRODUCT EXTENDED ATTRIBUTES
  // ============================================

  /**
   * Get extended attributes for a product
   * GET /api/package-builder/products/:productId/attributes
   */
  router.get('/products/:productId/attributes', async (req, res) => {
    try {
      const { productId } = req.params;
      const attributes = await builderService.getProductAttributes(parseInt(productId));

      res.json({
        success: true,
        data: attributes
      });
    } catch (err) {
      console.error('Error fetching attributes:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * Update extended attributes for a product
   * PUT /api/package-builder/products/:productId/attributes
   */
  router.put('/products/:productId/attributes', async (req, res) => {
    try {
      const { productId } = req.params;
      const attributes = req.body;

      const result = await builderService.upsertProductAttributes(parseInt(productId), attributes);

      res.json({
        success: true,
        data: result,
        message: 'Product attributes updated'
      });
    } catch (err) {
      console.error('Error updating attributes:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  /**
   * Bulk update product attributes
   * POST /api/package-builder/products/bulk-attributes
   */
  router.post('/products/bulk-attributes', async (req, res) => {
    try {
      const { attributes } = req.body;

      if (!Array.isArray(attributes)) {
        return res.status(400).json({
          success: false,
          error: 'attributes array is required'
        });
      }

      const result = await builderService.bulkUpdateAttributes(attributes);

      res.json({
        success: true,
        data: result,
        message: `Updated ${result.success} products, ${result.failed} failed`
      });
    } catch (err) {
      console.error('Error bulk updating attributes:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  console.log('✅ Package builder routes loaded');
  return router;
};
