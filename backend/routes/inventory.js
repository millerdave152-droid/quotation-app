/**
 * Inventory API Routes
 * Handles inventory management, reservations, and stock tracking
 * Uses consistent error handling with asyncHandler and ApiError
 */

const express = require('express');
const router = express.Router();
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate } = require('../middleware/auth');
const InventoryOptimizationService = require('../services/InventoryOptimizationService');

module.exports = (pool, cache, inventoryService) => {
  // Initialize optimization service
  const optimizationService = new InventoryOptimizationService(pool);

  /**
   * GET /api/inventory/summary
   * Get inventory summary stats
   */
  router.get('/summary', authenticate, asyncHandler(async (req, res) => {
    const summary = await pool.query(`
      SELECT
        COUNT(*) as total_products,
        SUM(CASE WHEN COALESCE(qty_on_hand, 0) > 5 THEN 1 ELSE 0 END) as in_stock,
        SUM(CASE WHEN COALESCE(qty_on_hand, 0) > 0 AND COALESCE(qty_on_hand, 0) <= 5 THEN 1 ELSE 0 END) as low_stock,
        SUM(CASE WHEN COALESCE(qty_on_hand, 0) = 0 THEN 1 ELSE 0 END) as out_of_stock,
        COALESCE(SUM(qty_reserved), 0) as total_reserved
      FROM products
      WHERE active = true
    `);
    res.json(summary.rows[0] || { total_products: 0, in_stock: 0, low_stock: 0, out_of_stock: 0, total_reserved: 0 });
  }));

  /**
   * GET /api/inventory/low-stock
   * Get low stock products
   */
  router.get('/low-stock', authenticate, asyncHandler(async (req, res) => {
    const threshold = parseInt(req.query.threshold) || 5;
    const products = await pool.query(`
      SELECT id, model, manufacturer, name,
             COALESCE(qty_on_hand, 0) as qty_on_hand,
             COALESCE(qty_reserved, 0) as qty_reserved,
             COALESCE(qty_on_hand, 0) - COALESCE(qty_reserved, 0) as qty_available
      FROM products
      WHERE active = true
        AND COALESCE(qty_on_hand, 0) <= $1
      ORDER BY COALESCE(qty_on_hand, 0) ASC
      LIMIT 50
    `, [threshold]);
    res.json(products.rows);
  }));

  /**
   * GET /api/inventory/products
   * Browse all products with stock quantities
   * Supports search, filtering by stock status, manufacturer, and pagination
   */
  router.get('/products', authenticate, asyncHandler(async (req, res) => {
    const {
      search = '',
      stockStatus = 'all',
      manufacturer = '',
      category = '',
      page = 1,
      limit = 25,
      sortBy = 'model',
      sortOrder = 'ASC'
    } = req.query;

    const pageNum = parseInt(page) || 1;
    const limitNum = Math.min(parseInt(limit) || 25, 100);
    const offset = (pageNum - 1) * limitNum;

    // Validate sort parameters
    const allowedSortFields = ['model', 'name', 'manufacturer', 'qty_on_hand', 'qty_available'];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : 'model';
    const sortDir = sortOrder.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    // Build WHERE clause
    const conditions = ['active = true'];
    const params = [];
    let paramIndex = 1;

    // Search filter
    if (search && search.trim()) {
      conditions.push(`(
        model ILIKE $${paramIndex} OR
        name ILIKE $${paramIndex} OR
        manufacturer ILIKE $${paramIndex}
      )`);
      params.push(`%${search.trim()}%`);
      paramIndex++;
    }

    // Stock status filter
    if (stockStatus === 'in_stock') {
      conditions.push(`COALESCE(qty_on_hand, 0) > 0`);
    } else if (stockStatus === 'low_stock') {
      conditions.push(`COALESCE(qty_on_hand, 0) > 0 AND COALESCE(qty_on_hand, 0) <= 5`);
    } else if (stockStatus === 'out_of_stock') {
      conditions.push(`COALESCE(qty_on_hand, 0) = 0`);
    }

    // Manufacturer filter
    if (manufacturer && manufacturer.trim()) {
      conditions.push(`UPPER(manufacturer) = $${paramIndex}`);
      params.push(manufacturer.trim().toUpperCase());
      paramIndex++;
    }

    // Category filter (uses master_category)
    if (category && category.trim()) {
      conditions.push(`master_category = $${paramIndex}`);
      params.push(category.trim());
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    // Get total count
    const countQuery = `SELECT COUNT(*) FROM products WHERE ${whereClause}`;
    const countResult = await pool.query(countQuery, params);
    const total = countResult.rows.length > 0 ? parseInt(countResult.rows[0].count) : 0;

    // Get products
    const sortExpression = sortField === 'qty_available'
      ? `(COALESCE(qty_on_hand, 0) - COALESCE(qty_reserved, 0))`
      : sortField;

    const productsQuery = `
      SELECT
        id, model, name, manufacturer, master_category,
        COALESCE(qty_on_hand, 0) as qty_on_hand,
        COALESCE(qty_reserved, 0) as qty_reserved,
        COALESCE(qty_on_hand, 0) - COALESCE(qty_reserved, 0) as qty_available,
        stock_status,
        cost_cents,
        msrp_cents,
        last_stock_sync,
        stock_sync_source
      FROM products
      WHERE ${whereClause}
      ORDER BY ${sortExpression} ${sortDir}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    params.push(limitNum, offset);

    const productsResult = await pool.query(productsQuery, params);

    // Get distinct manufacturers and categories for filter dropdowns
    const [manufacturersResult, categoriesResult] = await Promise.all([
      pool.query(`
        SELECT DISTINCT UPPER(manufacturer) as manufacturer
        FROM products
        WHERE active = true AND manufacturer IS NOT NULL AND manufacturer != ''
        ORDER BY manufacturer
      `),
      pool.query(`
        SELECT master_category, COUNT(*) as count
        FROM products
        WHERE active = true AND master_category IS NOT NULL
        GROUP BY master_category
        ORDER BY count DESC
      `)
    ]);

    res.json({
      products: productsResult.rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      },
      manufacturers: manufacturersResult.rows.map(r => r.manufacturer),
      categories: categoriesResult.rows.map(r => ({
        master_category: r.master_category,
        count: parseInt(r.count)
      }))
    });
  }));

  /**
   * GET /api/inventory/reservations
   * Get inventory reservations
   */
  router.get('/reservations', authenticate, asyncHandler(async (req, res) => {
    const { status, search, page = 1, limit = 50 } = req.query;
    let query = `
      SELECT ir.*, p.model, p.manufacturer, p.name as product_name,
             q.quote_number
      FROM inventory_reservations ir
      LEFT JOIN products p ON ir.product_id = p.id
      LEFT JOIN quotations q ON ir.quotation_id = q.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (status) {
      query += ` AND ir.status = $${paramIndex++}`;
      params.push(status);
    }

    if (search) {
      query += ` AND (p.model ILIKE $${paramIndex} OR p.manufacturer ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    query += ` ORDER BY ir.reserved_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
    params.push(parseInt(limit), (parseInt(page) - 1) * parseInt(limit));

    const result = await pool.query(query, params);
    res.json({ reservations: result.rows, pagination: { page: parseInt(page), limit: parseInt(limit) } });
  }));

  /**
   * GET /api/inventory/:productId
   * Get stock levels for a product
   */
  router.get('/:productId', authenticate, asyncHandler(async (req, res) => {
    const productId = parseInt(req.params.productId);

    if (isNaN(productId)) {
      throw ApiError.badRequest('Invalid product ID');
    }

    const availability = await inventoryService.getAvailability(productId);
    res.json(availability);
  }));

  /**
   * GET /api/inventory/reservations/list
   * List inventory reservations
   */
  router.get('/reservations/list', authenticate, asyncHandler(async (req, res) => {
    const reservations = await inventoryService.getReservations({
      quotationId: req.query.quotationId,
      orderId: req.query.orderId,
      productId: req.query.productId,
      status: req.query.status,
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 50
    });

    res.json(reservations);
  }));

  /**
   * POST /api/inventory/reserve
   * Create inventory reservation
   */
  router.post('/reserve', authenticate, asyncHandler(async (req, res) => {
    const { quotationId, items, createdBy, expiryHours } = req.body;

    if (!quotationId) {
      throw ApiError.badRequest('Quotation ID is required');
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      throw ApiError.badRequest('Items are required for reservation');
    }

    const reservations = await inventoryService.reserveStock(
      quotationId,
      items,
      createdBy || 'api',
      expiryHours || 72
    );

    res.status(201).json(reservations);
  }));

  /**
   * DELETE /api/inventory/reservations/:quotationId
   * Release reservations for a quotation
   */
  router.delete('/reservations/:quotationId', authenticate, asyncHandler(async (req, res) => {
    const quotationId = parseInt(req.params.quotationId);

    if (isNaN(quotationId)) {
      throw ApiError.badRequest('Invalid quotation ID');
    }

    const count = await inventoryService.releaseReservation(
      quotationId,
      req.body.reason || 'manual',
      req.body.releasedBy || 'api'
    );

    res.json({ released: count });
  }));

  /**
   * POST /api/inventory/check
   * Check stock availability for items
   */
  router.post('/check', authenticate, asyncHandler(async (req, res) => {
    if (!req.body.items || !Array.isArray(req.body.items)) {
      throw ApiError.badRequest('Items array is required');
    }

    const result = await inventoryService.checkStockForQuote(req.body.items);
    res.json(result);
  }));

  /**
   * POST /api/inventory/sync
   * Sync inventory from external system
   */
  router.post('/sync', authenticate, asyncHandler(async (req, res) => {
    if (!req.body.products || !Array.isArray(req.body.products)) {
      throw ApiError.badRequest('Products array is required');
    }

    const result = await inventoryService.syncFromERP(
      req.body.products,
      req.body.source || 'api_sync'
    );

    res.json(result);
  }));

  /**
   * GET /api/inventory/alerts/low-stock
   * Get low stock products (via service)
   */
  router.get('/alerts/low-stock', authenticate, asyncHandler(async (req, res) => {
    const products = await inventoryService.getLowStockProducts(
      parseInt(req.query.threshold) || 5
    );

    res.json(products);
  }));

  /**
   * POST /api/inventory/adjust/:productId
   * Manually adjust stock quantity
   */
  router.post('/adjust/:productId', authenticate, asyncHandler(async (req, res) => {
    const productId = parseInt(req.params.productId);

    if (isNaN(productId)) {
      throw ApiError.badRequest('Invalid product ID');
    }

    if (req.body.newQuantity === undefined || req.body.newQuantity < 0) {
      throw ApiError.badRequest('Valid new quantity is required');
    }

    const result = await inventoryService.adjustStock(
      productId,
      req.body.newQuantity,
      req.body.reason,
      req.body.adjustedBy || 'api'
    );

    res.json(result);
  }));

  /**
   * POST /api/inventory/process-expired
   * Process expired reservations (for scheduled job)
   */
  router.post('/process-expired', authenticate, asyncHandler(async (req, res) => {
    const count = await inventoryService.processExpiredReservations();
    res.json({ processed: count });
  }));

  // ============================================
  // INVENTORY OPTIMIZATION ROUTES
  // ============================================

  /**
   * GET /api/inventory/optimization/summary
   * Get inventory optimization summary with all key metrics
   */
  router.get('/optimization/summary', authenticate, asyncHandler(async (req, res) => {
    const summary = await optimizationService.getOptimizationSummary();
    res.json({ success: true, data: summary });
  }));

  /**
   * GET /api/inventory/optimization/health
   * Get stock health metrics
   */
  router.get('/optimization/health', authenticate, asyncHandler(async (req, res) => {
    const health = await optimizationService.getStockHealthMetrics();
    res.json({ success: true, data: health });
  }));

  /**
   * GET /api/inventory/optimization/reorder-needed
   * Get products that need reordering
   */
  router.get('/optimization/reorder-needed', authenticate, asyncHandler(async (req, res) => {
    const { limit = 50 } = req.query;
    const products = await optimizationService.getProductsNeedingReorder(parseInt(limit));
    res.json({ success: true, data: products });
  }));

  /**
   * GET /api/inventory/optimization/dead-stock
   * Get dead stock analysis
   */
  router.get('/optimization/dead-stock', authenticate, asyncHandler(async (req, res) => {
    const { limit = 50 } = req.query;
    const deadStock = await optimizationService.getDeadStock(parseInt(limit));
    res.json({ success: true, data: deadStock });
  }));

  /**
   * GET /api/inventory/optimization/top-demand
   * Get top demand products
   */
  router.get('/optimization/top-demand', authenticate, asyncHandler(async (req, res) => {
    const { limit = 10 } = req.query;
    const products = await optimizationService.getTopDemandProducts(parseInt(limit));
    res.json({ success: true, data: products });
  }));

  /**
   * GET /api/inventory/optimization/forecast/:productId
   * Get demand forecast for a product
   */
  router.get('/optimization/forecast/:productId', authenticate, asyncHandler(async (req, res) => {
    const productId = parseInt(req.params.productId);

    if (isNaN(productId)) {
      throw ApiError.badRequest('Invalid product ID');
    }

    const forecast = await optimizationService.calculateDemandForecast(productId);
    res.json({ success: true, data: forecast });
  }));

  /**
   * GET /api/inventory/optimization/reorder/:productId
   * Get reorder optimization for a product
   */
  router.get('/optimization/reorder/:productId', authenticate, asyncHandler(async (req, res) => {
    const productId = parseInt(req.params.productId);

    if (isNaN(productId)) {
      throw ApiError.badRequest('Invalid product ID');
    }

    const optimization = await optimizationService.calculateReorderOptimization(productId);

    if (!optimization) {
      throw ApiError.notFound('Product');
    }

    res.json({ success: true, data: optimization });
  }));

  /**
   * GET /api/inventory/optimization/turnover
   * Get inventory turnover analysis by category
   */
  router.get('/optimization/turnover', authenticate, asyncHandler(async (req, res) => {
    const { days = 365 } = req.query;
    const turnover = await optimizationService.getInventoryTurnover(parseInt(days));
    res.json({ success: true, data: turnover });
  }));

  /**
   * GET /api/inventory/optimization/abc-analysis
   * Get ABC analysis (Pareto classification)
   */
  router.get('/optimization/abc-analysis', authenticate, asyncHandler(async (req, res) => {
    const analysis = await optimizationService.getABCAnalysis();
    res.json({ success: true, data: analysis });
  }));

  /**
   * GET /api/inventory/optimization/po-suggestions
   * Generate purchase order suggestions
   */
  router.get('/optimization/po-suggestions', authenticate, asyncHandler(async (req, res) => {
    const suggestions = await optimizationService.generatePOSuggestions();
    res.json({ success: true, data: suggestions });
  }));

  return router;
};
