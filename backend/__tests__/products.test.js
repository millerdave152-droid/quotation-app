const request = require('supertest');
const express = require('express');

// Mock database pool
const mockPool = {
  query: jest.fn()
};

describe('Product API Endpoints', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());

    // Mock GET /api/products
    app.get('/api/products', async (req, res) => {
      try {
        const result = await mockPool.query('SELECT * FROM products ORDER BY created_at DESC');
        res.json(result.rows);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Mock GET /api/products/:id
    app.get('/api/products/:id', async (req, res) => {
      try {
        const result = await mockPool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Product not found' });
        }
        res.json(result.rows[0]);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Mock POST /api/products
    app.post('/api/products', async (req, res) => {
      try {
        const { name, description, price, sku, category } = req.body;

        if (!name || price === undefined) {
          return res.status(400).json({ error: 'Name and price are required' });
        }

        if (price < 0) {
          return res.status(400).json({ error: 'Price must be non-negative' });
        }

        const result = await mockPool.query(
          'INSERT INTO products (name, description, price, sku, category) VALUES ($1, $2, $3, $4, $5) RETURNING *',
          [name, description, price, sku, category]
        );
        res.status(201).json(result.rows[0]);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Mock PUT /api/products/:id
    app.put('/api/products/:id', async (req, res) => {
      try {
        const { name, description, price, sku, category } = req.body;

        if (price !== undefined && price < 0) {
          return res.status(400).json({ error: 'Price must be non-negative' });
        }

        const result = await mockPool.query(
          'UPDATE products SET name = $1, description = $2, price = $3, sku = $4, category = $5 WHERE id = $6 RETURNING *',
          [name, description, price, sku, category, req.params.id]
        );

        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Product not found' });
        }

        res.json(result.rows[0]);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Mock DELETE /api/products/:id
    app.delete('/api/products/:id', async (req, res) => {
      try {
        const result = await mockPool.query('DELETE FROM products WHERE id = $1 RETURNING *', [req.params.id]);

        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Product not found' });
        }

        res.json({ message: 'Product deleted successfully', product: result.rows[0] });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/products', () => {
    test('should return all products', async () => {
      const mockProducts = [
        { id: 1, name: 'Widget A', description: 'A great widget', price: 19.99, sku: 'WGT-001', category: 'Widgets' },
        { id: 2, name: 'Gadget B', description: 'An amazing gadget', price: 49.99, sku: 'GDT-002', category: 'Gadgets' }
      ];

      mockPool.query.mockResolvedValue({ rows: mockProducts });

      const response = await request(app).get('/api/products');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockProducts);
      expect(response.body).toHaveLength(2);
    });

    test('should handle database errors', async () => {
      mockPool.query.mockRejectedValue(new Error('Database error'));

      const response = await request(app).get('/api/products');

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error', 'Database error');
    });
  });

  describe('GET /api/products/:id', () => {
    test('should return a single product', async () => {
      const mockProduct = { id: 1, name: 'Widget A', description: 'A great widget', price: 19.99, sku: 'WGT-001' };

      mockPool.query.mockResolvedValue({ rows: [mockProduct] });

      const response = await request(app).get('/api/products/1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockProduct);
    });

    test('should return 404 for non-existent product', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const response = await request(app).get('/api/products/999');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Product not found');
    });
  });

  describe('POST /api/products', () => {
    test('should create a new product', async () => {
      const newProduct = { name: 'New Widget', description: 'Latest model', price: 29.99, sku: 'WGT-003', category: 'Widgets' };
      const createdProduct = { id: 3, ...newProduct };

      mockPool.query.mockResolvedValue({ rows: [createdProduct] });

      const response = await request(app)
        .post('/api/products')
        .send(newProduct);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe(newProduct.name);
      expect(response.body.price).toBe(newProduct.price);
    });

    test('should return 400 if name is missing', async () => {
      const invalidProduct = { price: 29.99, sku: 'WGT-003' };

      const response = await request(app)
        .post('/api/products')
        .send(invalidProduct);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Name and price are required');
    });

    test('should return 400 if price is missing', async () => {
      const invalidProduct = { name: 'Widget', sku: 'WGT-003' };

      const response = await request(app)
        .post('/api/products')
        .send(invalidProduct);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Name and price are required');
    });

    test('should return 400 if price is negative', async () => {
      const invalidProduct = { name: 'Widget', price: -10, sku: 'WGT-003' };

      const response = await request(app)
        .post('/api/products')
        .send(invalidProduct);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Price must be non-negative');
    });

    test('should accept price of zero', async () => {
      const freeProduct = { name: 'Free Widget', price: 0, sku: 'WGT-FREE' };
      const createdProduct = { id: 4, ...freeProduct };

      mockPool.query.mockResolvedValue({ rows: [createdProduct] });

      const response = await request(app)
        .post('/api/products')
        .send(freeProduct);

      expect(response.status).toBe(201);
      expect(response.body.price).toBe(0);
    });
  });

  describe('PUT /api/products/:id', () => {
    test('should update an existing product', async () => {
      const updatedData = { name: 'Updated Widget', description: 'New description', price: 39.99, sku: 'WGT-001-V2', category: 'Premium' };
      const updatedProduct = { id: 1, ...updatedData };

      mockPool.query.mockResolvedValue({ rows: [updatedProduct] });

      const response = await request(app)
        .put('/api/products/1')
        .send(updatedData);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(updatedProduct);
    });

    test('should return 404 when updating non-existent product', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .put('/api/products/999')
        .send({ name: 'Test', price: 10 });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Product not found');
    });

    test('should return 400 if updated price is negative', async () => {
      const response = await request(app)
        .put('/api/products/1')
        .send({ name: 'Widget', price: -5 });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Price must be non-negative');
    });
  });

  describe('DELETE /api/products/:id', () => {
    test('should delete an existing product', async () => {
      const deletedProduct = { id: 1, name: 'Widget A', price: 19.99 };

      mockPool.query.mockResolvedValue({ rows: [deletedProduct] });

      const response = await request(app).delete('/api/products/1');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'Product deleted successfully');
      expect(response.body.product).toEqual(deletedProduct);
    });

    test('should return 404 when deleting non-existent product', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const response = await request(app).delete('/api/products/999');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Product not found');
    });
  });
});
