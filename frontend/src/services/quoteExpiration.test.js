import { cachedFetch } from './apiCache';

jest.mock('./apiCache');

describe('Quote Expiration Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('setQuoteExpiration', () => {
    test('should set expiration by number of days', async () => {
      const mockResponse = {
        id: 1,
        expiration_date: '2025-02-28T00:00:00Z',
        days_valid: 30,
        status: 'valid'
      };

      cachedFetch.mockResolvedValue(mockResponse);

      const setQuoteExpiration = async (quoteId, daysValid) => {
        return await cachedFetch(`/api/quotations/${quoteId}/set-expiration`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ days_valid: daysValid })
        });
      };

      const result = await setQuoteExpiration(1, 30);

      expect(result.expiration_date).toBeDefined();
      expect(result.days_valid).toBe(30);
      expect(result.status).toBe('valid');
    });

    test('should set custom expiration date', async () => {
      const customDate = '2025-03-15';
      const mockResponse = {
        id: 1,
        expiration_date: customDate,
        status: 'valid'
      };

      cachedFetch.mockResolvedValue(mockResponse);

      const setQuoteExpiration = async (quoteId, customExpirationDate) => {
        return await cachedFetch(`/api/quotations/${quoteId}/set-expiration`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ custom_expiration_date: customExpirationDate })
        });
      };

      const result = await setQuoteExpiration(1, customDate);

      expect(result.expiration_date).toBe(customDate);
    });

    test('should validate days_valid is positive', () => {
      const validateDaysValid = (days) => {
        if (days <= 0) {
          throw new Error('Days must be a positive number');
        }
        return true;
      };

      expect(() => validateDaysValid(-5)).toThrow('Days must be a positive number');
      expect(() => validateDaysValid(0)).toThrow('Days must be a positive number');
      expect(validateDaysValid(30)).toBe(true);
    });

    test('should validate custom date is not in the past', () => {
      const validateCustomDate = (dateString) => {
        const customDate = new Date(dateString);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (customDate < today) {
          throw new Error('Expiration date cannot be in the past');
        }
        return true;
      };

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      expect(() => validateCustomDate(yesterday.toISOString())).toThrow('Expiration date cannot be in the past');
      expect(validateCustomDate(tomorrow.toISOString())).toBe(true);
    });
  });

  describe('checkExpirationStatus', () => {
    test('should return valid status for future expiration', async () => {
      const mockResponse = {
        status: 'valid',
        expiration_date: '2025-03-01',
        days_remaining: 20,
        is_expired: false
      };

      cachedFetch.mockResolvedValue(mockResponse);

      const checkExpirationStatus = async (quoteId) => {
        return await cachedFetch(`/api/quotations/${quoteId}/expiration-status`);
      };

      const result = await checkExpirationStatus(1);

      expect(result.status).toBe('valid');
      expect(result.is_expired).toBe(false);
      expect(result.days_remaining).toBeGreaterThan(0);
    });

    test('should return expiring_soon status when within 7 days', async () => {
      const mockResponse = {
        status: 'expiring_soon',
        expiration_date: '2025-02-05',
        days_remaining: 5,
        is_expired: false
      };

      cachedFetch.mockResolvedValue(mockResponse);

      const checkExpirationStatus = async (quoteId) => {
        return await cachedFetch(`/api/quotations/${quoteId}/expiration-status`);
      };

      const result = await checkExpirationStatus(1);

      expect(result.status).toBe('expiring_soon');
      expect(result.days_remaining).toBeLessThanOrEqual(7);
    });

    test('should return expired status for past expiration', async () => {
      const mockResponse = {
        status: 'expired',
        expiration_date: '2025-01-15',
        days_remaining: 0,
        is_expired: true
      };

      cachedFetch.mockResolvedValue(mockResponse);

      const checkExpirationStatus = async (quoteId) => {
        return await cachedFetch(`/api/quotations/${quoteId}/expiration-status`);
      };

      const result = await checkExpirationStatus(1);

      expect(result.status).toBe('expired');
      expect(result.is_expired).toBe(true);
    });

    test('should handle quotes with no expiration date', async () => {
      cachedFetch.mockResolvedValue({
        status: 'no_expiration',
        expiration_date: null,
        message: 'No expiration date set'
      });

      const checkExpirationStatus = async (quoteId) => {
        return await cachedFetch(`/api/quotations/${quoteId}/expiration-status`);
      };

      const result = await checkExpirationStatus(1);

      expect(result.status).toBe('no_expiration');
      expect(result.expiration_date).toBeNull();
    });
  });

  describe('extendQuoteExpiration', () => {
    test('should extend quote expiration by additional days', async () => {
      const mockResponse = {
        id: 1,
        old_expiration: '2025-02-15',
        new_expiration: '2025-02-25',
        days_extended: 10
      };

      cachedFetch.mockResolvedValue(mockResponse);

      const extendQuoteExpiration = async (quoteId, additionalDays) => {
        return await cachedFetch(`/api/quotations/${quoteId}/extend-expiration`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ additional_days: additionalDays })
        });
      };

      const result = await extendQuoteExpiration(1, 10);

      expect(result.days_extended).toBe(10);
      expect(result.new_expiration).not.toBe(result.old_expiration);
    });

    test('should validate additional days is positive', () => {
      const validateExtensionDays = (days) => {
        if (!days || days <= 0) {
          throw new Error('Extension days must be a positive number');
        }
        return true;
      };

      expect(() => validateExtensionDays(0)).toThrow('Extension days must be a positive number');
      expect(() => validateExtensionDays(-5)).toThrow('Extension days must be a positive number');
      expect(validateExtensionDays(7)).toBe(true);
    });
  });

  describe('batchExpireQuotes', () => {
    test('should expire all overdue quotes', async () => {
      const mockResponse = {
        expired_count: 5,
        quote_ids: [1, 2, 3, 4, 5],
        message: '5 quotes marked as expired'
      };

      cachedFetch.mockResolvedValue(mockResponse);

      const batchExpireQuotes = async () => {
        return await cachedFetch('/api/quotations/batch-expire', {
          method: 'POST'
        });
      };

      const result = await batchExpireQuotes();

      expect(result.expired_count).toBe(5);
      expect(result.quote_ids).toHaveLength(5);
    });

    test('should return zero count when no quotes expired', async () => {
      cachedFetch.mockResolvedValue({
        expired_count: 0,
        quote_ids: [],
        message: 'No quotes to expire'
      });

      const batchExpireQuotes = async () => {
        return await cachedFetch('/api/quotations/batch-expire', {
          method: 'POST'
        });
      };

      const result = await batchExpireQuotes();

      expect(result.expired_count).toBe(0);
      expect(result.quote_ids).toEqual([]);
    });
  });

  describe('renewExpiredQuote', () => {
    test('should renew expired quote with new expiration', async () => {
      const mockResponse = {
        id: 1,
        old_status: 'expired',
        new_status: 'draft',
        new_expiration: '2025-03-15',
        renewed_at: '2025-01-29T00:00:00Z'
      };

      cachedFetch.mockResolvedValue(mockResponse);

      const renewExpiredQuote = async (quoteId, daysValid) => {
        return await cachedFetch(`/api/quotations/${quoteId}/renew`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ days_valid: daysValid })
        });
      };

      const result = await renewExpiredQuote(1, 30);

      expect(result.old_status).toBe('expired');
      expect(result.new_status).toBe('draft');
      expect(result.new_expiration).toBeDefined();
    });

    test('should reject renewal of non-expired quote', async () => {
      cachedFetch.mockRejectedValue({
        status: 400,
        error: 'Quote is not expired'
      });

      const renewExpiredQuote = async (quoteId, daysValid) => {
        return await cachedFetch(`/api/quotations/${quoteId}/renew`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ days_valid: daysValid })
        });
      };

      await expect(renewExpiredQuote(1, 30)).rejects.toMatchObject({
        error: 'Quote is not expired'
      });
    });
  });

  describe('getExpirationHistory', () => {
    test('should fetch expiration history for quote', async () => {
      const mockHistory = [
        {
          id: 1,
          quote_id: 1,
          action: 'set_expiration',
          old_date: null,
          new_date: '2025-02-15',
          created_at: '2025-01-15'
        },
        {
          id: 2,
          quote_id: 1,
          action: 'extend_expiration',
          old_date: '2025-02-15',
          new_date: '2025-02-25',
          created_at: '2025-02-10'
        }
      ];

      cachedFetch.mockResolvedValue(mockHistory);

      const getExpirationHistory = async (quoteId) => {
        return await cachedFetch(`/api/quotations/${quoteId}/expiration-history`);
      };

      const result = await getExpirationHistory(1);

      expect(result).toHaveLength(2);
      expect(result[0].action).toBe('set_expiration');
      expect(result[1].action).toBe('extend_expiration');
    });
  });

  describe('UI Helper Functions', () => {
    test('should format expiration status with color coding', () => {
      const getExpirationBadge = (status) => {
        const badges = {
          'valid': { color: 'green', text: 'Valid' },
          'expiring_soon': { color: 'yellow', text: 'Expiring Soon' },
          'expired': { color: 'red', text: 'Expired' },
          'no_expiration': { color: 'gray', text: 'No Expiration' }
        };
        return badges[status] || { color: 'gray', text: 'Unknown' };
      };

      expect(getExpirationBadge('valid')).toEqual({ color: 'green', text: 'Valid' });
      expect(getExpirationBadge('expiring_soon')).toEqual({ color: 'yellow', text: 'Expiring Soon' });
      expect(getExpirationBadge('expired')).toEqual({ color: 'red', text: 'Expired' });
    });

    test('should calculate days remaining', () => {
      const calculateDaysRemaining = (expirationDate) => {
        if (!expirationDate) return null;

        const expDate = new Date(expirationDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        expDate.setHours(0, 0, 0, 0);

        const diffTime = expDate - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        return Math.max(0, diffDays);
      };

      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 10);

      expect(calculateDaysRemaining(futureDate.toISOString())).toBe(10);
      expect(calculateDaysRemaining(null)).toBeNull();
    });

    test('should format expiration message', () => {
      const formatExpirationMessage = (daysRemaining) => {
        if (daysRemaining === null) return 'No expiration set';
        if (daysRemaining === 0) return 'Expires today';
        if (daysRemaining === 1) return 'Expires tomorrow';
        if (daysRemaining <= 7) return `Expires in ${daysRemaining} days`;
        return `Valid for ${daysRemaining} more days`;
      };

      expect(formatExpirationMessage(null)).toBe('No expiration set');
      expect(formatExpirationMessage(0)).toBe('Expires today');
      expect(formatExpirationMessage(1)).toBe('Expires tomorrow');
      expect(formatExpirationMessage(5)).toBe('Expires in 5 days');
      expect(formatExpirationMessage(30)).toBe('Valid for 30 more days');
    });

    test('should determine if warning should be shown', () => {
      const shouldShowWarning = (daysRemaining) => {
        return daysRemaining !== null && daysRemaining <= 7 && daysRemaining >= 0;
      };

      expect(shouldShowWarning(5)).toBe(true);
      expect(shouldShowWarning(7)).toBe(true);
      expect(shouldShowWarning(8)).toBe(false);
      expect(shouldShowWarning(null)).toBe(false);
      expect(shouldShowWarning(-1)).toBe(false);
    });

    test('should suggest extension days based on current expiration', () => {
      const suggestExtensionDays = (daysRemaining) => {
        if (daysRemaining === null) return [7, 14, 30];
        if (daysRemaining <= 3) return [7, 14, 30];
        if (daysRemaining <= 7) return [7, 14];
        return [14, 30, 60];
      };

      expect(suggestExtensionDays(2)).toEqual([7, 14, 30]);
      expect(suggestExtensionDays(5)).toEqual([7, 14]);
      expect(suggestExtensionDays(15)).toEqual([14, 30, 60]);
      expect(suggestExtensionDays(null)).toEqual([7, 14, 30]);
    });
  });

  describe('Expiration Date Picker', () => {
    test('should generate date options for quick selection', () => {
      const generateQuickDateOptions = () => {
        const today = new Date();
        return [
          { label: '7 days', days: 7 },
          { label: '14 days', days: 14 },
          { label: '30 days', days: 30 },
          { label: '60 days', days: 60 },
          { label: '90 days', days: 90 }
        ];
      };

      const options = generateQuickDateOptions();

      expect(options).toHaveLength(5);
      expect(options[0]).toEqual({ label: '7 days', days: 7 });
      expect(options[4]).toEqual({ label: '90 days', days: 90 });
    });

    test('should calculate expiration date from days', () => {
      const calculateExpirationFromDays = (days) => {
        const date = new Date();
        date.setDate(date.getDate() + days);
        return date.toISOString().split('T')[0];
      };

      const result = calculateExpirationFromDays(30);
      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('Bulk Operations', () => {
    test('should fetch quotes expiring within specified days', async () => {
      const mockQuotes = [
        { id: 1, customer_name: 'Customer A', expiration_date: '2025-02-05', days_remaining: 5 },
        { id: 2, customer_name: 'Customer B', expiration_date: '2025-02-07', days_remaining: 7 }
      ];

      cachedFetch.mockResolvedValue(mockQuotes);

      const getExpiringQuotes = async (withinDays) => {
        return await cachedFetch(`/api/quotations/expiring?within_days=${withinDays}`);
      };

      const result = await getExpiringQuotes(7);

      expect(result).toHaveLength(2);
      expect(result[0].days_remaining).toBeLessThanOrEqual(7);
    });

    test('should bulk extend multiple quotes', async () => {
      const mockResponse = {
        extended_count: 3,
        quote_ids: [1, 2, 3],
        additional_days: 14
      };

      cachedFetch.mockResolvedValue(mockResponse);

      const bulkExtendQuotes = async (quoteIds, additionalDays) => {
        return await cachedFetch('/api/quotations/bulk-extend', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ quote_ids: quoteIds, additional_days: additionalDays })
        });
      };

      const result = await bulkExtendQuotes([1, 2, 3], 14);

      expect(result.extended_count).toBe(3);
      expect(result.quote_ids).toEqual([1, 2, 3]);
    });
  });
});
