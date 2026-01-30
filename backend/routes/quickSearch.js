/**
 * Quick Search API Routes
 *
 * Provides endpoints for:
 * - Universal product search with filters
 * - Filter options with counts
 * - Quick filter presets
 * - Product status management
 * - Floor price management
 */

const express = require('express');
const router = express.Router();
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate, requireRole } = require('../middleware/auth');
const QuickSearchService = require('../services/QuickSearchService');

module.exports = (pool, cache) => {
  const quickSearchService = new QuickSearchService(pool, cache);

  /**
   * GET /api/quick-search
   * Universal search with filters
   *
   * Query params:
   * - q: Search query
   * - page: Page number (default 1)
   * - limit: Results per page (default 24, max 100)
   * - sortBy: relevance, price_low, price_high, discount, stock, sellability, newest, margin
   * - sortOrder: ASC or DESC
   * - productStatus[]: Array of statuses (normal, clearance, discontinued, end_of_line)
   * - brands[]: Array of manufacturer names
   * - categoryId: Category ID
   * - minPrice: Minimum price in dollars
   * - maxPrice: Maximum price in dollars
   * - stockStatus: in_stock, low_stock, overstock, out_of_stock, last_pieces
   * - colors[]: Array of color/finish values
   * - energyStar: true/false
   * - smartEnabled: true/false
   * - onSale: true/false
   * - minCapacity: Minimum capacity (cu ft)
   * - maxCapacity: Maximum capacity (cu ft)
   */
  router.get('/', authenticate, asyncHandler(async (req, res) => {
    const {
      q: query = '',
      page = 1,
      limit = 24,
      sortBy = 'relevance',
      sortOrder = 'DESC',
      ...filterParams
    } = req.query;

    // Parse filter parameters
    const filters = {};

    // Product status filter
    if (filterParams.productStatus) {
      filters.productStatus = Array.isArray(filterParams.productStatus)
        ? filterParams.productStatus
        : [filterParams.productStatus];
    }

    // Brand filter
    if (filterParams.brands) {
      filters.brands = Array.isArray(filterParams.brands)
        ? filterParams.brands
        : [filterParams.brands];
    }

    // Category filter
    if (filterParams.categoryId) {
      filters.categoryId = filterParams.categoryId;
    }

    // Price range
    if (filterParams.minPrice) {
      filters.minPrice = filterParams.minPrice;
    }
    if (filterParams.maxPrice) {
      filters.maxPrice = filterParams.maxPrice;
    }

    // Stock status
    if (filterParams.stockStatus) {
      filters.stockStatus = filterParams.stockStatus;
    }

    // Colors
    if (filterParams.colors) {
      filters.colors = Array.isArray(filterParams.colors)
        ? filterParams.colors
        : [filterParams.colors];
    }

    // Energy Star
    if (filterParams.energyStar === 'true' || filterParams.energyStar === true) {
      filters.energyStar = true;
    }

    // Smart/WiFi
    if (filterParams.smartEnabled === 'true' || filterParams.smartEnabled === true) {
      filters.smartEnabled = true;
    }

    // On sale
    if (filterParams.onSale === 'true' || filterParams.onSale === true) {
      filters.onSale = true;
    }

    // Capacity
    if (filterParams.minCapacity) {
      filters.minCapacity = filterParams.minCapacity;
    }
    if (filterParams.maxCapacity) {
      filters.maxCapacity = filterParams.maxCapacity;
    }

    // Get user role for pricing visibility
    const userRole = req.user?.role || 'user';

    // Perform search
    const result = await quickSearchService.universalSearch(
      query,
      filters,
      userRole,
      {
        page: parseInt(page) || 1,
        limit: Math.min(parseInt(limit) || 24, 100),
        sortBy,
        sortOrder
      }
    );

    res.json(result);
  }));

  /**
   * GET /api/quick-search/filters
   * Get filter options with counts
   *
   * Returns counts for:
   * - Brands
   * - Product statuses
   * - Categories
   * - Colors
   * - Price range
   */
  router.get('/filters', authenticate, asyncHandler(async (req, res) => {
    // Parse current filters to calculate counts relative to them
    const baseFilters = {};

    if (req.query.brands) {
      baseFilters.brands = Array.isArray(req.query.brands)
        ? req.query.brands
        : [req.query.brands];
    }

    if (req.query.categoryId) {
      baseFilters.categoryId = req.query.categoryId;
    }

    if (req.query.productStatus) {
      baseFilters.productStatus = Array.isArray(req.query.productStatus)
        ? req.query.productStatus
        : [req.query.productStatus];
    }

    const filterCounts = await quickSearchService.getFilterCounts(baseFilters);
    res.json(filterCounts);
  }));

  /**
   * GET /api/quick-search/presets
   * Get quick filter presets
   *
   * Returns predefined filter combinations like:
   * - Best Deals
   * - Budget Picks
   * - New Arrivals
   * - Aging Stock
   */
  router.get('/presets', authenticate, asyncHandler(async (req, res) => {
    const presets = await quickSearchService.getFilterPresets();
    res.json(presets);
  }));

  /**
   * PUT /api/products/:id/status
   * Update product status
   * Requires: Manager or Admin role
   *
   * Body:
   * - status: 'normal' | 'clearance' | 'discontinued' | 'end_of_line'
   * - reason: Optional reason for status change
   */
  router.put('/products/:id/status',
    authenticate,
    requireRole(['manager', 'admin']),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const { status, reason } = req.body;

      if (!status) {
        throw new ApiError('Status is required', 400);
      }

      const validStatuses = ['normal', 'clearance', 'discontinued', 'end_of_line'];
      if (!validStatuses.includes(status)) {
        throw new ApiError(`Invalid status. Must be one of: ${validStatuses.join(', ')}`, 400);
      }

      const product = await quickSearchService.updateProductStatus(
        parseInt(id),
        status,
        reason || null,
        req.user.id
      );

      res.json({
        success: true,
        message: `Product status updated to ${status}`,
        product
      });
    })
  );

  /**
   * PUT /api/products/:id/floor-price
   * Set floor price for negotiation
   * Requires: Admin role only
   *
   * Body:
   * - floorPrice: Floor price in dollars
   * - expiryDate: Optional expiry date (ISO format)
   */
  router.put('/products/:id/floor-price',
    authenticate,
    requireRole(['admin']),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const { floorPrice, expiryDate } = req.body;

      if (floorPrice === undefined || floorPrice === null) {
        throw new ApiError('Floor price is required', 400);
      }

      if (floorPrice < 0) {
        throw new ApiError('Floor price cannot be negative', 400);
      }

      const floorPriceCents = Math.round(parseFloat(floorPrice) * 100);

      const product = await quickSearchService.setFloorPrice(
        parseInt(id),
        floorPriceCents,
        expiryDate || null,
        req.user.id
      );

      res.json({
        success: true,
        message: 'Floor price updated',
        product
      });
    })
  );

  /**
   * PUT /api/products/:id/clearance-price
   * Set clearance price and mark product as clearance
   * Requires: Manager or Admin role
   *
   * Body:
   * - clearancePrice: Clearance price in dollars
   * - reason: Reason for clearance
   */
  router.put('/products/:id/clearance-price',
    authenticate,
    requireRole(['manager', 'admin']),
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const { clearancePrice, reason } = req.body;

      if (clearancePrice === undefined || clearancePrice === null) {
        throw new ApiError('Clearance price is required', 400);
      }

      if (clearancePrice < 0) {
        throw new ApiError('Clearance price cannot be negative', 400);
      }

      const clearancePriceCents = Math.round(parseFloat(clearancePrice) * 100);

      const product = await quickSearchService.setClearancePrice(
        parseInt(id),
        clearancePriceCents,
        reason || 'Marked for clearance',
        req.user.id
      );

      res.json({
        success: true,
        message: 'Product marked for clearance',
        product
      });
    })
  );

  /**
   * GET /api/quick-search/sellability/:id
   * Get sellability score breakdown for a product
   */
  router.get('/sellability/:id', authenticate, asyncHandler(async (req, res) => {
    const { id } = req.params;

    // Get product
    const productResult = await pool.query(`
      SELECT *
      FROM products
      WHERE id = $1
    `, [parseInt(id)]);

    if (productResult.rows.length === 0) {
      throw new ApiError('Product not found', 404);
    }

    const product = productResult.rows[0];
    const sellability = quickSearchService.calculateSellabilityScore(product);

    res.json({
      productId: product.id,
      model: product.model,
      ...sellability
    });
  }));

  return router;
};
