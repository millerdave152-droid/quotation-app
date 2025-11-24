const request = require('supertest');
const express = require('express');

const mockPool = { query: jest.fn() };

describe('Bulk Operations System', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());

    // POST /api/bulk/status-update
    app.post('/api/bulk/status-update', async (req, res) => {
      try {
        const { quote_ids, status, updated_by } = req.body;

        if (!quote_ids || !Array.isArray(quote_ids) || quote_ids.length === 0) {
          return res.status(400).json({ error: 'Quote IDs array required' });
        }

        if (!status) {
          return res.status(400).json({ error: 'Status required' });
        }

        const validStatuses = ['draft', 'pending', 'sent', 'accepted', 'rejected', 'expired'];
        if (!validStatuses.includes(status)) {
          return res.status(400).json({ error: 'Invalid status' });
        }

        const placeholders = quote_ids.map((_, i) => `$${i + 1}`).join(',');
        const result = await mockPool.query(
          `UPDATE quotations SET status = $${quote_ids.length + 1}, updated_at = NOW(), updated_by = $${quote_ids.length + 2} WHERE id IN (${placeholders}) RETURNING id`,
          [...quote_ids, status, updated_by]
        );

        res.json({
          success: true,
          updated_count: result.rows.length,
          quote_ids: result.rows.map(r => r.id)
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/bulk/send-emails
    app.post('/api/bulk/send-emails', async (req, res) => {
      try {
        const { quote_ids, email_template, sender_id } = req.body;

        if (!quote_ids || !Array.isArray(quote_ids) || quote_ids.length === 0) {
          return res.status(400).json({ error: 'Quote IDs array required' });
        }

        const placeholders = quote_ids.map((_, i) => `$${i + 1}`).join(',');
        const quotes = await mockPool.query(
          `SELECT q.id, q.quote_number, c.email, c.name FROM quotations q JOIN customers c ON q.customer_id = c.id WHERE q.id IN (${placeholders})`,
          quote_ids
        );

        const sent_emails = [];
        for (const quote of quotes.rows) {
          if (quote.email) {
            await mockPool.query(
              'INSERT INTO email_logs (quotation_id, recipient_email, template, sent_by) VALUES ($1, $2, $3, $4)',
              [quote.id, quote.email, email_template || 'default', sender_id]
            );
            sent_emails.push(quote.id);
          }
        }

        res.json({
          success: true,
          sent_count: sent_emails.length,
          failed_count: quote_ids.length - sent_emails.length,
          sent_quote_ids: sent_emails
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/bulk/generate-pdfs
    app.post('/api/bulk/generate-pdfs', async (req, res) => {
      try {
        const { quote_ids, user_id } = req.body;

        if (!quote_ids || !Array.isArray(quote_ids) || quote_ids.length === 0) {
          return res.status(400).json({ error: 'Quote IDs array required' });
        }

        const generated = [];
        for (const quoteId of quote_ids) {
          const result = await mockPool.query(
            'INSERT INTO pdf_generations (quotation_id, generated_by, file_path) VALUES ($1, $2, $3) RETURNING id, file_path',
            [quoteId, user_id, `/pdfs/quote-${quoteId}.pdf`]
          );
          generated.push({
            quote_id: quoteId,
            pdf_id: result.rows[0].id,
            file_path: result.rows[0].file_path
          });
        }

        res.json({
          success: true,
          generated_count: generated.length,
          pdfs: generated
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/bulk/export
    app.post('/api/bulk/export', async (req, res) => {
      try {
        const { quote_ids, format, fields } = req.body;

        if (!quote_ids || !Array.isArray(quote_ids) || quote_ids.length === 0) {
          return res.status(400).json({ error: 'Quote IDs array required' });
        }

        const validFormats = ['csv', 'excel', 'json'];
        if (!validFormats.includes(format)) {
          return res.status(400).json({ error: 'Invalid format' });
        }

        const placeholders = quote_ids.map((_, i) => `$${i + 1}`).join(',');
        const result = await mockPool.query(
          `SELECT * FROM quotations WHERE id IN (${placeholders})`,
          quote_ids
        );

        const exportData = fields
          ? result.rows.map(row => {
              const filtered = {};
              fields.forEach(field => {
                if (row[field] !== undefined) filtered[field] = row[field];
              });
              return filtered;
            })
          : result.rows;

        res.json({
          success: true,
          format,
          data: exportData,
          count: exportData.length
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/bulk/delete
    app.post('/api/bulk/delete', async (req, res) => {
      try {
        const { quote_ids, soft_delete = true, deleted_by } = req.body;

        if (!quote_ids || !Array.isArray(quote_ids) || quote_ids.length === 0) {
          return res.status(400).json({ error: 'Quote IDs array required' });
        }

        const placeholders = quote_ids.map((_, i) => `$${i + 1}`).join(',');

        if (soft_delete) {
          const result = await mockPool.query(
            `UPDATE quotations SET deleted_at = NOW(), deleted_by = $${quote_ids.length + 1} WHERE id IN (${placeholders}) RETURNING id`,
            [...quote_ids, deleted_by]
          );
          res.json({
            success: true,
            deleted_count: result.rows.length,
            soft_delete: true
          });
        } else {
          const result = await mockPool.query(
            `DELETE FROM quotations WHERE id IN (${placeholders}) RETURNING id`,
            quote_ids
          );
          res.json({
            success: true,
            deleted_count: result.rows.length,
            soft_delete: false
          });
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/bulk/assign
    app.post('/api/bulk/assign', async (req, res) => {
      try {
        const { quote_ids, assigned_to, assigned_by } = req.body;

        if (!quote_ids || !Array.isArray(quote_ids) || quote_ids.length === 0) {
          return res.status(400).json({ error: 'Quote IDs array required' });
        }

        if (!assigned_to) {
          return res.status(400).json({ error: 'Assigned user ID required' });
        }

        const placeholders = quote_ids.map((_, i) => `$${i + 1}`).join(',');
        const result = await mockPool.query(
          `UPDATE quotations SET assigned_to = $${quote_ids.length + 1}, assigned_by = $${quote_ids.length + 2}, assigned_at = NOW() WHERE id IN (${placeholders}) RETURNING id`,
          [...quote_ids, assigned_to, assigned_by]
        );

        res.json({
          success: true,
          assigned_count: result.rows.length,
          assigned_to
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/bulk/archive
    app.post('/api/bulk/archive', async (req, res) => {
      try {
        const { quote_ids, archived_by } = req.body;

        if (!quote_ids || !Array.isArray(quote_ids) || quote_ids.length === 0) {
          return res.status(400).json({ error: 'Quote IDs array required' });
        }

        const placeholders = quote_ids.map((_, i) => `$${i + 1}`).join(',');
        const result = await mockPool.query(
          `UPDATE quotations SET archived = true, archived_at = NOW(), archived_by = $${quote_ids.length + 1} WHERE id IN (${placeholders}) RETURNING id`,
          [...quote_ids, archived_by]
        );

        res.json({
          success: true,
          archived_count: result.rows.length
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/bulk/duplicate
    app.post('/api/bulk/duplicate', async (req, res) => {
      try {
        const { quote_ids, created_by } = req.body;

        if (!quote_ids || !Array.isArray(quote_ids) || quote_ids.length === 0) {
          return res.status(400).json({ error: 'Quote IDs array required' });
        }

        const duplicated = [];
        for (const quoteId of quote_ids) {
          const original = await mockPool.query('SELECT * FROM quotations WHERE id = $1', [quoteId]);
          if (original.rows.length > 0) {
            const result = await mockPool.query(
              'INSERT INTO quotations (quote_number, customer_id, total_amount, created_by) VALUES ($1, $2, $3, $4) RETURNING id',
              [`${original.rows[0].quote_number}-COPY`, original.rows[0].customer_id, original.rows[0].total_amount, created_by]
            );
            duplicated.push({
              original_id: quoteId,
              new_id: result.rows[0].id
            });
          }
        }

        res.json({
          success: true,
          duplicated_count: duplicated.length,
          duplicates: duplicated
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/bulk/operations/:operationId/status
    app.get('/api/bulk/operations/:operationId/status', async (req, res) => {
      try {
        const result = await mockPool.query(
          'SELECT * FROM bulk_operations WHERE id = $1',
          [parseInt(req.params.operationId)]
        );

        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Operation not found' });
        }

        res.json({ operation: result.rows[0] });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/bulk/validate
    app.post('/api/bulk/validate', async (req, res) => {
      try {
        const { quote_ids, operation } = req.body;

        if (!quote_ids || !Array.isArray(quote_ids) || quote_ids.length === 0) {
          return res.status(400).json({ error: 'Quote IDs array required' });
        }

        const placeholders = quote_ids.map((_, i) => `$${i + 1}`).join(',');
        const result = await mockPool.query(
          `SELECT id, status, customer_id FROM quotations WHERE id IN (${placeholders})`,
          quote_ids
        );

        const valid = [];
        const invalid = [];

        result.rows.forEach(quote => {
          let isValid = true;
          let reason = '';

          if (operation === 'send-email' && !quote.customer_id) {
            isValid = false;
            reason = 'No customer assigned';
          } else if (operation === 'status-update' && quote.status === 'accepted') {
            isValid = false;
            reason = 'Quote already accepted';
          }

          if (isValid) {
            valid.push(quote.id);
          } else {
            invalid.push({ id: quote.id, reason });
          }
        });

        res.json({
          valid_count: valid.length,
          invalid_count: invalid.length,
          valid_ids: valid,
          invalid_items: invalid
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  });

  beforeEach(() => jest.clearAllMocks());

  describe('POST /api/bulk/status-update', () => {
    test('should update status for multiple quotes', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ id: 1 }, { id: 2 }, { id: 3 }]
      });

      const response = await request(app)
        .post('/api/bulk/status-update')
        .send({
          quote_ids: [1, 2, 3],
          status: 'sent',
          updated_by: 1
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.updated_count).toBe(3);
    });

    test('should validate status values', async () => {
      const response = await request(app)
        .post('/api/bulk/status-update')
        .send({
          quote_ids: [1, 2],
          status: 'invalid_status',
          updated_by: 1
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid status');
    });

    test('should require quote IDs array', async () => {
      const response = await request(app)
        .post('/api/bulk/status-update')
        .send({
          status: 'sent',
          updated_by: 1
        });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/bulk/send-emails', () => {
    test('should send emails to multiple customers', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            { id: 1, quote_number: 'Q-001', email: 'customer1@example.com', name: 'Customer 1' },
            { id: 2, quote_number: 'Q-002', email: 'customer2@example.com', name: 'Customer 2' }
          ]
        })
        .mockResolvedValue({ rows: [] });

      const response = await request(app)
        .post('/api/bulk/send-emails')
        .send({
          quote_ids: [1, 2],
          email_template: 'quote_notification',
          sender_id: 1
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.sent_count).toBe(2);
    });

    test('should track failed emails', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            { id: 1, email: 'customer1@example.com' },
            { id: 2, email: null }
          ]
        })
        .mockResolvedValue({ rows: [] });

      const response = await request(app)
        .post('/api/bulk/send-emails')
        .send({ quote_ids: [1, 2], sender_id: 1 });

      expect(response.body.sent_count).toBe(1);
      expect(response.body.failed_count).toBe(1);
    });
  });

  describe('POST /api/bulk/generate-pdfs', () => {
    test('should generate PDFs for multiple quotes', async () => {
      mockPool.query.mockImplementation((query, params) => {
        const quoteId = params[0];
        return Promise.resolve({
          rows: [{ id: quoteId, file_path: `/pdfs/quote-${quoteId}.pdf` }]
        });
      });

      const response = await request(app)
        .post('/api/bulk/generate-pdfs')
        .send({
          quote_ids: [1, 2, 3],
          user_id: 1
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.generated_count).toBe(3);
      expect(response.body.pdfs).toHaveLength(3);
    });
  });

  describe('POST /api/bulk/export', () => {
    test('should export quotes in CSV format', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          { id: 1, quote_number: 'Q-001', total_amount: 1000 },
          { id: 2, quote_number: 'Q-002', total_amount: 2000 }
        ]
      });

      const response = await request(app)
        .post('/api/bulk/export')
        .send({
          quote_ids: [1, 2],
          format: 'csv'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.format).toBe('csv');
      expect(response.body.data).toHaveLength(2);
    });

    test('should filter exported fields', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          { id: 1, quote_number: 'Q-001', total_amount: 1000, notes: 'Some notes' }
        ]
      });

      const response = await request(app)
        .post('/api/bulk/export')
        .send({
          quote_ids: [1],
          format: 'json',
          fields: ['id', 'quote_number', 'total_amount']
        });

      expect(response.body.data[0]).toHaveProperty('id');
      expect(response.body.data[0]).toHaveProperty('quote_number');
      expect(response.body.data[0]).not.toHaveProperty('notes');
    });

    test('should validate export format', async () => {
      const response = await request(app)
        .post('/api/bulk/export')
        .send({
          quote_ids: [1, 2],
          format: 'invalid_format'
        });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/bulk/delete', () => {
    test('should soft delete quotes', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ id: 1 }, { id: 2 }]
      });

      const response = await request(app)
        .post('/api/bulk/delete')
        .send({
          quote_ids: [1, 2],
          soft_delete: true,
          deleted_by: 1
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.soft_delete).toBe(true);
      expect(response.body.deleted_count).toBe(2);
    });

    test('should hard delete quotes', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ id: 1 }]
      });

      const response = await request(app)
        .post('/api/bulk/delete')
        .send({
          quote_ids: [1],
          soft_delete: false
        });

      expect(response.body.soft_delete).toBe(false);
    });
  });

  describe('POST /api/bulk/assign', () => {
    test('should assign quotes to user', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ id: 1 }, { id: 2 }, { id: 3 }]
      });

      const response = await request(app)
        .post('/api/bulk/assign')
        .send({
          quote_ids: [1, 2, 3],
          assigned_to: 5,
          assigned_by: 1
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.assigned_count).toBe(3);
      expect(response.body.assigned_to).toBe(5);
    });

    test('should require assigned_to', async () => {
      const response = await request(app)
        .post('/api/bulk/assign')
        .send({
          quote_ids: [1, 2],
          assigned_by: 1
        });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/bulk/archive', () => {
    test('should archive multiple quotes', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ id: 1 }, { id: 2 }]
      });

      const response = await request(app)
        .post('/api/bulk/archive')
        .send({
          quote_ids: [1, 2],
          archived_by: 1
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.archived_count).toBe(2);
    });
  });

  describe('POST /api/bulk/duplicate', () => {
    test('should duplicate multiple quotes', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{ id: 1, quote_number: 'Q-001', customer_id: 1, total_amount: 1000 }]
        })
        .mockResolvedValueOnce({ rows: [{ id: 10 }] })
        .mockResolvedValueOnce({
          rows: [{ id: 2, quote_number: 'Q-002', customer_id: 2, total_amount: 2000 }]
        })
        .mockResolvedValueOnce({ rows: [{ id: 11 }] });

      const response = await request(app)
        .post('/api/bulk/duplicate')
        .send({
          quote_ids: [1, 2],
          created_by: 1
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.duplicated_count).toBe(2);
      expect(response.body.duplicates).toHaveLength(2);
    });
  });

  describe('GET /api/bulk/operations/:operationId/status', () => {
    test('should get bulk operation status', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{
          id: 1,
          operation_type: 'status_update',
          status: 'completed',
          total_items: 10,
          processed_items: 10
        }]
      });

      const response = await request(app)
        .get('/api/bulk/operations/1/status');

      expect(response.status).toBe(200);
      expect(response.body.operation.status).toBe('completed');
    });

    test('should return 404 for non-existent operation', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .get('/api/bulk/operations/999/status');

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/bulk/validate', () => {
    test('should validate quotes for bulk operation', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          { id: 1, status: 'pending', customer_id: 1 },
          { id: 2, status: 'accepted', customer_id: 2 }
        ]
      });

      const response = await request(app)
        .post('/api/bulk/validate')
        .send({
          quote_ids: [1, 2],
          operation: 'status-update'
        });

      expect(response.status).toBe(200);
      expect(response.body.valid_count).toBe(1);
      expect(response.body.invalid_count).toBe(1);
    });

    test('should validate email sending requirements', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          { id: 1, status: 'pending', customer_id: 1 },
          { id: 2, status: 'pending', customer_id: null }
        ]
      });

      const response = await request(app)
        .post('/api/bulk/validate')
        .send({
          quote_ids: [1, 2],
          operation: 'send-email'
        });

      expect(response.body.valid_count).toBe(1);
      expect(response.body.invalid_count).toBe(1);
      expect(response.body.invalid_items[0].reason).toContain('No customer');
    });
  });
});
