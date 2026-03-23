/**
 * Sales Order Routes
 * API endpoints for Sales Order Confirmation PDF generation
 */

const express = require('express');
const router = express.Router();
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate } = require('../middleware/auth');

// ============================================================================
// MODULE STATE
// ============================================================================
let salesOrderService = null;

// ============================================================================
// ROUTES
// ============================================================================

/**
 * GET /api/sales-orders/:id/pdf
 * Download Sales Order Confirmation PDF for a transaction
 */
router.get('/:id/pdf', authenticate, asyncHandler(async (req, res) => {
  const transactionId = parseInt(req.params.id, 10);
  if (isNaN(transactionId)) throw ApiError.badRequest('Invalid transaction ID');

  const pdfBuffer = await salesOrderService.generateSalesOrderPdf(transactionId);
  const data = await salesOrderService.getSalesOrderData(transactionId);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="sales-order-${data.orderNumber}.pdf"`);
  res.setHeader('Content-Length', pdfBuffer.length);
  res.send(pdfBuffer);
}));

/**
 * GET /api/sales-orders/:id/view
 * View Sales Order Confirmation PDF inline (browser preview)
 */
router.get('/:id/view', authenticate, asyncHandler(async (req, res) => {
  const transactionId = parseInt(req.params.id, 10);
  if (isNaN(transactionId)) throw ApiError.badRequest('Invalid transaction ID');

  const pdfBuffer = await salesOrderService.generateSalesOrderPdf(transactionId);
  const data = await salesOrderService.getSalesOrderData(transactionId);

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="sales-order-${data.orderNumber}.pdf"`);
  res.setHeader('Content-Length', pdfBuffer.length);
  res.send(pdfBuffer);
}));

/**
 * GET /api/sales-orders/:id/data
 * Get Sales Order data as JSON
 */
router.get('/:id/data', authenticate, asyncHandler(async (req, res) => {
  const transactionId = parseInt(req.params.id, 10);
  if (isNaN(transactionId)) throw ApiError.badRequest('Invalid transaction ID');

  const data = await salesOrderService.getSalesOrderData(transactionId);
  res.success(data);
}));

// ============================================================================
// INIT
// ============================================================================

const init = (deps) => {
  salesOrderService = deps.salesOrderService;
  return router;
};

module.exports = { init };
