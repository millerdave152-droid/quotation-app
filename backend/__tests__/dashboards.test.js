/**
 * Dashboard Service & Routes Unit Tests
 */

// Mock the db module (pool)
const mockQuery = jest.fn();
jest.mock('../db', () => ({ query: mockQuery }));

// Mock auth middleware so route tests don't need real JWT tokens
jest.mock('../middleware/auth', () => ({
  authenticate: (req, res, next) => next(),
}));

const dashboardService = require('../services/dashboardService');

describe('dashboardService', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  // ── resolveDateRange ───────────────────────────────────────────

  describe('resolveDateRange', () => {
    it('today: from and to are the same', () => {
      const { from, to } = dashboardService.resolveDateRange('today');
      expect(from).toBe(to);
      expect(from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('week: from is Monday of current week', () => {
      const { from } = dashboardService.resolveDateRange('week');
      expect(from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // Parse date parts to avoid timezone interpretation issues
      const [yr, mo, dy] = from.split('-').map(Number);
      const d = new Date(yr, mo - 1, dy, 12, 0, 0);
      expect(d.getDay()).toBe(1); // Monday
    });

    it('month: from is first of the month', () => {
      const { from } = dashboardService.resolveDateRange('month');
      expect(from).toMatch(/-01$/);
    });

    it('year: from is Jan 1', () => {
      const { from } = dashboardService.resolveDateRange('year');
      const year = new Date().getFullYear();
      expect(from).toBe(`${year}-01-01`);
    });

    it('custom: uses provided dates', () => {
      const result = dashboardService.resolveDateRange('custom', '2026-01-01', '2026-01-31');
      expect(result.from).toBe('2026-01-01');
      expect(result.to).toBe('2026-01-31');
    });

    it('default/unknown: falls back to today', () => {
      const { from, to } = dashboardService.resolveDateRange('unknown_period');
      expect(from).toBe(to);
    });
  });

  // ── getSalesSummary ────────────────────────────────────────────

  describe('getSalesSummary', () => {
    it('returns current, prior, and trends', async () => {
      // Current period query
      mockQuery.mockResolvedValueOnce({
        rows: [{
          total_revenue: '500000', total_transactions: '50',
          avg_transaction: '10000', cash_count: '10', debit_count: '15',
          credit_count: '20', financing_count: '5',
        }],
      });
      // Prior period query
      mockQuery.mockResolvedValueOnce({
        rows: [{
          total_revenue: '400000', total_transactions: '40',
          avg_transaction: '10000', cash_count: '8', debit_count: '12',
          credit_count: '16', financing_count: '4',
        }],
      });

      const result = await dashboardService.getSalesSummary({ period: 'month' });

      expect(result.current.totalRevenue).toBe(500000);
      expect(result.current.totalTransactions).toBe(50);
      expect(result.prior.totalRevenue).toBe(400000);
      expect(result.trends.revenueChangePct).toBe(25); // (500000-400000)/400000 * 100
    });

    it('100% change when prior is zero', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            total_revenue: '100000', total_transactions: '10',
            avg_transaction: '10000', cash_count: '5', debit_count: '5',
            credit_count: '0', financing_count: '0',
          }],
        })
        .mockResolvedValueOnce({
          rows: [{
            total_revenue: '0', total_transactions: '0',
            avg_transaction: '0', cash_count: '0', debit_count: '0',
            credit_count: '0', financing_count: '0',
          }],
        });

      const result = await dashboardService.getSalesSummary({ period: 'today' });

      expect(result.trends.revenueChangePct).toBe(100);
    });

    it('applies salespersonId filter when provided', async () => {
      mockQuery
        .mockResolvedValue({
          rows: [{
            total_revenue: '0', total_transactions: '0', avg_transaction: '0',
            cash_count: '0', debit_count: '0', credit_count: '0', financing_count: '0',
          }],
        });

      await dashboardService.getSalesSummary({ period: 'today', salespersonId: 5 });

      // Both queries should include salesperson_id filter
      const firstCallSql = mockQuery.mock.calls[0][0].text;
      expect(firstCallSql).toContain('salesperson_id');
    });
  });

  // ── getBrandMargins ────────────────────────────────────────────

  describe('getBrandMargins', () => {
    it('returns brand margin data sorted by revenue', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { brand_name: 'Samsung', total_revenue_cents: '300000', total_margin_cents: '90000', units_sold: '30', avg_margin_pct: '30.00' },
          { brand_name: 'LG', total_revenue_cents: '200000', total_margin_cents: '50000', units_sold: '20', avg_margin_pct: '25.00' },
        ],
      });

      const result = await dashboardService.getBrandMargins({
        from: '2026-01-01', to: '2026-03-07',
      });

      expect(result).toHaveLength(2);
      expect(result[0].brandName).toBe('Samsung');
      expect(result[0].revenueCents).toBe(300000);
      expect(result[0].avgMarginPct).toBe(30);
      expect(result[1].brandName).toBe('LG');
    });
  });

  // ── getLowStockAlerts ──────────────────────────────────────────

  describe('getLowStockAlerts', () => {
    it('returns items below reorder point with stockRatio', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            product_id: 1, product_name: 'Widget', sku: 'W-001', brand: 'Acme',
            qty_on_hand: '5', qty_available: '3', reorder_point: '10', reorder_qty: '20',
            location_id: 1, location_name: 'Main',
          },
        ],
      });

      const result = await dashboardService.getLowStockAlerts({});

      expect(result).toHaveLength(1);
      expect(result[0].productName).toBe('Widget');
      expect(result[0].stockRatio).toBe(30); // 3/10 * 100
      expect(result[0].qtyAvailable).toBe(3);
      expect(result[0].reorderPoint).toBe(10);
    });

    it('applies locationId filter', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await dashboardService.getLowStockAlerts({ locationId: 3 });

      const sql = mockQuery.mock.calls[0][0].text;
      expect(sql).toContain('location_id');
    });
  });

  // ── getRepPerformance ──────────────────────────────────────────

  describe('getRepPerformance', () => {
    it('merges open quotes into rep performance', async () => {
      // Performance query
      mockQuery.mockResolvedValueOnce({
        rows: [
          { rep_id: 1, rep_name: 'Alice', revenue_cents: '200000', transaction_count: '20', avg_transaction_cents: '10000' },
          { rep_id: 2, rep_name: 'Bob', revenue_cents: '150000', transaction_count: '15', avg_transaction_cents: '10000' },
        ],
      });
      // Open quotes query
      mockQuery.mockResolvedValueOnce({
        rows: [
          { salesperson_id: 1, open_quotes: '5' },
        ],
      });

      const result = await dashboardService.getRepPerformance({
        from: '2026-01-01', to: '2026-03-07',
      });

      expect(result).toHaveLength(2);
      expect(result[0].repName).toBe('Alice');
      expect(result[0].revenueCents).toBe(200000);
      expect(result[0].openQuotesCount).toBe(5);
      expect(result[1].openQuotesCount).toBe(0); // Bob has no open quotes
    });
  });

  // ── getAgingInventory ──────────────────────────────────────────

  describe('getAgingInventory', () => {
    it('returns aging items with daysSinceLastSale', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          product_name: 'Old Fridge', sku: 'OF-001', brand: 'GE',
          category: 'Appliances', qty_on_hand: '3', location_id: 1,
          location_name: 'Main', inventory_value_cents: '150000',
          last_sold_at: '2025-01-01', days_since_last_sale: '430',
          aging_status: 'critical',
        }],
      });

      const result = await dashboardService.getAgingInventory({});

      expect(result).toHaveLength(1);
      expect(result[0].productName).toBe('Old Fridge');
      expect(result[0].daysSinceLastSale).toBe(430);
      expect(result[0].agingStatus).toBe('critical');
    });
  });

  // ── getInstitutionalSummary ────────────────────────────────────

  describe('getInstitutionalSummary', () => {
    it('returns openQuotes, outstandingAR, and revenueSplit', async () => {
      // 3 parallel queries
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '5', total_cents: '250000' }] })
        .mockResolvedValueOnce({ rows: [{ count: '3', outstanding_cents: '150000' }] })
        .mockResolvedValueOnce({ rows: [{ b2b_cents: '400000', b2c_cents: '600000' }] });

      const result = await dashboardService.getInstitutionalSummary({
        from: '2026-01-01', to: '2026-03-07',
      });

      expect(result.openQuotes.count).toBe(5);
      expect(result.openQuotes.totalCents).toBe(250000);
      expect(result.outstandingAR.outstandingCents).toBe(150000);
      expect(result.revenueSplit.b2bCents).toBe(400000);
      expect(result.revenueSplit.b2cCents).toBe(600000);
    });
  });
});

// ══════════════════════════════════════════════════════════════════
// Route-level tests (role enforcement)
// ══════════════════════════════════════════════════════════════════

const express = require('express');
const request = require('supertest');

describe('retailDashboardRoutes', () => {
  let app;

  beforeEach(() => {
    mockQuery.mockReset();

    // Provide default mock for any DB query in routes
    mockQuery.mockResolvedValue({
      rows: [{
        total_revenue: '0', total_transactions: '0', avg_transaction: '0',
        cash_count: '0', debit_count: '0', credit_count: '0', financing_count: '0',
      }],
    });
  });

  /**
   * Build an express app with mocked auth and the dashboard router.
   */
  function buildApp(user) {
    const testApp = express();

    // Mock auth middleware - inject user
    testApp.use((req, res, next) => {
      req.user = user;
      next();
    });

    // Need to re-require the routes after mocks are set
    // But routes use require('../db') inline for some endpoints,
    // which is already mocked above
    const routerModule = require('../routes/retailDashboardRoutes');
    testApp.use('/api/retail-dashboard', routerModule);

    // Error handler
    testApp.use((err, req, res, _next) => {
      res.status(err.status || 500).json({ success: false, message: err.message });
    });

    return testApp;
  }

  describe('GET /sales/summary', () => {
    it('403 for sales role', async () => {
      app = buildApp({ id: 1, role: 'sales' });

      const res = await request(app).get('/api/retail-dashboard/sales/summary');
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('200 for manager role', async () => {
      app = buildApp({ id: 1, role: 'manager' });

      const res = await request(app).get('/api/retail-dashboard/sales/summary');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('200 for admin role', async () => {
      app = buildApp({ id: 1, role: 'admin' });

      const res = await request(app).get('/api/retail-dashboard/sales/summary');
      expect(res.status).toBe(200);
    });
  });

  describe('GET /reps/performance', () => {
    it('sales reps see own data only (forced repId)', async () => {
      app = buildApp({ id: 42, role: 'sales' });

      // Performance + open quotes queries
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ rep_id: 42, rep_name: 'Self', revenue_cents: '100000', transaction_count: '10', avg_transaction_cents: '10000' }],
        })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get('/api/retail-dashboard/reps/performance');

      expect(res.status).toBe(200);
      // The performance query should include rep_id filter
      const perfQuerySql = mockQuery.mock.calls[0][0].text;
      expect(perfQuerySql).toContain('rep_id');
    });

    it('managers see all reps', async () => {
      app = buildApp({ id: 1, role: 'manager' });

      mockQuery
        .mockResolvedValueOnce({
          rows: [
            { rep_id: 1, rep_name: 'A', revenue_cents: '200000', transaction_count: '20', avg_transaction_cents: '10000' },
            { rep_id: 2, rep_name: 'B', revenue_cents: '150000', transaction_count: '15', avg_transaction_cents: '10000' },
          ],
        })
        .mockResolvedValueOnce({ rows: [] });

      const res = await request(app).get('/api/retail-dashboard/reps/performance');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
    });
  });

  describe('GET /my/summary', () => {
    it('accessible to all authenticated users', async () => {
      app = buildApp({ id: 10, role: 'sales' });

      const res = await request(app).get('/api/retail-dashboard/my/summary');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /inventory/low-stock', () => {
    it('403 for non-manager role', async () => {
      app = buildApp({ id: 1, role: 'senior_sales' });

      const res = await request(app).get('/api/retail-dashboard/inventory/low-stock');
      expect(res.status).toBe(403);
    });
  });
});
