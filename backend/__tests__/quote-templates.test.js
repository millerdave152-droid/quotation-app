const request = require('supertest');
const express = require('express');

// Mock database pool
const mockPool = {
  query: jest.fn()
};

describe('Quote Template API Endpoints', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());

    // GET /api/quote-templates - List all templates
    app.get('/api/quote-templates', async (req, res) => {
      try {
        const result = await mockPool.query(
          'SELECT * FROM quote_templates ORDER BY created_at DESC'
        );
        res.json(result.rows);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/quote-templates/:id - Get single template
    app.get('/api/quote-templates/:id', async (req, res) => {
      try {
        const result = await mockPool.query(
          'SELECT * FROM quote_templates WHERE id = $1',
          [req.params.id]
        );

        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Template not found' });
        }

        res.json(result.rows[0]);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/quote-templates - Create template
    app.post('/api/quote-templates', async (req, res) => {
      try {
        const { name, description, items, default_terms, default_discount } = req.body;

        if (!name || !items || items.length === 0) {
          return res.status(400).json({
            error: 'Template name and at least one item are required'
          });
        }

        const result = await mockPool.query(
          `INSERT INTO quote_templates
           (name, description, items, default_terms, default_discount)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *`,
          [name, description, JSON.stringify(items), default_terms, default_discount]
        );

        res.status(201).json(result.rows[0]);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // PUT /api/quote-templates/:id - Update template
    app.put('/api/quote-templates/:id', async (req, res) => {
      try {
        const { name, description, items, default_terms, default_discount } = req.body;

        const result = await mockPool.query(
          `UPDATE quote_templates
           SET name = $1, description = $2, items = $3,
               default_terms = $4, default_discount = $5,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $6
           RETURNING *`,
          [name, description, JSON.stringify(items), default_terms, default_discount, req.params.id]
        );

        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Template not found' });
        }

        res.json(result.rows[0]);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // DELETE /api/quote-templates/:id - Delete template
    app.delete('/api/quote-templates/:id', async (req, res) => {
      try {
        const result = await mockPool.query(
          'DELETE FROM quote_templates WHERE id = $1 RETURNING *',
          [req.params.id]
        );

        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Template not found' });
        }

        res.json({
          message: 'Template deleted successfully',
          template: result.rows[0]
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/quotations/from-template/:templateId - Create quote from template
    app.post('/api/quotations/from-template/:templateId', async (req, res) => {
      try {
        const { customer_id, additional_items } = req.body;

        if (!customer_id) {
          return res.status(400).json({ error: 'Customer ID is required' });
        }

        // Get template
        const templateResult = await mockPool.query(
          'SELECT * FROM quote_templates WHERE id = $1',
          [req.params.templateId]
        );

        if (templateResult.rows.length === 0) {
          return res.status(404).json({ error: 'Template not found' });
        }

        const template = templateResult.rows[0];
        const items = typeof template.items === 'string'
          ? JSON.parse(template.items)
          : template.items;

        // Combine template items with additional items
        const allItems = additional_items
          ? [...items, ...additional_items]
          : items;

        // Create quotation
        const quoteResult = await mockPool.query(
          `INSERT INTO quotations
           (customer_id, items, terms, discount, status, template_id)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING *`,
          [
            customer_id,
            JSON.stringify(allItems),
            template.default_terms,
            template.default_discount,
            'draft',
            req.params.templateId
          ]
        );

        res.status(201).json(quoteResult.rows[0]);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/quote-templates', () => {
    test('should return all quote templates', async () => {
      const mockTemplates = [
        {
          id: 1,
          name: 'Standard Service Package',
          description: 'Basic maintenance package',
          items: '[{"product_id": 1, "quantity": 1}]',
          default_terms: 'Net 30',
          default_discount: 0
        },
        {
          id: 2,
          name: 'Premium Package',
          description: 'Comprehensive service package',
          items: '[{"product_id": 2, "quantity": 2}]',
          default_terms: 'Net 60',
          default_discount: 10
        }
      ];

      mockPool.query.mockResolvedValue({ rows: mockTemplates });

      const response = await request(app).get('/api/quote-templates');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockTemplates);
      expect(response.body).toHaveLength(2);
    });

    test('should handle database errors', async () => {
      mockPool.query.mockRejectedValue(new Error('Database error'));

      const response = await request(app).get('/api/quote-templates');

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('error', 'Database error');
    });
  });

  describe('GET /api/quote-templates/:id', () => {
    test('should return a single template', async () => {
      const mockTemplate = {
        id: 1,
        name: 'Standard Service Package',
        description: 'Basic maintenance package',
        items: '[{"product_id": 1, "quantity": 1}]'
      };

      mockPool.query.mockResolvedValue({ rows: [mockTemplate] });

      const response = await request(app).get('/api/quote-templates/1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockTemplate);
    });

    test('should return 404 for non-existent template', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const response = await request(app).get('/api/quote-templates/999');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Template not found');
    });
  });

  describe('POST /api/quote-templates', () => {
    test('should create a new template', async () => {
      const newTemplate = {
        name: 'New Package',
        description: 'Test package',
        items: [{ product_id: 1, quantity: 2, price: 100 }],
        default_terms: 'Net 30',
        default_discount: 5
      };

      const createdTemplate = {
        id: 1,
        ...newTemplate,
        items: JSON.stringify(newTemplate.items),
        created_at: new Date().toISOString()
      };

      mockPool.query.mockResolvedValue({ rows: [createdTemplate] });

      const response = await request(app)
        .post('/api/quote-templates')
        .send(newTemplate);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe(newTemplate.name);
    });

    test('should return 400 if name is missing', async () => {
      const invalidTemplate = {
        items: [{ product_id: 1, quantity: 1 }]
      };

      const response = await request(app)
        .post('/api/quote-templates')
        .send(invalidTemplate);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    test('should return 400 if items array is empty', async () => {
      const invalidTemplate = {
        name: 'Test Template',
        items: []
      };

      const response = await request(app)
        .post('/api/quote-templates')
        .send(invalidTemplate);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('PUT /api/quote-templates/:id', () => {
    test('should update an existing template', async () => {
      const updatedData = {
        name: 'Updated Package',
        description: 'Updated description',
        items: [{ product_id: 2, quantity: 3 }],
        default_terms: 'Net 60',
        default_discount: 10
      };

      const updatedTemplate = {
        id: 1,
        ...updatedData,
        items: JSON.stringify(updatedData.items)
      };

      mockPool.query.mockResolvedValue({ rows: [updatedTemplate] });

      const response = await request(app)
        .put('/api/quote-templates/1')
        .send(updatedData);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(updatedTemplate);
    });

    test('should return 404 when updating non-existent template', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .put('/api/quote-templates/999')
        .send({ name: 'Test', items: [{ product_id: 1, quantity: 1 }] });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Template not found');
    });
  });

  describe('DELETE /api/quote-templates/:id', () => {
    test('should delete an existing template', async () => {
      const deletedTemplate = {
        id: 1,
        name: 'Standard Package'
      };

      mockPool.query.mockResolvedValue({ rows: [deletedTemplate] });

      const response = await request(app).delete('/api/quote-templates/1');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message', 'Template deleted successfully');
      expect(response.body.template).toEqual(deletedTemplate);
    });

    test('should return 404 when deleting non-existent template', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const response = await request(app).delete('/api/quote-templates/999');

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Template not found');
    });
  });

  describe('POST /api/quotations/from-template/:templateId', () => {
    test('should create quotation from template', async () => {
      const mockTemplate = {
        id: 1,
        name: 'Standard Package',
        items: '[{"product_id": 1, "quantity": 2, "price": 100}]',
        default_terms: 'Net 30',
        default_discount: 5
      };

      const mockQuotation = {
        id: 1,
        customer_id: 1,
        items: mockTemplate.items,
        terms: mockTemplate.default_terms,
        discount: mockTemplate.default_discount,
        status: 'draft',
        template_id: 1
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockTemplate] })
        .mockResolvedValueOnce({ rows: [mockQuotation] });

      const response = await request(app)
        .post('/api/quotations/from-template/1')
        .send({ customer_id: 1 });

      expect(response.status).toBe(201);
      expect(response.body.customer_id).toBe(1);
      expect(response.body.template_id).toBe(1);
      expect(response.body.status).toBe('draft');
    });

    test('should return 400 if customer_id is missing', async () => {
      const response = await request(app)
        .post('/api/quotations/from-template/1')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Customer ID is required');
    });

    test('should return 404 if template not found', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .post('/api/quotations/from-template/999')
        .send({ customer_id: 1 });

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error', 'Template not found');
    });

    test('should combine template items with additional items', async () => {
      const mockTemplate = {
        id: 1,
        items: '[{"product_id": 1, "quantity": 1}]',
        default_terms: 'Net 30',
        default_discount: 0
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockTemplate] })
        .mockResolvedValueOnce({ rows: [{ id: 1 }] });

      const response = await request(app)
        .post('/api/quotations/from-template/1')
        .send({
          customer_id: 1,
          additional_items: [{ product_id: 2, quantity: 1 }]
        });

      expect(response.status).toBe(201);
      expect(mockPool.query).toHaveBeenCalledTimes(2);
    });
  });
});
