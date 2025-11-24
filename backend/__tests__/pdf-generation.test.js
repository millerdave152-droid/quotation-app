const request = require('supertest');
const express = require('express');

// Mock database
const mockPool = {
  query: jest.fn()
};

// Mock PDF library
const mockPDF = {
  create: jest.fn(),
  addPage: jest.fn(),
  addText: jest.fn(),
  addImage: jest.fn(),
  save: jest.fn(),
  toBuffer: jest.fn()
};

describe('PDF Generation System', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());

    // Middleware to extract user from request
    app.use((req, res, next) => {
      req.user = req.headers['x-user-id']
        ? { id: parseInt(req.headers['x-user-id']), name: req.headers['x-user-name'] || 'Test User' }
        : null;
      next();
    });

    // POST /api/quotations/:id/generate-pdf
    app.post('/api/quotations/:id/generate-pdf', async (req, res) => {
      try {
        const { template, include_watermark, watermark_text, send_email } = req.body;

        // Get quote data
        const quoteResult = await mockPool.query(
          `SELECT q.*, c.name as customer_name, c.email as customer_email
           FROM quotations q
           JOIN customers c ON q.customer_id = c.id
           WHERE q.id = $1`,
          [req.params.id]
        );

        if (quoteResult.rows.length === 0) {
          return res.status(404).json({ error: 'Quote not found' });
        }

        const quote = quoteResult.rows[0];

        // Generate PDF
        const pdf = mockPDF.create();
        const pdfBuffer = Buffer.from('mock-pdf-data');
        const fileName = `quote-${quote.quote_number}-${Date.now()}.pdf`;
        const fileUrl = `/pdfs/${fileName}`;

        // Store PDF metadata
        const pdfResult = await mockPool.query(
          `INSERT INTO quote_pdfs
           (quote_id, file_name, file_url, file_size, template, watermark, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
          [
            req.params.id,
            fileName,
            fileUrl,
            pdfBuffer.length,
            template || 'default',
            watermark_text || null,
            req.user?.id || null
          ]
        );

        // Send email if requested
        if (send_email && quote.customer_email) {
          await mockPool.query(
            `INSERT INTO email_queue (recipient, subject, body, attachment_url)
             VALUES ($1, $2, $3, $4)`,
            [
              quote.customer_email,
              `Quote ${quote.quote_number}`,
              `Please find your quote attached.`,
              fileUrl
            ]
          );
        }

        res.json({
          success: true,
          pdf: pdfResult.rows[0],
          file_url: fileUrl,
          file_name: fileName,
          email_sent: send_email && quote.customer_email ? true : false
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/quotations/:id/pdfs
    app.get('/api/quotations/:id/pdfs', async (req, res) => {
      try {
        const pdfsResult = await mockPool.query(
          `SELECT p.*, u.name as created_by_name
           FROM quote_pdfs p
           LEFT JOIN users u ON p.created_by = u.id
           WHERE p.quote_id = $1
           ORDER BY p.created_at DESC`,
          [req.params.id]
        );

        res.json({
          count: pdfsResult.rows.length,
          pdfs: pdfsResult.rows
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/pdfs/:pdfId
    app.get('/api/pdfs/:pdfId', async (req, res) => {
      try {
        const pdfResult = await mockPool.query(
          'SELECT * FROM quote_pdfs WHERE id = $1',
          [req.params.pdfId]
        );

        if (pdfResult.rows.length === 0) {
          return res.status(404).json({ error: 'PDF not found' });
        }

        const pdf = pdfResult.rows[0];

        // In real implementation, would read file from storage
        const pdfBuffer = Buffer.from('mock-pdf-data');

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${pdf.file_name}"`);
        res.send(pdfBuffer);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/pdf-templates
    app.get('/api/pdf-templates', async (req, res) => {
      try {
        const templatesResult = await mockPool.query(
          `SELECT * FROM pdf_templates
           WHERE is_active = true
           ORDER BY name ASC`
        );

        res.json({
          count: templatesResult.rows.length,
          templates: templatesResult.rows
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/pdf-templates
    app.post('/api/pdf-templates', async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Authentication required' });
        }

        const {
          name,
          description,
          header_config,
          footer_config,
          styles,
          is_default
        } = req.body;

        if (!name || name.trim() === '') {
          return res.status(400).json({ error: 'Template name is required' });
        }

        // If setting as default, unset other defaults
        if (is_default) {
          await mockPool.query(
            'UPDATE pdf_templates SET is_default = false'
          );
        }

        const templateResult = await mockPool.query(
          `INSERT INTO pdf_templates
           (name, description, header_config, footer_config, styles, is_default, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING *`,
          [
            name,
            description,
            JSON.stringify(header_config || {}),
            JSON.stringify(footer_config || {}),
            JSON.stringify(styles || {}),
            is_default || false,
            req.user.id
          ]
        );

        res.status(201).json({
          success: true,
          template: templateResult.rows[0]
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/quotations/:id/preview-pdf
    app.post('/api/quotations/:id/preview-pdf', async (req, res) => {
      try {
        const { template } = req.body;

        const quoteResult = await mockPool.query(
          'SELECT * FROM quotations WHERE id = $1',
          [req.params.id]
        );

        if (quoteResult.rows.length === 0) {
          return res.status(404).json({ error: 'Quote not found' });
        }

        // Generate preview (smaller, watermarked)
        const previewUrl = `/previews/quote-${req.params.id}-preview.pdf`;

        res.json({
          success: true,
          preview_url: previewUrl,
          template: template || 'default'
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/quotations/batch-generate-pdfs
    app.post('/api/quotations/batch-generate-pdfs', async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Authentication required' });
        }

        const { quote_ids, template, send_emails } = req.body;

        if (!quote_ids || quote_ids.length === 0) {
          return res.status(400).json({ error: 'Quote IDs are required' });
        }

        const generated = [];
        const failed = [];

        for (const quoteId of quote_ids) {
          try {
            const quoteResult = await mockPool.query(
              'SELECT * FROM quotations WHERE id = $1',
              [quoteId]
            );

            if (quoteResult.rows.length === 0) {
              failed.push({ quote_id: quoteId, reason: 'Quote not found' });
              continue;
            }

            const fileName = `quote-${quoteResult.rows[0].quote_number}.pdf`;
            const fileUrl = `/pdfs/${fileName}`;

            await mockPool.query(
              `INSERT INTO quote_pdfs
               (quote_id, file_name, file_url, file_size, template, created_by)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [quoteId, fileName, fileUrl, 1024, template || 'default', req.user.id]
            );

            generated.push({ quote_id: quoteId, file_url: fileUrl });
          } catch (error) {
            failed.push({ quote_id: quoteId, reason: error.message });
          }
        }

        res.json({
          success: true,
          generated_count: generated.length,
          generated: generated,
          failed_count: failed.length,
          failed: failed
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // PUT /api/pdf-templates/:id
    app.put('/api/pdf-templates/:id', async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Authentication required' });
        }

        const {
          name,
          description,
          header_config,
          footer_config,
          styles,
          is_default
        } = req.body;

        // If setting as default, unset other defaults
        if (is_default) {
          await mockPool.query(
            'UPDATE pdf_templates SET is_default = false WHERE id != $1',
            [req.params.id]
          );
        }

        const templateResult = await mockPool.query(
          `UPDATE pdf_templates
           SET name = $1,
               description = $2,
               header_config = $3,
               footer_config = $4,
               styles = $5,
               is_default = $6,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $7
           RETURNING *`,
          [
            name,
            description,
            JSON.stringify(header_config || {}),
            JSON.stringify(footer_config || {}),
            JSON.stringify(styles || {}),
            is_default || false,
            req.params.id
          ]
        );

        if (templateResult.rows.length === 0) {
          return res.status(404).json({ error: 'Template not found' });
        }

        res.json({
          success: true,
          template: templateResult.rows[0]
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // DELETE /api/pdfs/:pdfId
    app.delete('/api/pdfs/:pdfId', async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Authentication required' });
        }

        const deleteResult = await mockPool.query(
          'DELETE FROM quote_pdfs WHERE id = $1 RETURNING *',
          [req.params.pdfId]
        );

        if (deleteResult.rows.length === 0) {
          return res.status(404).json({ error: 'PDF not found' });
        }

        res.json({
          success: true,
          message: 'PDF deleted successfully',
          deleted_pdf: deleteResult.rows[0]
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/quotations/:id/send-pdf
    app.post('/api/quotations/:id/send-pdf', async (req, res) => {
      try {
        const { pdf_id, recipient_email, subject, message } = req.body;

        if (!recipient_email) {
          return res.status(400).json({ error: 'Recipient email is required' });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(recipient_email)) {
          return res.status(400).json({ error: 'Invalid email format' });
        }

        // Get PDF
        const pdfResult = await mockPool.query(
          'SELECT * FROM quote_pdfs WHERE id = $1 AND quote_id = $2',
          [pdf_id, req.params.id]
        );

        if (pdfResult.rows.length === 0) {
          return res.status(404).json({ error: 'PDF not found' });
        }

        const pdf = pdfResult.rows[0];

        // Queue email
        await mockPool.query(
          `INSERT INTO email_queue
           (recipient, subject, body, attachment_url, quote_id)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            recipient_email,
            subject || `Quote ${req.params.id}`,
            message || 'Please find your quote attached.',
            pdf.file_url,
            req.params.id
          ]
        );

        res.json({
          success: true,
          message: 'PDF sent successfully',
          recipient: recipient_email
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/pdf-statistics
    app.get('/api/pdf-statistics', async (req, res) => {
      try {
        const { start_date, end_date } = req.query;

        const statsResult = await mockPool.query(
          `SELECT
             COUNT(*) as total_pdfs,
             COUNT(DISTINCT quote_id) as unique_quotes,
             SUM(file_size) as total_size,
             AVG(file_size) as avg_size,
             template as most_used_template
           FROM quote_pdfs
           WHERE created_at BETWEEN $1 AND $2
           GROUP BY template
           ORDER BY COUNT(*) DESC
           LIMIT 1`,
          [start_date || '2020-01-01', end_date || '2030-12-31']
        );

        const allStats = await mockPool.query(
          `SELECT
             COUNT(*) as total_pdfs,
             COUNT(DISTINCT quote_id) as unique_quotes,
             SUM(file_size) as total_size
           FROM quote_pdfs
           WHERE created_at BETWEEN $1 AND $2`,
          [start_date || '2020-01-01', end_date || '2030-12-31']
        );

        res.json({
          ...allStats.rows[0],
          most_used_template: statsResult.rows[0]?.most_used_template || null
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/quotations/:id/generate-pdf', () => {
    test('should generate PDF for quote', async () => {
      const mockQuote = {
        id: 1,
        quote_number: 'Q-001',
        customer_name: 'ACME Corp',
        customer_email: 'customer@acme.com'
      };

      const mockPDF = {
        id: 1,
        file_name: 'quote-Q-001.pdf',
        file_url: '/pdfs/quote-Q-001.pdf'
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockQuote] })
        .mockResolvedValueOnce({ rows: [mockPDF] });

      const response = await request(app)
        .post('/api/quotations/1/generate-pdf')
        .set('x-user-id', '1')
        .send({ template: 'default' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.file_url).toBeDefined();
      expect(response.body.file_name).toContain('quote-');
    });

    test('should include watermark when requested', async () => {
      const mockQuote = { id: 1, quote_number: 'Q-001', customer_name: 'Test' };

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockQuote] })
        .mockResolvedValueOnce({ rows: [{ watermark: 'DRAFT' }] });

      const response = await request(app)
        .post('/api/quotations/1/generate-pdf')
        .set('x-user-id', '1')
        .send({ include_watermark: true, watermark_text: 'DRAFT' });

      expect(response.status).toBe(200);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO quote_pdfs'),
        expect.arrayContaining([expect.any(Number), expect.any(String), expect.any(String), expect.any(Number), expect.any(String), 'DRAFT', expect.any(Number)])
      );
    });

    test('should send email when requested', async () => {
      const mockQuote = {
        id: 1,
        quote_number: 'Q-001',
        customer_email: 'customer@test.com'
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockQuote] })
        .mockResolvedValueOnce({ rows: [{ file_url: '/pdfs/test.pdf' }] })
        .mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/quotations/1/generate-pdf')
        .set('x-user-id', '1')
        .send({ send_email: true });

      expect(response.status).toBe(200);
      expect(response.body.email_sent).toBe(true);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO email_queue'),
        expect.arrayContaining(['customer@test.com', expect.any(String), expect.any(String), expect.any(String)])
      );
    });

    test('should return 404 for non-existent quote', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .post('/api/quotations/999/generate-pdf')
        .set('x-user-id', '1')
        .send({});

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/quotations/:id/pdfs', () => {
    test('should return all PDFs for a quote', async () => {
      const mockPDFs = [
        { id: 1, file_name: 'quote-1-v1.pdf', created_by_name: 'John Doe' },
        { id: 2, file_name: 'quote-1-v2.pdf', created_by_name: 'Jane Smith' }
      ];

      mockPool.query.mockResolvedValue({ rows: mockPDFs });

      const response = await request(app).get('/api/quotations/1/pdfs');

      expect(response.status).toBe(200);
      expect(response.body.count).toBe(2);
      expect(response.body.pdfs).toHaveLength(2);
    });
  });

  describe('GET /api/pdfs/:pdfId', () => {
    test('should download PDF file', async () => {
      const mockPDF = {
        id: 1,
        file_name: 'quote-Q-001.pdf',
        file_url: '/pdfs/quote-Q-001.pdf'
      };

      mockPool.query.mockResolvedValue({ rows: [mockPDF] });

      const response = await request(app).get('/api/pdfs/1');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.headers['content-disposition']).toContain('quote-Q-001.pdf');
    });

    test('should return 404 for non-existent PDF', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const response = await request(app).get('/api/pdfs/999');

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/pdf-templates', () => {
    test('should return all active templates', async () => {
      const mockTemplates = [
        { id: 1, name: 'Default', is_default: true },
        { id: 2, name: 'Modern', is_default: false }
      ];

      mockPool.query.mockResolvedValue({ rows: mockTemplates });

      const response = await request(app).get('/api/pdf-templates');

      expect(response.status).toBe(200);
      expect(response.body.count).toBe(2);
      expect(response.body.templates).toHaveLength(2);
    });
  });

  describe('POST /api/pdf-templates', () => {
    test('should create new PDF template', async () => {
      const newTemplate = {
        name: 'Custom Template',
        description: 'A custom template',
        header_config: { logo: true },
        styles: { font: 'Arial' }
      };

      mockPool.query.mockResolvedValue({ rows: [{ id: 1, ...newTemplate }] });

      const response = await request(app)
        .post('/api/pdf-templates')
        .set('x-user-id', '1')
        .send(newTemplate);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.template.name).toBe('Custom Template');
    });

    test('should require template name', async () => {
      const response = await request(app)
        .post('/api/pdf-templates')
        .set('x-user-id', '1')
        .send({ description: 'Test' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Template name is required');
    });

    test('should unset other defaults when setting new default', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 1, is_default: true }] });

      const response = await request(app)
        .post('/api/pdf-templates')
        .set('x-user-id', '1')
        .send({ name: 'New Default', is_default: true });

      expect(response.status).toBe(201);
      expect(mockPool.query).toHaveBeenCalledWith(
        'UPDATE pdf_templates SET is_default = false'
      );
    });

    test('should require authentication', async () => {
      const response = await request(app)
        .post('/api/pdf-templates')
        .send({ name: 'Test' });

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/quotations/:id/preview-pdf', () => {
    test('should generate PDF preview', async () => {
      mockPool.query.mockResolvedValue({ rows: [{ id: 1 }] });

      const response = await request(app)
        .post('/api/quotations/1/preview-pdf')
        .send({ template: 'modern' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.preview_url).toBeDefined();
      expect(response.body.template).toBe('modern');
    });

    test('should return 404 for non-existent quote', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .post('/api/quotations/999/preview-pdf')
        .send({});

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/quotations/batch-generate-pdfs', () => {
    test('should generate PDFs for multiple quotes', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 1, quote_number: 'Q-001' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 2, quote_number: 'Q-002' }] })
        .mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/quotations/batch-generate-pdfs')
        .set('x-user-id', '1')
        .send({ quote_ids: [1, 2], template: 'default' });

      expect(response.status).toBe(200);
      expect(response.body.generated_count).toBe(2);
      expect(response.body.failed_count).toBe(0);
    });

    test('should handle partial failures', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 2, quote_number: 'Q-002' }] })
        .mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/quotations/batch-generate-pdfs')
        .set('x-user-id', '1')
        .send({ quote_ids: [999, 2] });

      expect(response.status).toBe(200);
      expect(response.body.generated_count).toBe(1);
      expect(response.body.failed_count).toBe(1);
      expect(response.body.failed[0].reason).toBe('Quote not found');
    });

    test('should require quote IDs', async () => {
      const response = await request(app)
        .post('/api/quotations/batch-generate-pdfs')
        .set('x-user-id', '1')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Quote IDs are required');
    });
  });

  describe('PUT /api/pdf-templates/:id', () => {
    test('should update PDF template', async () => {
      const updatedTemplate = {
        name: 'Updated Template',
        description: 'Updated description'
      };

      mockPool.query.mockResolvedValue({ rows: [{ id: 1, ...updatedTemplate }] });

      const response = await request(app)
        .put('/api/pdf-templates/1')
        .set('x-user-id', '1')
        .send(updatedTemplate);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.template.name).toBe('Updated Template');
    });

    test('should return 404 for non-existent template', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .put('/api/pdf-templates/999')
        .set('x-user-id', '1')
        .send({ name: 'Test' });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/pdfs/:pdfId', () => {
    test('should delete PDF', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ id: 1, file_name: 'test.pdf' }]
      });

      const response = await request(app)
        .delete('/api/pdfs/1')
        .set('x-user-id', '1');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('should return 404 for non-existent PDF', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .delete('/api/pdfs/999')
        .set('x-user-id', '1');

      expect(response.status).toBe(404);
    });

    test('should require authentication', async () => {
      const response = await request(app).delete('/api/pdfs/1');

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/quotations/:id/send-pdf', () => {
    test('should send PDF via email', async () => {
      const mockPDF = {
        id: 1,
        file_url: '/pdfs/quote-001.pdf'
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockPDF] })
        .mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/quotations/1/send-pdf')
        .send({
          pdf_id: 1,
          recipient_email: 'customer@test.com',
          subject: 'Your Quote',
          message: 'Please review'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.recipient).toBe('customer@test.com');
    });

    test('should require recipient email', async () => {
      const response = await request(app)
        .post('/api/quotations/1/send-pdf')
        .send({ pdf_id: 1 });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Recipient email is required');
    });

    test('should validate email format', async () => {
      const response = await request(app)
        .post('/api/quotations/1/send-pdf')
        .send({ pdf_id: 1, recipient_email: 'invalid-email' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid email format');
    });

    test('should return 404 for non-existent PDF', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .post('/api/quotations/1/send-pdf')
        .send({ pdf_id: 999, recipient_email: 'test@test.com' });

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/pdf-statistics', () => {
    test('should return PDF generation statistics', async () => {
      const mockStats = {
        total_pdfs: '50',
        unique_quotes: '40',
        total_size: '5242880',
        most_used_template: 'default'
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockStats] })
        .mockResolvedValueOnce({ rows: [{ total_pdfs: '50', unique_quotes: '40', total_size: '5242880' }] });

      const response = await request(app).get('/api/pdf-statistics');

      expect(response.status).toBe(200);
      expect(response.body.total_pdfs).toBe('50');
      expect(response.body.most_used_template).toBe('default');
    });
  });
});
