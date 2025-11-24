const request = require('supertest');
const express = require('express');

const app = express();
app.use(express.json());

// Mock pool for database operations
const mockPool = {
  query: jest.fn()
};

describe('Quote Approval Workflow System', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/approval-rules', () => {
    app.post('/api/approval-rules', async (req, res) => {
      try {
        const { name, conditions, approvers, order_level, created_by } = req.body;

        if (!name || !conditions || !approvers || !order_level) {
          return res.status(400).json({ error: 'All fields are required' });
        }

        if (approvers.length === 0) {
          return res.status(400).json({ error: 'At least one approver is required' });
        }

        const result = await mockPool.query(
          'INSERT INTO approval_rules (name, conditions, approvers, order_level, created_by, is_active) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
          [name, JSON.stringify(conditions), JSON.stringify(approvers), order_level, created_by, true]
        );

        res.json({ success: true, rule: result.rows[0] });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    test('should create approval rule', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{
          id: 1,
          name: 'High Value Quotes',
          conditions: { min_amount: 10000 },
          approvers: [2, 3],
          order_level: 1,
          is_active: true
        }]
      });

      const response = await request(app)
        .post('/api/approval-rules')
        .send({
          name: 'High Value Quotes',
          conditions: { min_amount: 10000 },
          approvers: [2, 3],
          order_level: 1,
          created_by: 1
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.rule.name).toBe('High Value Quotes');
    });

    test('should require all fields', async () => {
      const response = await request(app)
        .post('/api/approval-rules')
        .send({ name: 'Test' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('required');
    });

    test('should require at least one approver', async () => {
      const response = await request(app)
        .post('/api/approval-rules')
        .send({
          name: 'Test',
          conditions: {},
          approvers: [],
          order_level: 1
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('approver');
    });
  });

  describe('GET /api/approval-rules', () => {
    app.get('/api/approval-rules', async (req, res) => {
      try {
        const { active_only } = req.query;

        let query = 'SELECT * FROM approval_rules';
        const params = [];

        if (active_only === 'true') {
          query += ' WHERE is_active = true';
        }

        query += ' ORDER BY order_level ASC';

        const result = await mockPool.query(query, params);
        res.json({ rules: result.rows });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    test('should get all approval rules', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          { id: 1, name: 'Rule 1', order_level: 1, is_active: true },
          { id: 2, name: 'Rule 2', order_level: 2, is_active: false }
        ]
      });

      const response = await request(app).get('/api/approval-rules');

      expect(response.status).toBe(200);
      expect(response.body.rules).toHaveLength(2);
    });

    test('should filter active rules only', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ id: 1, name: 'Rule 1', order_level: 1, is_active: true }]
      });

      const response = await request(app)
        .get('/api/approval-rules')
        .query({ active_only: 'true' });

      expect(response.status).toBe(200);
      expect(response.body.rules).toHaveLength(1);
    });
  });

  describe('POST /api/quotes/:id/submit-for-approval', () => {
    app.post('/api/quotes/:id/submit-for-approval', async (req, res) => {
      try {
        const quoteId = req.params.id;
        const { submitted_by, notes } = req.body;

        // Get quote details
        const quoteResult = await mockPool.query(
          'SELECT * FROM quotations WHERE id = $1',
          [quoteId]
        );

        if (quoteResult.rows.length === 0) {
          return res.status(404).json({ error: 'Quote not found' });
        }

        const quote = quoteResult.rows[0];

        // Get applicable approval rules
        const rulesResult = await mockPool.query(
          'SELECT * FROM approval_rules WHERE is_active = true ORDER BY order_level ASC'
        );

        const applicableRules = rulesResult.rows.filter(rule => {
          const conditions = JSON.parse(rule.conditions);
          if (conditions.min_amount && quote.total_amount >= conditions.min_amount) {
            return true;
          }
          return false;
        });

        if (applicableRules.length === 0) {
          // Auto-approve if no rules apply
          await mockPool.query(
            'UPDATE quotations SET status = $1, approved_at = NOW() WHERE id = $2',
            ['approved', quoteId]
          );
          return res.json({ success: true, auto_approved: true });
        }

        // Create approval requests
        for (const rule of applicableRules) {
          const approvers = JSON.parse(rule.approvers);
          for (const approverId of approvers) {
            await mockPool.query(
              'INSERT INTO approval_requests (quotation_id, rule_id, approver_id, status, level) VALUES ($1, $2, $3, $4, $5)',
              [quoteId, rule.id, approverId, 'pending', rule.order_level]
            );
          }
        }

        // Update quote status
        await mockPool.query(
          'UPDATE quotations SET status = $1 WHERE id = $2',
          ['pending_approval', quoteId]
        );

        res.json({ success: true, approval_requests_created: true });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    test('should submit quote for approval', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{ id: 1, total_amount: 15000, status: 'draft' }]
        })
        .mockResolvedValueOnce({
          rows: [{ id: 1, order_level: 1, approvers: '[2, 3]', conditions: '{"min_amount": 10000}' }]
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/quotes/1/submit-for-approval')
        .send({ submitted_by: 1, notes: 'Please review' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('should auto-approve if no rules apply', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{ id: 1, total_amount: 1000, status: 'draft' }]
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/quotes/1/submit-for-approval')
        .send({ submitted_by: 1 });

      expect(response.status).toBe(200);
      expect(response.body.auto_approved).toBe(true);
    });

    test('should return 404 for non-existent quote', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .post('/api/quotes/999/submit-for-approval')
        .send({ submitted_by: 1 });

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/approval-requests/:id/approve', () => {
    app.post('/api/approval-requests/:id/approve', async (req, res) => {
      try {
        const requestId = req.params.id;
        const { approver_id, comments } = req.body;

        // Get approval request
        const requestResult = await mockPool.query(
          'SELECT * FROM approval_requests WHERE id = $1',
          [requestId]
        );

        if (requestResult.rows.length === 0) {
          return res.status(404).json({ error: 'Approval request not found' });
        }

        const approvalRequest = requestResult.rows[0];

        if (approvalRequest.approver_id !== approver_id) {
          return res.status(403).json({ error: 'Not authorized to approve this request' });
        }

        if (approvalRequest.status !== 'pending') {
          return res.status(400).json({ error: 'Request already processed' });
        }

        // Update approval request
        await mockPool.query(
          'UPDATE approval_requests SET status = $1, approved_at = NOW(), comments = $2 WHERE id = $3',
          ['approved', comments, requestId]
        );

        // Check if all approvals for this quote are complete
        const pendingResult = await mockPool.query(
          'SELECT COUNT(*) as pending_count FROM approval_requests WHERE quotation_id = $1 AND status = $2',
          [approvalRequest.quotation_id, 'pending']
        );

        if (parseInt(pendingResult.rows[0].pending_count) === 0) {
          // All approvals complete, update quote status
          await mockPool.query(
            'UPDATE quotations SET status = $1, approved_at = NOW() WHERE id = $2',
            ['approved', approvalRequest.quotation_id]
          );
        }

        res.json({ success: true, all_approvals_complete: parseInt(pendingResult.rows[0].pending_count) === 0 });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    test('should approve request', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{ id: 1, quotation_id: 1, approver_id: 2, status: 'pending', level: 1 }]
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ pending_count: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/approval-requests/1/approve')
        .send({ approver_id: 2, comments: 'Approved' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.all_approvals_complete).toBe(true);
    });

    test('should check authorization', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ id: 1, quotation_id: 1, approver_id: 2, status: 'pending' }]
      });

      const response = await request(app)
        .post('/api/approval-requests/1/approve')
        .send({ approver_id: 3, comments: 'Approved' });

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('authorized');
    });

    test('should prevent duplicate approval', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ id: 1, quotation_id: 1, approver_id: 2, status: 'approved' }]
      });

      const response = await request(app)
        .post('/api/approval-requests/1/approve')
        .send({ approver_id: 2 });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('already processed');
    });
  });

  describe('POST /api/approval-requests/:id/reject', () => {
    app.post('/api/approval-requests/:id/reject', async (req, res) => {
      try {
        const requestId = req.params.id;
        const { approver_id, reason } = req.body;

        if (!reason) {
          return res.status(400).json({ error: 'Rejection reason is required' });
        }

        const requestResult = await mockPool.query(
          'SELECT * FROM approval_requests WHERE id = $1',
          [requestId]
        );

        if (requestResult.rows.length === 0) {
          return res.status(404).json({ error: 'Approval request not found' });
        }

        const approvalRequest = requestResult.rows[0];

        if (approvalRequest.approver_id !== approver_id) {
          return res.status(403).json({ error: 'Not authorized' });
        }

        // Update approval request
        await mockPool.query(
          'UPDATE approval_requests SET status = $1, rejected_at = NOW(), comments = $2 WHERE id = $3',
          ['rejected', reason, requestId]
        );

        // Update quote status
        await mockPool.query(
          'UPDATE quotations SET status = $1 WHERE id = $2',
          ['rejected', approvalRequest.quotation_id]
        );

        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    test('should reject request', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{ id: 1, quotation_id: 1, approver_id: 2, status: 'pending' }]
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/approval-requests/1/reject')
        .send({ approver_id: 2, reason: 'Price too high' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('should require rejection reason', async () => {
      const response = await request(app)
        .post('/api/approval-requests/1/reject')
        .send({ approver_id: 2 });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('reason');
    });
  });

  describe('GET /api/users/:id/pending-approvals', () => {
    app.get('/api/users/:id/pending-approvals', async (req, res) => {
      try {
        const userId = req.params.id;

        const result = await mockPool.query(
          `SELECT ar.*, q.quote_number, q.total_amount, c.name as customer_name
          FROM approval_requests ar
          INNER JOIN quotations q ON ar.quotation_id = q.id
          INNER JOIN customers c ON q.customer_id = c.id
          WHERE ar.approver_id = $1 AND ar.status = $2
          ORDER BY ar.created_at DESC`,
          [userId, 'pending']
        );

        res.json({ approvals: result.rows });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    test('should get pending approvals for user', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          { id: 1, quotation_id: 1, quote_number: 'Q-001', total_amount: 15000, customer_name: 'Acme Corp' },
          { id: 2, quotation_id: 2, quote_number: 'Q-002', total_amount: 20000, customer_name: 'Tech Inc' }
        ]
      });

      const response = await request(app).get('/api/users/2/pending-approvals');

      expect(response.status).toBe(200);
      expect(response.body.approvals).toHaveLength(2);
    });
  });

  describe('GET /api/quotes/:id/approval-history', () => {
    app.get('/api/quotes/:id/approval-history', async (req, res) => {
      try {
        const quoteId = req.params.id;

        const result = await mockPool.query(
          `SELECT ar.*, u.name as approver_name, r.name as rule_name
          FROM approval_requests ar
          INNER JOIN users u ON ar.approver_id = u.id
          LEFT JOIN approval_rules r ON ar.rule_id = r.id
          WHERE ar.quotation_id = $1
          ORDER BY ar.level ASC, ar.created_at ASC`,
          [quoteId]
        );

        res.json({ history: result.rows });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    test('should get approval history for quote', async () => {
      mockPool.query.mockResolvedValue({
        rows: [
          { id: 1, level: 1, status: 'approved', approver_name: 'John Doe', rule_name: 'High Value' },
          { id: 2, level: 2, status: 'pending', approver_name: 'Jane Smith', rule_name: 'Executive' }
        ]
      });

      const response = await request(app).get('/api/quotes/1/approval-history');

      expect(response.status).toBe(200);
      expect(response.body.history).toHaveLength(2);
    });
  });

  describe('POST /api/approval-requests/:id/delegate', () => {
    app.post('/api/approval-requests/:id/delegate', async (req, res) => {
      try {
        const requestId = req.params.id;
        const { from_user_id, to_user_id, reason } = req.body;

        if (!to_user_id) {
          return res.status(400).json({ error: 'Delegate user is required' });
        }

        const requestResult = await mockPool.query(
          'SELECT * FROM approval_requests WHERE id = $1',
          [requestId]
        );

        if (requestResult.rows.length === 0) {
          return res.status(404).json({ error: 'Approval request not found' });
        }

        const approvalRequest = requestResult.rows[0];

        if (approvalRequest.approver_id !== from_user_id) {
          return res.status(403).json({ error: 'Not authorized' });
        }

        // Update approval request with new approver
        await mockPool.query(
          'UPDATE approval_requests SET approver_id = $1, delegated_from = $2, delegation_reason = $3 WHERE id = $4',
          [to_user_id, from_user_id, reason, requestId]
        );

        res.json({ success: true });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    test('should delegate approval request', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{ id: 1, approver_id: 2, status: 'pending' }]
        })
        .mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/approval-requests/1/delegate')
        .send({
          from_user_id: 2,
          to_user_id: 3,
          reason: 'Out of office'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('should require delegate user', async () => {
      const response = await request(app)
        .post('/api/approval-requests/1/delegate')
        .send({ from_user_id: 2 });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/approval-analytics', () => {
    app.get('/api/approval-analytics', async (req, res) => {
      try {
        const { start_date, end_date } = req.query;

        const result = await mockPool.query(
          `SELECT
            COUNT(*) as total_requests,
            COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_count,
            COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected_count,
            COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
            AVG(EXTRACT(EPOCH FROM (approved_at - created_at))/3600) as avg_approval_time_hours
          FROM approval_requests
          WHERE created_at >= $1 AND created_at <= $2`,
          [start_date || '2024-01-01', end_date || '2024-12-31']
        );

        res.json({ analytics: result.rows[0] });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    test('should get approval analytics', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{
          total_requests: 100,
          approved_count: 70,
          rejected_count: 20,
          pending_count: 10,
          avg_approval_time_hours: 24.5
        }]
      });

      const response = await request(app)
        .get('/api/approval-analytics')
        .query({ start_date: '2024-01-01', end_date: '2024-12-31' });

      expect(response.status).toBe(200);
      expect(response.body.analytics.total_requests).toBe(100);
      expect(response.body.analytics.approved_count).toBe(70);
    });
  });

  describe('PATCH /api/approval-rules/:id', () => {
    app.patch('/api/approval-rules/:id', async (req, res) => {
      try {
        const ruleId = req.params.id;
        const { is_active } = req.body;

        const result = await mockPool.query(
          'UPDATE approval_rules SET is_active = $1 WHERE id = $2 RETURNING *',
          [is_active, ruleId]
        );

        if (result.rows.length === 0) {
          return res.status(404).json({ error: 'Rule not found' });
        }

        res.json({ success: true, rule: result.rows[0] });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    test('should update approval rule status', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ id: 1, name: 'Test Rule', is_active: false }]
      });

      const response = await request(app)
        .patch('/api/approval-rules/1')
        .send({ is_active: false });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('should return 404 for non-existent rule', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .patch('/api/approval-rules/999')
        .send({ is_active: false });

      expect(response.status).toBe(404);
    });
  });
});
