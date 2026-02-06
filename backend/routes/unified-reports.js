/**
 * Unified Reporting Routes
 * API endpoints for combined quote and POS analytics
 */

const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { ApiError, asyncHandler } = require('../middleware/errorHandler');
const { authenticate, requireRole } = require('../middleware/auth');

// ============================================================================
// MODULE STATE
// ============================================================================
let reportingService = null;

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const dateRangeSchema = Joi.object({
  startDate: Joi.date().iso(),
  endDate: Joi.date().iso(),
  groupBy: Joi.string().valid('day', 'week', 'month')
});

const paginationSchema = Joi.object({
  limit: Joi.number().integer().min(1).max(500).default(50),
  sortBy: Joi.string(),
  sortOrder: Joi.string().valid('ASC', 'DESC', 'asc', 'desc')
});

// ============================================================================
// DASHBOARD & SUMMARY ROUTES
// ============================================================================

/**
 * GET /api/reports/dashboard
 * Get dashboard summary with key metrics
 */
router.get('/dashboard', authenticate, asyncHandler(async (req, res) => {
  const summary = await reportingService.getDashboardSummary();

  res.json({
    success: true,
    data: summary
  });
}));

// ============================================================================
// SALES REPORTS
// ============================================================================

/**
 * GET /api/reports/sales/summary
 * Get sales summary for a period
 */
router.get('/sales/summary', authenticate, asyncHandler(async (req, res) => {
  const { error, value } = dateRangeSchema.validate(req.query);
  if (error) {
    throw ApiError.badRequest(error.details[0].message);
  }

  const data = await reportingService.getSalesSummary(value);

  res.json({
    success: true,
    data
  });
}));

/**
 * GET /api/reports/sales/daily
 * Get daily sales report
 */
router.get('/sales/daily', authenticate, asyncHandler(async (req, res) => {
  const date = req.query.date || new Date().toISOString().split('T')[0];
  const data = await reportingService.getDailySalesReport(date);

  res.json({
    success: true,
    data
  });
}));

/**
 * GET /api/reports/sales/monthly-trend
 * Get monthly sales trend
 */
router.get('/sales/monthly-trend', authenticate, asyncHandler(async (req, res) => {
  const months = parseInt(req.query.months) || 12;
  const data = await reportingService.getMonthlySalesTrend({ months });

  res.json({
    success: true,
    data
  });
}));

/**
 * GET /api/reports/sales/hourly-patterns
 * Get hourly sales patterns for scheduling optimization
 */
router.get('/sales/hourly-patterns', authenticate, asyncHandler(async (req, res) => {
  const dayOfWeek = req.query.dayOfWeek;
  const data = await reportingService.getHourlySalesPatterns({
    dayOfWeek: dayOfWeek !== undefined ? parseInt(dayOfWeek) : undefined
  });

  res.json({
    success: true,
    data
  });
}));

// ============================================================================
// QUOTE CONVERSION REPORTS
// ============================================================================

/**
 * GET /api/reports/quotes/conversion
 * Get quote conversion metrics
 */
router.get('/quotes/conversion', authenticate, asyncHandler(async (req, res) => {
  const { error, value } = dateRangeSchema.validate(req.query);
  if (error) {
    throw ApiError.badRequest(error.details[0].message);
  }

  const salesRep = req.query.salesRep;
  const data = await reportingService.getQuoteConversionMetrics({
    ...value,
    salesRep
  });

  res.json({
    success: true,
    data
  });
}));

/**
 * GET /api/reports/quotes/conversion-trend
 * Get quote conversion trend over time
 */
router.get('/quotes/conversion-trend', authenticate, asyncHandler(async (req, res) => {
  const { error, value } = dateRangeSchema.validate(req.query);
  if (error) {
    throw ApiError.badRequest(error.details[0].message);
  }

  const data = await reportingService.getQuoteConversionTrend(value);

  res.json({
    success: true,
    data
  });
}));

// ============================================================================
// AOV COMPARISON REPORTS
// ============================================================================

/**
 * GET /api/reports/aov/comparison
 * Compare average order value between quotes and POS
 */
router.get('/aov/comparison', authenticate, asyncHandler(async (req, res) => {
  const { error, value } = dateRangeSchema.validate(req.query);
  if (error) {
    throw ApiError.badRequest(error.details[0].message);
  }

  const data = await reportingService.getAOVComparison(value);

  res.json({
    success: true,
    data
  });
}));

// ============================================================================
// PRODUCT PERFORMANCE REPORTS
// ============================================================================

/**
 * GET /api/reports/products/performance
 * Get product performance across channels
 */
router.get('/products/performance', authenticate, asyncHandler(async (req, res) => {
  const schema = dateRangeSchema.keys({
    category: Joi.string(),
    limit: Joi.number().integer().min(1).max(500).default(50)
  });

  const { error, value } = schema.validate(req.query);
  if (error) {
    throw ApiError.badRequest(error.details[0].message);
  }

  const data = await reportingService.getProductPerformance(value);

  res.json({
    success: true,
    data
  });
}));

/**
 * GET /api/reports/products/categories
 * Get category performance summary
 */
router.get('/products/categories', authenticate, asyncHandler(async (req, res) => {
  const { error, value } = dateRangeSchema.validate(req.query);
  if (error) {
    throw ApiError.badRequest(error.details[0].message);
  }

  const data = await reportingService.getCategoryPerformance(value);

  res.json({
    success: true,
    data
  });
}));

// ============================================================================
// CUSTOMER REPORTS
// ============================================================================

/**
 * GET /api/reports/customers/purchase-history
 * Get customer purchase history summary
 */
router.get('/customers/purchase-history', authenticate, asyncHandler(async (req, res) => {
  const schema = paginationSchema.keys({
    customerId: Joi.number().integer().positive()
  });

  const { error, value } = schema.validate(req.query);
  if (error) {
    throw ApiError.badRequest(error.details[0].message);
  }

  const data = await reportingService.getCustomerPurchaseHistory(value);

  res.json({
    success: true,
    data
  });
}));

/**
 * GET /api/reports/customers/:customerId/transactions
 * Get detailed transaction history for a customer
 */
router.get('/customers/:customerId/transactions', authenticate, asyncHandler(async (req, res) => {
  const customerId = parseInt(req.params.customerId, 10);

  if (isNaN(customerId)) {
    throw ApiError.badRequest('Invalid customer ID');
  }

  const schema = dateRangeSchema.keys({
    limit: Joi.number().integer().min(1).max(500).default(100)
  });

  const { error, value } = schema.validate(req.query);
  if (error) {
    throw ApiError.badRequest(error.details[0].message);
  }

  const data = await reportingService.getCustomerTransactionHistory(customerId, value);

  res.json({
    success: true,
    data
  });
}));

// ============================================================================
// SALES REP REPORTS
// ============================================================================

/**
 * GET /api/reports/sales-reps/performance
 * Get sales rep performance metrics
 */
router.get('/sales-reps/performance', authenticate, requireRole(['admin', 'manager']), asyncHandler(async (req, res) => {
  const { error, value } = dateRangeSchema.validate(req.query);
  if (error) {
    throw ApiError.badRequest(error.details[0].message);
  }

  const data = await reportingService.getSalesRepPerformance(value);

  res.json({
    success: true,
    data
  });
}));

// ============================================================================
// EXPORT ROUTES
// ============================================================================

/**
 * GET /api/reports/export/sales
 * Export sales data as CSV
 */
router.get('/export/sales', authenticate, requireRole(['admin', 'manager']), asyncHandler(async (req, res) => {
  const { error, value } = dateRangeSchema.validate(req.query);
  if (error) {
    throw ApiError.badRequest(error.details[0].message);
  }

  const data = await reportingService.getSalesSummary(value);

  // Build CSV
  const headers = ['Period', 'Source', 'Transactions', 'Gross Sales', 'Discounts', 'Tax', 'Net Sales', 'Avg Order Value'];
  const rows = data.periods.map(row => [
    row.period,
    row.source,
    row.transaction_count,
    row.gross_sales,
    row.total_discounts,
    row.total_tax,
    row.net_sales,
    row.avg_order_value
  ]);

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="sales-report.csv"');
  res.send(csv);
}));

/**
 * GET /api/reports/export/products
 * Export product performance as CSV
 */
router.get('/export/products', authenticate, requireRole(['admin', 'manager']), asyncHandler(async (req, res) => {
  const schema = dateRangeSchema.keys({
    category: Joi.string(),
    limit: Joi.number().integer().min(1).max(1000).default(500)
  });

  const { error, value } = schema.validate(req.query);
  if (error) {
    throw ApiError.badRequest(error.details[0].message);
  }

  const data = await reportingService.getProductPerformance(value);

  const headers = ['Product', 'SKU', 'Manufacturer', 'Category', 'Quote Units', 'POS Units', 'Total Units', 'Quote Revenue', 'POS Revenue', 'Total Revenue'];
  const rows = data.map(row => [
    `"${row.product_name}"`,
    row.sku,
    row.manufacturer,
    row.category,
    row.quote_units,
    row.pos_units,
    row.total_units,
    row.quote_revenue,
    row.pos_revenue,
    row.total_revenue
  ]);

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="product-performance.csv"');
  res.send(csv);
}));

// ============================================================================
// INITIALIZATION
// ============================================================================

const init = (deps) => {
  reportingService = deps.reportingService;
  return router;
};

module.exports = { init };
