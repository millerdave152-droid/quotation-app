/**
 * Performance Tests - Quote List Operations
 * Week 3.5 of 4-week sprint
 *
 * Tests response times for common operations
 * Target: < 500ms for list operations with 1000+ quotes
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

const TEST_CONFIG = {
  JWT_SECRET: 'test-jwt-secret-for-performance',
  // Performance thresholds (in milliseconds)
  THRESHOLDS: {
    QUOTE_LIST: 500,        // List 50 quotes < 500ms
    QUOTE_DETAIL: 200,      // Single quote detail < 200ms
    QUOTE_CREATE: 300,      // Create quote < 300ms
    QUOTE_SEARCH: 500,      // Search quotes < 500ms
    DASHBOARD_STATS: 400    // Dashboard aggregations < 400ms
  }
};

// Generate large mock dataset
const generateMockData = (quoteCount = 1000) => {
  const customers = Array.from({ length: 50 }, (_, i) => ({
    id: i + 1,
    name: `Customer ${i + 1}`,
    email: `customer${i + 1}@test.com`,
    company: `Company ${i + 1}`
  }));

  const quotations = Array.from({ length: quoteCount }, (_, i) => ({
    id: i + 1,
    quotation_number: `Q-2024-${String(i + 1).padStart(5, '0')}`,
    customer_id: (i % 50) + 1,
    customer_name: customers[(i % 50)].name,
    status: ['DRAFT', 'SENT', 'WON', 'LOST', 'EXPIRED'][i % 5],
    subtotal_cents: Math.floor(Math.random() * 1000000) + 10000,
    total_cents: Math.floor(Math.random() * 1000000) + 10000,
    created_at: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString(),
    created_by: (i % 10) + 1
  }));

  return { customers, quotations };
};

const createMockPool = (mockData) => {
  return {
    query: jest.fn().mockImplementation((sql, params) => {
      const sqlLower = sql.toLowerCase();
      const startTime = Date.now();

      // Simulate real database latency (5-20ms)
      const simulatedLatency = () => new Promise(resolve =>
        setTimeout(resolve, Math.floor(Math.random() * 15) + 5)
      );

      return simulatedLatency().then(() => {
        // Dashboard stats (check before count to avoid false match)
        if (sqlLower.includes('sum(') || sqlLower.includes('avg(') || sqlLower.includes('filter (')) {
          return {
            rows: [{
              total_quotes: String(mockData.quotations.length),
              total_value: String(mockData.quotations.reduce((sum, q) => sum + q.total_cents, 0)),
              won_count: String(mockData.quotations.filter(q => q.status === 'WON').length),
              avg_value: String(Math.floor(mockData.quotations.reduce((sum, q) => sum + q.total_cents, 0) / mockData.quotations.length))
            }]
          };
        }

        // Count query (simple count without aggregates)
        if (sqlLower.includes('count(*)') && !sqlLower.includes('sum(')) {
          if (sqlLower.includes('quotations')) {
            return { rows: [{ count: mockData.quotations.length }] };
          }
          return { rows: [{ count: 0 }] };
        }

        // List quotations with pagination
        if (sqlLower.includes('from quotations') && sqlLower.includes('limit')) {
          const limitMatch = sql.match(/LIMIT\s+(\d+)/i);
          const offsetMatch = sql.match(/OFFSET\s+(\d+)/i);
          const limit = limitMatch ? parseInt(limitMatch[1]) : 50;
          const offset = offsetMatch ? parseInt(offsetMatch[1]) : 0;

          let filtered = [...mockData.quotations];

          // Apply status filter
          if (params && params.length > 0) {
            const statusParam = params.find(p => typeof p === 'string' && ['DRAFT', 'SENT', 'WON', 'LOST', 'EXPIRED'].includes(p));
            if (statusParam) {
              filtered = filtered.filter(q => q.status === statusParam);
            }
          }

          // Apply search filter
          if (sqlLower.includes('ilike')) {
            const searchParam = params.find(p => typeof p === 'string' && p.includes('%'));
            if (searchParam) {
              const searchTerm = searchParam.replace(/%/g, '').toLowerCase();
              filtered = filtered.filter(q =>
                q.quotation_number.toLowerCase().includes(searchTerm) ||
                q.customer_name.toLowerCase().includes(searchTerm)
              );
            }
          }

          const sliced = filtered.slice(offset, offset + limit);
          return { rows: sliced };
        }

        // Single quotation
        if (sqlLower.includes('from quotations') && sqlLower.includes('where') && params?.[0]) {
          const quote = mockData.quotations.find(q => q.id === params[0]);
          return { rows: quote ? [quote] : [] };
        }

        return { rows: [] };
      });
    })
  };
};

describe('Performance Tests', () => {
  let app;
  let mockPool;
  let mockData;
  let authToken;

  beforeAll(() => {
    process.env.JWT_SECRET = TEST_CONFIG.JWT_SECRET;

    // Generate 1000 quotes for testing
    mockData = generateMockData(1000);
    mockPool = createMockPool(mockData);

    // Generate auth token
    authToken = jwt.sign(
      { userId: 1, email: 'test@test.com', role: 'admin', type: 'access' },
      TEST_CONFIG.JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Create test app
    app = express();
    app.use(express.json());

    // Auth middleware
    app.use((req, res, next) => {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      try {
        jwt.verify(authHeader.split(' ')[1], TEST_CONFIG.JWT_SECRET);
        req.user = { id: 1, role: 'admin' };
        next();
      } catch (err) {
        res.status(401).json({ error: 'Invalid token' });
      }
    });

    // GET /api/quotations - List with pagination
    app.get('/api/quotations', async (req, res) => {
      const { page = 1, limit = 50, status, search } = req.query;
      const offset = (parseInt(page) - 1) * parseInt(limit);

      const params = [];
      let paramIndex = 1;
      let whereConditions = [];

      if (status) {
        whereConditions.push(`status = $${paramIndex++}`);
        params.push(status);
      }

      if (search) {
        whereConditions.push(`(quotation_number ILIKE $${paramIndex} OR customer_name ILIKE $${paramIndex})`);
        params.push(`%${search}%`);
        paramIndex++;
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

      const countResult = await mockPool.query(
        `SELECT COUNT(*) FROM quotations ${whereClause}`,
        params
      );

      params.push(parseInt(limit), offset);
      const quotesResult = await mockPool.query(
        `SELECT * FROM quotations ${whereClause} ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
        params
      );

      res.json({
        data: quotesResult.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(countResult.rows[0].count)
        }
      });
    });

    // GET /api/quotations/:id - Single quote
    app.get('/api/quotations/:id', async (req, res) => {
      const result = await mockPool.query(
        'SELECT * FROM quotations WHERE id = $1',
        [parseInt(req.params.id)]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Not found' });
      }

      res.json(result.rows[0]);
    });

    // GET /api/dashboard/stats
    app.get('/api/dashboard/stats', async (req, res) => {
      const result = await mockPool.query(`
        SELECT
          COUNT(*) as total_quotes,
          SUM(total_cents) as total_value,
          COUNT(*) FILTER (WHERE status = 'WON') as won_count,
          AVG(total_cents) as avg_value
        FROM quotations
      `);

      res.json(result.rows[0]);
    });

    // POST /api/quotations - Create quote
    app.post('/api/quotations', async (req, res) => {
      const quote = {
        id: mockData.quotations.length + 1,
        quotation_number: `Q-NEW-${Date.now()}`,
        ...req.body,
        status: 'DRAFT',
        created_at: new Date().toISOString()
      };
      mockData.quotations.push(quote);
      res.status(201).json(quote);
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Quote List Performance', () => {
    test(`should list 50 quotes in < ${TEST_CONFIG.THRESHOLDS.QUOTE_LIST}ms`, async () => {
      const start = Date.now();

      const response = await request(app)
        .get('/api/quotations?page=1&limit=50')
        .set('Authorization', `Bearer ${authToken}`);

      const duration = Date.now() - start;

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBe(50);
      expect(duration).toBeLessThan(TEST_CONFIG.THRESHOLDS.QUOTE_LIST);

      console.log(`  Quote list (50 items): ${duration}ms`);
    });

    test(`should list quotes with status filter in < ${TEST_CONFIG.THRESHOLDS.QUOTE_LIST}ms`, async () => {
      const start = Date.now();

      const response = await request(app)
        .get('/api/quotations?status=WON&limit=50')
        .set('Authorization', `Bearer ${authToken}`);

      const duration = Date.now() - start;

      expect(response.status).toBe(200);
      expect(duration).toBeLessThan(TEST_CONFIG.THRESHOLDS.QUOTE_LIST);

      console.log(`  Quote list (filtered): ${duration}ms`);
    });

    test(`should paginate through 1000+ quotes efficiently`, async () => {
      const durations = [];

      // Test multiple pages
      for (let page = 1; page <= 5; page++) {
        const start = Date.now();

        const response = await request(app)
          .get(`/api/quotations?page=${page}&limit=50`)
          .set('Authorization', `Bearer ${authToken}`);

        const duration = Date.now() - start;
        durations.push(duration);

        expect(response.status).toBe(200);
        expect(duration).toBeLessThan(TEST_CONFIG.THRESHOLDS.QUOTE_LIST);
      }

      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      console.log(`  Pagination avg (5 pages): ${avgDuration.toFixed(0)}ms`);

      expect(avgDuration).toBeLessThan(TEST_CONFIG.THRESHOLDS.QUOTE_LIST);
    });
  });

  describe('Quote Detail Performance', () => {
    test(`should fetch single quote in < ${TEST_CONFIG.THRESHOLDS.QUOTE_DETAIL}ms`, async () => {
      const start = Date.now();

      const response = await request(app)
        .get('/api/quotations/1')
        .set('Authorization', `Bearer ${authToken}`);

      const duration = Date.now() - start;

      expect(response.status).toBe(200);
      expect(duration).toBeLessThan(TEST_CONFIG.THRESHOLDS.QUOTE_DETAIL);

      console.log(`  Quote detail: ${duration}ms`);
    });

    test('should handle random quote access efficiently', async () => {
      const durations = [];

      // Access 10 random quotes
      for (let i = 0; i < 10; i++) {
        const randomId = Math.floor(Math.random() * 1000) + 1;
        const start = Date.now();

        await request(app)
          .get(`/api/quotations/${randomId}`)
          .set('Authorization', `Bearer ${authToken}`);

        durations.push(Date.now() - start);
      }

      const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
      console.log(`  Random quote access avg: ${avgDuration.toFixed(0)}ms`);

      expect(avgDuration).toBeLessThan(TEST_CONFIG.THRESHOLDS.QUOTE_DETAIL);
    });
  });

  describe('Quote Search Performance', () => {
    test(`should search quotes in < ${TEST_CONFIG.THRESHOLDS.QUOTE_SEARCH}ms`, async () => {
      const start = Date.now();

      const response = await request(app)
        .get('/api/quotations?search=Customer%201')
        .set('Authorization', `Bearer ${authToken}`);

      const duration = Date.now() - start;

      expect(response.status).toBe(200);
      expect(duration).toBeLessThan(TEST_CONFIG.THRESHOLDS.QUOTE_SEARCH);

      console.log(`  Quote search: ${duration}ms`);
    });
  });

  describe('Dashboard Stats Performance', () => {
    test(`should load dashboard stats in < ${TEST_CONFIG.THRESHOLDS.DASHBOARD_STATS}ms`, async () => {
      const start = Date.now();

      const response = await request(app)
        .get('/api/dashboard/stats')
        .set('Authorization', `Bearer ${authToken}`);

      const duration = Date.now() - start;

      expect(response.status).toBe(200);
      expect(response.body.total_quotes).toBeDefined();
      expect(duration).toBeLessThan(TEST_CONFIG.THRESHOLDS.DASHBOARD_STATS);

      console.log(`  Dashboard stats: ${duration}ms`);
    });
  });

  describe('Quote Creation Performance', () => {
    test(`should create quote in < ${TEST_CONFIG.THRESHOLDS.QUOTE_CREATE}ms`, async () => {
      const start = Date.now();

      const response = await request(app)
        .post('/api/quotations')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          customer_id: 1,
          subtotal_cents: 50000,
          total_cents: 56500
        });

      const duration = Date.now() - start;

      expect(response.status).toBe(201);
      expect(duration).toBeLessThan(TEST_CONFIG.THRESHOLDS.QUOTE_CREATE);

      console.log(`  Quote creation: ${duration}ms`);
    });
  });

  describe('Concurrent Request Performance', () => {
    test('should handle 10 concurrent requests efficiently', async () => {
      const start = Date.now();

      // Send 10 requests concurrently
      const promises = Array.from({ length: 10 }, (_, i) =>
        request(app)
          .get(`/api/quotations?page=${i + 1}&limit=20`)
          .set('Authorization', `Bearer ${authToken}`)
      );

      const responses = await Promise.all(promises);

      const duration = Date.now() - start;

      // All should succeed
      responses.forEach(res => {
        expect(res.status).toBe(200);
      });

      // Total time should be reasonable (not 10x sequential)
      expect(duration).toBeLessThan(TEST_CONFIG.THRESHOLDS.QUOTE_LIST * 3);

      console.log(`  10 concurrent requests: ${duration}ms`);
    });
  });

  describe('Memory Efficiency', () => {
    test('should not leak memory during repeated requests', async () => {
      const initialMemory = process.memoryUsage().heapUsed;

      // Make 50 requests
      for (let i = 0; i < 50; i++) {
        await request(app)
          .get('/api/quotations?limit=50')
          .set('Authorization', `Bearer ${authToken}`);
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024; // MB

      console.log(`  Memory increase after 50 requests: ${memoryIncrease.toFixed(2)}MB`);

      // Should not increase by more than 50MB
      expect(memoryIncrease).toBeLessThan(50);
    });
  });
});
