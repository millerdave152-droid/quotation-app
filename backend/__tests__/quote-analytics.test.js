const request = require('supertest');
const express = require('express');

const app = express();
app.use(express.json());

// Mock pool for database operations
const mockPool = {
  query: jest.fn()
};

describe('Quote Analytics & Reporting System', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/analytics/dashboard', () => {
    app.get('/api/analytics/dashboard', async (req, res) => {
      try {
        const { start_date, end_date, user_id } = req.query;

        let userFilter = '';
        const params = [start_date || '2024-01-01', end_date || '2024-12-31'];

        if (user_id) {
          userFilter = ' AND created_by = $3';
          params.push(user_id);
        }

        // Get basic metrics
        const metricsResult = await mockPool.query(
          `SELECT
            COUNT(*) as total_quotes,
            COUNT(CASE WHEN status = 'accepted' THEN 1 END) as accepted_quotes,
            COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected_quotes,
            COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_quotes,
            SUM(total_amount) as total_value,
            SUM(CASE WHEN status = 'accepted' THEN total_amount ELSE 0 END) as won_value,
            AVG(total_amount) as average_quote_value
          FROM quotations
          WHERE created_at >= $1 AND created_at <= $2${userFilter}`,
          params
        );

        const metrics = metricsResult.rows[0];

        // Calculate conversion rate
        const conversionRate = metrics.total_quotes > 0
          ? ((metrics.accepted_quotes / metrics.total_quotes) * 100).toFixed(2)
          : '0.00';

        res.json({
          metrics: {
            ...metrics,
            conversion_rate: conversionRate
          }
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    test('should get dashboard metrics', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{
          total_quotes: 100,
          accepted_quotes: 60,
          rejected_quotes: 20,
          pending_quotes: 20,
          total_value: 500000,
          won_value: 300000,
          average_quote_value: 5000
        }]
      });

      const response = await request(app)
        .get('/api/analytics/dashboard')
        .query({ start_date: '2024-01-01', end_date: '2024-12-31' });

      expect(response.status).toBe(200);
      expect(response.body.metrics.total_quotes).toBe(100);
      expect(response.body.metrics.conversion_rate).toBe('60.00');
    });

    test('should filter metrics by user', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{
          total_quotes: 50,
          accepted_quotes: 30,
          rejected_quotes: 10,
          pending_quotes: 10,
          total_value: 250000,
          won_value: 150000,
          average_quote_value: 5000
        }]
      });

      const response = await request(app)
        .get('/api/analytics/dashboard')
        .query({ user_id: 1 });

      expect(response.status).toBe(200);
      expect(response.body.metrics.total_quotes).toBe(50);
    });
  });

  describe('GET /api/analytics/conversion-funnel', () => {
    app.get('/api/analytics/conversion-funnel', async (req, res) => {
      try {
        const { start_date, end_date } = req.query;

        const result = await mockPool.query(
          `SELECT
            status,
            COUNT(*) as count
          FROM quotations
          WHERE created_at >= $1 AND created_at <= $2
          GROUP BY status
          ORDER BY CASE status
            WHEN 'draft' THEN 1
            WHEN 'pending' THEN 2
            WHEN 'sent' THEN 3
            WHEN 'accepted' THEN 4
            WHEN 'rejected' THEN 5
            ELSE 6
          END`,
          [start_date || '2024-01-01', end_date || '2024-12-31']
        );

        res.json({ funnel: result.rows });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    test('should get conversion funnel data', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          { status: 'draft', count: 20 },
          { status: 'pending', count: 30 },
          { status: 'sent', count: 40 },
          { status: 'accepted', count: 50 },
          { status: 'rejected', count: 10 }
        ]
      });

      const response = await request(app)
        .get('/api/analytics/conversion-funnel')
        .query({ start_date: '2024-01-01', end_date: '2024-12-31' });

      expect(response.status).toBe(200);
      expect(response.body.funnel).toHaveLength(5);
      expect(response.body.funnel[0].status).toBe('draft');
    });
  });

  describe('GET /api/analytics/revenue-trends', () => {
    app.get('/api/analytics/revenue-trends', async (req, res) => {
      try {
        const { start_date, end_date, interval } = req.query;

        const dateFormat = interval === 'week' ? 'YYYY-IW' : 'YYYY-MM';

        const result = await mockPool.query(
          `SELECT
            TO_CHAR(created_at, $3) as period,
            COUNT(*) as quote_count,
            SUM(total_amount) as total_revenue,
            SUM(CASE WHEN status = 'accepted' THEN total_amount ELSE 0 END) as won_revenue
          FROM quotations
          WHERE created_at >= $1 AND created_at <= $2
          GROUP BY TO_CHAR(created_at, $3)
          ORDER BY period`,
          [start_date || '2024-01-01', end_date || '2024-12-31', dateFormat]
        );

        res.json({ trends: result.rows });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    test('should get revenue trends by month', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          { period: '2024-01', quote_count: 20, total_revenue: 100000, won_revenue: 60000 },
          { period: '2024-02', quote_count: 25, total_revenue: 125000, won_revenue: 75000 }
        ]
      });

      const response = await request(app)
        .get('/api/analytics/revenue-trends')
        .query({ interval: 'month' });

      expect(response.status).toBe(200);
      expect(response.body.trends).toHaveLength(2);
      expect(response.body.trends[0].period).toBe('2024-01');
    });

    test('should get revenue trends by week', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          { period: '2024-01', quote_count: 5, total_revenue: 25000, won_revenue: 15000 }
        ]
      });

      const response = await request(app)
        .get('/api/analytics/revenue-trends')
        .query({ interval: 'week' });

      expect(response.status).toBe(200);
      expect(response.body.trends).toHaveLength(1);
    });
  });

  describe('GET /api/analytics/top-customers', () => {
    app.get('/api/analytics/top-customers', async (req, res) => {
      try {
        const { start_date, end_date, limit } = req.query;

        const result = await mockPool.query(
          `SELECT
            c.id,
            c.name,
            COUNT(q.id) as quote_count,
            SUM(q.total_amount) as total_value,
            SUM(CASE WHEN q.status = 'accepted' THEN q.total_amount ELSE 0 END) as won_value
          FROM customers c
          INNER JOIN quotations q ON c.id = q.customer_id
          WHERE q.created_at >= $1 AND q.created_at <= $2
          GROUP BY c.id, c.name
          ORDER BY won_value DESC
          LIMIT $3`,
          [start_date || '2024-01-01', end_date || '2024-12-31', limit || 10]
        );

        res.json({ customers: result.rows });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    test('should get top customers', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          { id: 1, name: 'Customer A', quote_count: 10, total_value: 100000, won_value: 80000 },
          { id: 2, name: 'Customer B', quote_count: 8, total_value: 80000, won_value: 60000 }
        ]
      });

      const response = await request(app)
        .get('/api/analytics/top-customers')
        .query({ limit: 10 });

      expect(response.status).toBe(200);
      expect(response.body.customers).toHaveLength(2);
      expect(response.body.customers[0].name).toBe('Customer A');
    });
  });

  describe('GET /api/analytics/user-performance', () => {
    app.get('/api/analytics/user-performance', async (req, res) => {
      try {
        const { start_date, end_date } = req.query;

        const result = await mockPool.query(
          `SELECT
            u.id,
            u.name,
            COUNT(q.id) as quote_count,
            COUNT(CASE WHEN q.status = 'accepted' THEN 1 END) as accepted_count,
            SUM(q.total_amount) as total_value,
            SUM(CASE WHEN q.status = 'accepted' THEN q.total_amount ELSE 0 END) as won_value
          FROM users u
          LEFT JOIN quotations q ON u.id = q.created_by
            AND q.created_at >= $1 AND q.created_at <= $2
          GROUP BY u.id, u.name
          ORDER BY won_value DESC`,
          [start_date || '2024-01-01', end_date || '2024-12-31']
        );

        const performance = result.rows.map(user => ({
          ...user,
          conversion_rate: user.quote_count > 0
            ? ((user.accepted_count / user.quote_count) * 100).toFixed(2)
            : '0.00'
        }));

        res.json({ performance });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    test('should get user performance metrics', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          { id: 1, name: 'User A', quote_count: 50, accepted_count: 30, total_value: 250000, won_value: 150000 },
          { id: 2, name: 'User B', quote_count: 40, accepted_count: 20, total_value: 200000, won_value: 100000 }
        ]
      });

      const response = await request(app).get('/api/analytics/user-performance');

      expect(response.status).toBe(200);
      expect(response.body.performance).toHaveLength(2);
      expect(response.body.performance[0].conversion_rate).toBe('60.00');
    });
  });

  describe('GET /api/analytics/quote-status-distribution', () => {
    app.get('/api/analytics/quote-status-distribution', async (req, res) => {
      try {
        const { start_date, end_date } = req.query;

        const result = await mockPool.query(
          `SELECT
            status,
            COUNT(*) as count,
            SUM(total_amount) as total_value
          FROM quotations
          WHERE created_at >= $1 AND created_at <= $2
          GROUP BY status`,
          [start_date || '2024-01-01', end_date || '2024-12-31']
        );

        res.json({ distribution: result.rows });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    test('should get quote status distribution', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          { status: 'accepted', count: 60, total_value: 300000 },
          { status: 'pending', count: 20, total_value: 100000 },
          { status: 'rejected', count: 20, total_value: 100000 }
        ]
      });

      const response = await request(app).get('/api/analytics/quote-status-distribution');

      expect(response.status).toBe(200);
      expect(response.body.distribution).toHaveLength(3);
    });
  });

  describe('GET /api/analytics/average-response-time', () => {
    app.get('/api/analytics/average-response-time', async (req, res) => {
      try {
        const { start_date, end_date } = req.query;

        const result = await mockPool.query(
          `SELECT
            AVG(EXTRACT(EPOCH FROM (accepted_at - created_at))/86400) as avg_days_to_accept,
            AVG(EXTRACT(EPOCH FROM (sent_at - created_at))/86400) as avg_days_to_send
          FROM quotations
          WHERE created_at >= $1 AND created_at <= $2
            AND (accepted_at IS NOT NULL OR sent_at IS NOT NULL)`,
          [start_date || '2024-01-01', end_date || '2024-12-31']
        );

        res.json({ response_time: result.rows[0] });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    test('should get average response times', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ avg_days_to_accept: 5.2, avg_days_to_send: 2.1 }]
      });

      const response = await request(app).get('/api/analytics/average-response-time');

      expect(response.status).toBe(200);
      expect(response.body.response_time.avg_days_to_accept).toBe(5.2);
      expect(response.body.response_time.avg_days_to_send).toBe(2.1);
    });
  });

  describe('GET /api/analytics/product-performance', () => {
    app.get('/api/analytics/product-performance', async (req, res) => {
      try {
        const { start_date, end_date, limit } = req.query;

        const result = await mockPool.query(
          `SELECT
            p.id,
            p.name,
            COUNT(DISTINCT q.id) as quote_count,
            SUM(qi.quantity) as total_quantity,
            SUM(qi.quantity * qi.unit_price) as total_revenue
          FROM products p
          INNER JOIN quote_items qi ON p.id = qi.product_id
          INNER JOIN quotations q ON qi.quotation_id = q.id
          WHERE q.created_at >= $1 AND q.created_at <= $2
            AND q.status = 'accepted'
          GROUP BY p.id, p.name
          ORDER BY total_revenue DESC
          LIMIT $3`,
          [start_date || '2024-01-01', end_date || '2024-12-31', limit || 10]
        );

        res.json({ products: result.rows });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    test('should get product performance', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          { id: 1, name: 'Product A', quote_count: 20, total_quantity: 100, total_revenue: 50000 },
          { id: 2, name: 'Product B', quote_count: 15, total_quantity: 75, total_revenue: 37500 }
        ]
      });

      const response = await request(app)
        .get('/api/analytics/product-performance')
        .query({ limit: 10 });

      expect(response.status).toBe(200);
      expect(response.body.products).toHaveLength(2);
      expect(response.body.products[0].name).toBe('Product A');
    });
  });

  describe('POST /api/analytics/export', () => {
    app.post('/api/analytics/export', async (req, res) => {
      try {
        const { report_type, format, filters } = req.body;

        if (!report_type || !format) {
          return res.status(400).json({ error: 'Report type and format are required' });
        }

        const validFormats = ['pdf', 'excel', 'csv'];
        if (!validFormats.includes(format)) {
          return res.status(400).json({ error: 'Invalid format' });
        }

        // Mock export
        res.json({
          success: true,
          export_url: `/exports/${report_type}_${Date.now()}.${format}`,
          format
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    test('should export report as PDF', async () => {
      const response = await request(app)
        .post('/api/analytics/export')
        .send({
          report_type: 'dashboard',
          format: 'pdf',
          filters: { start_date: '2024-01-01', end_date: '2024-12-31' }
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.export_url).toContain('.pdf');
    });

    test('should export report as Excel', async () => {
      const response = await request(app)
        .post('/api/analytics/export')
        .send({
          report_type: 'revenue',
          format: 'excel'
        });

      expect(response.status).toBe(200);
      expect(response.body.format).toBe('excel');
    });

    test('should validate format', async () => {
      const response = await request(app)
        .post('/api/analytics/export')
        .send({
          report_type: 'dashboard',
          format: 'invalid'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid');
    });
  });

  describe('GET /api/analytics/customer-insights', () => {
    app.get('/api/analytics/customer-insights', async (req, res) => {
      try {
        const { customer_id } = req.query;

        if (!customer_id) {
          return res.status(400).json({ error: 'Customer ID is required' });
        }

        const result = await mockPool.query(
          `SELECT
            COUNT(*) as total_quotes,
            COUNT(CASE WHEN status = 'accepted' THEN 1 END) as accepted_quotes,
            SUM(total_amount) as total_value,
            SUM(CASE WHEN status = 'accepted' THEN total_amount ELSE 0 END) as won_value,
            AVG(total_amount) as average_quote_value,
            MAX(created_at) as last_quote_date
          FROM quotations
          WHERE customer_id = $1`,
          [customer_id]
        );

        const insights = result.rows[0];
        insights.conversion_rate = insights.total_quotes > 0
          ? ((insights.accepted_quotes / insights.total_quotes) * 100).toFixed(2)
          : '0.00';

        res.json({ insights });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    test('should get customer insights', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{
          total_quotes: 20,
          accepted_quotes: 15,
          total_value: 100000,
          won_value: 75000,
          average_quote_value: 5000,
          last_quote_date: '2024-06-01'
        }]
      });

      const response = await request(app)
        .get('/api/analytics/customer-insights')
        .query({ customer_id: 1 });

      expect(response.status).toBe(200);
      expect(response.body.insights.total_quotes).toBe(20);
      expect(response.body.insights.conversion_rate).toBe('75.00');
    });

    test('should require customer ID', async () => {
      const response = await request(app).get('/api/analytics/customer-insights');

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('required');
    });
  });

  describe('GET /api/analytics/win-loss-reasons', () => {
    app.get('/api/analytics/win-loss-reasons', async (req, res) => {
      try {
        const { start_date, end_date } = req.query;

        const result = await mockPool.query(
          `SELECT
            status,
            rejection_reason,
            COUNT(*) as count
          FROM quotations
          WHERE created_at >= $1 AND created_at <= $2
            AND status IN ('accepted', 'rejected')
          GROUP BY status, rejection_reason
          ORDER BY count DESC`,
          [start_date || '2024-01-01', end_date || '2024-12-31']
        );

        res.json({ reasons: result.rows });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    test('should get win/loss reasons', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          { status: 'rejected', rejection_reason: 'Price too high', count: 15 },
          { status: 'rejected', rejection_reason: 'Competitor offer', count: 10 },
          { status: 'accepted', rejection_reason: null, count: 50 }
        ]
      });

      const response = await request(app).get('/api/analytics/win-loss-reasons');

      expect(response.status).toBe(200);
      expect(response.body.reasons).toHaveLength(3);
    });
  });
});
