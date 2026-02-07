/**
 * TeleTime POS - Warranty Routes
 * API endpoints for warranty products, eligibility, and sales
 */

const express = require('express');
const router = express.Router();

/**
 * Initialize routes with service
 * @param {WarrantyService} warrantyService
 */
module.exports = function (warrantyService) {
  // ============================================================================
  // WARRANTY ELIGIBILITY
  // ============================================================================

  /**
   * GET /api/warranty/eligible/:productId
   * Get eligible warranties for a product
   */
  router.get('/eligible/:productId', async (req, res) => {
    try {
      const { productId } = req.params;
      const { price, saleContext } = req.query;

      const productPrice = price ? parseFloat(price) : null;

      const result = await warrantyService.getEligibleWarranties(
        parseInt(productId),
        productPrice,
        saleContext || 'at_sale'
      );

      if (!result.success) {
        return res.status(400).json(result);
      }

      // Filter out internal margin data for external API
      if (result.warranties) {
        result.warranties = result.warranties.map((w) => {
          const { margin, marginPercent, ...publicData } = w;
          return publicData;
        });
      }

      res.json(result);
    } catch (error) {
      console.error('[Warranty] Get eligible error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * POST /api/warranty/eligible
   * Get eligible warranties for multiple products (batch)
   */
  router.post('/eligible', async (req, res) => {
    try {
      const { products, saleContext } = req.body;

      if (!products || !Array.isArray(products)) {
        return res.status(400).json({
          success: false,
          error: 'products array is required',
        });
      }

      const results = await Promise.all(
        products.map(async (p) => {
          const result = await warrantyService.getEligibleWarranties(
            p.productId,
            p.price,
            saleContext || 'at_sale'
          );

          // Filter out margin data
          if (result.warranties) {
            result.warranties = result.warranties.map((w) => {
              const { margin, marginPercent, ...publicData } = w;
              return publicData;
            });
          }

          return result;
        })
      );

      res.json({
        success: true,
        results,
      });
    } catch (error) {
      console.error('[Warranty] Batch eligible error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  // ============================================================================
  // PRICE CALCULATION
  // ============================================================================

  /**
   * GET /api/warranty/calculate/:warrantyId
   * Calculate warranty price for a product price
   */
  router.get('/calculate/:warrantyId', async (req, res) => {
    try {
      const { warrantyId } = req.params;
      const { productPrice } = req.query;

      if (!productPrice) {
        return res.status(400).json({
          success: false,
          error: 'productPrice query parameter is required',
        });
      }

      const result = await warrantyService.calculateWarrantyPrice(
        parseInt(warrantyId),
        parseFloat(productPrice)
      );

      if (!result.success) {
        return res.status(400).json(result);
      }

      // Filter out internal data
      const { cost, margin, marginPercent, ...publicData } = result;

      res.json(publicData);
    } catch (error) {
      console.error('[Warranty] Calculate price error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  // ============================================================================
  // WARRANTY PURCHASE
  // ============================================================================

  /**
   * POST /api/warranty/add-to-order
   * Add warranty to a transaction/order
   */
  router.post('/add-to-order', async (req, res) => {
    try {
      const {
        transactionId,
        orderId,
        coveredItemId,
        warrantyProductId,
        customerId,
      } = req.body;

      if (!coveredItemId || !warrantyProductId) {
        return res.status(400).json({
          success: false,
          error: 'coveredItemId and warrantyProductId are required',
        });
      }

      if (!transactionId && !orderId) {
        return res.status(400).json({
          success: false,
          error: 'transactionId or orderId is required',
        });
      }

      const result = await warrantyService.addWarrantyToOrder({
        transactionId,
        orderId,
        coveredItemId,
        warrantyProductId,
        customerId,
      });

      if (!result.success) {
        return res.status(400).json(result);
      }

      res.status(201).json(result);
    } catch (error) {
      console.error('[Warranty] Add to order error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  // ============================================================================
  // UPSELL SCRIPTS
  // ============================================================================

  /**
   * POST /api/warranty/upsell-script
   * Get sales script for a product
   */
  router.post('/upsell-script', async (req, res) => {
    try {
      const { product } = req.body;

      if (!product || (!product.id && !product.productId)) {
        return res.status(400).json({
          success: false,
          error: 'product object with id is required',
        });
      }

      const result = await warrantyService.getWarrantyUpsellScript(product);

      if (!result.success) {
        return res.status(400).json(result);
      }

      res.json(result);
    } catch (error) {
      console.error('[Warranty] Upsell script error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * GET /api/warranty/upsell-script/:productId
   * Get sales script by product ID
   */
  router.get('/upsell-script/:productId', async (req, res) => {
    try {
      const { productId } = req.params;
      const { price, name, category } = req.query;

      const product = {
        id: parseInt(productId),
        price: price ? parseFloat(price) : undefined,
        name: name || undefined,
        category: category || undefined,
      };

      const result = await warrantyService.getWarrantyUpsellScript(product);

      if (!result.success) {
        return res.status(400).json(result);
      }

      res.json(result);
    } catch (error) {
      console.error('[Warranty] Upsell script error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  // ============================================================================
  // DECLINE TRACKING
  // ============================================================================

  /**
   * POST /api/warranty/decline
   * Track warranty decline for analytics
   */
  router.post('/decline', async (req, res) => {
    try {
      const {
        productId,
        transactionId,
        warrantyOffered,
        declineReason,
      } = req.body;

      if (!productId) {
        return res.status(400).json({
          success: false,
          error: 'productId is required',
        });
      }

      const result = await warrantyService.trackWarrantyDecline({
        productId,
        transactionId,
        warrantyOffered,
        declineReason,
        cashierId: req.user?.id,
      });

      res.json(result);
    } catch (error) {
      console.error('[Warranty] Decline tracking error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  // ============================================================================
  // WARRANTY LOOKUP
  // ============================================================================

  /**
   * GET /api/warranty/lookup/:code
   * Look up warranty by registration code
   */
  router.get('/lookup/:code', async (req, res) => {
    try {
      const { code } = req.params;

      const result = await warrantyService.getWarrantyByCode(code);

      if (!result.success) {
        return res.status(404).json(result);
      }

      res.json(result);
    } catch (error) {
      console.error('[Warranty] Lookup error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  // ============================================================================
  // ANALYTICS (Admin)
  // ============================================================================

  /**
   * GET /api/warranty/analytics
   * Get warranty sales analytics
   */
  router.get('/analytics', async (req, res) => {
    try {
      const {
        startDate,
        endDate,
        warrantyType,
      } = req.query;

      // Default to last 30 days
      const end = endDate ? new Date(endDate) : new Date();
      const start = startDate
        ? new Date(startDate)
        : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

      const result = await warrantyService.getWarrantyAnalytics({
        startDate: start,
        endDate: end,
        warrantyType,
      });

      if (!result.success) {
        return res.status(400).json(result);
      }

      res.json(result);
    } catch (error) {
      console.error('[Warranty] Analytics error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  // ============================================================================
  // CUSTOMER WARRANTY LOOKUP
  // ============================================================================

  /**
   * GET /api/warranty/customer/:customerId
   * Get all warranties for a customer
   */
  router.get('/customer/:customerId', async (req, res) => {
    try {
      const { customerId } = req.params;
      const { status, includeExpired } = req.query;

      const result = await warrantyService.getCustomerWarranties(
        parseInt(customerId),
        {
          status,
          includeExpired: includeExpired === 'true',
        }
      );

      if (!result.success) {
        return res.status(400).json(result);
      }

      res.json(result);
    } catch (error) {
      console.error('[Warranty] Customer warranties error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * GET /api/warranty/expiring
   * Get warranties expiring soon (for proactive renewal offers)
   */
  router.get('/expiring', async (req, res) => {
    try {
      const { days } = req.query;
      const daysThreshold = days ? parseInt(days) : 30;

      const result = await warrantyService.getExpiringWarranties(daysThreshold);

      if (!result.success) {
        return res.status(400).json(result);
      }

      res.json(result);
    } catch (error) {
      console.error('[Warranty] Expiring warranties error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  // ============================================================================
  // WARRANTY PRODUCTS MANAGEMENT
  // ============================================================================

  /**
   * GET /api/warranty/products
   * List all warranty products
   */
  router.get('/products', async (req, res) => {
    try {
      const { active } = req.query;

      let whereClause = '';
      if (active !== undefined) {
        whereClause = `WHERE wp.is_active = ${active === 'true'}`;
      }

      const query = `
        SELECT
          wp.*,
          p.name as product_name,
          p.sku,
          p.price,
          p.cost
        FROM warranty_products wp
        JOIN products p ON p.id = wp.product_id
        ${whereClause}
        ORDER BY wp.display_order, wp.duration_months
      `;

      const pool = warrantyService.pool;
      const result = await pool.query(query);

      res.json({
        success: true,
        warranties: result.rows.map((w) => ({
          id: w.id,
          productId: w.product_id,
          warrantyName: w.warranty_name,
          warrantyType: w.warranty_type,
          description: w.warranty_description,
          durationMonths: w.duration_months,
          priceType: w.price_type,
          priceValue: parseFloat(w.price_value),
          minProductPrice: parseFloat(w.min_product_price),
          maxProductPrice: parseFloat(w.max_product_price),
          coverageDetails: w.coverage_details,
          exclusions: w.exclusions,
          deductible: parseFloat(w.deductible_amount || 0),
          badge: w.badge_text,
          isFeatured: w.is_featured,
          isActive: w.is_active,
          displayOrder: w.display_order,
        })),
      });
    } catch (error) {
      console.error('[Warranty] List products error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  // ============================================================================
  // PROVIDER REGISTRATION TRACKING
  // ============================================================================

  /**
   * POST /api/warranty/register
   * Register a warranty purchase with Excelsior/Phoenix AMD
   */
  router.post('/register', async (req, res) => {
    try {
      const { warrantyPurchaseId, providerCode, providerSku } = req.body;

      if (!warrantyPurchaseId) {
        return res.status(400).json({
          success: false,
          error: 'warrantyPurchaseId is required',
        });
      }

      const pool = warrantyService.pool;

      const result = await pool.query(
        `INSERT INTO warranty_provider_registrations
          (warranty_purchase_id, provider_code, provider_sku, registration_status)
         VALUES ($1, $2, $3, 'pending')
         ON CONFLICT DO NOTHING
         RETURNING *`,
        [warrantyPurchaseId, providerCode || null, providerSku || null]
      );

      res.status(201).json({
        success: true,
        registration: result.rows[0] || null,
      });
    } catch (error) {
      console.error('[Warranty] Register error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * GET /api/warranty/registrations
   * List warranty registrations (for monthly Excelsior reporting)
   */
  router.get('/registrations', async (req, res) => {
    try {
      const { status, limit } = req.query;
      const pool = warrantyService.pool;

      let whereClause = '';
      const params = [];

      if (status) {
        params.push(status);
        whereClause = `WHERE r.registration_status = $${params.length}`;
      }

      const limitClause = limit ? `LIMIT ${parseInt(limit)}` : 'LIMIT 100';

      const query = `
        SELECT
          r.*,
          wp.warranty_name,
          wp.covered_product_name,
          wp.covered_product_serial,
          wp.warranty_price,
          wp.customer_name,
          wp.customer_email,
          wp.customer_phone,
          wp.coverage_start_date,
          wp.coverage_end_date
        FROM warranty_provider_registrations r
        JOIN warranty_purchases wp ON wp.id = r.warranty_purchase_id
        ${whereClause}
        ORDER BY r.created_at DESC
        ${limitClause}
      `;

      const result = await pool.query(query, params);

      res.json({
        success: true,
        registrations: result.rows,
        count: result.rows.length,
      });
    } catch (error) {
      console.error('[Warranty] Registrations error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  return router;
};
