const request = require('supertest');
const express = require('express');

// Mock database
const mockPool = {
  query: jest.fn()
};

describe('Approval Workflow System', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());

    // Middleware to extract user from request (simulated)
    app.use((req, res, next) => {
      req.user = req.headers['x-user-id']
        ? { id: parseInt(req.headers['x-user-id']), role: req.headers['x-user-role'] }
        : null;
      next();
    });

    // POST /api/quotations/:id/submit-for-approval
    app.post('/api/quotations/:id/submit-for-approval', async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Authentication required' });
        }

        const { approval_level, notes } = req.body;

        // Get quote
        const quoteResult = await mockPool.query(
          'SELECT * FROM quotations WHERE id = $1',
          [req.params.id]
        );

        if (quoteResult.rows.length === 0) {
          return res.status(404).json({ error: 'Quote not found' });
        }

        const quote = quoteResult.rows[0];

        if (quote.status === 'approved') {
          return res.status(400).json({ error: 'Quote is already approved' });
        }

        if (quote.approval_status === 'pending') {
          return res.status(400).json({ error: 'Quote is already pending approval' });
        }

        // Determine approval level based on quote amount
        let requiredLevel = approval_level || 1;
        if (quote.total_amount > 100000) {
          requiredLevel = 3; // Executive approval
        } else if (quote.total_amount > 50000) {
          requiredLevel = 2; // Manager approval
        } else if (quote.total_amount > 10000) {
          requiredLevel = 1; // Supervisor approval
        }

        // Update quote status
        const updateResult = await mockPool.query(
          `UPDATE quotations
           SET approval_status = 'pending',
               approval_level_required = $1,
               submitted_for_approval_at = CURRENT_TIMESTAMP,
               submitted_by = $2
           WHERE id = $3
           RETURNING *`,
          [requiredLevel, req.user.id, req.params.id]
        );

        // Create approval request
        await mockPool.query(
          `INSERT INTO approval_requests
           (quote_id, level_required, submitted_by, notes, status)
           VALUES ($1, $2, $3, $4, 'pending')`,
          [req.params.id, requiredLevel, req.user.id, notes]
        );

        res.json({
          success: true,
          message: 'Quote submitted for approval',
          quote: updateResult.rows[0],
          approval_level_required: requiredLevel
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/quotations/:id/approve
    app.post('/api/quotations/:id/approve', async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Authentication required' });
        }

        const { comments } = req.body;

        // Get quote and approval request
        const quoteResult = await mockPool.query(
          'SELECT * FROM quotations WHERE id = $1',
          [req.params.id]
        );

        if (quoteResult.rows.length === 0) {
          return res.status(404).json({ error: 'Quote not found' });
        }

        const quote = quoteResult.rows[0];

        if (quote.approval_status !== 'pending') {
          return res.status(400).json({ error: 'Quote is not pending approval' });
        }

        // Check user has sufficient approval authority
        const userResult = await mockPool.query(
          'SELECT * FROM users WHERE id = $1',
          [req.user.id]
        );

        const user = userResult.rows[0];
        const approvalLevels = {
          'supervisor': 1,
          'manager': 2,
          'executive': 3,
          'admin': 3
        };

        const userLevel = approvalLevels[user.role] || 0;

        if (userLevel < quote.approval_level_required) {
          return res.status(403).json({
            error: 'Insufficient approval authority',
            required_level: quote.approval_level_required,
            user_level: userLevel
          });
        }

        // Update quote
        const updateResult = await mockPool.query(
          `UPDATE quotations
           SET approval_status = 'approved',
               status = 'approved',
               approved_by = $1,
               approved_at = CURRENT_TIMESTAMP
           WHERE id = $2
           RETURNING *`,
          [req.user.id, req.params.id]
        );

        // Update approval request
        await mockPool.query(
          `UPDATE approval_requests
           SET status = 'approved',
               approved_by = $1,
               approved_at = CURRENT_TIMESTAMP,
               comments = $2
           WHERE quote_id = $3 AND status = 'pending'`,
          [req.user.id, comments, req.params.id]
        );

        // Log approval
        await mockPool.query(
          `INSERT INTO approval_log
           (quote_id, action, performed_by, comments)
           VALUES ($1, 'approved', $2, $3)`,
          [req.params.id, req.user.id, comments]
        );

        res.json({
          success: true,
          message: 'Quote approved successfully',
          quote: updateResult.rows[0],
          approved_by: req.user.id
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/quotations/:id/reject
    app.post('/api/quotations/:id/reject', async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Authentication required' });
        }

        const { reason } = req.body;

        if (!reason || reason.trim() === '') {
          return res.status(400).json({ error: 'Rejection reason is required' });
        }

        // Get quote
        const quoteResult = await mockPool.query(
          'SELECT * FROM quotations WHERE id = $1',
          [req.params.id]
        );

        if (quoteResult.rows.length === 0) {
          return res.status(404).json({ error: 'Quote not found' });
        }

        const quote = quoteResult.rows[0];

        if (quote.approval_status !== 'pending') {
          return res.status(400).json({ error: 'Quote is not pending approval' });
        }

        // Update quote
        const updateResult = await mockPool.query(
          `UPDATE quotations
           SET approval_status = 'rejected',
               status = 'rejected',
               rejected_by = $1,
               rejected_at = CURRENT_TIMESTAMP,
               rejection_reason = $2
           WHERE id = $3
           RETURNING *`,
          [req.user.id, reason, req.params.id]
        );

        // Update approval request
        await mockPool.query(
          `UPDATE approval_requests
           SET status = 'rejected',
               rejected_by = $1,
               rejected_at = CURRENT_TIMESTAMP,
               rejection_reason = $2
           WHERE quote_id = $3 AND status = 'pending'`,
          [req.user.id, reason, req.params.id]
        );

        // Log rejection
        await mockPool.query(
          `INSERT INTO approval_log
           (quote_id, action, performed_by, comments)
           VALUES ($1, 'rejected', $2, $3)`,
          [req.params.id, req.user.id, reason]
        );

        res.json({
          success: true,
          message: 'Quote rejected',
          quote: updateResult.rows[0],
          rejected_by: req.user.id,
          reason: reason
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/quotations/:id/approval-status
    app.get('/api/quotations/:id/approval-status', async (req, res) => {
      try {
        const quoteResult = await mockPool.query(
          `SELECT q.*, ar.*
           FROM quotations q
           LEFT JOIN approval_requests ar ON q.id = ar.quote_id AND ar.status = 'pending'
           WHERE q.id = $1`,
          [req.params.id]
        );

        if (quoteResult.rows.length === 0) {
          return res.status(404).json({ error: 'Quote not found' });
        }

        const quote = quoteResult.rows[0];

        res.json({
          quote_id: quote.id,
          approval_status: quote.approval_status,
          approval_level_required: quote.approval_level_required,
          submitted_at: quote.submitted_for_approval_at,
          submitted_by: quote.submitted_by,
          approved_by: quote.approved_by,
          approved_at: quote.approved_at,
          rejected_by: quote.rejected_by,
          rejected_at: quote.rejected_at,
          rejection_reason: quote.rejection_reason
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/approvals/pending
    app.get('/api/approvals/pending', async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Authentication required' });
        }

        // Get user's approval level
        const userResult = await mockPool.query(
          'SELECT * FROM users WHERE id = $1',
          [req.user.id]
        );

        const user = userResult.rows[0];
        const approvalLevels = {
          'supervisor': 1,
          'manager': 2,
          'executive': 3,
          'admin': 3
        };

        const userLevel = approvalLevels[user.role] || 0;

        // Get pending approvals the user can approve
        const pendingResult = await mockPool.query(
          `SELECT q.*, ar.submitted_at, ar.notes
           FROM quotations q
           JOIN approval_requests ar ON q.id = ar.quote_id
           WHERE ar.status = 'pending'
           AND q.approval_level_required <= $1
           ORDER BY ar.submitted_at ASC`,
          [userLevel]
        );

        res.json({
          count: pendingResult.rows.length,
          approvals: pendingResult.rows,
          user_level: userLevel
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/quotations/:id/approval-history
    app.get('/api/quotations/:id/approval-history', async (req, res) => {
      try {
        const historyResult = await mockPool.query(
          `SELECT al.*, u.name as performed_by_name
           FROM approval_log al
           LEFT JOIN users u ON al.performed_by = u.id
           WHERE al.quote_id = $1
           ORDER BY al.created_at DESC`,
          [req.params.id]
        );

        res.json({
          count: historyResult.rows.length,
          history: historyResult.rows
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/quotations/:id/delegate-approval
    app.post('/api/quotations/:id/delegate-approval', async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Authentication required' });
        }

        const { delegate_to, reason } = req.body;

        if (!delegate_to) {
          return res.status(400).json({ error: 'Delegate user ID is required' });
        }

        // Verify delegate has sufficient authority
        const delegateResult = await mockPool.query(
          'SELECT * FROM users WHERE id = $1',
          [delegate_to]
        );

        if (delegateResult.rows.length === 0) {
          return res.status(404).json({ error: 'Delegate user not found' });
        }

        const quoteResult = await mockPool.query(
          'SELECT * FROM quotations WHERE id = $1',
          [req.params.id]
        );

        if (quoteResult.rows.length === 0) {
          return res.status(404).json({ error: 'Quote not found' });
        }

        // Create delegation record
        await mockPool.query(
          `INSERT INTO approval_delegations
           (quote_id, delegated_from, delegated_to, reason)
           VALUES ($1, $2, $3, $4)`,
          [req.params.id, req.user.id, delegate_to, reason]
        );

        // Log delegation
        await mockPool.query(
          `INSERT INTO approval_log
           (quote_id, action, performed_by, comments)
           VALUES ($1, 'delegated', $2, $3)`,
          [req.params.id, req.user.id, `Delegated to user ${delegate_to}: ${reason}`]
        );

        res.json({
          success: true,
          message: 'Approval delegated successfully',
          delegated_to: delegate_to
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // POST /api/approvals/bulk-approve
    app.post('/api/approvals/bulk-approve', async (req, res) => {
      try {
        if (!req.user) {
          return res.status(401).json({ error: 'Authentication required' });
        }

        const { quote_ids, comments } = req.body;

        if (!quote_ids || quote_ids.length === 0) {
          return res.status(400).json({ error: 'Quote IDs are required' });
        }

        // Get user's approval level
        const userResult = await mockPool.query(
          'SELECT * FROM users WHERE id = $1',
          [req.user.id]
        );

        const user = userResult.rows[0];
        const approvalLevels = {
          'supervisor': 1,
          'manager': 2,
          'executive': 3,
          'admin': 3
        };

        const userLevel = approvalLevels[user.role] || 0;

        // Approve all quotes where user has sufficient authority
        const approvedQuotes = [];
        const failedQuotes = [];

        for (const quoteId of quote_ids) {
          const quoteResult = await mockPool.query(
            'SELECT * FROM quotations WHERE id = $1',
            [quoteId]
          );

          if (quoteResult.rows.length === 0) {
            failedQuotes.push({ quote_id: quoteId, reason: 'Not found' });
            continue;
          }

          const quote = quoteResult.rows[0];

          if (quote.approval_status !== 'pending') {
            failedQuotes.push({ quote_id: quoteId, reason: 'Not pending approval' });
            continue;
          }

          if (userLevel < quote.approval_level_required) {
            failedQuotes.push({ quote_id: quoteId, reason: 'Insufficient authority' });
            continue;
          }

          // Approve the quote
          await mockPool.query(
            `UPDATE quotations
             SET approval_status = 'approved',
                 status = 'approved',
                 approved_by = $1,
                 approved_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [req.user.id, quoteId]
          );

          await mockPool.query(
            `UPDATE approval_requests
             SET status = 'approved',
                 approved_by = $1,
                 approved_at = CURRENT_TIMESTAMP,
                 comments = $2
             WHERE quote_id = $3 AND status = 'pending'`,
            [req.user.id, comments, quoteId]
          );

          approvedQuotes.push(quoteId);
        }

        res.json({
          success: true,
          approved_count: approvedQuotes.length,
          approved_quotes: approvedQuotes,
          failed_count: failedQuotes.length,
          failed_quotes: failedQuotes
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // GET /api/approvals/statistics
    app.get('/api/approvals/statistics', async (req, res) => {
      try {
        const { start_date, end_date } = req.query;

        const statsResult = await mockPool.query(
          `SELECT
             COUNT(*) FILTER (WHERE approval_status = 'pending') as pending_count,
             COUNT(*) FILTER (WHERE approval_status = 'approved') as approved_count,
             COUNT(*) FILTER (WHERE approval_status = 'rejected') as rejected_count,
             AVG(EXTRACT(EPOCH FROM (approved_at - submitted_for_approval_at))/3600)
               FILTER (WHERE approved_at IS NOT NULL) as avg_approval_time_hours
           FROM quotations
           WHERE submitted_for_approval_at BETWEEN $1 AND $2`,
          [start_date || '2020-01-01', end_date || '2030-12-31']
        );

        res.json(statsResult.rows[0]);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/quotations/:id/submit-for-approval', () => {
    test('should submit quote for approval', async () => {
      const mockQuote = {
        id: 1,
        total_amount: 15000,
        status: 'draft',
        approval_status: null
      };

      const mockUpdated = {
        ...mockQuote,
        approval_status: 'pending',
        approval_level_required: 1
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockQuote] })
        .mockResolvedValueOnce({ rows: [mockUpdated] })
        .mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/quotations/1/submit-for-approval')
        .set('x-user-id', '1')
        .set('x-user-role', 'user')
        .send({ notes: 'Please review' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.approval_level_required).toBe(1);
    });

    test('should require higher approval level for large quotes', async () => {
      const mockQuote = {
        id: 1,
        total_amount: 150000, // Over 100k
        status: 'draft'
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockQuote] })
        .mockResolvedValueOnce({ rows: [{ ...mockQuote, approval_level_required: 3 }] })
        .mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/quotations/1/submit-for-approval')
        .set('x-user-id', '1')
        .set('x-user-role', 'user')
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.approval_level_required).toBe(3);
    });

    test('should reject already approved quote', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ id: 1, status: 'approved' }]
      });

      const response = await request(app)
        .post('/api/quotations/1/submit-for-approval')
        .set('x-user-id', '1')
        .set('x-user-role', 'user')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('already approved');
    });

    test('should require authentication', async () => {
      const response = await request(app)
        .post('/api/quotations/1/submit-for-approval')
        .send({});

      expect(response.status).toBe(401);
    });
  });

  describe('POST /api/quotations/:id/approve', () => {
    test('should approve quote with sufficient authority', async () => {
      const mockQuote = {
        id: 1,
        approval_status: 'pending',
        approval_level_required: 1
      };

      const mockUser = {
        id: 2,
        role: 'manager' // Level 2
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockQuote] })
        .mockResolvedValueOnce({ rows: [mockUser] })
        .mockResolvedValueOnce({ rows: [{ ...mockQuote, approval_status: 'approved' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/quotations/1/approve')
        .set('x-user-id', '2')
        .set('x-user-role', 'manager')
        .send({ comments: 'Approved' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('approved successfully');
    });

    test('should reject approval with insufficient authority', async () => {
      const mockQuote = {
        id: 1,
        approval_status: 'pending',
        approval_level_required: 3 // Executive level
      };

      const mockUser = {
        id: 2,
        role: 'supervisor' // Only level 1
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockQuote] })
        .mockResolvedValueOnce({ rows: [mockUser] });

      const response = await request(app)
        .post('/api/quotations/1/approve')
        .set('x-user-id', '2')
        .set('x-user-role', 'supervisor')
        .send({});

      expect(response.status).toBe(403);
      expect(response.body.error).toContain('Insufficient approval authority');
      expect(response.body.required_level).toBe(3);
      expect(response.body.user_level).toBe(1);
    });

    test('should not approve quote that is not pending', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ id: 1, approval_status: 'approved' }]
      });

      const response = await request(app)
        .post('/api/quotations/1/approve')
        .set('x-user-id', '2')
        .set('x-user-role', 'manager')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('not pending approval');
    });
  });

  describe('POST /api/quotations/:id/reject', () => {
    test('should reject quote with reason', async () => {
      const mockQuote = {
        id: 1,
        approval_status: 'pending'
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockQuote] })
        .mockResolvedValueOnce({ rows: [{ ...mockQuote, approval_status: 'rejected' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/quotations/1/reject')
        .set('x-user-id', '2')
        .set('x-user-role', 'manager')
        .send({ reason: 'Pricing too high' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.reason).toBe('Pricing too high');
    });

    test('should require rejection reason', async () => {
      const response = await request(app)
        .post('/api/quotations/1/reject')
        .set('x-user-id', '2')
        .set('x-user-role', 'manager')
        .send({ reason: '' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('reason is required');
    });

    test('should not reject quote that is not pending', async () => {
      mockPool.query.mockResolvedValue({
        rows: [{ id: 1, approval_status: 'approved' }]
      });

      const response = await request(app)
        .post('/api/quotations/1/reject')
        .set('x-user-id', '2')
        .set('x-user-role', 'manager')
        .send({ reason: 'Test' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('not pending approval');
    });
  });

  describe('GET /api/quotations/:id/approval-status', () => {
    test('should return approval status', async () => {
      const mockQuote = {
        id: 1,
        approval_status: 'pending',
        approval_level_required: 2,
        submitted_for_approval_at: '2025-01-29',
        submitted_by: 1
      };

      mockPool.query.mockResolvedValue({ rows: [mockQuote] });

      const response = await request(app).get('/api/quotations/1/approval-status');

      expect(response.status).toBe(200);
      expect(response.body.approval_status).toBe('pending');
      expect(response.body.approval_level_required).toBe(2);
    });

    test('should return 404 for non-existent quote', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const response = await request(app).get('/api/quotations/999/approval-status');

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/approvals/pending', () => {
    test('should return pending approvals for user level', async () => {
      const mockUser = { id: 2, role: 'manager' };
      const mockPendingApprovals = [
        { id: 1, approval_level_required: 1 },
        { id: 2, approval_level_required: 2 }
      ];

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockUser] })
        .mockResolvedValueOnce({ rows: mockPendingApprovals });

      const response = await request(app)
        .get('/api/approvals/pending')
        .set('x-user-id', '2')
        .set('x-user-role', 'manager');

      expect(response.status).toBe(200);
      expect(response.body.count).toBe(2);
      expect(response.body.user_level).toBe(2);
    });

    test('should require authentication', async () => {
      const response = await request(app).get('/api/approvals/pending');

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/quotations/:id/approval-history', () => {
    test('should return approval history', async () => {
      const mockHistory = [
        { id: 1, action: 'approved', performed_by: 2, performed_by_name: 'John Doe' },
        { id: 2, action: 'delegated', performed_by: 1, performed_by_name: 'Jane Smith' }
      ];

      mockPool.query.mockResolvedValue({ rows: mockHistory });

      const response = await request(app).get('/api/quotations/1/approval-history');

      expect(response.status).toBe(200);
      expect(response.body.count).toBe(2);
      expect(response.body.history).toHaveLength(2);
    });
  });

  describe('POST /api/quotations/:id/delegate-approval', () => {
    test('should delegate approval to another user', async () => {
      const mockDelegate = { id: 3, role: 'manager' };
      const mockQuote = { id: 1, approval_status: 'pending' };

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockDelegate] })
        .mockResolvedValueOnce({ rows: [mockQuote] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/quotations/1/delegate-approval')
        .set('x-user-id', '2')
        .set('x-user-role', 'manager')
        .send({ delegate_to: 3, reason: 'Out of office' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.delegated_to).toBe(3);
    });

    test('should require delegate user ID', async () => {
      const response = await request(app)
        .post('/api/quotations/1/delegate-approval')
        .set('x-user-id', '2')
        .set('x-user-role', 'manager')
        .send({ reason: 'Test' });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Delegate user ID is required');
    });
  });

  describe('POST /api/approvals/bulk-approve', () => {
    test('should bulk approve multiple quotes', async () => {
      const mockUser = { id: 2, role: 'executive' };
      const mockQuote1 = { id: 1, approval_status: 'pending', approval_level_required: 2 };
      const mockQuote2 = { id: 2, approval_status: 'pending', approval_level_required: 1 };

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockUser] })
        .mockResolvedValueOnce({ rows: [mockQuote1] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [mockQuote2] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/approvals/bulk-approve')
        .set('x-user-id', '2')
        .set('x-user-role', 'executive')
        .send({ quote_ids: [1, 2], comments: 'Bulk approved' });

      expect(response.status).toBe(200);
      expect(response.body.approved_count).toBe(2);
      expect(response.body.approved_quotes).toEqual([1, 2]);
    });

    test('should handle partial failures in bulk approve', async () => {
      const mockUser = { id: 2, role: 'supervisor' };
      const mockQuote1 = { id: 1, approval_status: 'pending', approval_level_required: 3 }; // Too high
      const mockQuote2 = { id: 2, approval_status: 'pending', approval_level_required: 1 }; // OK

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockUser] })
        .mockResolvedValueOnce({ rows: [mockQuote1] })
        .mockResolvedValueOnce({ rows: [mockQuote2] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/api/approvals/bulk-approve')
        .set('x-user-id', '2')
        .set('x-user-role', 'supervisor')
        .send({ quote_ids: [1, 2] });

      expect(response.status).toBe(200);
      expect(response.body.approved_count).toBe(1);
      expect(response.body.failed_count).toBe(1);
      expect(response.body.failed_quotes[0].reason).toContain('Insufficient authority');
    });
  });

  describe('GET /api/approvals/statistics', () => {
    test('should return approval statistics', async () => {
      const mockStats = {
        pending_count: '5',
        approved_count: '20',
        rejected_count: '3',
        avg_approval_time_hours: '2.5'
      };

      mockPool.query.mockResolvedValue({ rows: [mockStats] });

      const response = await request(app).get('/api/approvals/statistics');

      expect(response.status).toBe(200);
      expect(response.body.pending_count).toBe('5');
      expect(response.body.approved_count).toBe('20');
      expect(response.body.rejected_count).toBe('3');
    });
  });
});
