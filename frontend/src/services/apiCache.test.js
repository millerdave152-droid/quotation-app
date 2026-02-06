import apiCache, { cachedFetch, invalidateCache, clearCache, getCacheStats } from './apiCache';

// Mock global fetch
global.fetch = jest.fn();

describe('API Cache Service', () => {
  beforeEach(() => {
    // Clear all mocks and cache before each test
    jest.clearAllMocks();
    clearCache();
  });

  describe('cachedFetch', () => {
    test('should fetch data from API on cache miss', async () => {
      const mockData = { id: 1, name: 'Test' };
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockData
      });

      const result = await cachedFetch('/api/test');

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockData);
    });

    test('should return cached data on cache hit', async () => {
      const mockData = { id: 1, name: 'Test' };
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockData
      });

      // First call - cache miss
      const result1 = await cachedFetch('/api/test');

      // Second call - cache hit
      const result2 = await cachedFetch('/api/test');

      expect(global.fetch).toHaveBeenCalledTimes(1); // Only called once
      expect(result1).toEqual(mockData);
      expect(result2).toEqual(mockData);
    });

    test('should handle API errors', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      });

      await expect(cachedFetch('/api/notfound')).rejects.toThrow('HTTP 404: Not Found');
    });

    test('should handle network errors', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(cachedFetch('/api/test')).rejects.toThrow('Network error');
    });

    test('should prepend API URL if not absolute URL', async () => {
      const mockData = { test: true };
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockData
      });

      await cachedFetch('/api/test');

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/test'),
        expect.objectContaining({
          headers: { 'Content-Type': 'application/json' },
          signal: expect.any(Object)
        })
      );
    });

    test('should use full URL if provided', async () => {
      const mockData = { test: true };
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockData
      });

      await cachedFetch('http://example.com/api/test');

      expect(global.fetch).toHaveBeenCalledWith(
        'http://example.com/api/test',
        expect.objectContaining({
          headers: { 'Content-Type': 'application/json' },
          signal: expect.any(Object)
        })
      );
    });
  });

  describe('Cache invalidation', () => {
    test('should invalidate cache entries matching pattern', async () => {
      const mockData1 = { id: 1 };
      const mockData2 = { id: 2 };

      global.fetch
        .mockResolvedValueOnce({ ok: true, json: async () => mockData1 })
        .mockResolvedValueOnce({ ok: true, json: async () => mockData2 });

      // Cache two different endpoints
      await cachedFetch('/api/products/1');
      await cachedFetch('/api/customers/1');

      // Invalidate products cache
      invalidateCache('/api/products');

      global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ id: 3 }) });

      // This should hit the API again (cache was invalidated)
      await cachedFetch('/api/products/1');

      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    test('should clear all cache', async () => {
      const mockData = { id: 1 };
      global.fetch.mockResolvedValue({ ok: true, json: async () => mockData });

      await cachedFetch('/api/test1');
      await cachedFetch('/api/test2');

      clearCache();

      await cachedFetch('/api/test1');

      expect(global.fetch).toHaveBeenCalledTimes(3); // All 3 calls hit the API
    });
  });

  describe('Cache statistics', () => {
    test('should return cache statistics', async () => {
      const mockData = { id: 1 };
      global.fetch.mockResolvedValue({ ok: true, json: async () => mockData });

      await cachedFetch('/api/test1');
      await cachedFetch('/api/test2');

      const stats = getCacheStats();

      expect(stats.size).toBe(2);
      expect(stats.entries.length).toBe(2);
    });
  });

  describe('TTL functionality', () => {
    test('should respect custom TTL for different endpoints', () => {
      const productsTTL = apiCache.getTTL('/api/products');
      const dashboardTTL = apiCache.getTTL('/api/dashboard/stats');
      const defaultTTL = apiCache.getTTL('/api/unknown');

      expect(productsTTL).toBe(2 * 60 * 1000); // 2 minutes
      expect(dashboardTTL).toBe(1 * 60 * 1000); // 1 minute
      expect(defaultTTL).toBe(5 * 60 * 1000); // 5 minutes default
    });

    test('should invalidate expired cache entries', async () => {
      const mockData = { id: 1 };
      global.fetch.mockResolvedValue({ ok: true, json: async () => mockData });

      // Fetch data
      await cachedFetch('/api/test');

      // Manually expire the cache by manipulating timestamp
      const cacheKey = Array.from(apiCache.cache.keys())[0];
      const entry = apiCache.cache.get(cacheKey);
      entry.timestamp = Date.now() - (10 * 60 * 1000); // 10 minutes ago

      // Should hit API again because cache expired
      await cachedFetch('/api/test');

      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('Pending requests deduplication', () => {
    test('should not make duplicate requests for same URL', async () => {
      const mockData = { id: 1 };
      global.fetch.mockImplementation(() =>
        new Promise(resolve =>
          setTimeout(() => resolve({ ok: true, json: async () => mockData }), 100)
        )
      );

      // Make multiple concurrent requests
      const promises = [
        cachedFetch('/api/test'),
        cachedFetch('/api/test'),
        cachedFetch('/api/test')
      ];

      const results = await Promise.all(promises);

      expect(global.fetch).toHaveBeenCalledTimes(1); // Only one actual API call
      expect(results).toEqual([mockData, mockData, mockData]);
    });
  });
});
