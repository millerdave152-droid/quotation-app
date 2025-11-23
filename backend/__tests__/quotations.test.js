const request = require('supertest');
const express = require('express');

// Mock database pool
const mockPool = {
  query: jest.fn()
};

describe('Quotation API Endpoints', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());

    // Mock GET /api/quotations
    app.get('/api/quotations', async (req, res) => {
      try {
        const result = await mockPool.query('SELECT * FROM quotations ORDER BY created_at DESC');
        res.json(result.rows);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Mock GET /api/quotations/:id
    app.get('/api/quotations/:id', async (req, res) => {
      try {
        const result = await mockPool.query('SELECT * FROM quotations WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Quotation not found' });
        }
        res.json(result.rows[0]);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Mock POST /api/quotations
    app.post('/api/quotations', async (req, res) => {
      try {
        const { customer_id, items, total_amount, status, notes } = req.body;

        if (!customer_id || !items || items.length === 0) {
          return res.status(400).json({ error: 'Customer ID and at least one item are required' });
        }

        if (total_amount < 0) {
          return res.status(400).json({ error: 'Total amount must be non-negative' });
        }

        const result = await mockPool.query(
          'INSERT INTO quotations (customer_id, items, total_amount, status, notes) VALUES ($1, $2, $3, $4, $5) RETURNING *',
          [customer_id, JSON.stringify(items), total_amount, status || 'draft', notes]
        );
        res.status(201).json(result.rows[0]);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Mock PUT /api/quotations/:id
    app.put('/api/quotations/:id', async (req, res) => {
      try {
        const { customer_id, items, total_amount, status, notes } = req.body;

        if (total_amount !== undefined && total_amount < 0) {
          return res.status(400).json({ error: 'Total amount must be non-negative' });
        }

        const result = await mockPool.query(
          'UPDATE quotations SET customer_id = $1, items = $2, total_amount = $3, status = $4, notes = $5 WHERE id = $6 RETURNING *',
          [customer_id, JSON.stringify(items), total_amount, status, notes, req.params.id]
        );

        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Quotation not found' });
        }

        res.json(result.rows[0]);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Mock DELETE /api/quotations/:id
    app.delete('/api/quotations/:id', async (req, res) => {
      try {
        const result = await mockPool.query('DELETE FROM quotations WHERE id = $1 RETURNING *', [req.params.id]);

        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Quotation not found' });
        }

        res.json({ message: 'Quotation deleted successfully', quotation: result.rows[0] });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Mock GET /api/quotations/stats/summary
    app.get('/api/quotations/stats/summary', async (req, res) => {
      try {
        const result = await mockPool.query(`
          SELECT
            COUNT(*) as total_quotations,
            SUM(total_amount) as total_value,
            COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_count,
            COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count
          FROM quotations
        `);
        res.json(result.rows[0]);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/quotations', () => {
    test('should return all quotations', async () => {
      const mockQuotations = [
        { id: 1, customer_id: 1, items: '[{"product_id": 1, "quantity": 2}]', total_amount: 100.00, status: 'draft' },
        { id: 2, customer_id: 2, items: '[{"product_id": 2, "quantity": 1}]', total_amount: 200.00, status: 'sent' }
      ];

      mockPool.query.mockResolvedValue({ rows: mockQuotations });

      const response = await request(app).get('/api/quotations');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockQuotations);
      expect(response.body).toHaveLength(2);
    });

    test('should handle database errors', async () => {
      mockPool.query.mockRejectedValue(new Error('Database error'));

      const response = await request(app).get('/api/quotations');

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/quotations/:id', () => {
    test('should return a single quotation', async () => {
      const mockQuotation = {
        id: 1,
        customer_id: 1,
        items: '[{"product_id": 1, "quantity": 2}]',
        total_amount: 100.00,
        status: 'draft'
      };

      mockPool.query.mockResolvedValue({ rows: [mockQuotation] });

      const response = await request(app).get('/api/quotations/1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockQuotation);
    });

    test('should return 404 for non-existent quotation', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const response = await request(app).get('/api/quotations/999');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Quotation not found');
    });
  });

  describe('POST /api/quotations', () => {
    test('should create a new quotation', async () => {
      const newQuotation = {
        customer_id: 1,
        items: [{ product_id: 1, quantity: 2, price: 50.00 }],
        total_amount: 100.00,
        status: 'draft',
        notes: 'Test quotation'
      };

      const createdQuotation = { id: 1, ...newQuotation, items: JSON.stringify(newQuotation.items) };

      mockPool.query.mockResolvedValue({ rows: [createdQuotation] });

      const response = await request(app)
        .post('/api/quotations')
        .send(newQuotation);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.customer_id).toBe(newQuotation.customer_id);
    });

    test('should return 400 if customer_id is missing', async () => {
      const invalidQuotation = {
        items: [{ product_id: 1, quantity: 2 }],
        total_amount: 100.00
      };

      const response = await request(app)
        .post('/api/quotations')
        .send(invalidQuotation);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Customer ID and at least one item are required');
    });

    test('should return 400 if items array is empty', async () => {
      const invalidQuotation = {
        customer_id: 1,
        items: [],
        total_amount: 100.00
      };

      const response = await request(app)
        .post('/api/quotations')
        .send(invalidQuotation);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Customer ID and at least one item are required');
    });

    test('should return 400 if total_amount is negative', async () => {
      const invalidQuotation = {
        customer_id: 1,
        items: [{ product_id: 1, quantity: 2 }],
        total_amount: -100.00
      };

      const response = await request(app)
        .post('/api/quotations')
        .send(invalidQuotation);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Total amount must be non-negative');
    });

    test('should default status to draft if not provided', async () => {
      const newQuotation = {
        customer_id: 1,
        items: [{ product_id: 1, quantity: 2 }],
        total_amount: 100.00
      };

      const createdQuotation = { id: 1, ...newQuotation, status: 'draft', items: JSON.stringify(newQuotation.items) };

      mockPool.query.mockResolvedValue({ rows: [createdQuotation] });

      const response = await request(app)
        .post('/api/quotations')
        .send(newQuotation);

      expect(response.status).toBe(201);
      expect(response.body.status).toBe('draft');
    });
  });

  describe('PUT /api/quotations/:id', () => {
    test('should update an existing quotation', async () => {
      const updatedData = {
        customer_id: 1,
        items: [{ product_id: 2, quantity: 3 }],
        total_amount: 150.00,
        status: 'sent',
        notes: 'Updated notes'
      };

      const updatedQuotation = { id: 1, ...updatedData, items: JSON.stringify(updatedData.items) };

      mockPool.query.mockResolvedValue({ rows: [updatedQuotation] });

      const response = await request(app)
        .put('/api/quotations/1')
        .send(updatedData);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(updatedQuotation);
    });

    test('should return 404 when updating non-existent quotation', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .put('/api/quotations/999')
        .send({ customer_id: 1, items: [], total_amount: 100 });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Quotation not found');
    });
  });

  describe('DELETE /api/quotations/:id', () => {
    test('should delete an existing quotation', async () => {
      const deletedQuotation = {
        id: 1,
        customer_id: 1,
        total_amount: 100.00,
        status: 'draft'
      };

      mockPool.query.mockResolvedValue({ rows: [deletedQuotation] });

      const response = await request(app).delete('/api/quotations/1');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'Quotation deleted successfully');
      expect(response.body.quotation).toEqual(deletedQuotation);
    });

    test('should return 404 when deleting non-existent quotation', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const response = await request(app).delete('/api/quotations/999');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Quotation not found');
    });
  });

  describe('GET /api/quotations/stats/summary', () => {
    test('should return quotation statistics', async () => {
      const mockStats = {
        total_quotations: 10,
        total_value: 5000.00,
        approved_count: 6,
        pending_count: 4
      };

      mockPool.query.mockResolvedValue({ rows: [mockStats] });

      const response = await request(app).get('/api/quotations/stats/summary');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockStats);
      expect(response.body.total_quotations).toBe(10);
      expect(response.body.approved_count).toBe(6);
    });
  });
});
