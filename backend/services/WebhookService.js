/**
 * Webhook Service
 * Manages webhook subscriptions and delivery for integration events
 *
 * Supported Events:
 * - lead.created, lead.updated, lead.converted, lead.lost
 * - quote.created, quote.sent, quote.won, quote.lost
 * - customer.created, customer.updated
 * - task.created, task.completed
 * - payment.received
 */

const crypto = require('crypto');
const https = require('https');
const http = require('http');

class WebhookService {
  constructor(pool, cache) {
    this.pool = pool;
    this.cache = cache;
    this.deliveryQueue = [];
    this.processing = false;
  }

  /**
   * Get all webhooks
   */
  async getWebhooks(options = {}) {
    const { active, event } = options;
    let query = `SELECT * FROM webhooks WHERE 1=1`;
    const params = [];

    if (active !== undefined) {
      params.push(active);
      query += ` AND is_active = $${params.length}`;
    }

    if (event) {
      params.push(event);
      query += ` AND $${params.length} = ANY(events)`;
    }

    query += ` ORDER BY created_at DESC`;

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  /**
   * Get webhook by ID
   */
  async getWebhookById(id) {
    const result = await this.pool.query(
      `SELECT * FROM webhooks WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Create a new webhook
   */
  async createWebhook(data, createdBy = null) {
    const {
      name,
      url,
      events = [],
      secret,
      headers = {},
      is_active = true,
      retry_count = 3
    } = data;

    // Validate URL
    if (!url || (!url.startsWith('https://') && !url.startsWith('http://'))) {
      throw new Error('Invalid webhook URL');
    }

    // Generate secret if not provided
    const webhookSecret = secret || crypto.randomBytes(32).toString('hex');

    const result = await this.pool.query(`
      INSERT INTO webhooks (
        name, url, events, secret, headers, is_active, retry_count, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [
      name,
      url,
      events,
      webhookSecret,
      JSON.stringify(headers),
      is_active,
      retry_count,
      createdBy
    ]);

    this.cache?.invalidatePattern?.('webhooks:*');
    return result.rows[0];
  }

  /**
   * Update a webhook
   */
  async updateWebhook(id, updates) {
    const allowedFields = ['name', 'url', 'events', 'headers', 'is_active', 'retry_count'];
    const setClauses = [];
    const params = [id];

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key) && value !== undefined) {
        params.push(key === 'headers' ? JSON.stringify(value) : value);
        setClauses.push(`${key} = $${params.length}`);
      }
    }

    if (setClauses.length === 0) {
      return this.getWebhookById(id);
    }

    setClauses.push('updated_at = NOW()');

    const result = await this.pool.query(`
      UPDATE webhooks SET ${setClauses.join(', ')}
      WHERE id = $1
      RETURNING *
    `, params);

    this.cache?.invalidatePattern?.('webhooks:*');
    return result.rows[0];
  }

  /**
   * Delete a webhook
   */
  async deleteWebhook(id) {
    const result = await this.pool.query(
      `DELETE FROM webhooks WHERE id = $1 RETURNING id`,
      [id]
    );
    this.cache?.invalidatePattern?.('webhooks:*');
    return result.rowCount > 0;
  }

  /**
   * Regenerate webhook secret
   */
  async regenerateSecret(id) {
    const newSecret = crypto.randomBytes(32).toString('hex');

    const result = await this.pool.query(`
      UPDATE webhooks SET secret = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `, [newSecret, id]);

    return result.rows[0];
  }

  /**
   * Fire a webhook event
   */
  async fire(eventType, payload, options = {}) {
    try {
      // Get active webhooks subscribed to this event
      const webhooks = await this.getActiveWebhooksForEvent(eventType);

      if (webhooks.length === 0) {
        return { delivered: 0, queued: 0 };
      }

      const deliveryPromises = webhooks.map(webhook =>
        this.deliverWebhook(webhook, eventType, payload)
      );

      const results = await Promise.allSettled(deliveryPromises);

      const delivered = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
      const failed = results.filter(r => r.status === 'rejected' || !r.value?.success).length;

      return { delivered, failed, total: webhooks.length };
    } catch (error) {
      console.error(`Webhook fire error for ${eventType}:`, error);
      return { delivered: 0, failed: 1, error: error.message };
    }
  }

  /**
   * Get active webhooks for a specific event
   */
  async getActiveWebhooksForEvent(eventType) {
    const result = await this.pool.query(`
      SELECT * FROM webhooks
      WHERE is_active = true
        AND ($1 = ANY(events) OR '*' = ANY(events))
    `, [eventType]);
    return result.rows;
  }

  /**
   * Deliver a webhook
   */
  async deliverWebhook(webhook, eventType, payload) {
    const timestamp = Date.now();
    const body = JSON.stringify({
      event: eventType,
      timestamp: new Date().toISOString(),
      data: payload
    });

    // Generate signature
    const signature = this.generateSignature(body, webhook.secret);

    const headers = {
      'Content-Type': 'application/json',
      'X-Webhook-Event': eventType,
      'X-Webhook-Timestamp': timestamp.toString(),
      'X-Webhook-Signature': signature,
      ...(webhook.headers ? JSON.parse(webhook.headers) : {})
    };

    let attempts = 0;
    let lastError = null;
    const maxAttempts = webhook.retry_count || 3;

    while (attempts < maxAttempts) {
      attempts++;

      try {
        const response = await this.sendRequest(webhook.url, headers, body);

        // Log success
        await this.logDelivery(webhook.id, eventType, body, response.status, null);

        // Update last triggered
        await this.pool.query(`
          UPDATE webhooks SET last_triggered_at = NOW() WHERE id = $1
        `, [webhook.id]);

        return { success: true, status: response.status, attempts };
      } catch (error) {
        lastError = error;

        // Wait before retry (exponential backoff)
        if (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempts) * 1000));
        }
      }
    }

    // Log failure after all retries
    await this.logDelivery(webhook.id, eventType, body, null, lastError?.message);

    return { success: false, error: lastError?.message, attempts };
  }

  /**
   * Generate HMAC signature
   */
  generateSignature(body, secret) {
    return 'sha256=' + crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('hex');
  }

  /**
   * Send HTTP request
   */
  sendRequest(url, headers, body) {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);
      const isHttps = urlObj.protocol === 'https:';
      const client = isHttps ? https : http;

      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        headers: {
          ...headers,
          'Content-Length': Buffer.byteLength(body)
        },
        timeout: 30000
      };

      const req = client.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ status: res.statusCode, data });
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.write(body);
      req.end();
    });
  }

  /**
   * Log webhook delivery
   */
  async logDelivery(webhookId, eventType, payload, responseStatus, errorMessage) {
    try {
      await this.pool.query(`
        INSERT INTO webhook_logs (
          webhook_id, event_type, payload, response_status, error_message
        ) VALUES ($1, $2, $3, $4, $5)
      `, [webhookId, eventType, payload, responseStatus, errorMessage]);
    } catch (error) {
      console.error('Failed to log webhook delivery:', error);
    }
  }

  /**
   * Get webhook delivery logs
   */
  async getLogs(webhookId, options = {}) {
    const { limit = 50, offset = 0, success } = options;

    let query = `
      SELECT * FROM webhook_logs
      WHERE webhook_id = $1
    `;
    const params = [webhookId];

    if (success === true) {
      query += ` AND response_status IS NOT NULL AND response_status >= 200 AND response_status < 300`;
    } else if (success === false) {
      query += ` AND (response_status IS NULL OR response_status >= 300)`;
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  /**
   * Get webhook statistics
   */
  async getStats(webhookId) {
    const result = await this.pool.query(`
      SELECT
        COUNT(*) as total_deliveries,
        COUNT(*) FILTER (WHERE response_status >= 200 AND response_status < 300) as successful,
        COUNT(*) FILTER (WHERE response_status IS NULL OR response_status >= 300) as failed,
        MAX(created_at) FILTER (WHERE response_status >= 200 AND response_status < 300) as last_success,
        MAX(created_at) FILTER (WHERE response_status IS NULL OR response_status >= 300) as last_failure
      FROM webhook_logs
      WHERE webhook_id = $1
        AND created_at > NOW() - INTERVAL '30 days'
    `, [webhookId]);

    return result.rows[0];
  }

  /**
   * Test a webhook
   */
  async testWebhook(id) {
    const webhook = await this.getWebhookById(id);
    if (!webhook) {
      throw new Error('Webhook not found');
    }

    const testPayload = {
      test: true,
      message: 'This is a test webhook delivery',
      timestamp: new Date().toISOString()
    };

    return this.deliverWebhook(webhook, 'webhook.test', testPayload);
  }

  /**
   * Clean up old logs
   */
  async cleanupLogs(daysToKeep = 30) {
    const result = await this.pool.query(`
      DELETE FROM webhook_logs
      WHERE created_at < NOW() - INTERVAL '${daysToKeep} days'
      RETURNING id
    `);
    return result.rowCount;
  }
}

// Supported webhook events
WebhookService.EVENTS = {
  LEAD_CREATED: 'lead.created',
  LEAD_UPDATED: 'lead.updated',
  LEAD_CONVERTED: 'lead.converted',
  LEAD_LOST: 'lead.lost',
  QUOTE_CREATED: 'quote.created',
  QUOTE_SENT: 'quote.sent',
  QUOTE_WON: 'quote.won',
  QUOTE_LOST: 'quote.lost',
  CUSTOMER_CREATED: 'customer.created',
  CUSTOMER_UPDATED: 'customer.updated',
  TASK_CREATED: 'task.created',
  TASK_COMPLETED: 'task.completed',
  PAYMENT_RECEIVED: 'payment.received'
};

module.exports = WebhookService;
