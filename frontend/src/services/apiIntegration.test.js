import { cachedFetch } from './apiCache';

jest.mock('./apiCache');

describe('API Integration Service', () => {
  const API_BASE_URL = '/api';

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  describe('createAPIKey', () => {
    test('should create API key', async () => {
      const mockResponse = {
        success: true,
        api_key: 'sk_1234567890abcdef',
        key_info: {
          id: 1,
          name: 'Production Key',
          permissions: ['quotes:read', 'quotes:write'],
          is_active: true
        }
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const createAPIKey = async (keyData) => {
        const response = await fetch(`${API_BASE_URL}/api-keys`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(keyData)
        });
        return await response.json();
      };

      const result = await createAPIKey({
        name: 'Production Key',
        permissions: ['quotes:read', 'quotes:write'],
        created_by: 1
      });

      expect(result.success).toBe(true);
      expect(result.api_key).toMatch(/^sk_/);
    });
  });

  describe('getAPIKeys', () => {
    test('should fetch all API keys', async () => {
      const mockData = {
        api_keys: [
          { id: 1, name: 'Key 1', permissions: ['quotes:read'], is_active: true },
          { id: 2, name: 'Key 2', permissions: ['quotes:write'], is_active: false }
        ]
      };

      cachedFetch.mockResolvedValue(mockData);

      const getAPIKeys = async (activeOnly = false) => {
        const url = activeOnly
          ? `${API_BASE_URL}/api-keys?active_only=true`
          : `${API_BASE_URL}/api-keys`;
        return await cachedFetch(url);
      };

      const result = await getAPIKeys();
      expect(result.api_keys).toHaveLength(2);
    });
  });

  describe('createWebhook', () => {
    test('should create webhook', async () => {
      const mockResponse = {
        success: true,
        webhook: {
          id: 1,
          url: 'https://example.com/webhook',
          events: ['quote.created', 'quote.updated'],
          is_active: true
        }
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const createWebhook = async (webhookData) => {
        const response = await fetch(`${API_BASE_URL}/webhooks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(webhookData)
        });
        return await response.json();
      };

      const result = await createWebhook({
        url: 'https://example.com/webhook',
        events: ['quote.created', 'quote.updated'],
        secret: 'secret123',
        created_by: 1
      });

      expect(result.success).toBe(true);
      expect(result.webhook.url).toBe('https://example.com/webhook');
    });
  });

  describe('getWebhooks', () => {
    test('should fetch all webhooks', async () => {
      const mockData = {
        webhooks: [
          { id: 1, url: 'https://example.com/webhook1', events: ['quote.created'] },
          { id: 2, url: 'https://example.com/webhook2', events: ['quote.updated'] }
        ]
      };

      cachedFetch.mockResolvedValue(mockData);

      const getWebhooks = async () => {
        return await cachedFetch(`${API_BASE_URL}/webhooks`);
      };

      const result = await getWebhooks();
      expect(result.webhooks).toHaveLength(2);
    });
  });

  describe('testWebhook', () => {
    test('should test webhook delivery', async () => {
      const mockResponse = {
        success: true,
        webhook_url: 'https://example.com/webhook',
        status: 'delivered'
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const testWebhook = async (webhookId) => {
        const response = await fetch(`${API_BASE_URL}/webhooks/${webhookId}/test`, {
          method: 'POST'
        });
        return await response.json();
      };

      const result = await testWebhook(1);
      expect(result.success).toBe(true);
      expect(result.status).toBe('delivered');
    });
  });

  describe('getWebhookLogs', () => {
    test('should fetch webhook logs', async () => {
      const mockData = {
        logs: [
          { id: 1, webhook_id: 1, event: 'quote.created', status: 'success' },
          { id: 2, webhook_id: 1, event: 'quote.updated', status: 'failed' }
        ]
      };

      cachedFetch.mockResolvedValue(mockData);

      const getWebhookLogs = async (webhookId, status = null) => {
        const params = new URLSearchParams();
        if (webhookId) params.append('webhook_id', webhookId);
        if (status) params.append('status', status);
        return await cachedFetch(`${API_BASE_URL}/webhook-logs?${params}`);
      };

      const result = await getWebhookLogs(1);
      expect(result.logs).toHaveLength(2);
    });
  });

  describe('deleteWebhook', () => {
    test('should delete webhook', async () => {
      const mockResponse = { success: true };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const deleteWebhook = async (webhookId) => {
        const response = await fetch(`${API_BASE_URL}/webhooks/${webhookId}`, {
          method: 'DELETE'
        });
        return await response.json();
      };

      const result = await deleteWebhook(1);
      expect(result.success).toBe(true);
    });
  });

  describe('revokeAPIKey', () => {
    test('should revoke API key', async () => {
      const mockResponse = { success: true };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const revokeAPIKey = async (keyId) => {
        const response = await fetch(`${API_BASE_URL}/api-keys/${keyId}/revoke`, {
          method: 'PATCH'
        });
        return await response.json();
      };

      const result = await revokeAPIKey(1);
      expect(result.success).toBe(true);
    });
  });

  describe('getAPIUsage', () => {
    test('should fetch API usage statistics', async () => {
      const mockData = {
        usage: {
          total_requests: 1000,
          successful_requests: 950,
          failed_requests: 50,
          avg_response_time: 125.5
        }
      };

      cachedFetch.mockResolvedValue(mockData);

      const getAPIUsage = async (startDate, endDate, apiKeyId = null) => {
        const params = new URLSearchParams({
          start_date: startDate,
          end_date: endDate
        });
        if (apiKeyId) params.append('api_key_id', apiKeyId);
        return await cachedFetch(`${API_BASE_URL}/api-usage?${params}`);
      };

      const result = await getAPIUsage('2024-01-01', '2024-12-31');
      expect(result.usage.total_requests).toBe(1000);
    });
  });

  describe('syncWithCRM', () => {
    test('should sync with CRM', async () => {
      const mockResponse = {
        success: true,
        integration: 'salesforce',
        synced_records: 150
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const syncWithCRM = async (integrationType, syncType = 'full') => {
        const response = await fetch(`${API_BASE_URL}/integrations/crm/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ integration_type: integrationType, sync_type: syncType })
        });
        return await response.json();
      };

      const result = await syncWithCRM('salesforce', 'incremental');
      expect(result.success).toBe(true);
      expect(result.synced_records).toBe(150);
    });
  });

  describe('getIntegrationStatus', () => {
    test('should fetch integration status', async () => {
      const mockData = {
        integrations: [
          { integration_name: 'salesforce', is_active: true, sync_status: 'success' },
          { integration_name: 'quickbooks', is_active: false, sync_status: 'failed' }
        ]
      };

      cachedFetch.mockResolvedValue(mockData);

      const getIntegrationStatus = async () => {
        return await cachedFetch(`${API_BASE_URL}/integration-status`);
      };

      const result = await getIntegrationStatus();
      expect(result.integrations).toHaveLength(2);
    });
  });

  describe('retryWebhook', () => {
    test('should retry failed webhook', async () => {
      const mockResponse = { success: true, retried: true };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const retryWebhook = async (logId) => {
        const response = await fetch(`${API_BASE_URL}/webhooks/${logId}/retry`, {
          method: 'POST'
        });
        return await response.json();
      };

      const result = await retryWebhook(1);
      expect(result.success).toBe(true);
      expect(result.retried).toBe(true);
    });
  });

  describe('getRateLimits', () => {
    test('should fetch rate limits for API key', async () => {
      const mockData = {
        rate_limit: {
          api_key_id: 1,
          requests_per_minute: 100,
          requests_per_hour: 2000,
          requests_per_day: 20000
        }
      };

      cachedFetch.mockResolvedValue(mockData);

      const getRateLimits = async (apiKeyId) => {
        return await cachedFetch(`${API_BASE_URL}/rate-limits?api_key_id=${apiKeyId}`);
      };

      const result = await getRateLimits(1);
      expect(result.rate_limit.requests_per_minute).toBe(100);
    });
  });

  describe('API Key Utilities', () => {
    test('should mask API key for display', () => {
      const maskAPIKey = (key) => {
        if (key.length <= 8) return key;
        return key.substring(0, 8) + '*'.repeat(key.length - 8);
      };

      expect(maskAPIKey('sk_1234567890abcdef')).toBe('sk_12345***********');
      expect(maskAPIKey('short')).toBe('short');
    });

    test('should validate API key format', () => {
      const isValidAPIKey = (key) => {
        return /^sk_[a-f0-9]{64}$/.test(key);
      };

      expect(isValidAPIKey('sk_' + 'a'.repeat(64))).toBe(true);
      expect(isValidAPIKey('invalid')).toBe(false);
      expect(isValidAPIKey('sk_short')).toBe(false);
    });

    test('should get permission label', () => {
      const getPermissionLabel = (permission) => {
        const labels = {
          'quotes:read': 'Read Quotes',
          'quotes:write': 'Write Quotes',
          'quotes:delete': 'Delete Quotes',
          'customers:read': 'Read Customers',
          'customers:write': 'Write Customers'
        };
        return labels[permission] || permission;
      };

      expect(getPermissionLabel('quotes:read')).toBe('Read Quotes');
      expect(getPermissionLabel('unknown')).toBe('unknown');
    });
  });

  describe('Webhook Utilities', () => {
    test('should validate webhook URL', () => {
      const isValidWebhookURL = (url) => {
        return /^https?:\/\/.+/.test(url);
      };

      expect(isValidWebhookURL('https://example.com/webhook')).toBe(true);
      expect(isValidWebhookURL('http://example.com')).toBe(true);
      expect(isValidWebhookURL('invalid-url')).toBe(false);
    });

    test('should format webhook event', () => {
      const formatWebhookEvent = (event) => {
        return event
          .split('.')
          .map(part => part.charAt(0).toUpperCase() + part.slice(1))
          .join(' ');
      };

      expect(formatWebhookEvent('quote.created')).toBe('Quote Created');
      expect(formatWebhookEvent('customer.updated')).toBe('Customer Updated');
    });

    test('should get webhook status color', () => {
      const getWebhookStatusColor = (status) => {
        const colors = {
          success: 'green',
          failed: 'red',
          pending: 'yellow'
        };
        return colors[status] || 'gray';
      };

      expect(getWebhookStatusColor('success')).toBe('green');
      expect(getWebhookStatusColor('failed')).toBe('red');
    });
  });

  describe('Integration Status Utilities', () => {
    test('should get integration health', () => {
      const getIntegrationHealth = (integration) => {
        if (!integration.is_active) return 'inactive';
        if (integration.sync_status === 'success') return 'healthy';
        if (integration.sync_status === 'failed') return 'unhealthy';
        return 'unknown';
      };

      expect(getIntegrationHealth({ is_active: true, sync_status: 'success' })).toBe('healthy');
      expect(getIntegrationHealth({ is_active: false, sync_status: 'success' })).toBe('inactive');
      expect(getIntegrationHealth({ is_active: true, sync_status: 'failed' })).toBe('unhealthy');
    });

    test('should format last sync time', () => {
      const formatLastSync = (lastSyncAt) => {
        if (!lastSyncAt) return 'Never';
        const date = new Date(lastSyncAt);
        const now = new Date();
        const hours = Math.floor((now - date) / (1000 * 60 * 60));

        if (hours < 1) return 'Just now';
        if (hours < 24) return `${hours} hours ago`;
        const days = Math.floor(hours / 24);
        return `${days} day${days > 1 ? 's' : ''} ago`;
      };

      expect(formatLastSync(null)).toBe('Never');
      expect(formatLastSync(new Date(Date.now() - 30 * 60 * 1000))).toBe('Just now');
    });
  });

  describe('Rate Limit Utilities', () => {
    test('should calculate rate limit percentage', () => {
      const getRateLimitPercentage = (current, limit) => {
        if (limit === 0) return '0.0';
        return Math.min((current / limit) * 100, 100).toFixed(1);
      };

      expect(getRateLimitPercentage(50, 100)).toBe('50.0');
      expect(getRateLimitPercentage(150, 100)).toBe('100.0');
      expect(getRateLimitPercentage(0, 0)).toBe('0.0');
    });

    test('should check if rate limit exceeded', () => {
      const isRateLimitExceeded = (current, limit) => {
        return current >= limit;
      };

      expect(isRateLimitExceeded(100, 100)).toBe(true);
      expect(isRateLimitExceeded(150, 100)).toBe(true);
      expect(isRateLimitExceeded(50, 100)).toBe(false);
    });

    test('should get rate limit warning level', () => {
      const getRateLimitWarning = (percentage) => {
        if (percentage >= 90) return 'critical';
        if (percentage >= 75) return 'warning';
        if (percentage >= 50) return 'caution';
        return 'normal';
      };

      expect(getRateLimitWarning(95)).toBe('critical');
      expect(getRateLimitWarning(80)).toBe('warning');
      expect(getRateLimitWarning(60)).toBe('caution');
      expect(getRateLimitWarning(30)).toBe('normal');
    });
  });

  describe('API Usage Analytics', () => {
    test('should calculate success rate', () => {
      const calculateSuccessRate = (successful, total) => {
        if (total === 0) return '0.00';
        return ((successful / total) * 100).toFixed(2);
      };

      expect(calculateSuccessRate(950, 1000)).toBe('95.00');
      expect(calculateSuccessRate(0, 0)).toBe('0.00');
    });

    test('should format response time', () => {
      const formatResponseTime = (ms) => {
        if (ms < 1000) return `${ms.toFixed(0)}ms`;
        return `${(ms / 1000).toFixed(2)}s`;
      };

      expect(formatResponseTime(125)).toBe('125ms');
      expect(formatResponseTime(1500)).toBe('1.50s');
    });

    test('should get performance rating', () => {
      const getPerformanceRating = (avgResponseTime) => {
        if (avgResponseTime < 100) return 'excellent';
        if (avgResponseTime < 300) return 'good';
        if (avgResponseTime < 1000) return 'fair';
        return 'poor';
      };

      expect(getPerformanceRating(50)).toBe('excellent');
      expect(getPerformanceRating(200)).toBe('good');
      expect(getPerformanceRating(500)).toBe('fair');
      expect(getPerformanceRating(1500)).toBe('poor');
    });
  });

  describe('Webhook Filtering', () => {
    test('should filter webhooks by event', () => {
      const filterByEvent = (webhooks, event) => {
        return webhooks.filter(w => w.events.includes(event));
      };

      const webhooks = [
        { id: 1, events: ['quote.created', 'quote.updated'] },
        { id: 2, events: ['customer.created'] },
        { id: 3, events: ['quote.created'] }
      ];

      const filtered = filterByEvent(webhooks, 'quote.created');
      expect(filtered).toHaveLength(2);
    });

    test('should filter webhooks by status', () => {
      const filterByStatus = (webhooks, isActive) => {
        return webhooks.filter(w => w.is_active === isActive);
      };

      const webhooks = [
        { id: 1, is_active: true },
        { id: 2, is_active: false },
        { id: 3, is_active: true }
      ];

      const active = filterByStatus(webhooks, true);
      expect(active).toHaveLength(2);
    });
  });

  describe('API Key Security', () => {
    test('should check if key is expired', () => {
      const isKeyExpired = (expiresAt) => {
        if (!expiresAt) return false;
        return new Date(expiresAt) < new Date();
      };

      expect(isKeyExpired('2020-01-01')).toBe(true);
      expect(isKeyExpired('2030-01-01')).toBe(false);
      expect(isKeyExpired(null)).toBe(false);
    });

    test('should validate permissions', () => {
      const hasPermission = (keyPermissions, requiredPermission) => {
        return keyPermissions.includes(requiredPermission);
      };

      const permissions = ['quotes:read', 'quotes:write'];
      expect(hasPermission(permissions, 'quotes:read')).toBe(true);
      expect(hasPermission(permissions, 'quotes:delete')).toBe(false);
    });
  });
});
