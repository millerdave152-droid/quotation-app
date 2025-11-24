import { cachedFetch } from './apiCache';

jest.mock('./apiCache');

describe('Advanced Search Service', () => {
  const API_BASE_URL = '/api/search';

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  describe('searchQuotes', () => {
    test('should search quotes with query', async () => {
      const mockResponse = {
        quotes: [
          { id: 1, quote_number: 'Q-001', customer_name: 'ACME Corp' },
          { id: 2, quote_number: 'Q-002', customer_name: 'ACME Industries' }
        ],
        total: 2
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const searchQuotes = async (searchParams) => {
        const response = await fetch(`${API_BASE_URL}/quotes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(searchParams)
        });
        return await response.json();
      };

      const result = await searchQuotes({ query: 'ACME' });
      expect(result.quotes).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    test('should search with multiple filters', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ quotes: [], total: 0 })
      });

      const searchQuotes = async (searchParams) => {
        const response = await fetch(`${API_BASE_URL}/quotes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(searchParams)
        });
        return await response.json();
      };

      await searchQuotes({
        query: 'ACME',
        filters: {
          status: 'pending',
          start_date: '2024-01-01',
          end_date: '2024-12-31',
          min_amount: 1000,
          max_amount: 5000
        },
        sort: 'total_amount',
        order: 'DESC'
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/quotes'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('ACME')
        })
      );
    });
  });

  describe('getSuggestions', () => {
    test('should fetch search suggestions', async () => {
      const mockData = {
        suggestions: [
          { type: 'customer', id: 1, name: 'ACME Corp' },
          { type: 'quote', id: 1, quote_number: 'Q-001' }
        ]
      };

      cachedFetch.mockResolvedValue(mockData);

      const getSuggestions = async (query, type) => {
        return await cachedFetch(`${API_BASE_URL}/suggestions?query=${query}&type=${type}`);
      };

      const result = await getSuggestions('ACME', 'customer');
      expect(result.suggestions).toHaveLength(2);
    });

    test('should not fetch suggestions for short queries', async () => {
      const getSuggestions = async (query) => {
        if (query.length < 2) return { suggestions: [] };
        return await cachedFetch(`${API_BASE_URL}/suggestions?query=${query}`);
      };

      const result = await getSuggestions('A');
      expect(result.suggestions).toHaveLength(0);
      expect(cachedFetch).not.toHaveBeenCalled();
    });
  });

  describe('Saved Searches', () => {
    test('should save search', async () => {
      const mockResponse = {
        success: true,
        saved_search: { id: 1, name: 'My Search' }
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const saveSearch = async (name, searchParams, userId) => {
        const response = await fetch(`${API_BASE_URL}/saved-searches`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, search_params: searchParams, user_id: userId })
        });
        return await response.json();
      };

      const result = await saveSearch('My Search', { status: 'pending' }, 1);
      expect(result.success).toBe(true);
    });

    test('should get saved searches', async () => {
      const mockData = {
        saved_searches: [
          { id: 1, name: 'Search 1' },
          { id: 2, name: 'Search 2' }
        ]
      };

      cachedFetch.mockResolvedValue(mockData);

      const getSavedSearches = async (userId) => {
        return await cachedFetch(`${API_BASE_URL}/saved-searches/${userId}`);
      };

      const result = await getSavedSearches(1);
      expect(result.saved_searches).toHaveLength(2);
    });

    test('should delete saved search', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true })
      });

      const deleteSavedSearch = async (id) => {
        const response = await fetch(`${API_BASE_URL}/saved-searches/${id}`, {
          method: 'DELETE'
        });
        return await response.json();
      };

      const result = await deleteSavedSearch(1);
      expect(result.success).toBe(true);
    });

    test('should load saved search', async () => {
      const loadSavedSearch = (savedSearch) => {
        return JSON.parse(savedSearch.search_params);
      };

      const savedSearch = {
        id: 1,
        name: 'My Search',
        search_params: JSON.stringify({ status: 'pending', query: 'ACME' })
      };

      const params = loadSavedSearch(savedSearch);
      expect(params.status).toBe('pending');
      expect(params.query).toBe('ACME');
    });
  });

  describe('Search History', () => {
    test('should save to search history', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true })
      });

      const saveToHistory = async (query, userId) => {
        const response = await fetch(`${API_BASE_URL}/recent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ search_query: query, user_id: userId })
        });
        return await response.json();
      };

      const result = await saveToHistory('ACME', 1);
      expect(result.success).toBe(true);
    });

    test('should get recent searches', async () => {
      const mockData = {
        recent_searches: ['ACME', 'Tech Corp', 'Industries']
      };

      cachedFetch.mockResolvedValue(mockData);

      const getRecentSearches = async (userId) => {
        return await cachedFetch(`${API_BASE_URL}/recent/${userId}`);
      };

      const result = await getRecentSearches(1);
      expect(result.recent_searches).toHaveLength(3);
    });
  });

  describe('Filter Options', () => {
    test('should get available filter options', async () => {
      const mockData = {
        statuses: ['pending', 'accepted', 'rejected'],
        customers: [
          { id: 1, name: 'ACME Corp' },
          { id: 2, name: 'Tech Industries' }
        ]
      };

      cachedFetch.mockResolvedValue(mockData);

      const getFilterOptions = async () => {
        return await cachedFetch(`${API_BASE_URL}/filters/options`);
      };

      const result = await getFilterOptions();
      expect(result.statuses).toHaveLength(3);
      expect(result.customers).toHaveLength(2);
    });
  });

  describe('Search Utilities', () => {
    test('should build search query string', () => {
      const buildQueryString = (params) => {
        const { query, filters = {} } = params;
        const parts = [];

        if (query) parts.push(`query:"${query}"`);
        if (filters.status) parts.push(`status:${filters.status}`);
        if (filters.customer_id) parts.push(`customer:${filters.customer_id}`);

        return parts.join(' ');
      };

      const queryString = buildQueryString({
        query: 'ACME',
        filters: { status: 'pending', customer_id: 1 }
      });

      expect(queryString).toContain('query:"ACME"');
      expect(queryString).toContain('status:pending');
      expect(queryString).toContain('customer:1');
    });

    test('should parse search query string', () => {
      const parseQueryString = (queryString) => {
        const params = { filters: {} };
        const parts = queryString.split(' ');

        parts.forEach(part => {
          if (part.startsWith('query:')) {
            params.query = part.substring(6).replace(/"/g, '');
          } else if (part.startsWith('status:')) {
            params.filters.status = part.substring(7);
          }
        });

        return params;
      };

      const params = parseQueryString('query:"ACME" status:pending');
      expect(params.query).toBe('ACME');
      expect(params.filters.status).toBe('pending');
    });

    test('should validate search parameters', () => {
      const validateSearchParams = (params) => {
        const errors = [];

        if (params.filters?.min_amount && params.filters?.max_amount) {
          if (parseFloat(params.filters.min_amount) > parseFloat(params.filters.max_amount)) {
            errors.push('Minimum amount cannot be greater than maximum amount');
          }
        }

        if (params.filters?.start_date && params.filters?.end_date) {
          if (new Date(params.filters.start_date) > new Date(params.filters.end_date)) {
            errors.push('Start date cannot be after end date');
          }
        }

        return { valid: errors.length === 0, errors };
      };

      const result1 = validateSearchParams({
        filters: { min_amount: 5000, max_amount: 1000 }
      });
      expect(result1.valid).toBe(false);

      const result2 = validateSearchParams({
        filters: { min_amount: 1000, max_amount: 5000 }
      });
      expect(result2.valid).toBe(true);
    });

    test('should highlight search terms in results', () => {
      const highlightSearchTerms = (text, query) => {
        if (!query) return text;
        const regex = new RegExp(`(${query})`, 'gi');
        return text.replace(regex, '<mark>$1</mark>');
      };

      const result = highlightSearchTerms('ACME Corporation', 'ACME');
      expect(result).toBe('<mark>ACME</mark> Corporation');
    });

    test('should format search result count', () => {
      const formatResultCount = (total, limit, offset) => {
        const from = offset + 1;
        const to = Math.min(offset + limit, total);
        return `Showing ${from}-${to} of ${total} results`;
      };

      expect(formatResultCount(100, 20, 0)).toBe('Showing 1-20 of 100 results');
      expect(formatResultCount(100, 20, 20)).toBe('Showing 21-40 of 100 results');
      expect(formatResultCount(15, 20, 0)).toBe('Showing 1-15 of 15 results');
    });
  });

  describe('Search Result Processing', () => {
    test('should group results by category', () => {
      const groupByCategory = (results) => {
        return results.reduce((acc, result) => {
          const category = result.status || 'uncategorized';
          if (!acc[category]) acc[category] = [];
          acc[category].push(result);
          return acc;
        }, {});
      };

      const results = [
        { id: 1, status: 'pending' },
        { id: 2, status: 'accepted' },
        { id: 3, status: 'pending' }
      ];

      const grouped = groupByCategory(results);
      expect(grouped.pending).toHaveLength(2);
      expect(grouped.accepted).toHaveLength(1);
    });

    test('should sort results by relevance', () => {
      const sortByRelevance = (results, query) => {
        return [...results].sort((a, b) => {
          const aScore = a.quote_number.toLowerCase().includes(query.toLowerCase()) ? 2 : 0;
          const bScore = b.quote_number.toLowerCase().includes(query.toLowerCase()) ? 2 : 0;
          return bScore - aScore;
        });
      };

      const results = [
        { id: 1, quote_number: 'Q-001' },
        { id: 2, quote_number: 'ACME-002' },
        { id: 3, quote_number: 'Q-003' }
      ];

      const sorted = sortByRelevance(results, 'ACME');
      expect(sorted[0].quote_number).toBe('ACME-002');
    });

    test('should filter duplicate results', () => {
      const removeDuplicates = (results) => {
        const seen = new Set();
        return results.filter(result => {
          if (seen.has(result.id)) return false;
          seen.add(result.id);
          return true;
        });
      };

      const results = [
        { id: 1, name: 'Quote 1' },
        { id: 2, name: 'Quote 2' },
        { id: 1, name: 'Quote 1 Duplicate' }
      ];

      const filtered = removeDuplicates(results);
      expect(filtered).toHaveLength(2);
    });
  });

  describe('Advanced Filters', () => {
    test('should build date range filter', () => {
      const buildDateRangeFilter = (range) => {
        const now = new Date();
        const filters = {};

        switch (range) {
          case 'today':
            filters.start_date = new Date(now.setHours(0, 0, 0, 0)).toISOString();
            filters.end_date = new Date(now.setHours(23, 59, 59, 999)).toISOString();
            break;
          case 'last_7_days':
            filters.start_date = new Date(now.setDate(now.getDate() - 7)).toISOString();
            filters.end_date = new Date().toISOString();
            break;
          case 'last_30_days':
            filters.start_date = new Date(now.setDate(now.getDate() - 30)).toISOString();
            filters.end_date = new Date().toISOString();
            break;
        }

        return filters;
      };

      const filters = buildDateRangeFilter('last_7_days');
      expect(filters.start_date).toBeDefined();
      expect(filters.end_date).toBeDefined();
    });

    test('should build amount range filter', () => {
      const buildAmountRangeFilter = (range) => {
        const filters = {};

        switch (range) {
          case 'small':
            filters.max_amount = 1000;
            break;
          case 'medium':
            filters.min_amount = 1000;
            filters.max_amount = 10000;
            break;
          case 'large':
            filters.min_amount = 10000;
            break;
        }

        return filters;
      };

      const filters = buildAmountRangeFilter('medium');
      expect(filters.min_amount).toBe(1000);
      expect(filters.max_amount).toBe(10000);
    });
  });

  describe('Search Export', () => {
    test('should prepare search results for export', () => {
      const prepareForExport = (results) => {
        return results.map(result => ({
          'Quote Number': result.quote_number,
          'Customer': result.customer_name,
          'Status': result.status,
          'Total Amount': result.total_amount,
          'Created Date': new Date(result.created_at).toLocaleDateString()
        }));
      };

      const results = [
        {
          quote_number: 'Q-001',
          customer_name: 'ACME Corp',
          status: 'pending',
          total_amount: 5000,
          created_at: '2024-01-15T10:00:00Z'
        }
      ];

      const exported = prepareForExport(results);
      expect(exported[0]['Quote Number']).toBe('Q-001');
      expect(exported[0]['Customer']).toBe('ACME Corp');
    });

    test('should generate CSV from search results', () => {
      const generateCSV = (results) => {
        const headers = ['Quote Number', 'Customer', 'Status', 'Amount'];
        const rows = results.map(r => [
          r.quote_number,
          r.customer_name,
          r.status,
          r.total_amount
        ]);

        return [
          headers.join(','),
          ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n');
      };

      const results = [
        { quote_number: 'Q-001', customer_name: 'ACME Corp', status: 'pending', total_amount: 5000 }
      ];

      const csv = generateCSV(results);
      expect(csv).toContain('Quote Number,Customer,Status,Amount');
      expect(csv).toContain('Q-001');
    });
  });

  describe('Search Performance', () => {
    test('should debounce search input', () => {
      jest.useFakeTimers();

      const debounce = (func, delay) => {
        let timeoutId;
        return (...args) => {
          clearTimeout(timeoutId);
          timeoutId = setTimeout(() => func(...args), delay);
        };
      };

      const mockSearch = jest.fn();
      const debouncedSearch = debounce(mockSearch, 300);

      debouncedSearch('A');
      debouncedSearch('AC');
      debouncedSearch('ACM');
      debouncedSearch('ACME');

      expect(mockSearch).not.toHaveBeenCalled();

      jest.advanceTimersByTime(300);

      expect(mockSearch).toHaveBeenCalledTimes(1);
      expect(mockSearch).toHaveBeenCalledWith('ACME');

      jest.useRealTimers();
    });

    test('should cache search results', () => {
      const searchCache = new Map();

      const getCachedSearch = (key) => {
        if (searchCache.has(key)) {
          const cached = searchCache.get(key);
          if (Date.now() - cached.timestamp < 60000) {
            return cached.data;
          }
          searchCache.delete(key);
        }
        return null;
      };

      const setCachedSearch = (key, data) => {
        searchCache.set(key, { data, timestamp: Date.now() });
      };

      const searchKey = JSON.stringify({ query: 'ACME' });
      const mockData = { quotes: [], total: 0 };

      setCachedSearch(searchKey, mockData);
      const result = getCachedSearch(searchKey);

      expect(result).toEqual(mockData);
    });
  });

  describe('Search Analytics', () => {
    test('should track search metrics', () => {
      const trackSearch = (query, resultCount, executionTime) => {
        return {
          query,
          result_count: resultCount,
          execution_time: executionTime,
          timestamp: new Date().toISOString()
        };
      };

      const metrics = trackSearch('ACME', 15, 250);
      expect(metrics.query).toBe('ACME');
      expect(metrics.result_count).toBe(15);
      expect(metrics.execution_time).toBe(250);
    });

    test('should identify popular searches', () => {
      const getPopularSearches = (history) => {
        const counts = {};
        history.forEach(search => {
          counts[search] = (counts[search] || 0) + 1;
        });

        return Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([query, count]) => ({ query, count }));
      };

      const history = ['ACME', 'Tech', 'ACME', 'Industries', 'ACME', 'Tech'];
      const popular = getPopularSearches(history);

      expect(popular[0].query).toBe('ACME');
      expect(popular[0].count).toBe(3);
    });
  });
});
