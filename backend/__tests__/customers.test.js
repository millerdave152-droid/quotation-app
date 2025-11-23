const request = require('supertest');
const express = require('express');

// Mock database pool
const mockPool = {
  query: jest.fn()
};

describe('Customer API Endpoints', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());

    // Mock GET /api/customers
    app.get('/api/customers', async (req, res) => {
      try {
        const result = await mockPool.query('SELECT * FROM customers ORDER BY created_at DESC');
        res.json(result.rows);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Mock GET /api/customers/:id
    app.get('/api/customers/:id', async (req, res) => {
      try {
        const result = await mockPool.query('SELECT * FROM customers WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Customer not found' });
        }
        res.json(result.rows[0]);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Mock POST /api/customers
    app.post('/api/customers', async (req, res) => {
      try {
        const { name, email, phone, company } = req.body;

        if (!name || !email) {
          return res.status(400).json({ error: 'Name and email are required' });
        }

        const result = await mockPool.query(
          'INSERT INTO customers (name, email, phone, company) VALUES ($1, $2, $3, $4) RETURNING *',
          [name, email, phone, company]
        );
        res.status(201).json(result.rows[0]);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Mock PUT /api/customers/:id
    app.put('/api/customers/:id', async (req, res) => {
      try {
        const { name, email, phone, company } = req.body;
        const result = await mockPool.query(
          'UPDATE customers SET name = $1, email = $2, phone = $3, company = $4 WHERE id = $5 RETURNING *',
          [name, email, phone, company, req.params.id]
        );

        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Customer not found' });
        }

        res.json(result.rows[0]);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Mock DELETE /api/customers/:id
    app.delete('/api/customers/:id', async (req, res) => {
      try {
        const result = await mockPool.query('DELETE FROM customers WHERE id = $1 RETURNING *', [req.params.id]);

        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Customer not found' });
        }

        res.json({ message: 'Customer deleted successfully', customer: result.rows[0] });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/customers', () => {
    test('should return all customers', async () => {
      const mockCustomers = [
        { id: 1, name: 'John Doe', email: 'john@example.com', phone: '1234567890', company: 'Acme Inc' },
        { id: 2, name: 'Jane Smith', email: 'jane@example.com', phone: '0987654321', company: 'Tech Corp' }
      ];

      mockPool.query.mockResolvedValue({ rows: mockCustomers });

      const response = await request(app).get('/api/customers');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockCustomers);
      expect(mockPool.query).toHaveBeenCalledWith('SELECT * FROM customers ORDER BY created_at DESC');
    });

    test('should handle database errors', async () => {
      mockPool.query.mockRejectedValue(new Error('Database connection failed'));

      const response = await request(app).get('/api/customers');

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error', 'Database connection failed');
    });
  });

  describe('GET /api/customers/:id', () => {
    test('should return a single customer', async () => {
      const mockCustomer = { id: 1, name: 'John Doe', email: 'john@example.com', phone: '1234567890', company: 'Acme Inc' };

      mockPool.query.mockResolvedValue({ rows: [mockCustomer] });

      const response = await request(app).get('/api/customers/1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockCustomer);
      expect(mockPool.query).toHaveBeenCalledWith('SELECT * FROM customers WHERE id = $1', ['1']);
    });

    test('should return 404 for non-existent customer', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const response = await request(app).get('/api/customers/999');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Customer not found');
    });
  });

  describe('POST /api/customers', () => {
    test('should create a new customer', async () => {
      const newCustomer = { name: 'Alice Johnson', email: 'alice@example.com', phone: '5551234567', company: 'StartupCo' };
      const createdCustomer = { id: 3, ...newCustomer, created_at: new Date().toISOString() };

      mockPool.query.mockResolvedValue({ rows: [createdCustomer] });

      const response = await request(app)
        .post('/api/customers')
        .send(newCustomer);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe(newCustomer.name);
      expect(response.body.email).toBe(newCustomer.email);
    });

    test('should return 400 if name is missing', async () => {
      const invalidCustomer = { email: 'test@example.com', phone: '1234567890' };

      const response = await request(app)
        .post('/api/customers')
        .send(invalidCustomer);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Name and email are required');
    });

    test('should return 400 if email is missing', async () => {
      const invalidCustomer = { name: 'Test User', phone: '1234567890' };

      const response = await request(app)
        .post('/api/customers')
        .send(invalidCustomer);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Name and email are required');
    });
  });

  describe('PUT /api/customers/:id', () => {
    test('should update an existing customer', async () => {
      const updatedData = { name: 'John Updated', email: 'john.updated@example.com', phone: '9999999999', company: 'New Company' };
      const updatedCustomer = { id: 1, ...updatedData };

      mockPool.query.mockResolvedValue({ rows: [updatedCustomer] });

      const response = await request(app)
        .put('/api/customers/1')
        .send(updatedData);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(updatedCustomer);
    });

    test('should return 404 when updating non-existent customer', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .put('/api/customers/999')
        .send({ name: 'Test', email: 'test@example.com' });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Customer not found');
    });
  });

  describe('DELETE /api/customers/:id', () => {
    test('should delete an existing customer', async () => {
      const deletedCustomer = { id: 1, name: 'John Doe', email: 'john@example.com' };

      mockPool.query.mockResolvedValue({ rows: [deletedCustomer] });

      const response = await request(app).delete('/api/customers/1');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'Customer deleted successfully');
      expect(response.body.customer).toEqual(deletedCustomer);
    });

    test('should return 404 when deleting non-existent customer', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const response = await request(app).delete('/api/customers/999');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Customer not found');
    });
  });
});
