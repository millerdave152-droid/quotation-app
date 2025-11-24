const request = require('supertest');
const express = require('express');

// Mock database
const mockPool = {
  query: jest.fn()
};

describe('Activity Feed System', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());

    // Middleware to extract user from request
    app.use((req, res, next) => {
      req.user = req.headers['x-user-id']
        ? { id: parseInt(req.headers['x-user-id']), role: req.headers['x-user-role'] || 'user' }
        : null;
      next();
    });

    // POST /api/activities
    app.post('/api/activities', async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Authentication required' });
        }

        const {
          activity_type,
          quotation_id,
          entity_type,
          entity_id,
          description,
          metadata
        } = req.body;

        if (!activity_type || !description) {
          return res.status(400).json({
            error: 'Activity type and description are required'
          });
        }

        const validTypes = [
          'quote_created',
          'quote_updated',
          'quote_status_changed',
          'quote_sent',
          'quote_accepted',
          'quote_rejected',
          'quote_expired',
          'quote_deleted',
          'attachment_uploaded',
          'attachment_deleted',
          'comment_added',
          'approval_requested',
          'approval_granted',
          'approval_denied',
          'discount_applied',
          'version_created',
          'pdf_generated',
          'email_sent'
        ];

        if (!validTypes.includes(activity_type)) {
          return res.status(400).json({
            error: 'Invalid activity type'
          });
        }

        const result = await mockPool.query(
          `INSERT INTO activities
           (activity_type, quotation_id, entity_type, entity_id, description,
            metadata, user_id, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
           RETURNING *`,
          [
            activity_type,
            quotation_id || null,
            entity_type || null,
            entity_id || null,
            description,
            JSON.stringify(metadata || {}),
            req.user.id
          ]
        );

        res.status(201).json({
          success: true,
          activity: result.rows[0]
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/activities
    app.get('/api/activities', async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Authentication required' });
        }

        const {
          activity_type,
          quotation_id,
          user_id,
          start_date,
          end_date,
          limit,
          offset,
          search
        } = req.query;

        let query = `
          SELECT a.*, u.name as user_name, u.email as user_email,
                 q.quote_number, q.customer_id
          FROM activities a
          LEFT JOIN users u ON a.user_id = u.id
          LEFT JOIN quotations q ON a.quotation_id = q.id
          WHERE 1=1
        `;
        const params = [];
        let paramCount = 0;

        if (activity_type) {
          paramCount++;
          query += ` AND a.activity_type = $${paramCount}`;
          params.push(activity_type);
        }

        if (quotation_id) {
          paramCount++;
          query += ` AND a.quotation_id = $${paramCount}`;
          params.push(parseInt(quotation_id));
        }

        if (user_id) {
          paramCount++;
          query += ` AND a.user_id = $${paramCount}`;
          params.push(parseInt(user_id));
        }

        if (start_date) {
          paramCount++;
          query += ` AND a.created_at >= $${paramCount}`;
          params.push(start_date);
        }

        if (end_date) {
          paramCount++;
          query += ` AND a.created_at <= $${paramCount}`;
          params.push(end_date);
        }

        if (search) {
          paramCount++;
          query += ` AND a.description ILIKE $${paramCount}`;
          params.push(`%${search}%`);
        }

        query += ' ORDER BY a.created_at DESC';

        if (limit) {
          paramCount++;
          query += ` LIMIT $${paramCount}`;
          params.push(parseInt(limit));
        }

        if (offset) {
          paramCount++;
          query += ` OFFSET $${paramCount}`;
          params.push(parseInt(offset));
        }

        const result = await mockPool.query(query, params);

        // Get total count
        let countQuery = 'SELECT COUNT(*) FROM activities a WHERE 1=1';
        const countParams = [];
        let countParamCount = 0;

        if (activity_type) {
          countParamCount++;
          countQuery += ` AND a.activity_type = $${countParamCount}`;
          countParams.push(activity_type);
        }

        if (quotation_id) {
          countParamCount++;
          countQuery += ` AND a.quotation_id = $${countParamCount}`;
          countParams.push(parseInt(quotation_id));
        }

        const countResult = await mockPool.query(countQuery, countParams);

        res.json({
          activities: result.rows,
          total: parseInt(countResult.rows[0].count),
          limit: parseInt(limit) || null,
          offset: parseInt(offset) || 0
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/quotations/:id/activities
    app.get('/api/quotations/:id/activities', async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Authentication required' });
        }

        const quotationId = parseInt(req.params.id);
        const { limit, offset } = req.query;

        let query = `
          SELECT a.*, u.name as user_name, u.email as user_email
          FROM activities a
          LEFT JOIN users u ON a.user_id = u.id
          WHERE a.quotation_id = $1
          ORDER BY a.created_at DESC
        `;
        const params = [quotationId];

        if (limit) {
          query += ` LIMIT $2`;
          params.push(parseInt(limit));
        }

        if (offset) {
          query += ` OFFSET $${params.length + 1}`;
          params.push(parseInt(offset));
        }

        const result = await mockPool.query(query, params);

        res.json({
          activities: result.rows,
          quotation_id: quotationId
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/activities/user/:id
    app.get('/api/activities/user/:id', async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Authentication required' });
        }

        const userId = parseInt(req.params.id);
        const { limit, offset } = req.query;

        let query = `
          SELECT a.*, u.name as user_name, u.email as user_email,
                 q.quote_number
          FROM activities a
          LEFT JOIN users u ON a.user_id = u.id
          LEFT JOIN quotations q ON a.quotation_id = q.id
          WHERE a.user_id = $1
          ORDER BY a.created_at DESC
        `;
        const params = [userId];

        if (limit) {
          query += ` LIMIT $2`;
          params.push(parseInt(limit));
        }

        if (offset) {
          query += ` OFFSET $${params.length + 1}`;
          params.push(parseInt(offset));
        }

        const result = await mockPool.query(query, params);

        res.json({
          activities: result.rows,
          user_id: userId
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/activities/statistics
    app.get('/api/activities/statistics', async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Authentication required' });
        }

        const { start_date, end_date } = req.query;

        const result = await mockPool.query(
          `SELECT
             COUNT(*) as total_activities,
             COUNT(DISTINCT user_id) as active_users,
             COUNT(DISTINCT quotation_id) as quotes_with_activity
           FROM activities
           WHERE created_at BETWEEN $1 AND $2`,
          [start_date || '2024-01-01', end_date || '2024-12-31']
        );

        const typeResult = await mockPool.query(
          `SELECT activity_type, COUNT(*) as count
           FROM activities
           WHERE created_at BETWEEN $1 AND $2
           GROUP BY activity_type
           ORDER BY count DESC`,
          [start_date || '2024-01-01', end_date || '2024-12-31']
        );

        const userResult = await mockPool.query(
          `SELECT u.id, u.name, COUNT(a.id) as activity_count
           FROM users u
           LEFT JOIN activities a ON u.id = a.user_id
           WHERE a.created_at BETWEEN $1 AND $2
           GROUP BY u.id, u.name
           ORDER BY activity_count DESC
           LIMIT 10`,
          [start_date || '2024-01-01', end_date || '2024-12-31']
        );

        res.json({
          total_activities: parseInt(result.rows[0].total_activities || 0),
          active_users: parseInt(result.rows[0].active_users || 0),
          quotes_with_activity: parseInt(result.rows[0].quotes_with_activity || 0),
          by_type: typeResult.rows.map(row => ({
            activity_type: row.activity_type,
            count: parseInt(row.count)
          })),
          top_users: userResult.rows.map(row => ({
            user_id: row.id,
            name: row.name,
            activity_count: parseInt(row.activity_count)
          }))
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/activities/timeline
    app.get('/api/activities/timeline', async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Authentication required' });
        }

        const { start_date, end_date, interval } = req.query;

        if (!interval || !['daily', 'weekly', 'monthly'].includes(interval)) {
          return res.status(400).json({ error: 'Invalid interval. Must be daily, weekly, or monthly' });
        }

        let dateFormat;
        if (interval === 'daily') {
          dateFormat = 'YYYY-MM-DD';
        } else if (interval === 'weekly') {
          dateFormat = 'IYYY-IW';
        } else {
          dateFormat = 'YYYY-MM';
        }

        const result = await mockPool.query(
          `SELECT
             TO_CHAR(created_at, $3) as period,
             COUNT(*) as activity_count,
             COUNT(DISTINCT user_id) as unique_users,
             COUNT(DISTINCT quotation_id) as unique_quotes
           FROM activities
           WHERE created_at BETWEEN $1 AND $2
           GROUP BY period
           ORDER BY period`,
          [start_date || '2024-01-01', end_date || '2024-12-31', dateFormat]
        );

        res.json({
          interval: interval,
          timeline: result.rows.map(row => ({
            period: row.period,
            activity_count: parseInt(row.activity_count),
            unique_users: parseInt(row.unique_users),
            unique_quotes: parseInt(row.unique_quotes)
          }))
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // DELETE /api/activities/:id
    app.delete('/api/activities/:id', async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Authentication required' });
        }

        if (req.user.role !== 'admin') {
          return res.status(403).json({ error: 'Admin access required' });
        }

        const activityId = parseInt(req.params.id);

        const result = await mockPool.query(
          'SELECT id FROM activities WHERE id = $1',
          [activityId]
        );

        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Activity not found' });
        }

        await mockPool.query('DELETE FROM activities WHERE id = $1', [activityId]);

        res.json({
          success: true,
          message: 'Activity deleted successfully'
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/activities', () => {
    test('should create activity log entry', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{
          id: 1,
          activity_type: 'quote_created',
          quotation_id: 1,
          description: 'Quote #Q-001 created',
          user_id: 1,
          created_at: '2024-01-15T10:00:00Z'
        }]
      });

      const response = await request(app)
        .post('/api/activities')
        .set('x-user-id', '1')
        .send({
          activity_type: 'quote_created',
          quotation_id: 1,
          description: 'Quote #Q-001 created',
          metadata: { quote_number: 'Q-001' }
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.activity.activity_type).toBe('quote_created');
    });

    test('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/activities')
        .set('x-user-id', '1')
        .send({
          quotation_id: 1
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('required');
    });

    test('should validate activity type', async () => {
      const response = await request(app)
        .post('/api/activities')
        .set('x-user-id', '1')
        .send({
          activity_type: 'invalid_type',
          description: 'Test activity'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid activity type');
    });

    test('should require authentication', async () => {
      const response = await request(app)
        .post('/api/activities')
        .send({
          activity_type: 'quote_created',
          description: 'Test'
        });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/activities', () => {
    test('should fetch activity feed', async () => {
      const mockActivities = [
        {
          id: 1,
          activity_type: 'quote_created',
          description: 'Quote created',
          user_name: 'John Doe',
          created_at: '2024-01-15T10:00:00Z'
        },
        {
          id: 2,
          activity_type: 'quote_sent',
          description: 'Quote sent to customer',
          user_name: 'Jane Smith',
          created_at: '2024-01-15T11:00:00Z'
        }
      ];

      mockPool.query
        .mockResolvedValueOnce({ rows: mockActivities })
        .mockResolvedValueOnce({ rows: [{ count: '2' }] });

      const response = await request(app)
        .get('/api/activities')
        .set('x-user-id', '1');

      expect(response.status).toBe(200);
      expect(response.body.activities).toHaveLength(2);
      expect(response.body.total).toBe(2);
    });

    test('should filter by activity type', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const response = await request(app)
        .get('/api/activities')
        .set('x-user-id', '1')
        .query({ activity_type: 'quote_created' });

      expect(response.status).toBe(200);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('activity_type'),
        expect.arrayContaining(['quote_created'])
      );
    });

    test('should filter by quotation', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const response = await request(app)
        .get('/api/activities')
        .set('x-user-id', '1')
        .query({ quotation_id: '1' });

      expect(response.status).toBe(200);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('quotation_id'),
        expect.arrayContaining([1])
      );
    });

    test('should support pagination', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '100' }] });

      const response = await request(app)
        .get('/api/activities')
        .set('x-user-id', '1')
        .query({ limit: '20', offset: '40' });

      expect(response.status).toBe(200);
      expect(response.body.limit).toBe(20);
      expect(response.body.offset).toBe(40);
    });

    test('should support search', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const response = await request(app)
        .get('/api/activities')
        .set('x-user-id', '1')
        .query({ search: 'quote created' });

      expect(response.status).toBe(200);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('ILIKE'),
        expect.arrayContaining(['%quote created%'])
      );
    });
  });

  describe('GET /api/quotations/:id/activities', () => {
    test('should fetch activities for quotation', async () => {
      const mockActivities = [
        { id: 1, activity_type: 'quote_created', description: 'Created', user_name: 'John' },
        { id: 2, activity_type: 'quote_sent', description: 'Sent', user_name: 'Jane' }
      ];

      mockPool.query.mockResolvedValue({ rows: mockActivities });

      const response = await request(app)
        .get('/api/quotations/1/activities')
        .set('x-user-id', '1');

      expect(response.status).toBe(200);
      expect(response.body.activities).toHaveLength(2);
      expect(response.body.quotation_id).toBe(1);
    });
  });

  describe('GET /api/activities/user/:id', () => {
    test('should fetch activities by user', async () => {
      const mockActivities = [
        { id: 1, activity_type: 'quote_created', user_name: 'John Doe' },
        { id: 2, activity_type: 'quote_updated', user_name: 'John Doe' }
      ];

      mockPool.query.mockResolvedValue({ rows: mockActivities });

      const response = await request(app)
        .get('/api/activities/user/1')
        .set('x-user-id', '1');

      expect(response.status).toBe(200);
      expect(response.body.activities).toHaveLength(2);
      expect(response.body.user_id).toBe(1);
    });
  });

  describe('GET /api/activities/statistics', () => {
    test('should return activity statistics', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            total_activities: '150',
            active_users: '10',
            quotes_with_activity: '50'
          }]
        })
        .mockResolvedValueOnce({
          rows: [
            { activity_type: 'quote_created', count: '50' },
            { activity_type: 'quote_sent', count: '40' }
          ]
        })
        .mockResolvedValueOnce({
          rows: [
            { id: 1, name: 'John Doe', activity_count: '30' }
          ]
        });

      const response = await request(app)
        .get('/api/activities/statistics')
        .set('x-user-id', '1')
        .query({ start_date: '2024-01-01', end_date: '2024-12-31' });

      expect(response.status).toBe(200);
      expect(response.body.total_activities).toBe(150);
      expect(response.body.by_type).toHaveLength(2);
      expect(response.body.top_users).toHaveLength(1);
    });
  });

  describe('GET /api/activities/timeline', () => {
    test('should return daily activity timeline', async () => {
      const mockTimeline = [
        { period: '2024-01-01', activity_count: '10', unique_users: '3', unique_quotes: '5' },
        { period: '2024-01-02', activity_count: '15', unique_users: '4', unique_quotes: '6' }
      ];

      mockPool.query.mockResolvedValue({ rows: mockTimeline });

      const response = await request(app)
        .get('/api/activities/timeline')
        .set('x-user-id', '1')
        .query({ interval: 'daily', start_date: '2024-01-01', end_date: '2024-01-31' });

      expect(response.status).toBe(200);
      expect(response.body.interval).toBe('daily');
      expect(response.body.timeline).toHaveLength(2);
    });

    test('should validate interval parameter', async () => {
      const response = await request(app)
        .get('/api/activities/timeline')
        .set('x-user-id', '1')
        .query({ interval: 'invalid' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid interval');
    });
  });

  describe('DELETE /api/activities/:id', () => {
    test('should delete activity (admin only)', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })
        .mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .delete('/api/activities/1')
        .set('x-user-id', '1')
        .set('x-user-role', 'admin');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('should require admin role', async () => {
      const response = await request(app)
        .delete('/api/activities/1')
        .set('x-user-id', '1')
        .set('x-user-role', 'user');

      expect(response.status).toBe(403);
    });

    test('should return 404 if activity not found', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .delete('/api/activities/999')
        .set('x-user-id', '1')
        .set('x-user-role', 'admin');

      expect(response.status).toBe(404);
    });
  });
});
