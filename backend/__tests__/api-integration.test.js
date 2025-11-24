const request = require('supertest');
const express = require('express');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// Mock pool for database operations
const mockPool = {
  query: jest.fn()
};

describe('API Integration System', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/api-keys', () => {
    app.post('/api/api-keys', async (req, res) => {
      try {
        const { name, permissions, created_by } = req.body;

        if (!name || !permissions) {
          return res.status(400).json({ error: 'Name and permissions are required' });
        }

        // Generate API key
        const apiKey = 'sk_' + crypto.randomBytes(32).toString('hex');
        const hashedKey = crypto.createHash('sha256').update(apiKey).digest('hex');

        const result = await mockPool.query(
          'INSERT INTO api_keys (name, key_hash, permissions, created_by, is_active) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, permissions, is_active, created_at',
          [name, hashedKey, JSON.stringify(permissions), created_by, true]
        );

        res.json({
          success: true,
          api_key: apiKey,
          key_info: result.rows[0]
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    test('should create API key', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{
          id: 1,
          name: 'Production Key',
          permissions: ['quotes:read', 'quotes:write'],
          is_active: true,
          created_at: '2024-01-01'
        }]
      });

      const response = await request(app)
        .post('/api/api-keys')
        .send({
          name: 'Production Key',
          permissions: ['quotes:read', 'quotes:write'],
          created_by: 1
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.api_key).toMatch(/^sk_/);
      expect(response.body.key_info.name).toBe('Production Key');
    });

    test('should require name and permissions', async () => {
      const response = await request(app)
        .post('/api/api-keys')
        .send({ name: 'Test' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('required');
    });
  });

  describe('GET /api/api-keys', () => {
    app.get('/api/api-keys', async (req, res) => {
      try {
        const { active_only } = req.query;

        let query = 'SELECT id, name, permissions, is_active, created_at, last_used_at FROM api_keys';

        if (active_only === 'true') {
          query += ' WHERE is_active = true';
        }

        query += ' ORDER BY created_at DESC';

        const result = await mockPool.query(query);
        res.json({ api_keys: result.rows });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    test('should get all API keys', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          { id: 1, name: 'Key 1', permissions: ['quotes:read'], is_active: true },
          { id: 2, name: 'Key 2', permissions: ['quotes:write'], is_active: false }
        ]
      });

      const response = await request(app).get('/api/api-keys');

      expect(response.status).toBe(200);
      expect(response.body.api_keys).toHaveLength(2);
    });

    test('should filter active keys only', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ id: 1, name: 'Key 1', is_active: true }]
      });

      const response = await request(app)
        .get('/api/api-keys')
        .query({ active_only: 'true' });

      expect(response.status).toBe(200);
      expect(response.body.api_keys).toHaveLength(1);
    });
  });

  describe('POST /api/webhooks', () => {
    app.post('/api/webhooks', async (req, res) => {
      try {
        const { url, events, secret, created_by } = req.body;

        if (!url || !events || events.length === 0) {
          return res.status(400).json({ error: 'URL and events are required' });
        }

        const urlPattern = /^https?:\/\/.+/;
        if (!urlPattern.test(url)) {
          return res.status(400).json({ error: 'Invalid URL' });
        }

        const result = await mockPool.query(
          'INSERT INTO webhooks (url, events, secret, created_by, is_active) VALUES ($1, $2, $3, $4, $5) RETURNING *',
          [url, JSON.stringify(events), secret, created_by, true]
        );

        res.json({ success: true, webhook: result.rows[0] });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    test('should create webhook', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{
          id: 1,
          url: 'https://example.com/webhook',
          events: ['quote.created', 'quote.updated'],
          is_active: true
        }]
      });

      const response = await request(app)
        .post('/api/webhooks')
        .send({
          url: 'https://example.com/webhook',
          events: ['quote.created', 'quote.updated'],
          secret: 'secret123',
          created_by: 1
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.webhook.url).toBe('https://example.com/webhook');
    });

    test('should validate URL format', async () => {
      const response = await request(app)
        .post('/api/webhooks')
        .send({
          url: 'invalid-url',
          events: ['quote.created']
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid URL');
    });

    test('should require events', async () => {
      const response = await request(app)
        .post('/api/webhooks')
        .send({
          url: 'https://example.com/webhook',
          events: []
        });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/webhooks', () => {
    app.get('/api/webhooks', async (req, res) => {
      try {
        const result = await mockPool.query(
          'SELECT * FROM webhooks ORDER BY created_at DESC'
        );

        res.json({ webhooks: result.rows });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    test('should get all webhooks', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          { id: 1, url: 'https://example.com/webhook1', events: ['quote.created'] },
          { id: 2, url: 'https://example.com/webhook2', events: ['quote.updated'] }
        ]
      });

      const response = await request(app).get('/api/webhooks');

      expect(response.status).toBe(200);
      expect(response.body.webhooks).toHaveLength(2);
    });
  });

  describe('POST /api/webhooks/:id/test', () => {
    app.post('/api/webhooks/:id/test', async (req, res) => {
      try {
        const webhookId = req.params.id;

        const webhookResult = await mockPool.query(
          'SELECT * FROM webhooks WHERE id = $1',
          [webhookId]
        );

        if (webhookResult.rows.length === 0) {
          return res.status(404).json({ error: 'Webhook not found' });
        }

        const webhook = webhookResult.rows[0];

        // Mock webhook test (in real implementation, would send HTTP request)
        const testPayload = {
          event: 'webhook.test',
          data: { message: 'Test webhook delivery' },
          timestamp: new Date().toISOString()
        };

        res.json({
          success: true,
          webhook_url: webhook.url,
          test_payload: testPayload,
          status: 'delivered'
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    test('should test webhook delivery', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ id: 1, url: 'https://example.com/webhook', events: ['quote.created'] }]
      });

      const response = await request(app).post('/api/webhooks/1/test');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.status).toBe('delivered');
    });

    test('should return 404 for non-existent webhook', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const response = await request(app).post('/api/webhooks/999/test');

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/webhook-logs', () => {
    app.get('/api/webhook-logs', async (req, res) => {
      try {
        const { webhook_id, status, limit } = req.query;

        let query = 'SELECT * FROM webhook_logs WHERE 1=1';
        const params = [];
        let paramCount = 1;

        if (webhook_id) {
          params.push(webhook_id);
          query += ` AND webhook_id = $${paramCount++}`;
        }

        if (status) {
          params.push(status);
          query += ` AND status = $${paramCount++}`;
        }

        query += ' ORDER BY created_at DESC';

        if (limit) {
          params.push(limit);
          query += ` LIMIT $${paramCount++}`;
        }

        const result = await mockPool.query(query, params);
        res.json({ logs: result.rows });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    test('should get webhook logs', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          { id: 1, webhook_id: 1, event: 'quote.created', status: 'success' },
          { id: 2, webhook_id: 1, event: 'quote.updated', status: 'failed' }
        ]
      });

      const response = await request(app)
        .get('/api/webhook-logs')
        .query({ webhook_id: 1 });

      expect(response.status).toBe(200);
      expect(response.body.logs).toHaveLength(2);
    });

    test('should filter logs by status', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ id: 1, webhook_id: 1, status: 'success' }]
      });

      const response = await request(app)
        .get('/api/webhook-logs')
        .query({ status: 'success' });

      expect(response.status).toBe(200);
      expect(response.body.logs).toHaveLength(1);
    });
  });

  describe('DELETE /api/webhooks/:id', () => {
    app.delete('/api/webhooks/:id', async (req, res) => {
      try {
        const webhookId = req.params.id;

        const result = await mockPool.query(
          'DELETE FROM webhooks WHERE id = $1 RETURNING *',
          [webhookId]
        );

        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Webhook not found' });
        }

        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    test('should delete webhook', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ id: 1 }]
      });

      const response = await request(app).delete('/api/webhooks/1');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('should return 404 for non-existent webhook', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const response = await request(app).delete('/api/webhooks/999');

      expect(response.status).toBe(404);
    });
  });

  describe('PATCH /api/api-keys/:id/revoke', () => {
    app.patch('/api/api-keys/:id/revoke', async (req, res) => {
      try {
        const keyId = req.params.id;

        const result = await mockPool.query(
          'UPDATE api_keys SET is_active = false, revoked_at = NOW() WHERE id = $1 RETURNING *',
          [keyId]
        );

        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'API key not found' });
        }

        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    test('should revoke API key', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ id: 1, is_active: false }]
      });

      const response = await request(app).patch('/api/api-keys/1/revoke');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('should return 404 for non-existent key', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const response = await request(app).patch('/api/api-keys/999/revoke');

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/api-usage', () => {
    app.get('/api/api-usage', async (req, res) => {
      try {
        const { api_key_id, start_date, end_date } = req.query;

        const params = [
          start_date || '2024-01-01',
          end_date || '2024-12-31'
        ];

        let query = `
          SELECT
            COUNT(*) as total_requests,
            COUNT(CASE WHEN status_code < 400 THEN 1 END) as successful_requests,
            COUNT(CASE WHEN status_code >= 400 THEN 1 END) as failed_requests,
            AVG(response_time_ms) as avg_response_time
          FROM api_logs
          WHERE created_at >= $1 AND created_at <= $2
        `;

        if (api_key_id) {
          params.push(api_key_id);
          query += ' AND api_key_id = $3';
        }

        const result = await mockPool.query(query, params);
        res.json({ usage: result.rows[0] });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    test('should get API usage statistics', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{
          total_requests: 1000,
          successful_requests: 950,
          failed_requests: 50,
          avg_response_time: 125.5
        }]
      });

      const response = await request(app)
        .get('/api/api-usage')
        .query({ start_date: '2024-01-01', end_date: '2024-12-31' });

      expect(response.status).toBe(200);
      expect(response.body.usage.total_requests).toBe(1000);
      expect(response.body.usage.successful_requests).toBe(950);
    });

    test('should filter usage by API key', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{
          total_requests: 500,
          successful_requests: 480,
          failed_requests: 20,
          avg_response_time: 110.2
        }]
      });

      const response = await request(app)
        .get('/api/api-usage')
        .query({ api_key_id: 1 });

      expect(response.status).toBe(200);
      expect(response.body.usage.total_requests).toBe(500);
    });
  });

  describe('POST /api/integrations/crm/sync', () => {
    app.post('/api/integrations/crm/sync', async (req, res) => {
      try {
        const { integration_type, sync_type } = req.body;

        if (!integration_type) {
          return res.status(400).json({ error: 'Integration type is required' });
        }

        // Mock CRM sync
        const syncResult = {
          success: true,
          integration: integration_type,
          sync_type: sync_type || 'full',
          synced_records: 150,
          sync_duration_ms: 2500
        };

        res.json(syncResult);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    test('should sync with CRM', async () => {
      const response = await request(app)
        .post('/api/integrations/crm/sync')
        .send({
          integration_type: 'salesforce',
          sync_type: 'incremental'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.synced_records).toBe(150);
    });

    test('should require integration type', async () => {
      const response = await request(app)
        .post('/api/integrations/crm/sync')
        .send({});

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/integration-status', () => {
    app.get('/api/integration-status', async (req, res) => {
      try {
        const result = await mockPool.query(
          `SELECT
            integration_name,
            is_active,
            last_sync_at,
            sync_status,
            error_message
          FROM integrations
          ORDER BY integration_name`
        );

        res.json({ integrations: result.rows });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    test('should get integration status', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          {
            integration_name: 'salesforce',
            is_active: true,
            last_sync_at: '2024-01-01',
            sync_status: 'success'
          },
          {
            integration_name: 'quickbooks',
            is_active: false,
            sync_status: 'failed',
            error_message: 'Connection timeout'
          }
        ]
      });

      const response = await request(app).get('/api/integration-status');

      expect(response.status).toBe(200);
      expect(response.body.integrations).toHaveLength(2);
      expect(response.body.integrations[0].integration_name).toBe('salesforce');
    });
  });

  describe('POST /api/webhooks/:id/retry', () => {
    app.post('/api/webhooks/:id/retry', async (req, res) => {
      try {
        const logId = req.params.id;

        const logResult = await mockPool.query(
          'SELECT * FROM webhook_logs WHERE id = $1',
          [logId]
        );

        if (logResult.rows.length === 0) {
          return res.status(404).json({ error: 'Webhook log not found' });
        }

        const log = logResult.rows[0];

        if (log.status === 'success') {
          return res.status(400).json({ error: 'Cannot retry successful webhook' });
        }

        // Mock retry
        await mockPool.query(
          'UPDATE webhook_logs SET status = $1, retry_count = retry_count + 1, last_retry_at = NOW() WHERE id = $2',
          ['success', logId]
        );

        res.json({ success: true, retried: true });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    test('should retry failed webhook', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{ id: 1, status: 'failed', webhook_id: 1 }]
        })
        .mockResolvedValueOnce({ rows: [] });

      const response = await request(app).post('/api/webhooks/1/retry');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('should not retry successful webhook', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ id: 1, status: 'success' }]
      });

      const response = await request(app).post('/api/webhooks/1/retry');

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/rate-limits', () => {
    app.get('/api/rate-limits', async (req, res) => {
      try {
        const { api_key_id } = req.query;

        const result = await mockPool.query(
          `SELECT * FROM rate_limits WHERE api_key_id = $1`,
          [api_key_id || 1]
        );

        const rateLimit = result.rows[0] || {
          requests_per_minute: 60,
          requests_per_hour: 1000,
          requests_per_day: 10000
        };

        res.json({ rate_limit: rateLimit });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    test('should get rate limits for API key', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{
          api_key_id: 1,
          requests_per_minute: 100,
          requests_per_hour: 2000,
          requests_per_day: 20000
        }]
      });

      const response = await request(app)
        .get('/api/rate-limits')
        .query({ api_key_id: 1 });

      expect(response.status).toBe(200);
      expect(response.body.rate_limit.requests_per_minute).toBe(100);
    });
  });
});
