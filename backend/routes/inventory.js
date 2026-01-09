/**
 * Inventory API Routes
 * Handles inventory management, reservations, and stock tracking
 * Uses consistent error handling with asyncHandler and ApiError
 */

const express = require('express');
const router = express.Router();
const { ApiError, asyncHandler } = require('../middleware/errorHandler');

module.exports = (pool, cache, inventoryService) => {

  /**
   * GET /api/inventory/summary
   * Get inventory summary stats
   */
  router.get('/summary', asyncHandler(async (req, res) => {
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
    res.json(summary.rows[0]);
  }));

  /**
   * GET /api/inventory/low-stock
   * Get low stock products
   */
  router.get('/low-stock', asyncHandler(async (req, res) => {
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
   * GET /api/inventory/reservations
   * Get inventory reservations
   */
  router.get('/reservations', asyncHandler(async (req, res) => {
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
  router.get('/:productId', asyncHandler(async (req, res) => {
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
  router.get('/reservations/list', asyncHandler(async (req, res) => {
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
  router.post('/reserve', asyncHandler(async (req, res) => {
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
  router.delete('/reservations/:quotationId', asyncHandler(async (req, res) => {
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
  router.post('/check', asyncHandler(async (req, res) => {
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
  router.post('/sync', asyncHandler(async (req, res) => {
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
  router.get('/alerts/low-stock', asyncHandler(async (req, res) => {
    const products = await inventoryService.getLowStockProducts(
      parseInt(req.query.threshold) || 5
    );

    res.json(products);
  }));

  /**
   * POST /api/inventory/adjust/:productId
   * Manually adjust stock quantity
   */
  router.post('/adjust/:productId', asyncHandler(async (req, res) => {
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
  router.post('/process-expired', asyncHandler(async (req, res) => {
    const count = await inventoryService.processExpiredReservations();
    res.json({ processed: count });
  }));

  return router;
};
