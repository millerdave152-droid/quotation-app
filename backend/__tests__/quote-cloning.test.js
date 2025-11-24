const request = require('supertest');
const express = require('express');

const mockPool = { query: jest.fn() };

describe('Quote Cloning System', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());

    // POST /api/quotes/:id/clone
    app.post('/api/quotes/:id/clone', async (req, res) => {
      try {
        const quoteId = parseInt(req.params.id);
        const { modifications = {}, clone_line_items = true, created_by } = req.body;

        // Get original quote
        const originalResult = await mockPool.query(
          'SELECT * FROM quotations WHERE id = $1',
          [quoteId]
        );

        if (originalResult.rows.length === 0) {
          return res.status(404).json({ error: 'Quote not found' });
        }

        const original = originalResult.rows[0];

        // Generate new quote number
        const newQuoteNumber = modifications.quote_number || `${original.quote_number}-COPY`;

        // Create cloned quote
        const cloneResult = await mockPool.query(
          `INSERT INTO quotations (
            quote_number, customer_id, total_amount, status, notes,
            valid_until, discount_percentage, tax_rate, created_by, cloned_from
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
          [
            newQuoteNumber,
            modifications.customer_id || original.customer_id,
            modifications.total_amount || original.total_amount,
            modifications.status || 'draft',
            modifications.notes || original.notes,
            modifications.valid_until || original.valid_until,
            modifications.discount_percentage !== undefined ? modifications.discount_percentage : original.discount_percentage,
            modifications.tax_rate !== undefined ? modifications.tax_rate : original.tax_rate,
            created_by,
            quoteId
          ]
        );

        const clonedQuote = cloneResult.rows[0];

        // Clone line items if requested
        if (clone_line_items) {
          const lineItemsResult = await mockPool.query(
            'SELECT * FROM quote_line_items WHERE quotation_id = $1',
            [quoteId]
          );

          for (const item of lineItemsResult.rows) {
            await mockPool.query(
              'INSERT INTO quote_line_items (quotation_id, product_id, quantity, unit_price, total) VALUES ($1, $2, $3, $4, $5)',
              [
                clonedQuote.id,
                item.product_id,
                modifications.adjust_quantities ? item.quantity * modifications.adjust_quantities : item.quantity,
                modifications.adjust_prices ? item.unit_price * modifications.adjust_prices : item.unit_price,
                item.total
              ]
            );
          }
        }

        // Log clone operation
        await mockPool.query(
          'INSERT INTO clone_history (original_quote_id, cloned_quote_id, created_by) VALUES ($1, $2, $3)',
          [quoteId, clonedQuote.id, created_by]
        );

        res.status(201).json({
          success: true,
          original_id: quoteId,
          cloned_quote: clonedQuote
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/quotes/clone-multiple
    app.post('/api/quotes/clone-multiple', async (req, res) => {
      try {
        const { quote_ids, modifications = {}, created_by } = req.body;

        if (!quote_ids || !Array.isArray(quote_ids) || quote_ids.length === 0) {
          return res.status(400).json({ error: 'Quote IDs array required' });
        }

        const clonedQuotes = [];

        for (const quoteId of quote_ids) {
          const originalResult = await mockPool.query(
            'SELECT * FROM quotations WHERE id = $1',
            [quoteId]
          );

          if (originalResult.rows.length > 0) {
            const original = originalResult.rows[0];
            const newQuoteNumber = `${original.quote_number}-COPY`;

            const cloneResult = await mockPool.query(
              'INSERT INTO quotations (quote_number, customer_id, total_amount, status, created_by, cloned_from) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
              [newQuoteNumber, original.customer_id, original.total_amount, 'draft', created_by, quoteId]
            );

            clonedQuotes.push({
              original_id: quoteId,
              cloned_quote: cloneResult.rows[0]
            });
          }
        }

        res.status(201).json({
          success: true,
          cloned_count: clonedQuotes.length,
          cloned_quotes: clonedQuotes
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/quotes/:id/clones
    app.get('/api/quotes/:id/clones', async (req, res) => {
      try {
        const quoteId = parseInt(req.params.id);

        const result = await mockPool.query(
          'SELECT * FROM quotations WHERE cloned_from = $1 ORDER BY created_at DESC',
          [quoteId]
        );

        res.json({
          original_id: quoteId,
          clones: result.rows,
          clone_count: result.rows.length
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/quotes/:id/clone-history
    app.get('/api/quotes/:id/clone-history', async (req, res) => {
      try {
        const quoteId = parseInt(req.params.id);

        const result = await mockPool.query(
          `SELECT ch.*, q.quote_number, u.name as created_by_name
           FROM clone_history ch
           LEFT JOIN quotations q ON ch.cloned_quote_id = q.id
           LEFT JOIN users u ON ch.created_by = u.id
           WHERE ch.original_quote_id = $1
           ORDER BY ch.created_at DESC`,
          [quoteId]
        );

        res.json({
          history: result.rows,
          total: result.rows.length
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/quotes/:id/clone-with-variations
    app.post('/api/quotes/:id/clone-with-variations', async (req, res) => {
      try {
        const quoteId = parseInt(req.params.id);
        const { variations = [], created_by } = req.body;

        if (!Array.isArray(variations) || variations.length === 0) {
          return res.status(400).json({ error: 'Variations array required' });
        }

        const originalResult = await mockPool.query(
          'SELECT * FROM quotations WHERE id = $1',
          [quoteId]
        );

        if (originalResult.rows.length === 0) {
          return res.status(404).json({ error: 'Quote not found' });
        }

        const original = originalResult.rows[0];
        const clonedVariations = [];

        for (let i = 0; i < variations.length; i++) {
          const variation = variations[i];
          const variantNumber = `${original.quote_number}-V${i + 1}`;

          const cloneResult = await mockPool.query(
            'INSERT INTO quotations (quote_number, customer_id, total_amount, status, notes, created_by, cloned_from) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
            [
              variantNumber,
              variation.customer_id || original.customer_id,
              variation.total_amount || original.total_amount,
              'draft',
              variation.notes || `Variation ${i + 1}: ${variation.description || ''}`,
              created_by,
              quoteId
            ]
          );

          clonedVariations.push(cloneResult.rows[0]);
        }

        res.status(201).json({
          success: true,
          variations_count: clonedVariations.length,
          variations: clonedVariations
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/quotes/:id/clone-as-template
    app.post('/api/quotes/:id/clone-as-template', async (req, res) => {
      try {
        const quoteId = parseInt(req.params.id);
        const { template_name, category, created_by } = req.body;

        if (!template_name) {
          return res.status(400).json({ error: 'Template name required' });
        }

        const originalResult = await mockPool.query(
          'SELECT * FROM quotations WHERE id = $1',
          [quoteId]
        );

        if (originalResult.rows.length === 0) {
          return res.status(404).json({ error: 'Quote not found' });
        }

        const original = originalResult.rows[0];

        // Create template from quote
        const templateResult = await mockPool.query(
          'INSERT INTO quote_templates (name, category, base_quote_id, created_by, template_data) VALUES ($1, $2, $3, $4, $5) RETURNING *',
          [template_name, category, quoteId, created_by, JSON.stringify(original)]
        );

        res.status(201).json({
          success: true,
          template: templateResult.rows[0]
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/quotes/:id/quick-clone
    app.post('/api/quotes/:id/quick-clone', async (req, res) => {
      try {
        const quoteId = parseInt(req.params.id);
        const { customer_id, created_by } = req.body;

        const originalResult = await mockPool.query(
          'SELECT * FROM quotations WHERE id = $1',
          [quoteId]
        );

        if (originalResult.rows.length === 0) {
          return res.status(404).json({ error: 'Quote not found' });
        }

        const original = originalResult.rows[0];

        // Quick clone with minimal modifications
        const cloneResult = await mockPool.query(
          'INSERT INTO quotations (quote_number, customer_id, total_amount, status, created_by, cloned_from) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
          [`${original.quote_number}-Q${Date.now()}`, customer_id || original.customer_id, original.total_amount, 'draft', created_by, quoteId]
        );

        res.status(201).json({
          success: true,
          cloned_quote: cloneResult.rows[0]
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/quotes/:id/is-cloneable
    app.get('/api/quotes/:id/is-cloneable', async (req, res) => {
      try {
        const quoteId = parseInt(req.params.id);

        const result = await mockPool.query(
          'SELECT status, deleted_at FROM quotations WHERE id = $1',
          [quoteId]
        );

        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Quote not found' });
        }

        const quote = result.rows[0];
        const isCloneable = quote.deleted_at === null;
        const reasons = [];

        if (quote.deleted_at) {
          reasons.push('Quote is deleted');
        }

        res.json({
          is_cloneable: isCloneable,
          reasons: reasons.length > 0 ? reasons : null
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  });

  beforeEach(() => jest.clearAllMocks());

  describe('POST /api/quotes/:id/clone', () => {
    test('should clone a quote with all details', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            quote_number: 'Q-001',
            customer_id: 1,
            total_amount: 5000,
            status: 'sent',
            notes: 'Original notes',
            valid_until: '2024-12-31',
            discount_percentage: 10,
            tax_rate: 8.5
          }]
        })
        .mockResolvedValueOnce({
          rows: [{
            id: 10,
            quote_number: 'Q-001-COPY',
            customer_id: 1,
            total_amount: 5000,
            status: 'draft',
            cloned_from: 1
          }]
        })
        .mockResolvedValueOnce({ rows: [] }); // clone history

      const response = await request(app)
        .post('/api/quotes/1/clone')
        .send({
          clone_line_items: false,
          created_by: 1
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.cloned_quote.quote_number).toBe('Q-001-COPY');
      expect(response.body.cloned_quote.status).toBe('draft');
    });

    test('should return 404 for non-existent quote', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/quotes/999/clone')
        .send({ created_by: 1 });

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/quotes/clone-multiple', () => {
    test('should clone multiple quotes', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{ id: 1, quote_number: 'Q-001', customer_id: 1, total_amount: 1000 }]
        })
        .mockResolvedValueOnce({
          rows: [{ id: 10, quote_number: 'Q-001-COPY' }]
        })
        .mockResolvedValueOnce({
          rows: [{ id: 2, quote_number: 'Q-002', customer_id: 2, total_amount: 2000 }]
        })
        .mockResolvedValueOnce({
          rows: [{ id: 11, quote_number: 'Q-002-COPY' }]
        });

      const response = await request(app)
        .post('/api/quotes/clone-multiple')
        .send({
          quote_ids: [1, 2],
          created_by: 1
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.cloned_count).toBe(2);
      expect(response.body.cloned_quotes).toHaveLength(2);
    });

    test('should require quote IDs array', async () => {
      const response = await request(app)
        .post('/api/quotes/clone-multiple')
        .send({ created_by: 1 });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/quotes/:id/clones', () => {
    test('should get all clones of a quote', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          { id: 10, quote_number: 'Q-001-COPY', cloned_from: 1 },
          { id: 11, quote_number: 'Q-001-COPY-2', cloned_from: 1 }
        ]
      });

      const response = await request(app)
        .get('/api/quotes/1/clones');

      expect(response.status).toBe(200);
      expect(response.body.clones).toHaveLength(2);
      expect(response.body.clone_count).toBe(2);
    });
  });

  describe('GET /api/quotes/:id/clone-history', () => {
    test('should get clone history', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          {
            id: 1,
            original_quote_id: 1,
            cloned_quote_id: 10,
            quote_number: 'Q-001-COPY',
            created_by_name: 'John Doe'
          }
        ]
      });

      const response = await request(app)
        .get('/api/quotes/1/clone-history');

      expect(response.status).toBe(200);
      expect(response.body.history).toHaveLength(1);
      expect(response.body.total).toBe(1);
    });
  });

  describe('POST /api/quotes/:id/clone-with-variations', () => {
    test('should clone with multiple variations', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{ id: 1, quote_number: 'Q-001', customer_id: 1, total_amount: 5000 }]
        })
        .mockResolvedValue({
          rows: [{ id: 10, quote_number: 'Q-001-V1' }]
        });

      const response = await request(app)
        .post('/api/quotes/1/clone-with-variations')
        .send({
          variations: [
            { description: 'Low price', total_amount: 4000 },
            { description: 'High spec', total_amount: 6000 }
          ],
          created_by: 1
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.variations_count).toBe(2);
    });

    test('should require variations array', async () => {
      const response = await request(app)
        .post('/api/quotes/1/clone-with-variations')
        .send({ created_by: 1 });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/quotes/:id/clone-as-template', () => {
    test('should clone quote as template', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{ id: 1, quote_number: 'Q-001', customer_id: 1 }]
        })
        .mockResolvedValueOnce({
          rows: [{ id: 1, name: 'Standard Quote Template', category: 'sales' }]
        });

      const response = await request(app)
        .post('/api/quotes/1/clone-as-template')
        .send({
          template_name: 'Standard Quote Template',
          category: 'sales',
          created_by: 1
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.template.name).toBe('Standard Quote Template');
    });

    test('should require template name', async () => {
      const response = await request(app)
        .post('/api/quotes/1/clone-as-template')
        .send({ created_by: 1 });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/quotes/:id/quick-clone', () => {
    test('should quickly clone a quote', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{ id: 1, quote_number: 'Q-001', customer_id: 1, total_amount: 5000 }]
        })
        .mockResolvedValueOnce({
          rows: [{ id: 20, quote_number: 'Q-001-Q1234567890' }]
        });

      const response = await request(app)
        .post('/api/quotes/1/quick-clone')
        .send({ customer_id: 2, created_by: 1 });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.cloned_quote).toBeDefined();
    });
  });

  describe('GET /api/quotes/:id/is-cloneable', () => {
    test('should check if quote is cloneable', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ status: 'sent', deleted_at: null }]
      });

      const response = await request(app)
        .get('/api/quotes/1/is-cloneable');

      expect(response.status).toBe(200);
      expect(response.body.is_cloneable).toBe(true);
    });

    test('should not allow cloning deleted quotes', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ status: 'sent', deleted_at: '2024-01-01' }]
      });

      const response = await request(app)
        .get('/api/quotes/1/is-cloneable');

      expect(response.body.is_cloneable).toBe(false);
      expect(response.body.reasons).toContain('Quote is deleted');
    });
  });
});
