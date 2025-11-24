const request = require('supertest');
const express = require('express');

// Mock email service
const mockEmailService = {
  sendQuoteCreatedEmail: jest.fn(),
  sendQuoteSentEmail: jest.fn(),
  sendQuoteStatusChangeEmail: jest.fn(),
  sendFollowUpEmail: jest.fn(),
  sendQuoteExpirationWarning: jest.fn()
};

// Mock database
const mockPool = {
  query: jest.fn()
};

describe('Email Notification System', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());

    // POST /api/notifications/quote-created
    app.post('/api/notifications/quote-created', async (req, res) => {
      try {
        const { quote_id, recipient_email, recipient_name } = req.body;

        if (!quote_id || !recipient_email) {
          return res.status(400).json({
            error: 'Quote ID and recipient email are required'
          });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(recipient_email)) {
          return res.status(400).json({ error: 'Invalid email format' });
        }

        // Get quote details
        const quoteResult = await mockPool.query(
          'SELECT * FROM quotations WHERE id = $1',
          [quote_id]
        );

        if (quoteResult.rows.length === 0) {
          return res.status(404).json({ error: 'Quote not found' });
        }

        const quote = quoteResult.rows[0];

        // Send email
        await mockEmailService.sendQuoteCreatedEmail({
          to: recipient_email,
          recipientName: recipient_name,
          quoteId: quote_id,
          quoteNumber: quote.quote_number,
          amount: quote.total_amount
        });

        // Log notification
        await mockPool.query(
          `INSERT INTO notification_log
           (quote_id, notification_type, recipient_email, status)
           VALUES ($1, $2, $3, $4)`,
          [quote_id, 'quote_created', recipient_email, 'sent']
        );

        res.json({
          success: true,
          message: 'Quote creation notification sent'
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/notifications/quote-sent
    app.post('/api/notifications/quote-sent', async (req, res) => {
      try {
        const { quote_id, customer_email, customer_name, pdf_url } = req.body;

        if (!quote_id || !customer_email) {
          return res.status(400).json({
            error: 'Quote ID and customer email are required'
          });
        }

        const quoteResult = await mockPool.query(
          'SELECT * FROM quotations WHERE id = $1',
          [quote_id]
        );

        if (quoteResult.rows.length === 0) {
          return res.status(404).json({ error: 'Quote not found' });
        }

        const quote = quoteResult.rows[0];

        await mockEmailService.sendQuoteSentEmail({
          to: customer_email,
          customerName: customer_name,
          quoteNumber: quote.quote_number,
          amount: quote.total_amount,
          pdfUrl: pdf_url,
          validUntil: quote.valid_until
        });

        await mockPool.query(
          `INSERT INTO notification_log
           (quote_id, notification_type, recipient_email, status)
           VALUES ($1, $2, $3, $4)`,
          [quote_id, 'quote_sent', customer_email, 'sent']
        );

        res.json({
          success: true,
          message: 'Quote sent notification delivered'
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/notifications/status-change
    app.post('/api/notifications/status-change', async (req, res) => {
      try {
        const { quote_id, old_status, new_status, recipient_email, notify_customer } = req.body;

        if (!quote_id || !new_status || !recipient_email) {
          return res.status(400).json({
            error: 'Quote ID, new status, and recipient email are required'
          });
        }

        const validStatuses = ['draft', 'sent', 'approved', 'rejected', 'expired'];
        if (!validStatuses.includes(new_status)) {
          return res.status(400).json({
            error: 'Invalid status value'
          });
        }

        const quoteResult = await mockPool.query(
          'SELECT * FROM quotations WHERE id = $1',
          [quote_id]
        );

        if (quoteResult.rows.length === 0) {
          return res.status(404).json({ error: 'Quote not found' });
        }

        await mockEmailService.sendQuoteStatusChangeEmail({
          to: recipient_email,
          quoteId: quote_id,
          oldStatus: old_status,
          newStatus: new_status,
          notifyCustomer: notify_customer
        });

        await mockPool.query(
          `INSERT INTO notification_log
           (quote_id, notification_type, recipient_email, status, metadata)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            quote_id,
            'status_change',
            recipient_email,
            'sent',
            JSON.stringify({ old_status, new_status })
          ]
        );

        res.json({
          success: true,
          message: `Status change notification sent (${old_status} → ${new_status})`
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/notifications/follow-up
    app.post('/api/notifications/follow-up', async (req, res) => {
      try {
        const { quote_id, recipient_email, days_since_sent, custom_message } = req.body;

        if (!quote_id || !recipient_email) {
          return res.status(400).json({
            error: 'Quote ID and recipient email are required'
          });
        }

        const quoteResult = await mockPool.query(
          'SELECT * FROM quotations WHERE id = $1',
          [quote_id]
        );

        if (quoteResult.rows.length === 0) {
          return res.status(404).json({ error: 'Quote not found' });
        }

        const quote = quoteResult.rows[0];

        await mockEmailService.sendFollowUpEmail({
          to: recipient_email,
          quoteId: quote_id,
          quoteNumber: quote.quote_number,
          daysSinceSent: days_since_sent,
          customMessage: custom_message
        });

        await mockPool.query(
          `INSERT INTO notification_log
           (quote_id, notification_type, recipient_email, status, metadata)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            quote_id,
            'follow_up',
            recipient_email,
            'sent',
            JSON.stringify({ days_since_sent })
          ]
        );

        res.json({
          success: true,
          message: 'Follow-up email sent'
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/notifications/expiration-warning
    app.post('/api/notifications/expiration-warning', async (req, res) => {
      try {
        const { quote_id, recipient_email, days_until_expiration } = req.body;

        if (!quote_id || !recipient_email) {
          return res.status(400).json({
            error: 'Quote ID and recipient email are required'
          });
        }

        if (days_until_expiration <= 0) {
          return res.status(400).json({
            error: 'Days until expiration must be positive'
          });
        }

        const quoteResult = await mockPool.query(
          'SELECT * FROM quotations WHERE id = $1',
          [quote_id]
        );

        if (quoteResult.rows.length === 0) {
          return res.status(404).json({ error: 'Quote not found' });
        }

        const quote = quoteResult.rows[0];

        await mockEmailService.sendQuoteExpirationWarning({
          to: recipient_email,
          quoteId: quote_id,
          quoteNumber: quote.quote_number,
          daysUntilExpiration: days_until_expiration,
          expirationDate: quote.valid_until
        });

        await mockPool.query(
          `INSERT INTO notification_log
           (quote_id, notification_type, recipient_email, status, metadata)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            quote_id,
            'expiration_warning',
            recipient_email,
            'sent',
            JSON.stringify({ days_until_expiration })
          ]
        );

        res.json({
          success: true,
          message: 'Expiration warning sent'
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/notifications/log/:quoteId
    app.get('/api/notifications/log/:quoteId', async (req, res) => {
      try {
        const result = await mockPool.query(
          `SELECT * FROM notification_log
           WHERE quote_id = $1
           ORDER BY created_at DESC`,
          [req.params.quoteId]
        );

        res.json(result.rows);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/notifications/preferences/:userId
    app.get('/api/notifications/preferences/:userId', async (req, res) => {
      try {
        const result = await mockPool.query(
          'SELECT * FROM notification_preferences WHERE user_id = $1',
          [req.params.userId]
        );

        if (result.rows.length === 0) {
          // Return default preferences
          return res.json({
            quote_created: true,
            quote_sent: true,
            status_change: true,
            follow_up: false,
            expiration_warning: true
          });
        }

        res.json(result.rows[0]);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // PUT /api/notifications/preferences/:userId
    app.put('/api/notifications/preferences/:userId', async (req, res) => {
      try {
        const { quote_created, quote_sent, status_change, follow_up, expiration_warning } = req.body;

        const result = await mockPool.query(
          `INSERT INTO notification_preferences
           (user_id, quote_created, quote_sent, status_change, follow_up, expiration_warning)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (user_id)
           DO UPDATE SET
             quote_created = $2,
             quote_sent = $3,
             status_change = $4,
             follow_up = $5,
             expiration_warning = $6
           RETURNING *`,
          [req.params.userId, quote_created, quote_sent, status_change, follow_up, expiration_warning]
        );

        res.json({
          success: true,
          preferences: result.rows[0]
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/notifications/quote-created', () => {
    test('should send quote created notification', async () => {
      const mockQuote = {
        id: 1,
        quote_number: 'Q-2025-001',
        total_amount: 1000
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockQuote] })
        .mockResolvedValueOnce({ rows: [] });

      mockEmailService.sendQuoteCreatedEmail.mockResolvedValue(true);

      const response = await request(app)
        .post('/api/notifications/quote-created')
        .send({
          quote_id: 1,
          recipient_email: 'customer@example.com',
          recipient_name: 'John Doe'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockEmailService.sendQuoteCreatedEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'customer@example.com',
          recipientName: 'John Doe',
          quoteId: 1
        })
      );
    });

    test('should return 400 if email is missing', async () => {
      const response = await request(app)
        .post('/api/notifications/quote-created')
        .send({ quote_id: 1 });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('required');
    });

    test('should validate email format', async () => {
      const response = await request(app)
        .post('/api/notifications/quote-created')
        .send({
          quote_id: 1,
          recipient_email: 'invalid-email'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid email');
    });

    test('should return 404 if quote not found', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .post('/api/notifications/quote-created')
        .send({
          quote_id: 999,
          recipient_email: 'test@example.com'
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Quote not found');
    });
  });

  describe('POST /api/notifications/quote-sent', () => {
    test('should send quote sent notification with PDF', async () => {
      const mockQuote = {
        id: 1,
        quote_number: 'Q-2025-001',
        total_amount: 1500,
        valid_until: '2025-12-31'
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockQuote] })
        .mockResolvedValueOnce({ rows: [] });

      mockEmailService.sendQuoteSentEmail.mockResolvedValue(true);

      const response = await request(app)
        .post('/api/notifications/quote-sent')
        .send({
          quote_id: 1,
          customer_email: 'customer@example.com',
          customer_name: 'Jane Smith',
          pdf_url: 'https://example.com/quotes/1.pdf'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockEmailService.sendQuoteSentEmail).toHaveBeenCalled();
    });
  });

  describe('POST /api/notifications/status-change', () => {
    test('should send status change notification', async () => {
      const mockQuote = { id: 1, status: 'approved' };

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockQuote] })
        .mockResolvedValueOnce({ rows: [] });

      mockEmailService.sendQuoteStatusChangeEmail.mockResolvedValue(true);

      const response = await request(app)
        .post('/api/notifications/status-change')
        .send({
          quote_id: 1,
          old_status: 'sent',
          new_status: 'approved',
          recipient_email: 'staff@example.com',
          notify_customer: true
        });

      expect(response.status).toBe(200);
      expect(response.body.message).toContain('sent → approved');
    });

    test('should validate status values', async () => {
      const response = await request(app)
        .post('/api/notifications/status-change')
        .send({
          quote_id: 1,
          new_status: 'invalid_status',
          recipient_email: 'test@example.com'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid status');
    });
  });

  describe('POST /api/notifications/follow-up', () => {
    test('should send follow-up email', async () => {
      const mockQuote = {
        id: 1,
        quote_number: 'Q-2025-001'
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockQuote] })
        .mockResolvedValueOnce({ rows: [] });

      mockEmailService.sendFollowUpEmail.mockResolvedValue(true);

      const response = await request(app)
        .post('/api/notifications/follow-up')
        .send({
          quote_id: 1,
          recipient_email: 'customer@example.com',
          days_since_sent: 7,
          custom_message: 'Just checking in...'
        });

      expect(response.status).toBe(200);
      expect(mockEmailService.sendFollowUpEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          daysSinceSent: 7,
          customMessage: 'Just checking in...'
        })
      );
    });
  });

  describe('POST /api/notifications/expiration-warning', () => {
    test('should send expiration warning', async () => {
      const mockQuote = {
        id: 1,
        quote_number: 'Q-2025-001',
        valid_until: '2025-12-31'
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockQuote] })
        .mockResolvedValueOnce({ rows: [] });

      mockEmailService.sendQuoteExpirationWarning.mockResolvedValue(true);

      const response = await request(app)
        .post('/api/notifications/expiration-warning')
        .send({
          quote_id: 1,
          recipient_email: 'customer@example.com',
          days_until_expiration: 3
        });

      expect(response.status).toBe(200);
      expect(mockEmailService.sendQuoteExpirationWarning).toHaveBeenCalled();
    });

    test('should validate days_until_expiration is positive', async () => {
      const response = await request(app)
        .post('/api/notifications/expiration-warning')
        .send({
          quote_id: 1,
          recipient_email: 'test@example.com',
          days_until_expiration: 0
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('must be positive');
    });
  });

  describe('GET /api/notifications/log/:quoteId', () => {
    test('should return notification log for quote', async () => {
      const mockLog = [
        { id: 1, quote_id: 1, notification_type: 'quote_created', status: 'sent' },
        { id: 2, quote_id: 1, notification_type: 'quote_sent', status: 'sent' }
      ];

      mockPool.query.mockResolvedValue({ rows: mockLog });

      const response = await request(app).get('/api/notifications/log/1');

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
    });
  });

  describe('Notification Preferences', () => {
    test('should get user notification preferences', async () => {
      const mockPreferences = {
        user_id: 1,
        quote_created: true,
        quote_sent: true,
        status_change: false
      };

      mockPool.query.mockResolvedValue({ rows: [mockPreferences] });

      const response = await request(app).get('/api/notifications/preferences/1');

      expect(response.status).toBe(200);
      expect(response.body.quote_created).toBe(true);
    });

    test('should return default preferences if none exist', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const response = await request(app).get('/api/notifications/preferences/999');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('quote_created', true);
      expect(response.body).toHaveProperty('quote_sent', true);
    });

    test('should update user notification preferences', async () => {
      const updatedPreferences = {
        user_id: 1,
        quote_created: false,
        quote_sent: true,
        status_change: true,
        follow_up: false,
        expiration_warning: true
      };

      mockPool.query.mockResolvedValue({ rows: [updatedPreferences] });

      const response = await request(app)
        .put('/api/notifications/preferences/1')
        .send({
          quote_created: false,
          quote_sent: true,
          status_change: true,
          follow_up: false,
          expiration_warning: true
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });
});
