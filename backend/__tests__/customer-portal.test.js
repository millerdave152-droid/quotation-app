const request = require('supertest');
const express = require('express');

const mockPool = { query: jest.fn() };

describe('Customer Portal System', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());

    app.use((req, res, next) => {
      req.customer = req.headers['x-customer-id']
        ? { id: parseInt(req.headers['x-customer-id']), email: req.headers['x-customer-email'] }
        : null;
      next();
    });

    // POST /api/customer-portal/login
    app.post('/api/customer-portal/login', async (req, res) => {
      try {
        const { email, access_code } = req.body;
        if (!email || !access_code) {
          return res.status(400).json({ error: 'Email and access code required' });
        }

        const result = await mockPool.query(
          'SELECT * FROM customers WHERE email = $1 AND portal_access_code = $2 AND portal_enabled = true',
          [email, access_code]
        );

        if (result.rows.length === 0) {
          return res.status(401).json({ error: 'Invalid credentials' });
        }

        res.json({ success: true, customer: result.rows[0], token: 'mock-token' });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/customer-portal/quotes
    app.get('/api/customer-portal/quotes', async (req, res) => {
      try {
        if (!req.customer) return res.status(401).json({ error: 'Authentication required' });

        const { status, limit, offset } = req.query;
        let query = 'SELECT * FROM quotations WHERE customer_id = $1';
        const params = [req.customer.id];

        if (status) {
          query += ' AND status = $2';
          params.push(status);
        }

        query += ' ORDER BY created_at DESC';
        if (limit) {
          query += ` LIMIT $${params.length + 1}`;
          params.push(parseInt(limit));
        }

        const result = await mockPool.query(query, params);
        res.json({ quotes: result.rows });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/customer-portal/quotes/:id
    app.get('/api/customer-portal/quotes/:id', async (req, res) => {
      try {
        if (!req.customer) return res.status(401).json({ error: 'Authentication required' });

        const result = await mockPool.query(
          'SELECT * FROM quotations WHERE id = $1 AND customer_id = $2',
          [parseInt(req.params.id), req.customer.id]
        );

        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Quote not found' });
        }

        res.json({ quote: result.rows[0] });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/customer-portal/quotes/:id/accept
    app.post('/api/customer-portal/quotes/:id/accept', async (req, res) => {
      try {
        if (!req.customer) return res.status(401).json({ error: 'Authentication required' });

        const quoteResult = await mockPool.query(
          'SELECT * FROM quotations WHERE id = $1 AND customer_id = $2 AND status = $3',
          [parseInt(req.params.id), req.customer.id, 'pending']
        );

        if (quoteResult.rows.length === 0) {
          return res.status(404).json({ error: 'Quote not found or not pending' });
        }

        await mockPool.query(
          'UPDATE quotations SET status = $1, accepted_at = NOW() WHERE id = $2',
          ['accepted', parseInt(req.params.id)]
        );

        res.json({ success: true, message: 'Quote accepted successfully' });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/customer-portal/quotes/:id/reject
    app.post('/api/customer-portal/quotes/:id/reject', async (req, res) => {
      try {
        if (!req.customer) return res.status(401).json({ error: 'Authentication required' });

        const { reason } = req.body;
        const quoteResult = await mockPool.query(
          'SELECT * FROM quotations WHERE id = $1 AND customer_id = $2 AND status = $3',
          [parseInt(req.params.id), req.customer.id, 'pending']
        );

        if (quoteResult.rows.length === 0) {
          return res.status(404).json({ error: 'Quote not found or not pending' });
        }

        await mockPool.query(
          'UPDATE quotations SET status = $1, rejection_reason = $2, rejected_at = NOW() WHERE id = $3',
          ['rejected', reason, parseInt(req.params.id)]
        );

        res.json({ success: true, message: 'Quote rejected successfully' });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/customer-portal/quotes/:id/comments
    app.post('/api/customer-portal/quotes/:id/comments', async (req, res) => {
      try {
        if (!req.customer) return res.status(401).json({ error: 'Authentication required' });

        const { content } = req.body;
        if (!content) return res.status(400).json({ error: 'Comment content required' });

        const result = await mockPool.query(
          'INSERT INTO quote_comments (quotation_id, customer_id, content) VALUES ($1, $2, $3) RETURNING *',
          [parseInt(req.params.id), req.customer.id, content]
        );

        res.status(201).json({ success: true, comment: result.rows[0] });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // PUT /api/customer-portal/profile
    app.put('/api/customer-portal/profile', async (req, res) => {
      try {
        if (!req.customer) return res.status(401).json({ error: 'Authentication required' });

        const { name, phone, address } = req.body;
        const result = await mockPool.query(
          'UPDATE customers SET name = COALESCE($1, name), phone = COALESCE($2, phone), address = COALESCE($3, address) WHERE id = $4 RETURNING *',
          [name, phone, address, req.customer.id]
        );

        res.json({ success: true, customer: result.rows[0] });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  });

  beforeEach(() => jest.clearAllMocks());

  describe('POST /api/customer-portal/login', () => {
    test('should login customer with valid credentials', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ id: 1, email: 'customer@example.com', name: 'John Doe' }]
      });

      const response = await request(app)
        .post('/api/customer-portal/login')
        .send({ email: 'customer@example.com', access_code: 'ABC123' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.customer.email).toBe('customer@example.com');
    });

    test('should reject invalid credentials', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .post('/api/customer-portal/login')
        .send({ email: 'wrong@example.com', access_code: 'WRONG' });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/customer-portal/quotes', () => {
    test('should fetch customer quotes', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          { id: 1, quote_number: 'Q-001', status: 'pending' },
          { id: 2, quote_number: 'Q-002', status: 'accepted' }
        ]
      });

      const response = await request(app)
        .get('/api/customer-portal/quotes')
        .set('x-customer-id', '1');

      expect(response.status).toBe(200);
      expect(response.body.quotes).toHaveLength(2);
    });

    test('should filter by status', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      await request(app)
        .get('/api/customer-portal/quotes')
        .set('x-customer-id', '1')
        .query({ status: 'pending' });

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('status'),
        expect.arrayContaining([1, 'pending'])
      );
    });
  });

  describe('POST /api/customer-portal/quotes/:id/accept', () => {
    test('should accept quote', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 1, status: 'pending' }] })
        .mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/customer-portal/quotes/1/accept')
        .set('x-customer-id', '1');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('should reject if quote not pending', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .post('/api/customer-portal/quotes/1/accept')
        .set('x-customer-id', '1');

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/customer-portal/quotes/:id/reject', () => {
    test('should reject quote with reason', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 1, status: 'pending' }] })
        .mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/customer-portal/quotes/1/reject')
        .set('x-customer-id', '1')
        .send({ reason: 'Price too high' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('POST /api/customer-portal/quotes/:id/comments', () => {
    test('should add comment to quote', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ id: 1, content: 'Great quote!', customer_id: 1 }]
      });

      const response = await request(app)
        .post('/api/customer-portal/quotes/1/comments')
        .set('x-customer-id', '1')
        .send({ content: 'Great quote!' });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
    });

    test('should require comment content', async () => {
      const response = await request(app)
        .post('/api/customer-portal/quotes/1/comments')
        .set('x-customer-id', '1')
        .send({});

      expect(response.status).toBe(400);
    });
  });

  describe('PUT /api/customer-portal/profile', () => {
    test('should update customer profile', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ id: 1, name: 'John Updated', phone: '555-1234' }]
      });

      const response = await request(app)
        .put('/api/customer-portal/profile')
        .set('x-customer-id', '1')
        .send({ name: 'John Updated', phone: '555-1234' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });
});
