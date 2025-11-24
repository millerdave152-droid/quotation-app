const request = require('supertest');
const express = require('express');

const mockPool = { query: jest.fn() };

describe('Collaborative Quoting System', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());

    // POST /api/quotes/:id/comments
    app.post('/api/quotes/:id/comments', async (req, res) => {
      try {
        const quoteId = parseInt(req.params.id);
        const { content, created_by, mentions = [] } = req.body;

        if (!content) {
          return res.status(400).json({ error: 'Comment content required' });
        }

        const result = await mockPool.query(
          'INSERT INTO quote_comments (quotation_id, content, created_by, is_internal) VALUES ($1, $2, $3, $4) RETURNING *',
          [quoteId, content, created_by, true]
        );

        const comment = result.rows[0];

        // Process mentions
        if (mentions.length > 0) {
          for (const userId of mentions) {
            await mockPool.query(
              'INSERT INTO comment_mentions (comment_id, user_id) VALUES ($1, $2)',
              [comment.id, userId]
            );
          }
        }

        res.status(201).json({ success: true, comment });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/quotes/:id/comments
    app.get('/api/quotes/:id/comments', async (req, res) => {
      try {
        const quoteId = parseInt(req.params.id);

        const result = await mockPool.query(
          `SELECT c.*, u.name as created_by_name,
           array_agg(m.user_id) as mentioned_users
           FROM quote_comments c
           LEFT JOIN users u ON c.created_by = u.id
           LEFT JOIN comment_mentions m ON c.id = m.comment_id
           WHERE c.quotation_id = $1 AND c.is_internal = true
           GROUP BY c.id, u.name
           ORDER BY c.created_at DESC`,
          [quoteId]
        );

        res.json({ comments: result.rows });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/quotes/:id/tasks
    app.post('/api/quotes/:id/tasks', async (req, res) => {
      try {
        const quoteId = parseInt(req.params.id);
        const { title, description, assigned_to, due_date, created_by } = req.body;

        if (!title || !assigned_to) {
          return res.status(400).json({ error: 'Title and assigned_to required' });
        }

        const result = await mockPool.query(
          'INSERT INTO quote_tasks (quotation_id, title, description, assigned_to, due_date, created_by, status) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
          [quoteId, title, description, assigned_to, due_date, created_by, 'pending']
        );

        res.status(201).json({ success: true, task: result.rows[0] });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/quotes/:id/tasks
    app.get('/api/quotes/:id/tasks', async (req, res) => {
      try {
        const quoteId = parseInt(req.params.id);

        const result = await mockPool.query(
          `SELECT t.*, u1.name as assigned_to_name, u2.name as created_by_name
           FROM quote_tasks t
           LEFT JOIN users u1 ON t.assigned_to = u1.id
           LEFT JOIN users u2 ON t.created_by = u2.id
           WHERE t.quotation_id = $1
           ORDER BY t.created_at DESC`,
          [quoteId]
        );

        res.json({ tasks: result.rows });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // PATCH /api/tasks/:id/status
    app.patch('/api/tasks/:id/status', async (req, res) => {
      try {
        const taskId = parseInt(req.params.id);
        const { status } = req.body;

        const validStatuses = ['pending', 'in_progress', 'completed', 'cancelled'];
        if (!validStatuses.includes(status)) {
          return res.status(400).json({ error: 'Invalid status' });
        }

        const result = await mockPool.query(
          'UPDATE quote_tasks SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
          [status, taskId]
        );

        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Task not found' });
        }

        res.json({ success: true, task: result.rows[0] });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/quotes/:id/revision-requests
    app.post('/api/quotes/:id/revision-requests', async (req, res) => {
      try {
        const quoteId = parseInt(req.params.id);
        const { requested_changes, requested_by, assigned_to } = req.body;

        if (!requested_changes) {
          return res.status(400).json({ error: 'Requested changes required' });
        }

        const result = await mockPool.query(
          'INSERT INTO revision_requests (quotation_id, requested_changes, requested_by, assigned_to, status) VALUES ($1, $2, $3, $4, $5) RETURNING *',
          [quoteId, requested_changes, requested_by, assigned_to, 'pending']
        );

        res.status(201).json({ success: true, revision_request: result.rows[0] });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/quotes/:id/revision-requests
    app.get('/api/quotes/:id/revision-requests', async (req, res) => {
      try {
        const quoteId = parseInt(req.params.id);

        const result = await mockPool.query(
          `SELECT r.*, u1.name as requested_by_name, u2.name as assigned_to_name
           FROM revision_requests r
           LEFT JOIN users u1 ON r.requested_by = u1.id
           LEFT JOIN users u2 ON r.assigned_to = u2.id
           WHERE r.quotation_id = $1
           ORDER BY r.created_at DESC`,
          [quoteId]
        );

        res.json({ revision_requests: result.rows });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/users/:id/mentions
    app.get('/api/users/:id/mentions', async (req, res) => {
      try {
        const userId = parseInt(req.params.id);

        const result = await mockPool.query(
          `SELECT c.*, q.quote_number, u.name as mentioned_by
           FROM comment_mentions cm
           JOIN quote_comments c ON cm.comment_id = c.id
           JOIN quotations q ON c.quotation_id = q.id
           JOIN users u ON c.created_by = u.id
           WHERE cm.user_id = $1 AND cm.read_at IS NULL
           ORDER BY c.created_at DESC`,
          [userId]
        );

        res.json({ mentions: result.rows, unread_count: result.rows.length });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/users/:id/assigned-tasks
    app.get('/api/users/:id/assigned-tasks', async (req, res) => {
      try {
        const userId = parseInt(req.params.id);
        const { status } = req.query;

        let query = `SELECT t.*, q.quote_number
                     FROM quote_tasks t
                     JOIN quotations q ON t.quotation_id = q.id
                     WHERE t.assigned_to = $1`;
        const params = [userId];

        if (status) {
          query += ' AND t.status = $2';
          params.push(status);
        }

        query += ' ORDER BY t.due_date ASC';

        const result = await mockPool.query(query, params);

        res.json({ tasks: result.rows });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/quotes/:id/collaboration-activity
    app.get('/api/quotes/:id/collaboration-activity', async (req, res) => {
      try {
        const quoteId = parseInt(req.params.id);

        const result = await mockPool.query(
          `SELECT 'comment' as type, c.id, c.content as description, c.created_at, u.name as user_name
           FROM quote_comments c
           JOIN users u ON c.created_by = u.id
           WHERE c.quotation_id = $1 AND c.is_internal = true
           UNION ALL
           SELECT 'task' as type, t.id, t.title as description, t.created_at, u.name as user_name
           FROM quote_tasks t
           JOIN users u ON t.created_by = u.id
           WHERE t.quotation_id = $1
           ORDER BY created_at DESC
           LIMIT 50`,
          [quoteId]
        );

        res.json({ activities: result.rows });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  });

  beforeEach(() => jest.clearAllMocks());

  describe('POST /api/quotes/:id/comments', () => {
    test('should add internal comment to quote', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{
          id: 1,
          quotation_id: 1,
          content: 'Internal team note',
          created_by: 1,
          is_internal: true
        }]
      });

      const response = await request(app)
        .post('/api/quotes/1/comments')
        .send({
          content: 'Internal team note',
          created_by: 1
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.comment.content).toBe('Internal team note');
    });

    test('should process mentions in comment', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 1, content: '@john please review' }] })
        .mockResolvedValue({ rows: [] });

      const response = await request(app)
        .post('/api/quotes/1/comments')
        .send({
          content: '@john please review',
          created_by: 1,
          mentions: [2, 3]
        });

      expect(response.status).toBe(201);
      expect(mockPool.query).toHaveBeenCalledTimes(3); // comment insert + 2 mention inserts
    });

    test('should require comment content', async () => {
      const response = await request(app)
        .post('/api/quotes/1/comments')
        .send({ created_by: 1 });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/quotes/:id/comments', () => {
    test('should get all internal comments for quote', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          { id: 1, content: 'Comment 1', created_by_name: 'John' },
          { id: 2, content: 'Comment 2', created_by_name: 'Jane' }
        ]
      });

      const response = await request(app)
        .get('/api/quotes/1/comments');

      expect(response.status).toBe(200);
      expect(response.body.comments).toHaveLength(2);
    });
  });

  describe('POST /api/quotes/:id/tasks', () => {
    test('should create task for quote', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{
          id: 1,
          title: 'Review pricing',
          assigned_to: 2,
          status: 'pending'
        }]
      });

      const response = await request(app)
        .post('/api/quotes/1/tasks')
        .send({
          title: 'Review pricing',
          description: 'Check if discount is appropriate',
          assigned_to: 2,
          due_date: '2024-12-31',
          created_by: 1
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.task.title).toBe('Review pricing');
    });

    test('should require title and assigned_to', async () => {
      const response = await request(app)
        .post('/api/quotes/1/tasks')
        .send({ created_by: 1 });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/quotes/:id/tasks', () => {
    test('should get all tasks for quote', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          { id: 1, title: 'Task 1', status: 'pending' },
          { id: 2, title: 'Task 2', status: 'completed' }
        ]
      });

      const response = await request(app)
        .get('/api/quotes/1/tasks');

      expect(response.status).toBe(200);
      expect(response.body.tasks).toHaveLength(2);
    });
  });

  describe('PATCH /api/tasks/:id/status', () => {
    test('should update task status', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ id: 1, status: 'completed' }]
      });

      const response = await request(app)
        .patch('/api/tasks/1/status')
        .send({ status: 'completed' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.task.status).toBe('completed');
    });

    test('should validate status', async () => {
      const response = await request(app)
        .patch('/api/tasks/1/status')
        .send({ status: 'invalid_status' });

      expect(response.status).toBe(400);
    });

    test('should return 404 for non-existent task', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .patch('/api/tasks/999/status')
        .send({ status: 'completed' });

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/quotes/:id/revision-requests', () => {
    test('should create revision request', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{
          id: 1,
          requested_changes: 'Update pricing section',
          status: 'pending'
        }]
      });

      const response = await request(app)
        .post('/api/quotes/1/revision-requests')
        .send({
          requested_changes: 'Update pricing section',
          requested_by: 1,
          assigned_to: 2
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
    });

    test('should require requested_changes', async () => {
      const response = await request(app)
        .post('/api/quotes/1/revision-requests')
        .send({ requested_by: 1 });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/quotes/:id/revision-requests', () => {
    test('should get all revision requests', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          { id: 1, requested_changes: 'Change 1', status: 'pending' },
          { id: 2, requested_changes: 'Change 2', status: 'completed' }
        ]
      });

      const response = await request(app)
        .get('/api/quotes/1/revision-requests');

      expect(response.status).toBe(200);
      expect(response.body.revision_requests).toHaveLength(2);
    });
  });

  describe('GET /api/users/:id/mentions', () => {
    test('should get unread mentions for user', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          { id: 1, content: '@user please review', quote_number: 'Q-001' },
          { id: 2, content: '@user thoughts?', quote_number: 'Q-002' }
        ]
      });

      const response = await request(app)
        .get('/api/users/1/mentions');

      expect(response.status).toBe(200);
      expect(response.body.mentions).toHaveLength(2);
      expect(response.body.unread_count).toBe(2);
    });
  });

  describe('GET /api/users/:id/assigned-tasks', () => {
    test('should get tasks assigned to user', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          { id: 1, title: 'Task 1', quote_number: 'Q-001' },
          { id: 2, title: 'Task 2', quote_number: 'Q-002' }
        ]
      });

      const response = await request(app)
        .get('/api/users/1/assigned-tasks');

      expect(response.status).toBe(200);
      expect(response.body.tasks).toHaveLength(2);
    });

    test('should filter tasks by status', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      await request(app)
        .get('/api/users/1/assigned-tasks')
        .query({ status: 'pending' });

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('status'),
        [1, 'pending']
      );
    });
  });

  describe('GET /api/quotes/:id/collaboration-activity', () => {
    test('should get all collaboration activity for quote', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          { type: 'comment', id: 1, description: 'Added comment' },
          { type: 'task', id: 1, description: 'Created task' }
        ]
      });

      const response = await request(app)
        .get('/api/quotes/1/collaboration-activity');

      expect(response.status).toBe(200);
      expect(response.body.activities).toHaveLength(2);
    });
  });
});
