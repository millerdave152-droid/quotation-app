const request = require('supertest');
const express = require('express');

const app = express();
app.use(express.json());

// Mock pool for database operations
const mockPool = {
  query: jest.fn()
};

// Mock email service
const mockEmailService = {
  sendEmail: jest.fn()
};

describe('Email Automation & Templates System', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/email-templates', () => {
    app.post('/api/email-templates', async (req, res) => {
      try {
        const { name, subject, body, variables, category, created_by } = req.body;

        if (!name || !subject || !body) {
          return res.status(400).json({ error: 'Name, subject, and body are required' });
        }

        const result = await mockPool.query(
          'INSERT INTO email_templates (name, subject, body, variables, category, created_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
          [name, subject, body, JSON.stringify(variables || []), category || 'general', created_by]
        );

        res.json({ success: true, template: result.rows[0] });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    test('should create email template', async () => {
      const template = {
        name: 'Quote Sent',
        subject: 'Your Quote {{quote_number}}',
        body: 'Dear {{customer_name}}, please find your quote attached.',
        variables: ['quote_number', 'customer_name'],
        category: 'quotes',
        created_by: 1
      };

      mockPool.query.mockResolvedValue({
        rows: [{ id: 1, ...template }]
      });

      const response = await request(app)
        .post('/api/email-templates')
        .send(template);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.template.name).toBe('Quote Sent');
    });

    test('should require name, subject, and body', async () => {
      const response = await request(app)
        .post('/api/email-templates')
        .send({ name: 'Test' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('required');
    });
  });

  describe('GET /api/email-templates', () => {
    app.get('/api/email-templates', async (req, res) => {
      try {
        const { category } = req.query;
        let query = 'SELECT * FROM email_templates WHERE 1=1';
        const params = [];

        if (category) {
          params.push(category);
          query += ` AND category = $${params.length}`;
        }

        query += ' ORDER BY created_at DESC';

        const result = await mockPool.query(query, params);
        res.json({ templates: result.rows });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    test('should get all email templates', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          { id: 1, name: 'Template 1', category: 'quotes' },
          { id: 2, name: 'Template 2', category: 'follow-up' }
        ]
      });

      const response = await request(app).get('/api/email-templates');

      expect(response.status).toBe(200);
      expect(response.body.templates).toHaveLength(2);
    });

    test('should filter templates by category', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ id: 1, name: 'Template 1', category: 'quotes' }]
      });

      const response = await request(app)
        .get('/api/email-templates')
        .query({ category: 'quotes' });

      expect(response.status).toBe(200);
      expect(response.body.templates).toHaveLength(1);
    });
  });

  describe('POST /api/quotes/:id/send-email', () => {
    app.post('/api/quotes/:id/send-email', async (req, res) => {
      try {
        const quoteId = req.params.id;
        const { template_id, recipient_email, cc_emails, custom_message } = req.body;

        if (!recipient_email) {
          return res.status(400).json({ error: 'Recipient email is required' });
        }

        // Get quote details
        const quoteResult = await mockPool.query(
          'SELECT q.*, c.name as customer_name, c.email as customer_email FROM quotations q JOIN customers c ON q.customer_id = c.id WHERE q.id = $1',
          [quoteId]
        );

        if (quoteResult.rows.length === 0) {
          return res.status(404).json({ error: 'Quote not found' });
        }

        const quote = quoteResult.rows[0];

        // Get template if specified
        let emailContent = { subject: 'Your Quote', body: custom_message || '' };
        if (template_id) {
          const templateResult = await mockPool.query(
            'SELECT * FROM email_templates WHERE id = $1',
            [template_id]
          );

          if (templateResult.rows.length > 0) {
            const template = templateResult.rows[0];
            emailContent = {
              subject: template.subject.replace('{{quote_number}}', quote.quote_number),
              body: template.body.replace('{{customer_name}}', quote.customer_name)
            };
          }
        }

        // Send email
        await mockEmailService.sendEmail({
          to: recipient_email,
          cc: cc_emails,
          subject: emailContent.subject,
          body: emailContent.body,
          attachments: [{ filename: `${quote.quote_number}.pdf` }]
        });

        // Log email
        await mockPool.query(
          'INSERT INTO email_logs (quotation_id, recipient, subject, sent_at, status) VALUES ($1, $2, $3, NOW(), $4)',
          [quoteId, recipient_email, emailContent.subject, 'sent']
        );

        res.json({ success: true, message: 'Email sent successfully' });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    test('should send email with template', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{ id: 1, quote_number: 'Q-001', customer_name: 'John Doe', customer_email: 'john@example.com' }]
        })
        .mockResolvedValueOnce({
          rows: [{ id: 1, subject: 'Quote {{quote_number}}', body: 'Dear {{customer_name}}' }]
        })
        .mockResolvedValueOnce({ rows: [] });

      mockEmailService.sendEmail.mockResolvedValue({ success: true });

      const response = await request(app)
        .post('/api/quotes/1/send-email')
        .send({
          template_id: 1,
          recipient_email: 'john@example.com'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockEmailService.sendEmail).toHaveBeenCalled();
    });

    test('should require recipient email', async () => {
      const response = await request(app)
        .post('/api/quotes/1/send-email')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('required');
    });

    test('should return 404 for non-existent quote', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .post('/api/quotes/999/send-email')
        .send({ recipient_email: 'test@example.com' });

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/email-schedules', () => {
    app.post('/api/email-schedules', async (req, res) => {
      try {
        const { quotation_id, template_id, schedule_type, schedule_date, recipient_email, created_by } = req.body;

        if (!quotation_id || !schedule_type || !recipient_email) {
          return res.status(400).json({ error: 'Required fields missing' });
        }

        const validTypes = ['once', 'follow-up', 'reminder'];
        if (!validTypes.includes(schedule_type)) {
          return res.status(400).json({ error: 'Invalid schedule type' });
        }

        const result = await mockPool.query(
          'INSERT INTO email_schedules (quotation_id, template_id, schedule_type, schedule_date, recipient_email, created_by, status) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
          [quotation_id, template_id, schedule_type, schedule_date, recipient_email, created_by, 'pending']
        );

        res.json({ success: true, schedule: result.rows[0] });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    test('should schedule email', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{
          id: 1,
          quotation_id: 1,
          schedule_type: 'follow-up',
          status: 'pending'
        }]
      });

      const response = await request(app)
        .post('/api/email-schedules')
        .send({
          quotation_id: 1,
          template_id: 1,
          schedule_type: 'follow-up',
          schedule_date: '2024-12-31',
          recipient_email: 'test@example.com',
          created_by: 1
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.schedule.status).toBe('pending');
    });

    test('should validate schedule type', async () => {
      const response = await request(app)
        .post('/api/email-schedules')
        .send({
          quotation_id: 1,
          schedule_type: 'invalid',
          recipient_email: 'test@example.com'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid');
    });
  });

  describe('GET /api/quotes/:id/email-logs', () => {
    app.get('/api/quotes/:id/email-logs', async (req, res) => {
      try {
        const quoteId = req.params.id;

        const result = await mockPool.query(
          'SELECT * FROM email_logs WHERE quotation_id = $1 ORDER BY sent_at DESC',
          [quoteId]
        );

        res.json({ logs: result.rows });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    test('should get email logs for quote', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          { id: 1, recipient: 'test@example.com', status: 'sent', sent_at: '2024-01-01' },
          { id: 2, recipient: 'test2@example.com', status: 'opened', sent_at: '2024-01-02' }
        ]
      });

      const response = await request(app).get('/api/quotes/1/email-logs');

      expect(response.status).toBe(200);
      expect(response.body.logs).toHaveLength(2);
    });
  });

  describe('POST /api/email-logs/:id/track', () => {
    app.post('/api/email-logs/:id/track', async (req, res) => {
      try {
        const logId = req.params.id;
        const { event_type } = req.body;

        const validEvents = ['opened', 'clicked', 'bounced', 'replied'];
        if (!validEvents.includes(event_type)) {
          return res.status(400).json({ error: 'Invalid event type' });
        }

        await mockPool.query(
          'UPDATE email_logs SET status = $1, last_event_at = NOW() WHERE id = $2',
          [event_type, logId]
        );

        await mockPool.query(
          'INSERT INTO email_tracking_events (email_log_id, event_type, occurred_at) VALUES ($1, $2, NOW())',
          [logId, event_type]
        );

        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    test('should track email event', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .post('/api/email-logs/1/track')
        .send({ event_type: 'opened' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(mockPool.query).toHaveBeenCalledTimes(2);
    });

    test('should validate event type', async () => {
      const response = await request(app)
        .post('/api/email-logs/1/track')
        .send({ event_type: 'invalid' });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/email-schedules/pending', () => {
    app.get('/api/email-schedules/pending', async (req, res) => {
      try {
        const result = await mockPool.query(
          'SELECT * FROM email_schedules WHERE status = $1 AND schedule_date <= NOW() ORDER BY schedule_date ASC',
          ['pending']
        );

        res.json({ schedules: result.rows });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    test('should get pending scheduled emails', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          { id: 1, status: 'pending', schedule_date: '2024-01-01' },
          { id: 2, status: 'pending', schedule_date: '2024-01-02' }
        ]
      });

      const response = await request(app).get('/api/email-schedules/pending');

      expect(response.status).toBe(200);
      expect(response.body.schedules).toHaveLength(2);
    });
  });

  describe('PATCH /api/email-templates/:id', () => {
    app.patch('/api/email-templates/:id', async (req, res) => {
      try {
        const templateId = req.params.id;
        const { name, subject, body, variables, category } = req.body;

        const updates = [];
        const params = [];
        let paramCount = 1;

        if (name) {
          updates.push(`name = $${paramCount++}`);
          params.push(name);
        }
        if (subject) {
          updates.push(`subject = $${paramCount++}`);
          params.push(subject);
        }
        if (body) {
          updates.push(`body = $${paramCount++}`);
          params.push(body);
        }
        if (variables) {
          updates.push(`variables = $${paramCount++}`);
          params.push(JSON.stringify(variables));
        }
        if (category) {
          updates.push(`category = $${paramCount++}`);
          params.push(category);
        }

        if (updates.length === 0) {
          return res.status(400).json({ error: 'No fields to update' });
        }

        params.push(templateId);
        const result = await mockPool.query(
          `UPDATE email_templates SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
          params
        );

        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Template not found' });
        }

        res.json({ success: true, template: result.rows[0] });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    test('should update email template', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ id: 1, name: 'Updated Template', subject: 'New Subject' }]
      });

      const response = await request(app)
        .patch('/api/email-templates/1')
        .send({ name: 'Updated Template', subject: 'New Subject' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.template.name).toBe('Updated Template');
    });

    test('should return 404 for non-existent template', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .patch('/api/email-templates/999')
        .send({ name: 'Test' });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/email-templates/:id', () => {
    app.delete('/api/email-templates/:id', async (req, res) => {
      try {
        const templateId = req.params.id;

        const result = await mockPool.query(
          'DELETE FROM email_templates WHERE id = $1 RETURNING *',
          [templateId]
        );

        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Template not found' });
        }

        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    test('should delete email template', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ id: 1 }]
      });

      const response = await request(app).delete('/api/email-templates/1');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('should return 404 for non-existent template', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const response = await request(app).delete('/api/email-templates/999');

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/email-templates/:id/duplicate', () => {
    app.post('/api/email-templates/:id/duplicate', async (req, res) => {
      try {
        const templateId = req.params.id;
        const { created_by } = req.body;

        const templateResult = await mockPool.query(
          'SELECT * FROM email_templates WHERE id = $1',
          [templateId]
        );

        if (templateResult.rows.length === 0) {
          return res.status(404).json({ error: 'Template not found' });
        }

        const original = templateResult.rows[0];
        const result = await mockPool.query(
          'INSERT INTO email_templates (name, subject, body, variables, category, created_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
          [`${original.name} (Copy)`, original.subject, original.body, original.variables, original.category, created_by]
        );

        res.json({ success: true, template: result.rows[0] });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    test('should duplicate email template', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{ id: 1, name: 'Original', subject: 'Test', body: 'Content' }]
        })
        .mockResolvedValueOnce({
          rows: [{ id: 2, name: 'Original (Copy)', subject: 'Test', body: 'Content' }]
        });

      const response = await request(app)
        .post('/api/email-templates/1/duplicate')
        .send({ created_by: 1 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.template.name).toContain('Copy');
    });
  });

  describe('GET /api/email-analytics', () => {
    app.get('/api/email-analytics', async (req, res) => {
      try {
        const { start_date, end_date } = req.query;

        const result = await mockPool.query(
          `SELECT
            COUNT(*) as total_sent,
            COUNT(CASE WHEN status = 'opened' THEN 1 END) as total_opened,
            COUNT(CASE WHEN status = 'clicked' THEN 1 END) as total_clicked,
            COUNT(CASE WHEN status = 'bounced' THEN 1 END) as total_bounced,
            COUNT(CASE WHEN status = 'replied' THEN 1 END) as total_replied
          FROM email_logs
          WHERE sent_at >= $1 AND sent_at <= $2`,
          [start_date || '2024-01-01', end_date || '2024-12-31']
        );

        const analytics = result.rows[0];
        analytics.open_rate = analytics.total_sent > 0
          ? (analytics.total_opened / analytics.total_sent * 100).toFixed(2)
          : 0;
        analytics.click_rate = analytics.total_sent > 0
          ? (analytics.total_clicked / analytics.total_sent * 100).toFixed(2)
          : 0;

        res.json({ analytics });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    test('should get email analytics', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{
          total_sent: 100,
          total_opened: 60,
          total_clicked: 30,
          total_bounced: 5,
          total_replied: 10
        }]
      });

      const response = await request(app)
        .get('/api/email-analytics')
        .query({ start_date: '2024-01-01', end_date: '2024-12-31' });

      expect(response.status).toBe(200);
      expect(response.body.analytics.total_sent).toBe(100);
      expect(response.body.analytics.open_rate).toBe('60.00');
      expect(response.body.analytics.click_rate).toBe('30.00');
    });
  });
});
