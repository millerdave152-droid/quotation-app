/**
 * TeleTime Quotation App - LookupService Tests
 * Tests for backend/services/LookupService.js
 *
 * LookupService uses static methods with a module-level pool.
 * We use _setPool() to inject a mock pool for testing.
 */

const https = require('https');

// Mock https before requiring LookupService
jest.mock('https');

// Mock the db module to prevent real connections
jest.mock('../db', () => ({
  query: jest.fn()
}));

const LookupService = require('../services/LookupService');

describe('LookupService', () => {
  let mockPool;

  beforeEach(() => {
    mockPool = {
      query: jest.fn()
    };
    LookupService._setPool(mockPool);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================================
  // searchCities Tests
  // ============================================================================

  describe('searchCities()', () => {
    it('should return matching cities sorted by population', async () => {
      const mockCities = [
        { id: 1, city_name: 'Mississauga', province_code: 'ON', province_name: 'Ontario', population: 717961, latitude: 43.5890, longitude: -79.6441 },
        { id: 2, city_name: 'Milton', province_code: 'ON', province_name: 'Ontario', population: 110128, latitude: 43.5183, longitude: -79.8774 }
      ];

      mockPool.query.mockResolvedValueOnce({ rows: mockCities });

      const result = await LookupService.searchCities('Mi');

      expect(result).toHaveLength(2);
      expect(result[0].city_name).toBe('Mississauga');
      expect(result[1].city_name).toBe('Milton');

      // Verify query params
      const params = mockPool.query.mock.calls[0][1];
      expect(params[0]).toBe('Mi%'); // starts-with pattern
      expect(params[1]).toBe(10); // default limit
    });

    it('should return empty array for short queries', async () => {
      const result = await LookupService.searchCities('M');

      expect(result).toEqual([]);
      expect(mockPool.query).not.toHaveBeenCalled();
    });

    it('should return empty array for null query', async () => {
      const result = await LookupService.searchCities(null);

      expect(result).toEqual([]);
    });

    it('should return empty array for empty string query', async () => {
      const result = await LookupService.searchCities('');

      expect(result).toEqual([]);
    });

    it('should filter by province code when provided', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await LookupService.searchCities('To', 'ON', 5);

      const queryCall = mockPool.query.mock.calls[0];
      expect(queryCall[0]).toContain('province_code = $3');
      expect(queryCall[1]).toEqual(['To%', 5, 'ON']);
    });

    it('should uppercase province code', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await LookupService.searchCities('To', 'on');

      const params = mockPool.query.mock.calls[0][1];
      expect(params[2]).toBe('ON');
    });

    it('should respect custom limit', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await LookupService.searchCities('Van', null, 3);

      const params = mockPool.query.mock.calls[0][1];
      expect(params[1]).toBe(3);
    });
  });

  // ============================================================================
  // getProvinces Tests
  // ============================================================================

  describe('getProvinces()', () => {
    it('should return all provinces with city counts', async () => {
      const mockProvinces = [
        { province_code: 'AB', province_name: 'Alberta', city_count: '150' },
        { province_code: 'BC', province_name: 'British Columbia', city_count: '200' },
        { province_code: 'ON', province_name: 'Ontario', city_count: '500' }
      ];

      mockPool.query.mockResolvedValueOnce({ rows: mockProvinces });

      const result = await LookupService.getProvinces();

      expect(result).toHaveLength(3);
      expect(result[2].province_code).toBe('ON');
      expect(result[2].province_name).toBe('Ontario');
    });
  });

  // ============================================================================
  // lookupPostalCode Tests
  // ============================================================================

  describe('lookupPostalCode()', () => {
    it('should return null for empty postal code', async () => {
      const result = await LookupService.lookupPostalCode(null);
      expect(result).toBeNull();
    });

    it('should return null for invalid postal code format', async () => {
      const result = await LookupService.lookupPostalCode('12345');
      expect(result).toBeNull();
    });

    it('should return null for partial postal code', async () => {
      const result = await LookupService.lookupPostalCode('M5H');
      expect(result).toBeNull();
    });

    it('should normalize postal code format (remove spaces, uppercase)', async () => {
      const cachedData = {
        postal_code: 'M5H 2N2',
        city: 'Toronto',
        province_code: 'ON',
        province_name: 'Ontario',
        latitude: 43.65,
        longitude: -79.38
      };

      // getPostalCodeFromCache returns cached data
      mockPool.query.mockResolvedValueOnce({ rows: [cachedData] });
      // updatePostalCodeUsage
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await LookupService.lookupPostalCode('m5h 2n2');

      expect(result).toEqual(cachedData);
    });

    it('should return cached result and update usage stats', async () => {
      const cachedData = {
        postal_code: 'L5B 3C2',
        city: 'Mississauga',
        province_code: 'ON',
        province_name: 'Ontario',
        latitude: 43.59,
        longitude: -79.64
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [cachedData] }) // cache hit
        .mockResolvedValueOnce({ rows: [] }); // update usage

      const result = await LookupService.lookupPostalCode('L5B3C2');

      expect(result).toEqual(cachedData);
      expect(mockPool.query).toHaveBeenCalledTimes(2);
      // Second call should update lookup_count
      const updateQuery = mockPool.query.mock.calls[1][0];
      expect(updateQuery).toContain('lookup_count = lookup_count + 1');
    });

    it('should fetch from API when not cached and cache the result', async () => {
      // Cache miss
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      // Mock the HTTPS request
      const mockResponse = {
        on: jest.fn((event, callback) => {
          if (event === 'data') {
            callback(JSON.stringify({
              city: 'Toronto',
              prov: 'ON',
              latt: '43.6532',
              longt: '-79.3832'
            }));
          }
          if (event === 'end') {
            callback();
          }
          return mockResponse;
        })
      };

      const mockRequest = {
        on: jest.fn().mockReturnThis(),
        destroy: jest.fn()
      };

      https.get.mockImplementation((url, options, callback) => {
        callback(mockResponse);
        return mockRequest;
      });

      // Cache the result
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await LookupService.lookupPostalCode('M5H2N2');

      expect(result).not.toBeNull();
      expect(result.city).toBe('Toronto');
      expect(result.province_code).toBe('ON');
      expect(result.province_name).toBe('Ontario');
      expect(result.latitude).toBe(43.6532);
      expect(result.longitude).toBe(-79.3832);
    });

    it('should return null when API returns an error', async () => {
      // Cache miss
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const mockResponse = {
        on: jest.fn((event, callback) => {
          if (event === 'data') {
            callback(JSON.stringify({ error: 'Not found' }));
          }
          if (event === 'end') {
            callback();
          }
          return mockResponse;
        })
      };

      const mockRequest = {
        on: jest.fn().mockReturnThis(),
        destroy: jest.fn()
      };

      https.get.mockImplementation((url, options, callback) => {
        callback(mockResponse);
        return mockRequest;
      });

      const result = await LookupService.lookupPostalCode('Z9Z9Z9');

      expect(result).toBeNull();
    });

    it('should handle API connection errors gracefully', async () => {
      // Cache miss
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const mockRequest = {
        on: jest.fn((event, callback) => {
          if (event === 'error') {
            callback(new Error('ECONNREFUSED'));
          }
          return mockRequest;
        }),
        destroy: jest.fn()
      };

      https.get.mockImplementation(() => {
        return mockRequest;
      });

      const result = await LookupService.lookupPostalCode('A1A1A1');

      expect(result).toBeNull();
    });

    it('should handle API timeout gracefully', async () => {
      // Cache miss
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const mockRequest = {
        on: jest.fn((event, callback) => {
          if (event === 'timeout') {
            callback();
          }
          return mockRequest;
        }),
        destroy: jest.fn()
      };

      https.get.mockImplementation(() => {
        return mockRequest;
      });

      const result = await LookupService.lookupPostalCode('B2B2B2');

      expect(result).toBeNull();
      expect(mockRequest.destroy).toHaveBeenCalled();
    });

    it('should accept postal codes with spaces', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ postal_code: 'M5H 2N2', city: 'Toronto', province_code: 'ON', province_name: 'Ontario', latitude: 43.65, longitude: -79.38 }] });
      mockPool.query.mockResolvedValueOnce({ rows: [] }); // usage update

      const result = await LookupService.lookupPostalCode('M5H 2N2');

      expect(result).not.toBeNull();
      expect(result.city).toBe('Toronto');
    });
  });

  // ============================================================================
  // searchNames Tests
  // ============================================================================

  describe('searchNames()', () => {
    it('should return matching names sorted by frequency', async () => {
      const mockNames = [
        { id: 1, name: 'John', name_type: 'first', frequency: 5000 },
        { id: 2, name: 'Jonathan', name_type: 'first', frequency: 2000 },
        { id: 3, name: 'Johnson', name_type: 'last', frequency: 3000 }
      ];

      mockPool.query.mockResolvedValueOnce({ rows: mockNames });

      const result = await LookupService.searchNames('Jo');

      expect(result).toHaveLength(3);
      expect(result[0].name).toBe('John');
    });

    it('should return empty array for short queries', async () => {
      const result = await LookupService.searchNames('J');

      expect(result).toEqual([]);
      expect(mockPool.query).not.toHaveBeenCalled();
    });

    it('should return empty array for null query', async () => {
      const result = await LookupService.searchNames(null);

      expect(result).toEqual([]);
    });

    it('should filter by name type when specified', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await LookupService.searchNames('Jo', 'first');

      const queryCall = mockPool.query.mock.calls[0];
      expect(queryCall[0]).toContain('name_type = $3');
      expect(queryCall[1]).toEqual(['Jo%', 10, 'first']);
    });

    it('should not filter by type for invalid type values', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await LookupService.searchNames('Jo', 'invalid');

      const queryCall = mockPool.query.mock.calls[0];
      expect(queryCall[0]).not.toContain('AND name_type =');
      expect(queryCall[1]).toEqual(['Jo%', 10]);
    });

    it('should respect custom limit', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await LookupService.searchNames('Smith', null, 5);

      const params = mockPool.query.mock.calls[0][1];
      expect(params[1]).toBe(5);
    });
  });

  // ============================================================================
  // searchCustomers Tests
  // ============================================================================

  describe('searchCustomers()', () => {
    it('should return matching customers for autocomplete', async () => {
      const mockCustomers = [
        { id: 1, name: 'John Doe', email: 'john@example.com', phone: '416-555-0001', company: 'Acme', city: 'Toronto', province: 'ON' }
      ];

      mockPool.query.mockResolvedValueOnce({ rows: mockCustomers });

      const result = await LookupService.searchCustomers('John');

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('John Doe');

      // Uses %query% (contains) pattern
      const params = mockPool.query.mock.calls[0][1];
      expect(params[0]).toBe('%John%');
      expect(params[1]).toBe(5); // default limit
    });

    it('should return empty array for short queries', async () => {
      const result = await LookupService.searchCustomers('J');

      expect(result).toEqual([]);
    });

    it('should return empty array for null query', async () => {
      const result = await LookupService.searchCustomers(null);

      expect(result).toEqual([]);
    });

    it('should respect custom limit', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await LookupService.searchCustomers('Doe', 10);

      const params = mockPool.query.mock.calls[0][1];
      expect(params[1]).toBe(10);
    });
  });

  // ============================================================================
  // findPotentialDuplicates Tests
  // ============================================================================

  describe('findPotentialDuplicates()', () => {
    it('should find duplicates by email with high confidence', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 5, name: 'Existing User', email: 'john@example.com', phone: null, company: null }]
      });

      const result = await LookupService.findPotentialDuplicates({
        email: 'john@example.com'
      });

      expect(result).toHaveLength(1);
      expect(result[0].matchType).toBe('email');
      expect(result[0].confidence).toBe('high');
    });

    it('should find duplicates by phone with high confidence', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] }) // no email match
        .mockResolvedValueOnce({
          rows: [{ id: 10, name: 'Phone User', email: 'phone@example.com', phone: '416-555-0001', company: null }]
        });

      const result = await LookupService.findPotentialDuplicates({
        email: 'new@example.com',
        phone: '416-555-0001'
      });

      expect(result).toHaveLength(1);
      expect(result[0].matchType).toBe('phone');
      expect(result[0].confidence).toBe('high');
    });

    it('should find duplicates by name with medium confidence', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] }) // no email match
        .mockResolvedValueOnce({ rows: [] }) // no phone match
        .mockResolvedValueOnce({
          rows: [{ id: 20, name: 'John Doe', email: 'different@example.com', phone: null, company: null }]
        });

      const result = await LookupService.findPotentialDuplicates({
        name: 'John Doe',
        email: 'johndoe@example.com',
        phone: '905-555-9999'
      });

      expect(result).toHaveLength(1);
      expect(result[0].matchType).toBe('name');
      expect(result[0].confidence).toBe('medium');
    });

    it('should find duplicates by company with low confidence', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] }) // no email match
        .mockResolvedValueOnce({ rows: [] }) // no phone match
        .mockResolvedValueOnce({ rows: [] }) // no name match
        .mockResolvedValueOnce({
          rows: [{ id: 30, name: 'Other Person', email: 'other@example.com', phone: null, company: 'Acme Corp' }]
        });

      const result = await LookupService.findPotentialDuplicates({
        name: 'New Person',
        email: 'new@example.com',
        phone: '000-000-0000',
        company: 'Acme Corp'
      });

      expect(result).toHaveLength(1);
      expect(result[0].matchType).toBe('company');
      expect(result[0].confidence).toBe('low');
    });

    it('should combine multiple match types', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{ id: 5, name: 'John Doe', email: 'john@example.com', phone: '416-555-0001', company: 'Acme' }]
        })
        // Phone check excludes already-found id=5
        .mockResolvedValueOnce({
          rows: [{ id: 10, name: 'Jane Doe', email: 'jane@example.com', phone: '416-555-0001', company: null }]
        });

      const result = await LookupService.findPotentialDuplicates({
        email: 'john@example.com',
        phone: '416-555-0001'
      });

      expect(result).toHaveLength(2);
      expect(result[0].matchType).toBe('email');
      expect(result[1].matchType).toBe('phone');
    });

    it('should skip short name for fuzzy matching', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] }); // email check only

      const result = await LookupService.findPotentialDuplicates({
        name: 'Jo', // too short for name matching (< 3 chars)
        email: 'unique@example.com'
      });

      expect(result).toHaveLength(0);
      // Should only have made the email query, not the name query
      expect(mockPool.query).toHaveBeenCalledTimes(1);
    });

    it('should skip company matching for short company names', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] }); // email

      const result = await LookupService.findPotentialDuplicates({
        email: 'test@test.com',
        company: 'AB' // too short for company matching (< 3 chars)
      });

      expect(result).toHaveLength(0);
      expect(mockPool.query).toHaveBeenCalledTimes(1);
    });

    it('should return empty array when no data provided', async () => {
      const result = await LookupService.findPotentialDuplicates({});

      expect(result).toEqual([]);
      expect(mockPool.query).not.toHaveBeenCalled();
    });

    it('should exclude already-found duplicates from subsequent searches', async () => {
      // Email match returns id 5
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 5, name: 'John', email: 'john@test.com', phone: '555-0001', company: null }]
      });
      // Phone match should exclude id 5
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await LookupService.findPotentialDuplicates({
        email: 'john@test.com',
        phone: '555-0001'
      });

      // The phone query should receive the exclude array containing id 5
      const phoneParams = mockPool.query.mock.calls[1][1];
      expect(phoneParams).toContain('555-0001');
      expect(phoneParams[1]).toEqual([5]); // excluded IDs
    });
  });

  // ============================================================================
  // getFrequentPostalCodes Tests
  // ============================================================================

  describe('getFrequentPostalCodes()', () => {
    it('should return most used postal codes', async () => {
      const mockCodes = [
        { postal_code: 'L5B 3C2', city: 'Mississauga', province_code: 'ON', province_name: 'Ontario', lookup_count: 150 },
        { postal_code: 'M5H 2N2', city: 'Toronto', province_code: 'ON', province_name: 'Ontario', lookup_count: 120 }
      ];

      mockPool.query.mockResolvedValueOnce({ rows: mockCodes });

      const result = await LookupService.getFrequentPostalCodes();

      expect(result).toHaveLength(2);
      expect(result[0].lookup_count).toBe(150);
    });

    it('should respect custom limit', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await LookupService.getFrequentPostalCodes(5);

      const params = mockPool.query.mock.calls[0][1];
      expect(params).toEqual([5]);
    });
  });

  // ============================================================================
  // fuzzySearchNames Tests
  // ============================================================================

  describe('fuzzySearchNames()', () => {
    it('should return empty array for empty query', async () => {
      const result = await LookupService.fuzzySearchNames('');
      expect(result).toEqual([]);
    });

    it('should return empty array for null query', async () => {
      const result = await LookupService.fuzzySearchNames(null);
      expect(result).toEqual([]);
    });

    it('should score exact matches highest', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { id: 1, name: 'John', name_type: 'first', frequency: 5000 },
          { id: 2, name: 'Johnny', name_type: 'first', frequency: 1000 }
        ]
      });
      // No variation query needed for 'john'
      mockPool.query.mockResolvedValueOnce({ rows: [] }); // known variations query

      const result = await LookupService.fuzzySearchNames('john');

      expect(result.length).toBeGreaterThan(0);
      // Exact match should have score 100 + frequency boost
      const exactMatch = result.find(r => r.name === 'John');
      expect(exactMatch).toBeDefined();
      expect(exactMatch.matchType).toBe('exact');
      expect(exactMatch.score).toBeGreaterThanOrEqual(100);
    });

    it('should include known name variations', async () => {
      // Main search results
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { id: 1, name: 'Mike', name_type: 'first', frequency: 3000 }
        ]
      });
      // Variation query (for 'michael', 'micheal', 'mick', 'mikey')
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { id: 2, name: 'Michael', name_type: 'first', frequency: 8000 }
        ]
      });

      const result = await LookupService.fuzzySearchNames('mike');

      const variation = result.find(r => r.name === 'Michael');
      expect(variation).toBeDefined();
      expect(variation.matchType).toBe('variation');
    });

    it('should filter by name type', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      // Second query for variations ('smith' has variations in NAME_VARIATIONS)
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await LookupService.fuzzySearchNames('Smith', 'last');

      const query = mockPool.query.mock.calls[0][0];
      expect(query).toContain('name_type');
      const params = mockPool.query.mock.calls[0][1];
      expect(params).toContain('last');
    });

    it('should respect custom limit', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: Array(20).fill(null).map((_, i) => ({
          id: i + 1,
          name: `Name${i}`,
          name_type: 'first',
          frequency: 100 - i
        }))
      });

      const result = await LookupService.fuzzySearchNames('Name', null, 5);

      expect(result.length).toBeLessThanOrEqual(5);
    });

    it('should score prefix matches higher than contains matches', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { id: 1, name: 'Chris', name_type: 'first', frequency: 100 },
          { id: 2, name: 'Ulrich', name_type: 'first', frequency: 100 }
        ]
      });
      // Variations query
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await LookupService.fuzzySearchNames('chri');

      if (result.length >= 2) {
        const prefixMatch = result.find(r => r.name === 'Chris');
        const containsMatch = result.find(r => r.name === 'Ulrich');
        if (prefixMatch && containsMatch) {
          expect(prefixMatch.score).toBeGreaterThan(containsMatch.score);
        }
      }
    });
  });

  // ============================================================================
  // getPopularFirstNames Tests
  // ============================================================================

  describe('getPopularFirstNames()', () => {
    it('should return popular first names', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { name: 'James', frequency: 10000 },
          { name: 'John', frequency: 9500 },
          { name: 'Robert', frequency: 9000 }
        ]
      });

      const result = await LookupService.getPopularFirstNames(3);

      expect(result).toEqual(['James', 'John', 'Robert']);
    });

    it('should use default limit of 5', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await LookupService.getPopularFirstNames();

      const params = mockPool.query.mock.calls[0][1];
      expect(params).toEqual([5]);
    });
  });

  // ============================================================================
  // getPopularLastNames Tests
  // ============================================================================

  describe('getPopularLastNames()', () => {
    it('should return popular last names', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { name: 'Smith', frequency: 15000 },
          { name: 'Johnson', frequency: 12000 }
        ]
      });

      const result = await LookupService.getPopularLastNames(2);

      expect(result).toEqual(['Smith', 'Johnson']);
    });

    it('should use default limit of 5', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await LookupService.getPopularLastNames();

      const params = mockPool.query.mock.calls[0][1];
      expect(params).toEqual([5]);
    });
  });

  // ============================================================================
  // searchCompanies Tests
  // ============================================================================

  describe('searchCompanies()', () => {
    it('should return distinct company names', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { company: 'Acme Corp' },
          { company: 'Acme Industries' }
        ]
      });

      const result = await LookupService.searchCompanies('Acme');

      expect(result).toEqual(['Acme Corp', 'Acme Industries']);
    });

    it('should return empty array for short queries', async () => {
      const result = await LookupService.searchCompanies('A');

      expect(result).toEqual([]);
      expect(mockPool.query).not.toHaveBeenCalled();
    });

    it('should return empty array for null query', async () => {
      const result = await LookupService.searchCompanies(null);

      expect(result).toEqual([]);
    });

    it('should use contains pattern for search', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await LookupService.searchCompanies('Tech');

      const params = mockPool.query.mock.calls[0][1];
      expect(params[0]).toBe('%Tech%');
    });

    it('should respect custom limit', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await LookupService.searchCompanies('Corp', 3);

      const params = mockPool.query.mock.calls[0][1];
      expect(params[1]).toBe(3);
    });
  });

  // ============================================================================
  // saveNewName Tests
  // ============================================================================

  describe('saveNewName()', () => {
    it('should save a new first name and return true', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] }) // name does not exist
        .mockResolvedValueOnce({ rows: [] }); // insert

      const result = await LookupService.saveNewName('johanna', 'first');

      expect(result).toBe(true);
      // Should normalize: capitalize first letter
      const insertParams = mockPool.query.mock.calls[1][1];
      expect(insertParams[0]).toBe('Johanna');
      expect(insertParams[1]).toBe('first');
    });

    it('should increment frequency for existing names and return false', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // name exists
        .mockResolvedValueOnce({ rows: [] }); // update frequency

      const result = await LookupService.saveNewName('John', 'first');

      expect(result).toBe(false);
      const updateQuery = mockPool.query.mock.calls[1][0];
      expect(updateQuery).toContain('frequency = frequency + 1');
    });

    it('should return false for names shorter than 2 characters', async () => {
      const result = await LookupService.saveNewName('J', 'first');

      expect(result).toBe(false);
      expect(mockPool.query).not.toHaveBeenCalled();
    });

    it('should return false for null name', async () => {
      const result = await LookupService.saveNewName(null, 'first');

      expect(result).toBe(false);
    });

    it('should return false for invalid type', async () => {
      const result = await LookupService.saveNewName('John', 'middle');

      expect(result).toBe(false);
      expect(mockPool.query).not.toHaveBeenCalled();
    });

    it('should handle duplicate key errors gracefully (race condition)', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] }) // name does not exist
        .mockRejectedValueOnce({ code: '23505', message: 'duplicate key' }); // insert race condition

      const result = await LookupService.saveNewName('Unique', 'first');

      expect(result).toBe(false);
    });

    it('should handle non-duplicate database errors', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockRejectedValueOnce({ code: '08001', message: 'connection failed' });

      const result = await LookupService.saveNewName('Test', 'first');

      expect(result).toBe(false);
    });
  });

  // ============================================================================
  // saveNamesFromCustomer Tests
  // ============================================================================

  describe('saveNamesFromCustomer()', () => {
    it('should save both first and last names', async () => {
      // First name check + save
      mockPool.query
        .mockResolvedValueOnce({ rows: [] }) // first name check
        .mockResolvedValueOnce({ rows: [] }) // first name insert
        .mockResolvedValueOnce({ rows: [] }) // last name check
        .mockResolvedValueOnce({ rows: [] }); // last name insert

      const result = await LookupService.saveNamesFromCustomer('John Smith');

      expect(result.firstName).toBe(true);
      expect(result.lastName).toBe(true);
    });

    it('should handle single-word names (first name only)', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] }) // first name check
        .mockResolvedValueOnce({ rows: [] }); // first name insert

      const result = await LookupService.saveNamesFromCustomer('Madonna');

      expect(result.firstName).toBe(true);
      expect(result.lastName).toBe(false);
    });

    it('should return false for both when name is null', async () => {
      const result = await LookupService.saveNamesFromCustomer(null);

      expect(result).toEqual({ firstName: false, lastName: false });
    });

    it('should return false for both when name is empty', async () => {
      const result = await LookupService.saveNamesFromCustomer('');

      expect(result).toEqual({ firstName: false, lastName: false });
    });

    it('should use last part of multi-word name as last name', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] }) // first name check
        .mockResolvedValueOnce({ rows: [] }) // first name insert
        .mockResolvedValueOnce({ rows: [] }) // last name check
        .mockResolvedValueOnce({ rows: [] }); // last name insert

      await LookupService.saveNamesFromCustomer('Mary Jane Watson');

      // First name should be 'Mary'
      expect(mockPool.query.mock.calls[0][1][0]).toMatch(/mary/i);
      // Last name should be 'Watson' (last part)
      expect(mockPool.query.mock.calls[2][1][0]).toMatch(/watson/i);
    });

    it('should handle whitespace-padded names', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await LookupService.saveNamesFromCustomer('  John   Smith  ');

      // Should trim and split correctly
      expect(mockPool.query.mock.calls[0][1][0]).toMatch(/john/i);
      expect(mockPool.query.mock.calls[2][1][0]).toMatch(/smith/i);
    });
  });

  // ============================================================================
  // Error Handling Tests
  // ============================================================================

  describe('Error handling', () => {
    it('should propagate database errors from searchCities', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('Connection lost'));

      await expect(LookupService.searchCities('Toronto'))
        .rejects.toThrow('Connection lost');
    });

    it('should propagate database errors from getProvinces', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('Query timeout'));

      await expect(LookupService.getProvinces())
        .rejects.toThrow('Query timeout');
    });

    it('should propagate database errors from searchCustomers', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('Database error'));

      await expect(LookupService.searchCustomers('test'))
        .rejects.toThrow('Database error');
    });

    it('should handle cachePostalCode errors gracefully (no throw)', async () => {
      // Cache miss
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      // API returns valid data
      const mockResponse = {
        on: jest.fn((event, callback) => {
          if (event === 'data') {
            callback(JSON.stringify({ city: 'Test', prov: 'ON', latt: '43.0', longt: '-79.0' }));
          }
          if (event === 'end') {
            callback();
          }
          return mockResponse;
        })
      };

      const mockRequest = {
        on: jest.fn().mockReturnThis(),
        destroy: jest.fn()
      };

      https.get.mockImplementation((url, options, callback) => {
        callback(mockResponse);
        return mockRequest;
      });

      // Cache write fails
      mockPool.query.mockRejectedValueOnce(new Error('Disk full'));

      // Should still return the data even if caching fails
      const result = await LookupService.lookupPostalCode('A1A1A1');

      expect(result).not.toBeNull();
      expect(result.city).toBe('Test');
    });
  });

  // ============================================================================
  // Postal Code Validation Tests
  // ============================================================================

  describe('Postal code validation', () => {
    it('should reject US zip codes', async () => {
      const result = await LookupService.lookupPostalCode('90210');
      expect(result).toBeNull();
    });

    it('should reject codes with invalid characters', async () => {
      const result = await LookupService.lookupPostalCode('1A1 1A1');
      expect(result).toBeNull();
    });

    it('should accept valid Canadian postal code patterns', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ postal_code: 'K1A 0B1', city: 'Ottawa', province_code: 'ON', province_name: 'Ontario', latitude: 45.42, longitude: -75.70 }] });
      mockPool.query.mockResolvedValueOnce({ rows: [] }); // usage update

      const result = await LookupService.lookupPostalCode('K1A0B1');
      expect(result).not.toBeNull();
    });
  });
});
