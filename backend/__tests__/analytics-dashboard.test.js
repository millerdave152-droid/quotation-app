const request = require('supertest');
const express = require('express');

// Mock database
const mockPool = {
  query: jest.fn()
};

describe('Analytics Dashboard System', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());

    // Middleware to extract user from request
    app.use((req, res, next) => {
      req.user = req.headers['x-user-id']
        ? { id: parseInt(req.headers['x-user-id']), role: req.headers['x-user-role'] || 'user' }
        : null;
      next();
    });

    // GET /api/analytics/overview
    app.get('/api/analytics/overview', async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Authentication required' });
        }

        const { start_date, end_date } = req.query;

        // Get total quotes
        const quotesResult = await mockPool.query(
          `SELECT COUNT(*) as total_quotes,
                  AVG(total_amount) as avg_quote_value,
                  SUM(total_amount) as total_quote_value
           FROM quotations
           WHERE created_at BETWEEN $1 AND $2`,
          [start_date || '2024-01-01', end_date || '2024-12-31']
        );

        // Get conversion metrics
        const conversionResult = await mockPool.query(
          `SELECT
             COUNT(*) FILTER (WHERE status = 'accepted') as accepted_quotes,
             COUNT(*) FILTER (WHERE status = 'rejected') as rejected_quotes,
             COUNT(*) FILTER (WHERE status = 'pending') as pending_quotes
           FROM quotations
           WHERE created_at BETWEEN $1 AND $2`,
          [start_date || '2024-01-01', end_date || '2024-12-31']
        );

        // Get revenue
        const revenueResult = await mockPool.query(
          `SELECT SUM(total_amount) as total_revenue
           FROM quotations
           WHERE status = 'accepted' AND created_at BETWEEN $1 AND $2`,
          [start_date || '2024-01-01', end_date || '2024-12-31']
        );

        const totalQuotes = parseInt(quotesResult.rows[0].total_quotes);
        const acceptedQuotes = parseInt(conversionResult.rows[0].accepted_quotes);
        const conversionRate = totalQuotes > 0 ? (acceptedQuotes / totalQuotes) * 100 : 0;

        res.json({
          total_quotes: totalQuotes,
          avg_quote_value: parseFloat(quotesResult.rows[0].avg_quote_value || 0),
          total_quote_value: parseFloat(quotesResult.rows[0].total_quote_value || 0),
          accepted_quotes: acceptedQuotes,
          rejected_quotes: parseInt(conversionResult.rows[0].rejected_quotes),
          pending_quotes: parseInt(conversionResult.rows[0].pending_quotes),
          conversion_rate: parseFloat(conversionRate.toFixed(2)),
          total_revenue: parseFloat(revenueResult.rows[0].total_revenue || 0)
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/analytics/quotes-by-status
    app.get('/api/analytics/quotes-by-status', async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Authentication required' });
        }

        const { start_date, end_date } = req.query;

        const result = await mockPool.query(
          `SELECT status, COUNT(*) as count, SUM(total_amount) as total_value
           FROM quotations
           WHERE created_at BETWEEN $1 AND $2
           GROUP BY status
           ORDER BY count DESC`,
          [start_date || '2024-01-01', end_date || '2024-12-31']
        );

        res.json({
          data: result.rows.map(row => ({
            status: row.status,
            count: parseInt(row.count),
            total_value: parseFloat(row.total_value || 0)
          }))
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/analytics/revenue-trends
    app.get('/api/analytics/revenue-trends', async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Authentication required' });
        }

        const { start_date, end_date, interval } = req.query;

        if (!interval || !['daily', 'weekly', 'monthly'].includes(interval)) {
          return res.status(400).json({ error: 'Invalid interval. Must be daily, weekly, or monthly' });
        }

        let dateFormat;
        if (interval === 'daily') {
          dateFormat = 'YYYY-MM-DD';
        } else if (interval === 'weekly') {
          dateFormat = 'IYYY-IW';
        } else {
          dateFormat = 'YYYY-MM';
        }

        const result = await mockPool.query(
          `SELECT
             TO_CHAR(created_at, $3) as period,
             COUNT(*) as quote_count,
             SUM(total_amount) FILTER (WHERE status = 'accepted') as revenue,
             SUM(total_amount) as total_quoted
           FROM quotations
           WHERE created_at BETWEEN $1 AND $2
           GROUP BY period
           ORDER BY period`,
          [start_date || '2024-01-01', end_date || '2024-12-31', dateFormat]
        );

        res.json({
          interval: interval,
          data: result.rows.map(row => ({
            period: row.period,
            quote_count: parseInt(row.quote_count),
            revenue: parseFloat(row.revenue || 0),
            total_quoted: parseFloat(row.total_quoted || 0)
          }))
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/analytics/conversion-rates
    app.get('/api/analytics/conversion-rates', async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Authentication required' });
        }

        const { start_date, end_date, group_by } = req.query;

        let groupByColumn = 'customer_id';
        if (group_by === 'sales_rep') {
          groupByColumn = 'created_by';
        } else if (group_by === 'product') {
          groupByColumn = 'product_id';
        }

        const result = await mockPool.query(
          `SELECT
             ${groupByColumn} as group_id,
             COUNT(*) as total_quotes,
             COUNT(*) FILTER (WHERE status = 'accepted') as accepted_quotes,
             ROUND((COUNT(*) FILTER (WHERE status = 'accepted')::numeric / COUNT(*)::numeric * 100), 2) as conversion_rate
           FROM quotations
           WHERE created_at BETWEEN $1 AND $2
           GROUP BY ${groupByColumn}
           HAVING COUNT(*) >= 5
           ORDER BY conversion_rate DESC
           LIMIT 20`,
          [start_date || '2024-01-01', end_date || '2024-12-31']
        );

        res.json({
          group_by: group_by || 'customer',
          data: result.rows.map(row => ({
            group_id: row.group_id,
            total_quotes: parseInt(row.total_quotes),
            accepted_quotes: parseInt(row.accepted_quotes),
            conversion_rate: parseFloat(row.conversion_rate || 0)
          }))
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/analytics/top-customers
    app.get('/api/analytics/top-customers', async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Authentication required' });
        }

        const { start_date, end_date, limit } = req.query;
        const maxResults = Math.min(parseInt(limit) || 10, 50);

        const result = await mockPool.query(
          `SELECT
             c.id,
             c.name,
             c.email,
             COUNT(q.id) as quote_count,
             SUM(q.total_amount) FILTER (WHERE q.status = 'accepted') as total_revenue,
             AVG(q.total_amount) as avg_quote_value
           FROM customers c
           JOIN quotations q ON c.id = q.customer_id
           WHERE q.created_at BETWEEN $1 AND $2
           GROUP BY c.id, c.name, c.email
           ORDER BY total_revenue DESC NULLS LAST, quote_count DESC
           LIMIT $3`,
          [start_date || '2024-01-01', end_date || '2024-12-31', maxResults]
        );

        res.json({
          data: result.rows.map(row => ({
            customer_id: row.id,
            name: row.name,
            email: row.email,
            quote_count: parseInt(row.quote_count),
            total_revenue: parseFloat(row.total_revenue || 0),
            avg_quote_value: parseFloat(row.avg_quote_value || 0)
          }))
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/analytics/top-products
    app.get('/api/analytics/top-products', async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Authentication required' });
        }

        const { start_date, end_date, limit } = req.query;
        const maxResults = Math.min(parseInt(limit) || 10, 50);

        const result = await mockPool.query(
          `SELECT
             p.id,
             p.name,
             p.sku,
             COUNT(qi.id) as times_quoted,
             SUM(qi.quantity) as total_quantity,
             SUM(qi.quantity * qi.unit_price) as total_value
           FROM products p
           JOIN quotation_items qi ON p.id = qi.product_id
           JOIN quotations q ON qi.quotation_id = q.id
           WHERE q.created_at BETWEEN $1 AND $2
           GROUP BY p.id, p.name, p.sku
           ORDER BY times_quoted DESC, total_value DESC
           LIMIT $3`,
          [start_date || '2024-01-01', end_date || '2024-12-31', maxResults]
        );

        res.json({
          data: result.rows.map(row => ({
            product_id: row.id,
            name: row.name,
            sku: row.sku,
            times_quoted: parseInt(row.times_quoted),
            total_quantity: parseInt(row.total_quantity),
            total_value: parseFloat(row.total_value || 0)
          }))
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/analytics/sales-performance
    app.get('/api/analytics/sales-performance', async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Authentication required' });
        }

        const { start_date, end_date } = req.query;

        const result = await mockPool.query(
          `SELECT
             u.id,
             u.name,
             u.email,
             COUNT(q.id) as quotes_created,
             COUNT(*) FILTER (WHERE q.status = 'accepted') as quotes_won,
             COUNT(*) FILTER (WHERE q.status = 'rejected') as quotes_lost,
             SUM(q.total_amount) FILTER (WHERE q.status = 'accepted') as total_revenue,
             AVG(q.total_amount) as avg_quote_value,
             ROUND((COUNT(*) FILTER (WHERE q.status = 'accepted')::numeric / NULLIF(COUNT(q.id), 0)::numeric * 100), 2) as win_rate
           FROM users u
           LEFT JOIN quotations q ON u.id = q.created_by
           WHERE q.created_at BETWEEN $1 AND $2 OR q.created_at IS NULL
           GROUP BY u.id, u.name, u.email
           HAVING COUNT(q.id) > 0
           ORDER BY total_revenue DESC NULLS LAST`,
          [start_date || '2024-01-01', end_date || '2024-12-31']
        );

        res.json({
          data: result.rows.map(row => ({
            user_id: row.id,
            name: row.name,
            email: row.email,
            quotes_created: parseInt(row.quotes_created),
            quotes_won: parseInt(row.quotes_won),
            quotes_lost: parseInt(row.quotes_lost),
            total_revenue: parseFloat(row.total_revenue || 0),
            avg_quote_value: parseFloat(row.avg_quote_value || 0),
            win_rate: parseFloat(row.win_rate || 0)
          }))
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/analytics/quote-velocity
    app.get('/api/analytics/quote-velocity', async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Authentication required' });
        }

        const { start_date, end_date } = req.query;

        const result = await mockPool.query(
          `SELECT
             AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 3600) FILTER (WHERE status IN ('accepted', 'rejected')) as avg_time_to_decision_hours,
             AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 3600) FILTER (WHERE status = 'accepted') as avg_time_to_win_hours,
             AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 3600) FILTER (WHERE status = 'rejected') as avg_time_to_loss_hours,
             COUNT(*) FILTER (WHERE status = 'pending' AND expires_at < NOW()) as expired_quotes,
             COUNT(*) FILTER (WHERE status = 'pending') as pending_quotes
           FROM quotations
           WHERE created_at BETWEEN $1 AND $2`,
          [start_date || '2024-01-01', end_date || '2024-12-31']
        );

        const row = result.rows[0];

        res.json({
          avg_time_to_decision_hours: parseFloat(row.avg_time_to_decision_hours || 0).toFixed(2),
          avg_time_to_win_hours: parseFloat(row.avg_time_to_win_hours || 0).toFixed(2),
          avg_time_to_loss_hours: parseFloat(row.avg_time_to_loss_hours || 0).toFixed(2),
          expired_quotes: parseInt(row.expired_quotes || 0),
          pending_quotes: parseInt(row.pending_quotes || 0)
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/analytics/discount-impact
    app.get('/api/analytics/discount-impact', async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Authentication required' });
        }

        const { start_date, end_date } = req.query;

        const result = await mockPool.query(
          `SELECT
             COUNT(*) FILTER (WHERE discount_amount > 0) as quotes_with_discount,
             COUNT(*) FILTER (WHERE discount_amount = 0 OR discount_amount IS NULL) as quotes_without_discount,
             COUNT(*) FILTER (WHERE discount_amount > 0 AND status = 'accepted') as discounted_quotes_won,
             COUNT(*) FILTER (WHERE (discount_amount = 0 OR discount_amount IS NULL) AND status = 'accepted') as non_discounted_quotes_won,
             AVG(discount_amount) FILTER (WHERE discount_amount > 0) as avg_discount_amount,
             SUM(discount_amount) as total_discount_given
           FROM quotations
           WHERE created_at BETWEEN $1 AND $2`,
          [start_date || '2024-01-01', end_date || '2024-12-31']
        );

        const row = result.rows[0];
        const quotesWithDiscount = parseInt(row.quotes_with_discount || 0);
        const quotesWithoutDiscount = parseInt(row.quotes_without_discount || 0);
        const discountedWon = parseInt(row.discounted_quotes_won || 0);
        const nonDiscountedWon = parseInt(row.non_discounted_quotes_won || 0);

        const discountConversionRate = quotesWithDiscount > 0
          ? (discountedWon / quotesWithDiscount) * 100
          : 0;
        const nonDiscountConversionRate = quotesWithoutDiscount > 0
          ? (nonDiscountedWon / quotesWithoutDiscount) * 100
          : 0;

        res.json({
          quotes_with_discount: quotesWithDiscount,
          quotes_without_discount: quotesWithoutDiscount,
          discounted_quotes_won: discountedWon,
          non_discounted_quotes_won: nonDiscountedWon,
          discount_conversion_rate: parseFloat(discountConversionRate.toFixed(2)),
          non_discount_conversion_rate: parseFloat(nonDiscountConversionRate.toFixed(2)),
          avg_discount_amount: parseFloat(row.avg_discount_amount || 0),
          total_discount_given: parseFloat(row.total_discount_given || 0)
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/analytics/expiration-analysis
    app.get('/api/analytics/expiration-analysis', async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Authentication required' });
        }

        const { days_ahead } = req.query;
        const daysAhead = parseInt(days_ahead) || 7;

        const result = await mockPool.query(
          `SELECT
             COUNT(*) FILTER (WHERE expires_at < NOW() AND status = 'pending') as expired_pending,
             COUNT(*) FILTER (WHERE expires_at BETWEEN NOW() AND NOW() + INTERVAL '1 day' * $1 AND status = 'pending') as expiring_soon,
             COUNT(*) FILTER (WHERE status = 'pending' AND expires_at > NOW()) as active_pending,
             AVG(total_amount) FILTER (WHERE expires_at < NOW() AND status = 'pending') as avg_expired_value
           FROM quotations`,
          [daysAhead]
        );

        const row = result.rows[0];

        res.json({
          expired_pending: parseInt(row.expired_pending || 0),
          expiring_soon: parseInt(row.expiring_soon || 0),
          active_pending: parseInt(row.active_pending || 0),
          avg_expired_value: parseFloat(row.avg_expired_value || 0),
          days_ahead: daysAhead
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/analytics/comparison
    app.get('/api/analytics/comparison', async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Authentication required' });
        }

        const { current_start, current_end, previous_start, previous_end } = req.query;

        if (!current_start || !current_end || !previous_start || !previous_end) {
          return res.status(400).json({
            error: 'All date parameters required: current_start, current_end, previous_start, previous_end'
          });
        }

        // Current period
        const currentResult = await mockPool.query(
          `SELECT
             COUNT(*) as total_quotes,
             SUM(total_amount) FILTER (WHERE status = 'accepted') as revenue,
             COUNT(*) FILTER (WHERE status = 'accepted') as accepted_quotes
           FROM quotations
           WHERE created_at BETWEEN $1 AND $2`,
          [current_start, current_end]
        );

        // Previous period
        const previousResult = await mockPool.query(
          `SELECT
             COUNT(*) as total_quotes,
             SUM(total_amount) FILTER (WHERE status = 'accepted') as revenue,
             COUNT(*) FILTER (WHERE status = 'accepted') as accepted_quotes
           FROM quotations
           WHERE created_at BETWEEN $1 AND $2`,
          [previous_start, previous_end]
        );

        const current = currentResult.rows[0];
        const previous = previousResult.rows[0];

        const calculateChange = (current, previous) => {
          if (!previous || previous === 0) return null;
          return parseFloat((((current - previous) / previous) * 100).toFixed(2));
        };

        res.json({
          current_period: {
            total_quotes: parseInt(current.total_quotes || 0),
            revenue: parseFloat(current.revenue || 0),
            accepted_quotes: parseInt(current.accepted_quotes || 0)
          },
          previous_period: {
            total_quotes: parseInt(previous.total_quotes || 0),
            revenue: parseFloat(previous.revenue || 0),
            accepted_quotes: parseInt(previous.accepted_quotes || 0)
          },
          changes: {
            quotes_change_percent: calculateChange(
              parseInt(current.total_quotes || 0),
              parseInt(previous.total_quotes || 0)
            ),
            revenue_change_percent: calculateChange(
              parseFloat(current.revenue || 0),
              parseFloat(previous.revenue || 0)
            ),
            accepted_quotes_change_percent: calculateChange(
              parseInt(current.accepted_quotes || 0),
              parseInt(previous.accepted_quotes || 0)
            )
          }
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/analytics/overview', () => {
    test('should return overview analytics', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ total_quotes: 100, avg_quote_value: 5000, total_quote_value: 500000 }] })
        .mockResolvedValueOnce({ rows: [{ accepted_quotes: 40, rejected_quotes: 20, pending_quotes: 40 }] })
        .mockResolvedValueOnce({ rows: [{ total_revenue: 200000 }] });

      const response = await request(app)
        .get('/api/analytics/overview')
        .set('x-user-id', '1')
        .query({ start_date: '2024-01-01', end_date: '2024-12-31' });

      expect(response.status).toBe(200);
      expect(response.body.total_quotes).toBe(100);
      expect(response.body.avg_quote_value).toBe(5000);
      expect(response.body.conversion_rate).toBe(40);
      expect(response.body.total_revenue).toBe(200000);
    });

    test('should require authentication', async () => {
      const response = await request(app)
        .get('/api/analytics/overview');

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/analytics/quotes-by-status', () => {
    test('should return quotes grouped by status', async () => {
      const mockData = [
        { status: 'pending', count: '50', total_value: '250000' },
        { status: 'accepted', count: '40', total_value: '200000' },
        { status: 'rejected', count: '10', total_value: '50000' }
      ];

      mockPool.query.mockResolvedValue({ rows: mockData });

      const response = await request(app)
        .get('/api/analytics/quotes-by-status')
        .set('x-user-id', '1')
        .query({ start_date: '2024-01-01', end_date: '2024-12-31' });

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(3);
      expect(response.body.data[0].status).toBe('pending');
      expect(response.body.data[0].count).toBe(50);
    });
  });

  describe('GET /api/analytics/revenue-trends', () => {
    test('should return daily revenue trends', async () => {
      const mockData = [
        { period: '2024-01-01', quote_count: '5', revenue: '25000', total_quoted: '30000' },
        { period: '2024-01-02', quote_count: '8', revenue: '40000', total_quoted: '50000' }
      ];

      mockPool.query.mockResolvedValue({ rows: mockData });

      const response = await request(app)
        .get('/api/analytics/revenue-trends')
        .set('x-user-id', '1')
        .query({ start_date: '2024-01-01', end_date: '2024-01-31', interval: 'daily' });

      expect(response.status).toBe(200);
      expect(response.body.interval).toBe('daily');
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0].period).toBe('2024-01-01');
      expect(response.body.data[0].revenue).toBe(25000);
    });

    test('should validate interval parameter', async () => {
      const response = await request(app)
        .get('/api/analytics/revenue-trends')
        .set('x-user-id', '1')
        .query({ interval: 'invalid' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid interval');
    });

    test('should support weekly interval', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .get('/api/analytics/revenue-trends')
        .set('x-user-id', '1')
        .query({ interval: 'weekly' });

      expect(response.status).toBe(200);
      expect(response.body.interval).toBe('weekly');
    });

    test('should support monthly interval', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .get('/api/analytics/revenue-trends')
        .set('x-user-id', '1')
        .query({ interval: 'monthly' });

      expect(response.status).toBe(200);
      expect(response.body.interval).toBe('monthly');
    });
  });

  describe('GET /api/analytics/conversion-rates', () => {
    test('should return conversion rates by customer', async () => {
      const mockData = [
        { group_id: 1, total_quotes: 10, accepted_quotes: 8, conversion_rate: '80.00' },
        { group_id: 2, total_quotes: 5, accepted_quotes: 3, conversion_rate: '60.00' }
      ];

      mockPool.query.mockResolvedValue({ rows: mockData });

      const response = await request(app)
        .get('/api/analytics/conversion-rates')
        .set('x-user-id', '1')
        .query({ group_by: 'customer' });

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0].conversion_rate).toBe(80);
    });

    test('should support grouping by sales rep', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .get('/api/analytics/conversion-rates')
        .set('x-user-id', '1')
        .query({ group_by: 'sales_rep' });

      expect(response.status).toBe(200);
      expect(response.body.group_by).toBe('sales_rep');
    });
  });

  describe('GET /api/analytics/top-customers', () => {
    test('should return top customers by revenue', async () => {
      const mockData = [
        { id: 1, name: 'Acme Corp', email: 'contact@acme.com', quote_count: '15', total_revenue: '150000', avg_quote_value: '10000' },
        { id: 2, name: 'Tech Inc', email: 'hello@tech.com', quote_count: '10', total_revenue: '100000', avg_quote_value: '10000' }
      ];

      mockPool.query.mockResolvedValue({ rows: mockData });

      const response = await request(app)
        .get('/api/analytics/top-customers')
        .set('x-user-id', '1')
        .query({ limit: 10 });

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0].name).toBe('Acme Corp');
      expect(response.body.data[0].total_revenue).toBe(150000);
    });

    test('should enforce maximum limit', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .get('/api/analytics/top-customers')
        .set('x-user-id', '1')
        .query({ limit: 1000 });

      expect(response.status).toBe(200);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([expect.any(String), expect.any(String), 50])
      );
    });
  });

  describe('GET /api/analytics/top-products', () => {
    test('should return top products by quote frequency', async () => {
      const mockData = [
        { id: 1, name: 'Widget Pro', sku: 'WP-001', times_quoted: '50', total_quantity: '500', total_value: '50000' },
        { id: 2, name: 'Gadget Max', sku: 'GM-002', times_quoted: '40', total_quantity: '200', total_value: '40000' }
      ];

      mockPool.query.mockResolvedValue({ rows: mockData });

      const response = await request(app)
        .get('/api/analytics/top-products')
        .set('x-user-id', '1');

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0].name).toBe('Widget Pro');
      expect(response.body.data[0].times_quoted).toBe(50);
    });
  });

  describe('GET /api/analytics/sales-performance', () => {
    test('should return sales rep performance metrics', async () => {
      const mockData = [
        {
          id: 1,
          name: 'John Doe',
          email: 'john@company.com',
          quotes_created: '20',
          quotes_won: '15',
          quotes_lost: '5',
          total_revenue: '150000',
          avg_quote_value: '7500',
          win_rate: '75.00'
        }
      ];

      mockPool.query.mockResolvedValue({ rows: mockData });

      const response = await request(app)
        .get('/api/analytics/sales-performance')
        .set('x-user-id', '1');

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].name).toBe('John Doe');
      expect(response.body.data[0].win_rate).toBe(75);
    });
  });

  describe('GET /api/analytics/quote-velocity', () => {
    test('should return quote timing metrics', async () => {
      const mockData = {
        avg_time_to_decision_hours: '48.5',
        avg_time_to_win_hours: '36.2',
        avg_time_to_loss_hours: '60.8',
        expired_quotes: '5',
        pending_quotes: '25'
      };

      mockPool.query.mockResolvedValue({ rows: [mockData] });

      const response = await request(app)
        .get('/api/analytics/quote-velocity')
        .set('x-user-id', '1');

      expect(response.status).toBe(200);
      expect(parseFloat(response.body.avg_time_to_decision_hours)).toBeCloseTo(48.5, 1);
      expect(response.body.expired_quotes).toBe(5);
      expect(response.body.pending_quotes).toBe(25);
    });
  });

  describe('GET /api/analytics/discount-impact', () => {
    test('should return discount impact analysis', async () => {
      const mockData = {
        quotes_with_discount: '60',
        quotes_without_discount: '40',
        discounted_quotes_won: '45',
        non_discounted_quotes_won: '20',
        avg_discount_amount: '500',
        total_discount_given: '30000'
      };

      mockPool.query.mockResolvedValue({ rows: [mockData] });

      const response = await request(app)
        .get('/api/analytics/discount-impact')
        .set('x-user-id', '1');

      expect(response.status).toBe(200);
      expect(response.body.quotes_with_discount).toBe(60);
      expect(response.body.discount_conversion_rate).toBe(75);
      expect(response.body.non_discount_conversion_rate).toBe(50);
      expect(response.body.total_discount_given).toBe(30000);
    });
  });

  describe('GET /api/analytics/expiration-analysis', () => {
    test('should return expiration analysis', async () => {
      const mockData = {
        expired_pending: '8',
        expiring_soon: '12',
        active_pending: '30',
        avg_expired_value: '5000'
      };

      mockPool.query.mockResolvedValue({ rows: [mockData] });

      const response = await request(app)
        .get('/api/analytics/expiration-analysis')
        .set('x-user-id', '1')
        .query({ days_ahead: 7 });

      expect(response.status).toBe(200);
      expect(response.body.expired_pending).toBe(8);
      expect(response.body.expiring_soon).toBe(12);
      expect(response.body.days_ahead).toBe(7);
    });

    test('should use default days_ahead if not provided', async () => {
      mockPool.query.mockResolvedValue({ rows: [{}] });

      const response = await request(app)
        .get('/api/analytics/expiration-analysis')
        .set('x-user-id', '1');

      expect(response.status).toBe(200);
      expect(response.body.days_ahead).toBe(7);
    });
  });

  describe('GET /api/analytics/comparison', () => {
    test('should compare two time periods', async () => {
      const currentData = { total_quotes: '100', revenue: '200000', accepted_quotes: '60' };
      const previousData = { total_quotes: '80', revenue: '150000', accepted_quotes: '45' };

      mockPool.query
        .mockResolvedValueOnce({ rows: [currentData] })
        .mockResolvedValueOnce({ rows: [previousData] });

      const response = await request(app)
        .get('/api/analytics/comparison')
        .set('x-user-id', '1')
        .query({
          current_start: '2024-07-01',
          current_end: '2024-07-31',
          previous_start: '2024-06-01',
          previous_end: '2024-06-30'
        });

      expect(response.status).toBe(200);
      expect(response.body.current_period.total_quotes).toBe(100);
      expect(response.body.previous_period.total_quotes).toBe(80);
      expect(response.body.changes.quotes_change_percent).toBe(25);
      expect(response.body.changes.revenue_change_percent).toBeCloseTo(33.33, 1);
    });

    test('should validate required date parameters', async () => {
      const response = await request(app)
        .get('/api/analytics/comparison')
        .set('x-user-id', '1')
        .query({ current_start: '2024-07-01' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('All date parameters required');
    });

    test('should handle null previous values', async () => {
      const currentData = { total_quotes: '100', revenue: '200000', accepted_quotes: '60' };
      const previousData = { total_quotes: '0', revenue: null, accepted_quotes: '0' };

      mockPool.query
        .mockResolvedValueOnce({ rows: [currentData] })
        .mockResolvedValueOnce({ rows: [previousData] });

      const response = await request(app)
        .get('/api/analytics/comparison')
        .set('x-user-id', '1')
        .query({
          current_start: '2024-07-01',
          current_end: '2024-07-31',
          previous_start: '2024-06-01',
          previous_end: '2024-06-30'
        });

      expect(response.status).toBe(200);
      expect(response.body.changes.revenue_change_percent).toBeNull();
    });
  });
});
