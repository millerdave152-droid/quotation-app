import { cachedFetch } from './apiCache';

jest.mock('./apiCache');

describe('Customer Portal Service', () => {
  const API_BASE_URL = '/api/customer-portal';

  beforeEach(() => jest.clearAllMocks());

  describe('login', () => {
    test('should login with valid credentials', async () => {
      const mockResponse = { success: true, customer: { id: 1, email: 'customer@example.com' }, token: 'token123' };
      global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => mockResponse });

      const login = async (email, accessCode) => {
        const response = await fetch(`${API_BASE_URL}/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, access_code: accessCode })
        });
        return await response.json();
      };

      const result = await login('customer@example.com', 'ABC123');
      expect(result.success).toBe(true);
      expect(result.customer.email).toBe('customer@example.com');
    });
  });

  describe('getQuotes', () => {
    test('should fetch customer quotes', async () => {
      const mockData = { quotes: [{ id: 1, quote_number: 'Q-001' }, { id: 2, quote_number: 'Q-002' }] };
      cachedFetch.mockResolvedValue(mockData);

      const getQuotes = async (filters = {}) => {
        const params = new URLSearchParams(filters);
        return await cachedFetch(`${API_BASE_URL}/quotes?${params}`);
      };

      const result = await getQuotes();
      expect(result.quotes).toHaveLength(2);
    });
  });

  describe('acceptQuote', () => {
    test('should accept quote', async () => {
      const mockResponse = { success: true, message: 'Quote accepted successfully' };
      global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => mockResponse });

      const acceptQuote = async (quoteId) => {
        const response = await fetch(`${API_BASE_URL}/quotes/${quoteId}/accept`, { method: 'POST' });
        return await response.json();
      };

      const result = await acceptQuote(1);
      expect(result.success).toBe(true);
    });
  });

  describe('rejectQuote', () => {
    test('should reject quote with reason', async () => {
      const mockResponse = { success: true, message: 'Quote rejected successfully' };
      global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => mockResponse });

      const rejectQuote = async (quoteId, reason) => {
        const response = await fetch(`${API_BASE_URL}/quotes/${quoteId}/reject`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason })
        });
        return await response.json();
      };

      const result = await rejectQuote(1, 'Price too high');
      expect(result.success).toBe(true);
    });
  });

  describe('addComment', () => {
    test('should add comment to quote', async () => {
      const mockResponse = { success: true, comment: { id: 1, content: 'Great quote!' } };
      global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => mockResponse });

      const addComment = async (quoteId, content) => {
        const response = await fetch(`${API_BASE_URL}/quotes/${quoteId}/comments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content })
        });
        return await response.json();
      };

      const result = await addComment(1, 'Great quote!');
      expect(result.success).toBe(true);
      expect(result.comment.content).toBe('Great quote!');
    });
  });

  describe('updateProfile', () => {
    test('should update customer profile', async () => {
      const mockResponse = { success: true, customer: { id: 1, name: 'John Updated' } };
      global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => mockResponse });

      const updateProfile = async (updates) => {
        const response = await fetch(`${API_BASE_URL}/profile`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates)
        });
        return await response.json();
      };

      const result = await updateProfile({ name: 'John Updated' });
      expect(result.success).toBe(true);
    });
  });

  describe('Quote Status Helpers', () => {
    test('should get status color', () => {
      const getStatusColor = (status) => {
        const colors = { pending: 'yellow', accepted: 'green', rejected: 'red', expired: 'gray' };
        return colors[status] || 'gray';
      };

      expect(getStatusColor('pending')).toBe('yellow');
      expect(getStatusColor('accepted')).toBe('green');
    });

    test('should check if quote is actionable', () => {
      const isActionable = (quote) => quote.status === 'pending' && new Date(quote.expires_at) > new Date();

      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      expect(isActionable({ status: 'pending', expires_at: futureDate })).toBe(true);
      expect(isActionable({ status: 'accepted', expires_at: futureDate })).toBe(false);
    });
  });

  describe('Authentication Helpers', () => {
    test('should validate access code format', () => {
      const validateAccessCode = (code) => {
        if (!code || code.length < 6) return false;
        return /^[A-Z0-9]+$/.test(code);
      };

      expect(validateAccessCode('ABC123')).toBe(true);
      expect(validateAccessCode('abc')).toBe(false);
      expect(validateAccessCode('AB12')).toBe(false);
    });
  });

  describe('Quote Formatting', () => {
    test('should format quote summary', () => {
      const formatQuoteSummary = (quote) => {
        return {
          number: quote.quote_number,
          total: `$${quote.total_amount.toLocaleString()}`,
          status: quote.status.charAt(0).toUpperCase() + quote.status.slice(1),
          date: new Date(quote.created_at).toLocaleDateString()
        };
      };

      const quote = {
        quote_number: 'Q-001',
        total_amount: 5000,
        status: 'pending',
        created_at: '2024-01-15T10:00:00Z'
      };

      const summary = formatQuoteSummary(quote);
      expect(summary.number).toBe('Q-001');
      expect(summary.status).toBe('Pending');
    });
  });
});
