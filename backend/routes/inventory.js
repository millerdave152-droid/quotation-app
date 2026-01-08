/**
 * Inventory API Routes
 */

const express = require('express');
const router = express.Router();

module.exports = (pool, cache, inventoryService) => {

  /**
   * GET /api/inventory/summary
   * Get inventory summary stats
   */
  router.get('/summary', async (req, res) => {
    try {
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
    } catch (error) {
      console.error('Error fetching inventory summary:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/inventory/low-stock
   * Get low stock products
   */
  router.get('/low-stock', async (req, res) => {
    try {
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
    } catch (error) {
      console.error('Error fetching low stock:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/inventory/reservations
   * Get inventory reservations
   */
  router.get('/reservations', async (req, res) => {
    try {
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
    } catch (error) {
      console.error('Error fetching reservations:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/inventory/:productId
   * Get stock levels for a product
   */
  router.get('/:productId', async (req, res) => {
    try {
      const availability = await inventoryService.getAvailability(
        parseInt(req.params.productId)
      );

      res.json(availability);
    } catch (error) {
      console.error('Error fetching inventory:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/inventory/reservations
   * List inventory reservations
   */
  router.get('/reservations/list', async (req, res) => {
    try {
      const reservations = await inventoryService.getReservations({
        quotationId: req.query.quotationId,
        orderId: req.query.orderId,
        productId: req.query.productId,
        status: req.query.status,
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 50
      });

      res.json(reservations);
    } catch (error) {
      console.error('Error fetching reservations:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/inventory/reserve
   * Create inventory reservation
   */
  router.post('/reserve', async (req, res) => {
    try {
      const reservations = await inventoryService.reserveStock(
        req.body.quotationId,
        req.body.items,
        req.body.createdBy || 'api',
        req.body.expiryHours || 72
      );

      res.status(201).json(reservations);
    } catch (error) {
      console.error('Error creating reservation:', error);
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * DELETE /api/inventory/reservations/:quotationId
   * Release reservations for a quotation
   */
  router.delete('/reservations/:quotationId', async (req, res) => {
    try {
      const count = await inventoryService.releaseReservation(
        parseInt(req.params.quotationId),
        req.body.reason || 'manual',
        req.body.releasedBy || 'api'
      );

      res.json({ released: count });
    } catch (error) {
      console.error('Error releasing reservation:', error);
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * POST /api/inventory/check
   * Check stock availability for items
   */
  router.post('/check', async (req, res) => {
    try {
      const result = await inventoryService.checkStockForQuote(req.body.items);
      res.json(result);
    } catch (error) {
      console.error('Error checking stock:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/inventory/sync
   * Sync inventory from external system
   */
  router.post('/sync', async (req, res) => {
    try {
      const result = await inventoryService.syncFromERP(
        req.body.products,
        req.body.source || 'api_sync'
      );

      res.json(result);
    } catch (error) {
      console.error('Error syncing inventory:', error);
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * GET /api/inventory/low-stock
   * Get low stock products
   */
  router.get('/alerts/low-stock', async (req, res) => {
    try {
      const products = await inventoryService.getLowStockProducts(
        parseInt(req.query.threshold) || 5
      );

      res.json(products);
    } catch (error) {
      console.error('Error fetching low stock:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/inventory/adjust/:productId
   * Manually adjust stock quantity
   */
  router.post('/adjust/:productId', async (req, res) => {
    try {
      const result = await inventoryService.adjustStock(
        parseInt(req.params.productId),
        req.body.newQuantity,
        req.body.reason,
        req.body.adjustedBy || 'api'
      );

      res.json(result);
    } catch (error) {
      console.error('Error adjusting stock:', error);
      res.status(400).json({ error: error.message });
    }
  });

  /**
   * POST /api/inventory/process-expired
   * Process expired reservations (for scheduled job)
   */
  router.post('/process-expired', async (req, res) => {
    try {
      const count = await inventoryService.processExpiredReservations();
      res.json({ processed: count });
    } catch (error) {
      console.error('Error processing expired reservations:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
