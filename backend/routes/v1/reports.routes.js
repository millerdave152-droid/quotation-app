/**
 * Reports Routes - v1 API
 * Unified reporting for quotes, orders, and POS
 */

const express = require('express');
const router = express.Router();

const {
  asyncHandler,
  ApiError,
  standardStack,
  managerStack,
  parseDateRange,
  cacheControl
} = require('../../shared/middleware');

const Joi = require('joi');

// Dependencies injected via init()
let db;
let services;

/**
 * Initialize routes with dependencies
 */
const init = (deps) => {
  db = deps.db;
  services = deps.services || {};
  return router;
};

// ============================================================================
// SALES OVERVIEW
// ============================================================================

/**
 * GET /api/v1/reports/sales/overview
 * Get sales overview with totals and trends
 */
router.get('/sales/overview',
  ...managerStack,
  parseDateRange,
  cacheControl({ maxAge: 300, private: true }),
  asyncHandler(async (req, res) => {
    const { startDate, endDate } = req.dateRange;

    // Default to last 30 days if no dates provided
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate || new Date();

    // Get quote stats
    const quoteStats = await db.query(`
      SELECT
        COUNT(*) as total_quotes,
        COUNT(CASE WHEN UPPER(status) IN ('WON', 'APPROVED', 'ACCEPTED', 'CONVERTED') THEN 1 END) as won_quotes,
        COALESCE(SUM(CASE WHEN UPPER(status) IN ('WON', 'APPROVED', 'ACCEPTED', 'CONVERTED') THEN total ELSE 0 END), 0) as quote_revenue
      FROM quotations
      WHERE created_at >= $1 AND created_at <= $2
    `, [start, end]);

    // Get POS transaction stats
    const posStats = await db.query(`
      SELECT
        COUNT(*) as total_transactions,
        COALESCE(SUM(CASE WHEN status = 'completed' THEN total_cents ELSE 0 END), 0) as pos_revenue_cents,
        COALESCE(AVG(CASE WHEN status = 'completed' THEN total_cents ELSE NULL END), 0) as avg_transaction_cents
      FROM transactions
      WHERE created_at >= $1 AND created_at <= $2
    `, [start, end]);

    // Get daily sales trend
    const dailyTrend = await db.query(`
      SELECT
        date_trunc('day', t.created_at) as date,
        COUNT(*) as transaction_count,
        COALESCE(SUM(t.total_cents), 0) as total_cents
      FROM transactions t
      WHERE t.created_at >= $1 AND t.created_at <= $2 AND t.status = 'completed'
      GROUP BY date_trunc('day', t.created_at)
      ORDER BY date
    `, [start, end]);

    // Get payment method breakdown
    const paymentBreakdown = await db.query(`
      SELECT
        p.payment_method,
        COUNT(*) as count,
        COALESCE(SUM(p.amount_cents), 0) as total_cents
      FROM payments p
      JOIN transactions t ON p.transaction_id = t.transaction_id
      WHERE t.created_at >= $1 AND t.created_at <= $2 AND t.status = 'completed'
      GROUP BY p.payment_method
      ORDER BY total_cents DESC
    `, [start, end]);

    const quoteData = quoteStats.rows[0];
    const posData = posStats.rows[0];
    const totalRevenue = parseFloat(quoteData.quote_revenue || 0) + (parseInt(posData.pos_revenue_cents || 0) / 100);

    res.success({
      period: { start, end },
      summary: {
        totalRevenue,
        quoteRevenue: parseFloat(quoteData.quote_revenue || 0),
        posRevenueCents: parseInt(posData.pos_revenue_cents || 0),
        totalQuotes: parseInt(quoteData.total_quotes || 0),
        wonQuotes: parseInt(quoteData.won_quotes || 0),
        conversionRate: quoteData.total_quotes > 0
          ? ((quoteData.won_quotes / quoteData.total_quotes) * 100).toFixed(1)
          : 0,
        totalTransactions: parseInt(posData.total_transactions || 0),
        avgTransactionCents: Math.round(parseFloat(posData.avg_transaction_cents || 0))
      },
      dailyTrend: dailyTrend.rows.map(row => ({
        date: row.date,
        transactionCount: parseInt(row.transaction_count),
        totalCents: parseInt(row.total_cents)
      })),
      paymentBreakdown: paymentBreakdown.rows
    });
  })
);

// ============================================================================
// QUOTE REPORTS
// ============================================================================

/**
 * GET /api/v1/reports/quotes/conversion
 * Quote conversion funnel report
 */
router.get('/quotes/conversion',
  ...managerStack,
  parseDateRange,
  asyncHandler(async (req, res) => {
    const { startDate, endDate } = req.dateRange;

    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate || new Date();

    const result = await db.query(`
      SELECT
        UPPER(status) as status,
        COUNT(*) as count,
        COALESCE(SUM(total), 0) as total_value
      FROM quotations
      WHERE created_at >= $1 AND created_at <= $2
      GROUP BY UPPER(status)
      ORDER BY count DESC
    `, [start, end]);

    // Calculate funnel metrics
    const statusCounts = {};
    let totalQuotes = 0;
    let totalValue = 0;

    for (const row of result.rows) {
      statusCounts[row.status] = {
        count: parseInt(row.count),
        value: parseFloat(row.total_value)
      };
      totalQuotes += parseInt(row.count);
      totalValue += parseFloat(row.total_value);
    }

    const wonStatuses = ['WON', 'APPROVED', 'ACCEPTED', 'CONVERTED'];
    const wonCount = wonStatuses.reduce((sum, status) => sum + (statusCounts[status]?.count || 0), 0);
    const wonValue = wonStatuses.reduce((sum, status) => sum + (statusCounts[status]?.value || 0), 0);

    const lostCount = statusCounts['LOST']?.count || 0;
    const pendingCount = statusCounts['PENDING_APPROVAL']?.count || 0;
    const draftCount = statusCounts['DRAFT']?.count || 0;
    const sentCount = statusCounts['SENT']?.count || 0;

    res.success({
      period: { start, end },
      funnel: {
        totalQuotes,
        totalValue,
        draft: { count: draftCount, value: statusCounts['DRAFT']?.value || 0 },
        sent: { count: sentCount, value: statusCounts['SENT']?.value || 0 },
        pending: { count: pendingCount, value: statusCounts['PENDING_APPROVAL']?.value || 0 },
        won: { count: wonCount, value: wonValue },
        lost: { count: lostCount, value: statusCounts['LOST']?.value || 0 }
      },
      rates: {
        conversionRate: totalQuotes > 0 ? ((wonCount / totalQuotes) * 100).toFixed(1) : 0,
        lossRate: totalQuotes > 0 ? ((lostCount / totalQuotes) * 100).toFixed(1) : 0,
        pendingRate: totalQuotes > 0 ? ((pendingCount / totalQuotes) * 100).toFixed(1) : 0
      },
      byStatus: result.rows
    });
  })
);

/**
 * GET /api/v1/reports/quotes/by-rep
 * Quote performance by sales rep
 */
router.get('/quotes/by-rep',
  ...managerStack,
  parseDateRange,
  asyncHandler(async (req, res) => {
    const { startDate, endDate } = req.dateRange;

    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate || new Date();

    const result = await db.query(`
      SELECT
        q.sales_rep_id,
        COALESCE(u.username, q.sales_rep_name, 'Unassigned') as sales_rep_name,
        COUNT(*) as total_quotes,
        COUNT(CASE WHEN UPPER(q.status) IN ('WON', 'APPROVED', 'ACCEPTED', 'CONVERTED') THEN 1 END) as won_quotes,
        COUNT(CASE WHEN UPPER(q.status) = 'LOST' THEN 1 END) as lost_quotes,
        COALESCE(SUM(q.total), 0) as total_value,
        COALESCE(SUM(CASE WHEN UPPER(q.status) IN ('WON', 'APPROVED', 'ACCEPTED', 'CONVERTED') THEN q.total ELSE 0 END), 0) as won_value,
        COALESCE(AVG(q.total), 0) as avg_quote_value
      FROM quotations q
      LEFT JOIN users u ON q.sales_rep_id = u.id
      WHERE q.created_at >= $1 AND q.created_at <= $2
      GROUP BY q.sales_rep_id, u.username, q.sales_rep_name
      ORDER BY won_value DESC
    `, [start, end]);

    res.success({
      period: { start, end },
      byRep: result.rows.map(row => ({
        salesRepId: row.sales_rep_id,
        salesRepName: row.sales_rep_name,
        totalQuotes: parseInt(row.total_quotes),
        wonQuotes: parseInt(row.won_quotes),
        lostQuotes: parseInt(row.lost_quotes),
        totalValue: parseFloat(row.total_value),
        wonValue: parseFloat(row.won_value),
        avgQuoteValue: parseFloat(row.avg_quote_value),
        conversionRate: row.total_quotes > 0
          ? ((row.won_quotes / row.total_quotes) * 100).toFixed(1)
          : 0
      }))
    });
  })
);

// ============================================================================
// PRODUCT REPORTS
// ============================================================================

/**
 * GET /api/v1/reports/products/top-sellers
 * Top selling products report
 */
router.get('/products/top-sellers',
  ...managerStack,
  parseDateRange,
  asyncHandler(async (req, res) => {
    const { startDate, endDate } = req.dateRange;
    const { limit = 20 } = req.query;

    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate || new Date();

    const result = await db.query(`
      SELECT
        p.id,
        p.name,
        p.model,
        p.category_id,
        cat.name as category_name,
        COALESCE(SUM(ti.quantity), 0) as units_sold,
        COALESCE(SUM(ti.line_total_cents), 0) as revenue_cents,
        COUNT(DISTINCT t.transaction_id) as transaction_count,
        p.sell_cents as current_price_cents,
        p.quantity_available as stock_available
      FROM products p
      LEFT JOIN transaction_items ti ON p.id = ti.product_id
      LEFT JOIN transactions t ON ti.transaction_id = t.transaction_id
        AND t.status = 'completed'
        AND t.created_at >= $1 AND t.created_at <= $2
      LEFT JOIN categories cat ON p.category_id = cat.id
      WHERE p.deleted_at IS NULL
      GROUP BY p.id, p.name, p.model, p.category_id, cat.name, p.sell_cents, p.quantity_available
      HAVING COALESCE(SUM(ti.quantity), 0) > 0
      ORDER BY revenue_cents DESC
      LIMIT $3
    `, [start, end, parseInt(limit)]);

    res.success({
      period: { start, end },
      topSellers: result.rows.map(row => ({
        ...row,
        unitsSold: parseInt(row.units_sold),
        revenueCents: parseInt(row.revenue_cents),
        transactionCount: parseInt(row.transaction_count),
        currentPriceCents: parseInt(row.current_price_cents),
        stockAvailable: parseInt(row.stock_available)
      }))
    });
  })
);

/**
 * GET /api/v1/reports/products/performance
 * Product performance metrics
 */
router.get('/products/performance',
  ...managerStack,
  parseDateRange,
  asyncHandler(async (req, res) => {
    const { startDate, endDate } = req.dateRange;

    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate || new Date();

    // Get category performance
    const categoryResult = await db.query(`
      SELECT
        cat.id as category_id,
        cat.name as category_name,
        COUNT(DISTINCT ti.product_id) as products_sold,
        COALESCE(SUM(ti.quantity), 0) as units_sold,
        COALESCE(SUM(ti.line_total_cents), 0) as revenue_cents
      FROM categories cat
      LEFT JOIN products p ON cat.id = p.category_id
      LEFT JOIN transaction_items ti ON p.id = ti.product_id
      LEFT JOIN transactions t ON ti.transaction_id = t.transaction_id
        AND t.status = 'completed'
        AND t.created_at >= $1 AND t.created_at <= $2
      GROUP BY cat.id, cat.name
      ORDER BY revenue_cents DESC
    `, [start, end]);

    // Get inventory alerts
    const inventoryAlerts = await db.query(`
      SELECT
        id, name, model,
        quantity_available, reorder_point,
        CASE
          WHEN quantity_available <= 0 THEN 'out_of_stock'
          WHEN quantity_available <= reorder_point THEN 'low_stock'
          ELSE 'ok'
        END as stock_status
      FROM products
      WHERE deleted_at IS NULL
        AND is_active = true
        AND track_inventory = true
        AND quantity_available <= reorder_point
      ORDER BY quantity_available ASC
      LIMIT 20
    `);

    res.success({
      period: { start, end },
      byCategory: categoryResult.rows.map(row => ({
        categoryId: row.category_id,
        categoryName: row.category_name,
        productsSold: parseInt(row.products_sold),
        unitsSold: parseInt(row.units_sold),
        revenueCents: parseInt(row.revenue_cents)
      })),
      inventoryAlerts: inventoryAlerts.rows
    });
  })
);

// ============================================================================
// CUSTOMER REPORTS
// ============================================================================

/**
 * GET /api/v1/reports/customers/top
 * Top customers by revenue
 */
router.get('/customers/top',
  ...managerStack,
  parseDateRange,
  asyncHandler(async (req, res) => {
    const { startDate, endDate } = req.dateRange;
    const { limit = 20 } = req.query;

    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate || new Date();

    const result = await db.query(`
      SELECT
        c.id,
        c.name,
        c.company,
        c.customer_type,
        c.email,
        c.phone,
        COUNT(DISTINCT t.transaction_id) as transaction_count,
        COALESCE(SUM(t.total_cents), 0) as total_spent_cents,
        COALESCE(AVG(t.total_cents), 0) as avg_transaction_cents,
        MAX(t.created_at) as last_transaction_date
      FROM customers c
      JOIN transactions t ON c.id = t.customer_id
      WHERE t.status = 'completed'
        AND t.created_at >= $1 AND t.created_at <= $2
        AND c.deleted_at IS NULL
      GROUP BY c.id, c.name, c.company, c.customer_type, c.email, c.phone
      ORDER BY total_spent_cents DESC
      LIMIT $3
    `, [start, end, parseInt(limit)]);

    res.success({
      period: { start, end },
      topCustomers: result.rows.map(row => ({
        id: row.id,
        name: row.name,
        company: row.company,
        customerType: row.customer_type,
        email: row.email,
        phone: row.phone,
        transactionCount: parseInt(row.transaction_count),
        totalSpentCents: parseInt(row.total_spent_cents),
        avgTransactionCents: Math.round(parseFloat(row.avg_transaction_cents)),
        lastTransactionDate: row.last_transaction_date
      }))
    });
  })
);

/**
 * GET /api/v1/reports/customers/insights
 * Customer behavior insights
 */
router.get('/customers/insights',
  ...managerStack,
  asyncHandler(async (req, res) => {
    // Customer type distribution
    const typeDistribution = await db.query(`
      SELECT
        customer_type,
        COUNT(*) as count,
        COALESCE(SUM(current_balance), 0) as total_balance
      FROM customers
      WHERE deleted_at IS NULL
      GROUP BY customer_type
      ORDER BY count DESC
    `);

    // New vs returning customers (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const newVsReturning = await db.query(`
      SELECT
        CASE
          WHEN c.created_at >= $1 THEN 'new'
          ELSE 'returning'
        END as customer_status,
        COUNT(DISTINCT c.id) as customer_count,
        COUNT(t.transaction_id) as transaction_count,
        COALESCE(SUM(t.total_cents), 0) as revenue_cents
      FROM customers c
      LEFT JOIN transactions t ON c.id = t.customer_id
        AND t.status = 'completed'
        AND t.created_at >= $1
      WHERE c.deleted_at IS NULL
      GROUP BY CASE WHEN c.created_at >= $1 THEN 'new' ELSE 'returning' END
    `, [thirtyDaysAgo]);

    // Average customer lifetime value estimate
    const clvResult = await db.query(`
      SELECT
        AVG(customer_total) as avg_clv_cents
      FROM (
        SELECT
          c.id,
          COALESCE(SUM(t.total_cents), 0) as customer_total
        FROM customers c
        LEFT JOIN transactions t ON c.id = t.customer_id AND t.status = 'completed'
        WHERE c.deleted_at IS NULL
        GROUP BY c.id
        HAVING COALESCE(SUM(t.total_cents), 0) > 0
      ) as customer_totals
    `);

    res.success({
      typeDistribution: typeDistribution.rows.map(row => ({
        customerType: row.customer_type,
        count: parseInt(row.count),
        totalBalance: parseInt(row.total_balance)
      })),
      newVsReturning: newVsReturning.rows.map(row => ({
        status: row.customer_status,
        customerCount: parseInt(row.customer_count),
        transactionCount: parseInt(row.transaction_count),
        revenueCents: parseInt(row.revenue_cents)
      })),
      averageCustomerLifetimeValueCents: Math.round(parseFloat(clvResult.rows[0]?.avg_clv_cents || 0))
    });
  })
);

// ============================================================================
// SHIFT REPORTS
// ============================================================================

/**
 * GET /api/v1/reports/shifts/summary
 * Shift performance summary
 */
router.get('/shifts/summary',
  ...managerStack,
  parseDateRange,
  asyncHandler(async (req, res) => {
    const { startDate, endDate } = req.dateRange;

    const start = startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const end = endDate || new Date();

    const result = await db.query(`
      SELECT
        s.shift_id,
        s.opened_at,
        s.closed_at,
        r.register_name,
        u.username as cashier,
        s.opening_cash_cents,
        s.closing_cash_cents,
        s.expected_cash_cents,
        s.variance_cents,
        s.status,
        COUNT(t.transaction_id) as transaction_count,
        COALESCE(SUM(CASE WHEN t.status = 'completed' THEN t.total_cents ELSE 0 END), 0) as total_sales_cents,
        COALESCE(SUM(CASE WHEN t.status = 'voided' THEN t.total_cents ELSE 0 END), 0) as voided_cents,
        COALESCE(SUM(CASE WHEN t.status = 'refunded' THEN t.refund_amount_cents ELSE 0 END), 0) as refunded_cents
      FROM shifts s
      JOIN registers r ON s.register_id = r.register_id
      JOIN users u ON s.user_id = u.id
      LEFT JOIN transactions t ON s.shift_id = t.shift_id
      WHERE s.opened_at >= $1 AND s.opened_at <= $2
      GROUP BY s.shift_id, s.opened_at, s.closed_at, r.register_name, u.username,
               s.opening_cash_cents, s.closing_cash_cents, s.expected_cash_cents, s.variance_cents, s.status
      ORDER BY s.opened_at DESC
    `, [start, end]);

    // Calculate summary stats
    const closedShifts = result.rows.filter(s => s.status === 'closed');
    const totalVariance = closedShifts.reduce((sum, s) => sum + (parseInt(s.variance_cents) || 0), 0);
    const avgVariance = closedShifts.length > 0 ? totalVariance / closedShifts.length : 0;

    res.success({
      period: { start, end },
      summary: {
        totalShifts: result.rows.length,
        closedShifts: closedShifts.length,
        openShifts: result.rows.filter(s => s.status === 'open').length,
        totalVarianceCents: totalVariance,
        avgVarianceCents: Math.round(avgVariance)
      },
      shifts: result.rows.map(row => ({
        shiftId: row.shift_id,
        openedAt: row.opened_at,
        closedAt: row.closed_at,
        registerName: row.register_name,
        cashier: row.cashier,
        status: row.status,
        openingCashCents: parseInt(row.opening_cash_cents),
        closingCashCents: row.closing_cash_cents ? parseInt(row.closing_cash_cents) : null,
        expectedCashCents: row.expected_cash_cents ? parseInt(row.expected_cash_cents) : null,
        varianceCents: row.variance_cents ? parseInt(row.variance_cents) : null,
        transactionCount: parseInt(row.transaction_count),
        totalSalesCents: parseInt(row.total_sales_cents),
        voidedCents: parseInt(row.voided_cents),
        refundedCents: parseInt(row.refunded_cents)
      }))
    });
  })
);

// ============================================================================
// EXPORT REPORTS
// ============================================================================

/**
 * GET /api/v1/reports/export/sales
 * Export sales data as CSV
 */
router.get('/export/sales',
  ...managerStack,
  parseDateRange,
  asyncHandler(async (req, res) => {
    const { startDate, endDate } = req.dateRange;
    const { format = 'json' } = req.query;

    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate || new Date();

    const result = await db.query(`
      SELECT
        t.transaction_number,
        t.created_at,
        c.name as customer_name,
        t.subtotal_cents,
        t.tax_cents,
        t.discount_cents,
        t.total_cents,
        t.status,
        r.register_name,
        u.username as cashier
      FROM transactions t
      LEFT JOIN customers c ON t.customer_id = c.id
      LEFT JOIN shifts s ON t.shift_id = s.shift_id
      LEFT JOIN registers r ON s.register_id = r.register_id
      LEFT JOIN users u ON s.user_id = u.id
      WHERE t.created_at >= $1 AND t.created_at <= $2
      ORDER BY t.created_at DESC
    `, [start, end]);

    if (format === 'csv') {
      const headers = [
        'Transaction Number',
        'Date',
        'Customer',
        'Subtotal',
        'Tax',
        'Discount',
        'Total',
        'Status',
        'Register',
        'Cashier'
      ];

      const rows = result.rows.map(row => [
        row.transaction_number,
        row.created_at.toISOString(),
        row.customer_name || '',
        (row.subtotal_cents / 100).toFixed(2),
        (row.tax_cents / 100).toFixed(2),
        (row.discount_cents / 100).toFixed(2),
        (row.total_cents / 100).toFixed(2),
        row.status,
        row.register_name || '',
        row.cashier || ''
      ]);

      const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="sales-export-${start.toISOString().split('T')[0]}-to-${end.toISOString().split('T')[0]}.csv"`);
      return res.send(csv);
    }

    res.success({
      period: { start, end },
      recordCount: result.rows.length,
      data: result.rows
    });
  })
);

module.exports = { router, init };
