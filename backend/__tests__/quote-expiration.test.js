const request = require('supertest');
const express = require('express');

// Mock database
const mockPool = {
  query: jest.fn()
};

// Mock date utilities
const mockDateUtils = {
  addDays: (date, days) => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  },
  daysBetween: (date1, date2) => {
    const diffTime = Math.abs(new Date(date2) - new Date(date1));
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  },
  isExpired: (expirationDate) => {
    return new Date(expirationDate) < new Date();
  }
};

describe('Quote Expiration System', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());

    // POST /api/quotations/:id/set-expiration
    app.post('/api/quotations/:id/set-expiration', async (req, res) => {
      try {
        const { days_valid, custom_expiration_date } = req.body;

        if ((days_valid === undefined || days_valid === null) && !custom_expiration_date) {
          return res.status(400).json({
            error: 'Either days_valid or custom_expiration_date is required'
          });
        }

        if (days_valid !== undefined && days_valid !== null && days_valid <= 0) {
          return res.status(400).json({
            error: 'Days valid must be a positive number'
          });
        }

        // Get quote
        const quoteResult = await mockPool.query(
          'SELECT * FROM quotations WHERE id = $1',
          [req.params.id]
        );

        if (quoteResult.rows.length === 0) {
          return res.status(404).json({ error: 'Quote not found' });
        }

        // Calculate expiration date
        let expirationDate;
        if (custom_expiration_date) {
          expirationDate = new Date(custom_expiration_date);
          if (expirationDate < new Date()) {
            return res.status(400).json({
              error: 'Expiration date cannot be in the past'
            });
          }
        } else {
          expirationDate = mockDateUtils.addDays(new Date(), days_valid);
        }

        // Update quote
        const updateResult = await mockPool.query(
          `UPDATE quotations
           SET valid_until = $1, days_valid = $2, updated_at = CURRENT_TIMESTAMP
           WHERE id = $3
           RETURNING *`,
          [expirationDate, days_valid || null, req.params.id]
        );

        res.json({
          success: true,
          quote: updateResult.rows[0],
          expiration_date: expirationDate,
          days_until_expiration: mockDateUtils.daysBetween(new Date(), expirationDate)
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/quotations/:id/expiration-status
    app.get('/api/quotations/:id/expiration-status', async (req, res) => {
      try {
        const quoteResult = await mockPool.query(
          'SELECT id, quote_number, valid_until, status FROM quotations WHERE id = $1',
          [req.params.id]
        );

        if (quoteResult.rows.length === 0) {
          return res.status(404).json({ error: 'Quote not found' });
        }

        const quote = quoteResult.rows[0];

        if (!quote.valid_until) {
          return res.json({
            has_expiration: false,
            is_expired: false,
            message: 'No expiration date set'
          });
        }

        const isExpired = mockDateUtils.isExpired(quote.valid_until);
        const daysRemaining = isExpired
          ? 0
          : mockDateUtils.daysBetween(new Date(), quote.valid_until);

        let status = 'valid';
        if (isExpired) {
          status = 'expired';
        } else if (daysRemaining <= 3) {
          status = 'expiring_soon';
        }

        res.json({
          has_expiration: true,
          is_expired: isExpired,
          expiration_date: quote.valid_until,
          days_remaining: daysRemaining,
          status: status,
          quote_status: quote.status
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/quotations/:id/extend
    app.post('/api/quotations/:id/extend', async (req, res) => {
      try {
        const { additional_days, new_expiration_date } = req.body;

        if (!additional_days && !new_expiration_date) {
          return res.status(400).json({
            error: 'Either additional_days or new_expiration_date is required'
          });
        }

        if (additional_days && additional_days <= 0) {
          return res.status(400).json({
            error: 'Additional days must be positive'
          });
        }

        const quoteResult = await mockPool.query(
          'SELECT * FROM quotations WHERE id = $1',
          [req.params.id]
        );

        if (quoteResult.rows.length === 0) {
          return res.status(404).json({ error: 'Quote not found' });
        }

        const quote = quoteResult.rows[0];

        if (!quote.valid_until) {
          return res.status(400).json({
            error: 'Quote has no expiration date to extend'
          });
        }

        let newExpirationDate;
        if (new_expiration_date) {
          newExpirationDate = new Date(new_expiration_date);
        } else {
          newExpirationDate = mockDateUtils.addDays(
            new Date(quote.valid_until),
            additional_days
          );
        }

        // Update quote
        const updateResult = await mockPool.query(
          `UPDATE quotations
           SET valid_until = $1, updated_at = CURRENT_TIMESTAMP
           WHERE id = $2
           RETURNING *`,
          [newExpirationDate, req.params.id]
        );

        // Log extension
        await mockPool.query(
          `INSERT INTO quote_expiration_log
           (quote_id, action, old_expiration, new_expiration)
           VALUES ($1, $2, $3, $4)`,
          [req.params.id, 'extended', quote.valid_until, newExpirationDate]
        );

        res.json({
          success: true,
          message: 'Quote expiration extended',
          old_expiration: quote.valid_until,
          new_expiration: newExpirationDate,
          days_added: additional_days || mockDateUtils.daysBetween(quote.valid_until, newExpirationDate)
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/quotations/expire-batch
    app.post('/api/quotations/expire-batch', async (req, res) => {
      try {
        // Find all quotes that should be expired
        const expiredQuotes = await mockPool.query(
          `SELECT id, quote_number, valid_until, status
           FROM quotations
           WHERE valid_until < NOW()
           AND status NOT IN ('expired', 'approved', 'rejected')`
        );

        if (expiredQuotes.rows.length === 0) {
          return res.json({
            success: true,
            expired_count: 0,
            message: 'No quotes to expire'
          });
        }

        // Update all expired quotes
        const updateResult = await mockPool.query(
          `UPDATE quotations
           SET status = 'expired', updated_at = CURRENT_TIMESTAMP
           WHERE valid_until < NOW()
           AND status NOT IN ('expired', 'approved', 'rejected')
           RETURNING id, quote_number`
        );

        // Log each expiration
        for (const quote of updateResult.rows) {
          await mockPool.query(
            `INSERT INTO quote_expiration_log
             (quote_id, action, old_status, new_status)
             VALUES ($1, $2, $3, $4)`,
            [quote.id, 'auto_expired', 'sent', 'expired']
          );
        }

        res.json({
          success: true,
          expired_count: updateResult.rows.length,
          expired_quotes: updateResult.rows,
          message: `${updateResult.rows.length} quote(s) marked as expired`
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/quotations/expiring-soon
    app.get('/api/quotations/expiring-soon', async (req, res) => {
      try {
        const { days = 7 } = req.query;

        const expiringQuotes = await mockPool.query(
          `SELECT id, quote_number, customer_id, valid_until, total_amount, status
           FROM quotations
           WHERE valid_until BETWEEN NOW() AND NOW() + INTERVAL '${days} days'
           AND status = 'sent'
           ORDER BY valid_until ASC`
        );

        const quotesWithDays = expiringQuotes.rows.map(quote => ({
          ...quote,
          days_until_expiration: mockDateUtils.daysBetween(new Date(), quote.valid_until)
        }));

        res.json({
          count: quotesWithDays.length,
          quotes: quotesWithDays,
          threshold_days: parseInt(days)
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/quotations/:id/renew
    app.post('/api/quotations/:id/renew', async (req, res) => {
      try {
        const { days_valid = 30 } = req.body;

        const quoteResult = await mockPool.query(
          'SELECT * FROM quotations WHERE id = $1',
          [req.params.id]
        );

        if (quoteResult.rows.length === 0) {
          return res.status(404).json({ error: 'Quote not found' });
        }

        const quote = quoteResult.rows[0];

        if (quote.status !== 'expired') {
          return res.status(400).json({
            error: 'Only expired quotes can be renewed'
          });
        }

        const newExpirationDate = mockDateUtils.addDays(new Date(), days_valid);

        const updateResult = await mockPool.query(
          `UPDATE quotations
           SET status = 'sent', valid_until = $1, updated_at = CURRENT_TIMESTAMP
           WHERE id = $2
           RETURNING *`,
          [newExpirationDate, req.params.id]
        );

        await mockPool.query(
          `INSERT INTO quote_expiration_log
           (quote_id, action, old_status, new_status, new_expiration)
           VALUES ($1, $2, $3, $4, $5)`,
          [req.params.id, 'renewed', 'expired', 'sent', newExpirationDate]
        );

        res.json({
          success: true,
          message: 'Quote renewed successfully',
          quote: updateResult.rows[0],
          new_expiration: newExpirationDate,
          days_valid: days_valid
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/quotations/:id/expiration-log
    app.get('/api/quotations/:id/expiration-log', async (req, res) => {
      try {
        const logResult = await mockPool.query(
          `SELECT * FROM quote_expiration_log
           WHERE quote_id = $1
           ORDER BY created_at DESC`,
          [req.params.id]
        );

        res.json({
          count: logResult.rows.length,
          log: logResult.rows
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/quotations/:id/set-expiration', () => {
    test('should set expiration using days_valid', async () => {
      const mockQuote = { id: 1, quote_number: 'Q-001' };
      const mockUpdated = {
        ...mockQuote,
        valid_until: mockDateUtils.addDays(new Date(), 30),
        days_valid: 30
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockQuote] })
        .mockResolvedValueOnce({ rows: [mockUpdated] });

      const response = await request(app)
        .post('/api/quotations/1/set-expiration')
        .send({ days_valid: 30 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('expiration_date');
      expect(response.body).toHaveProperty('days_until_expiration');
    });

    test('should set expiration using custom date', async () => {
      const customDate = new Date();
      customDate.setDate(customDate.getDate() + 45);

      const mockQuote = { id: 1 };
      const mockUpdated = { ...mockQuote, valid_until: customDate };

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockQuote] })
        .mockResolvedValueOnce({ rows: [mockUpdated] });

      const response = await request(app)
        .post('/api/quotations/1/set-expiration')
        .send({ custom_expiration_date: customDate });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('should reject past expiration dates', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);

      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });

      const response = await request(app)
        .post('/api/quotations/1/set-expiration')
        .send({ custom_expiration_date: pastDate });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('cannot be in the past');
    });

    test('should reject zero or negative days', async () => {
      const response = await request(app)
        .post('/api/quotations/1/set-expiration')
        .send({ days_valid: 0 });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('must be a positive number');
    });

    test('should return 404 for non-existent quote', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .post('/api/quotations/999/set-expiration')
        .send({ days_valid: 30 });

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/quotations/:id/expiration-status', () => {
    test('should return status for quote with expiration', async () => {
      const futureDate = mockDateUtils.addDays(new Date(), 10);
      const mockQuote = {
        id: 1,
        quote_number: 'Q-001',
        valid_until: futureDate,
        status: 'sent'
      };

      mockPool.query.mockResolvedValue({ rows: [mockQuote] });

      const response = await request(app).get('/api/quotations/1/expiration-status');

      expect(response.status).toBe(200);
      expect(response.body.has_expiration).toBe(true);
      expect(response.body.is_expired).toBe(false);
      expect(response.body.status).toBe('valid');
    });

    test('should detect expired quote', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 5);

      const mockQuote = {
        id: 1,
        valid_until: pastDate,
        status: 'sent'
      };

      mockPool.query.mockResolvedValue({ rows: [mockQuote] });

      const response = await request(app).get('/api/quotations/1/expiration-status');

      expect(response.status).toBe(200);
      expect(response.body.is_expired).toBe(true);
      expect(response.body.status).toBe('expired');
      expect(response.body.days_remaining).toBe(0);
    });

    test('should detect expiring soon status', async () => {
      const soonDate = mockDateUtils.addDays(new Date(), 2);
      const mockQuote = {
        id: 1,
        valid_until: soonDate,
        status: 'sent'
      };

      mockPool.query.mockResolvedValue({ rows: [mockQuote] });

      const response = await request(app).get('/api/quotations/1/expiration-status');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('expiring_soon');
    });

    test('should handle quote without expiration date', async () => {
      const mockQuote = {
        id: 1,
        valid_until: null,
        status: 'draft'
      };

      mockPool.query.mockResolvedValue({ rows: [mockQuote] });

      const response = await request(app).get('/api/quotations/1/expiration-status');

      expect(response.status).toBe(200);
      expect(response.body.has_expiration).toBe(false);
      expect(response.body.is_expired).toBe(false);
    });
  });

  describe('POST /api/quotations/:id/extend', () => {
    test('should extend quote by additional days', async () => {
      const currentExpiration = mockDateUtils.addDays(new Date(), 5);
      const mockQuote = {
        id: 1,
        valid_until: currentExpiration
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockQuote] })
        .mockResolvedValueOnce({ rows: [mockQuote] })
        .mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/quotations/1/extend')
        .send({ additional_days: 15 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.days_added).toBe(15);
    });

    test('should not extend quote without expiration', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ id: 1, valid_until: null }]
      });

      const response = await request(app)
        .post('/api/quotations/1/extend')
        .send({ additional_days: 10 });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('no expiration date');
    });
  });

  describe('POST /api/quotations/expire-batch', () => {
    test('should expire all overdue quotes', async () => {
      const expiredQuotes = [
        { id: 1, quote_number: 'Q-001', valid_until: '2025-01-01', status: 'sent' },
        { id: 2, quote_number: 'Q-002', valid_until: '2025-01-02', status: 'sent' }
      ];

      mockPool.query
        .mockResolvedValueOnce({ rows: expiredQuotes })
        .mockResolvedValueOnce({ rows: expiredQuotes })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const response = await request(app).post('/api/quotations/expire-batch');

      expect(response.status).toBe(200);
      expect(response.body.expired_count).toBe(2);
      expect(response.body.expired_quotes).toHaveLength(2);
    });

    test('should handle no quotes to expire', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const response = await request(app).post('/api/quotations/expire-batch');

      expect(response.status).toBe(200);
      expect(response.body.expired_count).toBe(0);
      expect(response.body.message).toContain('No quotes to expire');
    });
  });

  describe('GET /api/quotations/expiring-soon', () => {
    test('should return quotes expiring within threshold', async () => {
      const expiringQuotes = [
        {
          id: 1,
          quote_number: 'Q-001',
          valid_until: mockDateUtils.addDays(new Date(), 3),
          status: 'sent'
        }
      ];

      mockPool.query.mockResolvedValue({ rows: expiringQuotes });

      const response = await request(app).get('/api/quotations/expiring-soon?days=7');

      expect(response.status).toBe(200);
      expect(response.body.count).toBe(1);
      expect(response.body.threshold_days).toBe(7);
      expect(response.body.quotes[0]).toHaveProperty('days_until_expiration');
    });
  });

  describe('POST /api/quotations/:id/renew', () => {
    test('should renew expired quote', async () => {
      const mockQuote = {
        id: 1,
        status: 'expired',
        valid_until: '2025-01-01'
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockQuote] })
        .mockResolvedValueOnce({ rows: [{ ...mockQuote, status: 'sent' }] })
        .mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/quotations/1/renew')
        .send({ days_valid: 30 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('renewed successfully');
      expect(response.body.days_valid).toBe(30);
    });

    test('should not renew non-expired quote', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ id: 1, status: 'sent' }]
      });

      const response = await request(app)
        .post('/api/quotations/1/renew')
        .send({ days_valid: 30 });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Only expired quotes can be renewed');
    });
  });

  describe('GET /api/quotations/:id/expiration-log', () => {
    test('should return expiration history', async () => {
      const mockLog = [
        { id: 1, quote_id: 1, action: 'extended', old_expiration: '2025-01-01' },
        { id: 2, quote_id: 1, action: 'renewed', new_expiration: '2025-02-01' }
      ];

      mockPool.query.mockResolvedValue({ rows: mockLog });

      const response = await request(app).get('/api/quotations/1/expiration-log');

      expect(response.status).toBe(200);
      expect(response.body.count).toBe(2);
      expect(response.body.log).toHaveLength(2);
    });
  });
});
