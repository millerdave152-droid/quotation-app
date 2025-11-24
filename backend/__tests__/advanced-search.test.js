const request = require('supertest');
const express = require('express');

const mockPool = { query: jest.fn() };

describe('Advanced Search System', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());

    // POST /api/search/quotes
    app.post('/api/search/quotes', async (req, res) => {
      try {
        const {
          query: searchQuery,
          filters = {},
          sort = 'created_at',
          order = 'DESC',
          limit = 50,
          offset = 0
        } = req.body;

        let sql = 'SELECT q.*, c.name as customer_name FROM quotations q LEFT JOIN customers c ON q.customer_id = c.id WHERE 1=1';
        const params = [];
        let paramCount = 0;

        // Full-text search
        if (searchQuery) {
          paramCount++;
          sql += ` AND (q.quote_number ILIKE $${paramCount} OR c.name ILIKE $${paramCount} OR q.notes ILIKE $${paramCount})`;
          params.push(`%${searchQuery}%`);
        }

        // Status filter
        if (filters.status) {
          paramCount++;
          sql += ` AND q.status = $${paramCount}`;
          params.push(filters.status);
        }

        // Customer filter
        if (filters.customer_id) {
          paramCount++;
          sql += ` AND q.customer_id = $${paramCount}`;
          params.push(filters.customer_id);
        }

        // Date range
        if (filters.start_date) {
          paramCount++;
          sql += ` AND q.created_at >= $${paramCount}`;
          params.push(filters.start_date);
        }
        if (filters.end_date) {
          paramCount++;
          sql += ` AND q.created_at <= $${paramCount}`;
          params.push(filters.end_date);
        }

        // Amount range
        if (filters.min_amount) {
          paramCount++;
          sql += ` AND q.total_amount >= $${paramCount}`;
          params.push(parseFloat(filters.min_amount));
        }
        if (filters.max_amount) {
          paramCount++;
          sql += ` AND q.total_amount <= $${paramCount}`;
          params.push(parseFloat(filters.max_amount));
        }

        // Sorting
        const validSortFields = ['created_at', 'total_amount', 'quote_number', 'status'];
        const sortField = validSortFields.includes(sort) ? sort : 'created_at';
        const sortOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
        sql += ` ORDER BY q.${sortField} ${sortOrder}`;

        // Pagination
        paramCount++;
        sql += ` LIMIT $${paramCount}`;
        params.push(limit);
        paramCount++;
        sql += ` OFFSET $${paramCount}`;
        params.push(offset);

        const result = await mockPool.query(sql, params);

        // Get total count
        let countSql = 'SELECT COUNT(*) FROM quotations q LEFT JOIN customers c ON q.customer_id = c.id WHERE 1=1';
        const countParams = [];
        let countParamCount = 0;

        if (searchQuery) {
          countParamCount++;
          countSql += ` AND (q.quote_number ILIKE $${countParamCount} OR c.name ILIKE $${countParamCount} OR q.notes ILIKE $${countParamCount})`;
          countParams.push(`%${searchQuery}%`);
        }
        if (filters.status) {
          countParamCount++;
          countSql += ` AND q.status = $${countParamCount}`;
          countParams.push(filters.status);
        }
        if (filters.customer_id) {
          countParamCount++;
          countSql += ` AND q.customer_id = $${countParamCount}`;
          countParams.push(filters.customer_id);
        }

        const countResult = await mockPool.query(countSql, countParams);

        res.json({
          quotes: result.rows,
          total: parseInt(countResult.rows[0].count),
          limit,
          offset
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/search/suggestions
    app.get('/api/search/suggestions', async (req, res) => {
      try {
        const { query: searchQuery, type } = req.query;

        if (!searchQuery || searchQuery.length < 2) {
          return res.json({ suggestions: [] });
        }

        let suggestions = [];

        if (type === 'customer' || !type) {
          const customerResult = await mockPool.query(
            'SELECT id, name, email FROM customers WHERE name ILIKE $1 LIMIT 5',
            [`%${searchQuery}%`]
          );
          suggestions = [...suggestions, ...customerResult.rows.map(c => ({ type: 'customer', ...c }))];
        }

        if (type === 'quote' || !type) {
          const quoteResult = await mockPool.query(
            'SELECT id, quote_number FROM quotations WHERE quote_number ILIKE $1 LIMIT 5',
            [`%${searchQuery}%`]
          );
          suggestions = [...suggestions, ...quoteResult.rows.map(q => ({ type: 'quote', ...q }))];
        }

        res.json({ suggestions });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/search/saved-searches
    app.post('/api/search/saved-searches', async (req, res) => {
      try {
        const { name, search_params, user_id } = req.body;

        if (!name || !search_params) {
          return res.status(400).json({ error: 'Name and search parameters required' });
        }

        const result = await mockPool.query(
          'INSERT INTO saved_searches (name, search_params, user_id) VALUES ($1, $2, $3) RETURNING *',
          [name, JSON.stringify(search_params), user_id]
        );

        res.status(201).json({ success: true, saved_search: result.rows[0] });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/search/saved-searches/:userId
    app.get('/api/search/saved-searches/:userId', async (req, res) => {
      try {
        const result = await mockPool.query(
          'SELECT * FROM saved_searches WHERE user_id = $1 ORDER BY created_at DESC',
          [parseInt(req.params.userId)]
        );

        res.json({ saved_searches: result.rows });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // DELETE /api/search/saved-searches/:id
    app.delete('/api/search/saved-searches/:id', async (req, res) => {
      try {
        await mockPool.query('DELETE FROM saved_searches WHERE id = $1', [parseInt(req.params.id)]);
        res.json({ success: true, message: 'Saved search deleted' });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/search/recent
    app.post('/api/search/recent', async (req, res) => {
      try {
        const { search_query, user_id } = req.body;

        await mockPool.query(
          'INSERT INTO search_history (search_query, user_id) VALUES ($1, $2)',
          [search_query, user_id]
        );

        res.status(201).json({ success: true });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/search/recent/:userId
    app.get('/api/search/recent/:userId', async (req, res) => {
      try {
        const result = await mockPool.query(
          'SELECT DISTINCT search_query FROM search_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10',
          [parseInt(req.params.userId)]
        );

        res.json({ recent_searches: result.rows.map(r => r.search_query) });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/search/filters/options
    app.get('/api/search/filters/options', async (req, res) => {
      try {
        const statuses = await mockPool.query('SELECT DISTINCT status FROM quotations');
        const customers = await mockPool.query('SELECT id, name FROM customers ORDER BY name');

        res.json({
          statuses: statuses.rows.map(s => s.status),
          customers: customers.rows
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  });

  beforeEach(() => jest.clearAllMocks());

  describe('POST /api/search/quotes', () => {
    test('should search quotes with text query', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            { id: 1, quote_number: 'Q-001', customer_name: 'ACME Corp' },
            { id: 2, quote_number: 'Q-002', customer_name: 'ACME Industries' }
          ]
        })
        .mockResolvedValueOnce({ rows: [{ count: 2 }] });

      const response = await request(app)
        .post('/api/search/quotes')
        .send({ query: 'ACME' });

      expect(response.status).toBe(200);
      expect(response.body.quotes).toHaveLength(2);
      expect(response.body.total).toBe(2);
    });

    test('should filter by status', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 1, status: 'pending' }] })
        .mockResolvedValueOnce({ rows: [{ count: 1 }] });

      const response = await request(app)
        .post('/api/search/quotes')
        .send({ filters: { status: 'pending' } });

      expect(response.status).toBe(200);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('status'),
        expect.arrayContaining(['pending'])
      );
    });

    test('should filter by date range', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] });

      await request(app)
        .post('/api/search/quotes')
        .send({
          filters: {
            start_date: '2024-01-01',
            end_date: '2024-12-31'
          }
        });

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('created_at >='),
        expect.arrayContaining(['2024-01-01', '2024-12-31'])
      );
    });

    test('should filter by amount range', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] });

      await request(app)
        .post('/api/search/quotes')
        .send({
          filters: {
            min_amount: 1000,
            max_amount: 5000
          }
        });

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('total_amount'),
        expect.arrayContaining([1000, 5000])
      );
    });

    test('should support custom sorting', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] });

      await request(app)
        .post('/api/search/quotes')
        .send({
          sort: 'total_amount',
          order: 'ASC'
        });

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY q.total_amount ASC'),
        expect.any(Array)
      );
    });

    test('should support pagination', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: 0 }] });

      const response = await request(app)
        .post('/api/search/quotes')
        .send({
          limit: 20,
          offset: 40
        });

      expect(response.body.limit).toBe(20);
      expect(response.body.offset).toBe(40);
    });
  });

  describe('GET /api/search/suggestions', () => {
    test('should provide customer suggestions', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          { id: 1, name: 'ACME Corp', email: 'acme@example.com' }
        ]
      });

      const response = await request(app)
        .get('/api/search/suggestions')
        .query({ query: 'ACME', type: 'customer' });

      expect(response.status).toBe(200);
      expect(response.body.suggestions).toHaveLength(1);
      expect(response.body.suggestions[0].type).toBe('customer');
    });

    test('should require minimum query length', async () => {
      const response = await request(app)
        .get('/api/search/suggestions')
        .query({ query: 'A' });

      expect(response.status).toBe(200);
      expect(response.body.suggestions).toHaveLength(0);
    });
  });

  describe('Saved Searches', () => {
    test('should save search', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ id: 1, name: 'My Search', search_params: '{}' }]
      });

      const response = await request(app)
        .post('/api/search/saved-searches')
        .send({
          name: 'My Search',
          search_params: { status: 'pending' },
          user_id: 1
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
    });

    test('should get saved searches for user', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          { id: 1, name: 'Search 1' },
          { id: 2, name: 'Search 2' }
        ]
      });

      const response = await request(app)
        .get('/api/search/saved-searches/1');

      expect(response.status).toBe(200);
      expect(response.body.saved_searches).toHaveLength(2);
    });

    test('should delete saved search', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .delete('/api/search/saved-searches/1');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('Search History', () => {
    test('should save search to history', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .post('/api/search/recent')
        .send({ search_query: 'ACME', user_id: 1 });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
    });

    test('should get recent searches for user', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          { search_query: 'ACME' },
          { search_query: 'Tech' }
        ]
      });

      const response = await request(app)
        .get('/api/search/recent/1');

      expect(response.status).toBe(200);
      expect(response.body.recent_searches).toHaveLength(2);
    });
  });

  describe('GET /api/search/filters/options', () => {
    test('should get available filter options', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{ status: 'pending' }, { status: 'accepted' }]
        })
        .mockResolvedValueOnce({
          rows: [{ id: 1, name: 'ACME Corp' }]
        });

      const response = await request(app)
        .get('/api/search/filters/options');

      expect(response.status).toBe(200);
      expect(response.body.statuses).toHaveLength(2);
      expect(response.body.customers).toHaveLength(1);
    });
  });
});
