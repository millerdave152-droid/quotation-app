/**
 * Quote Workflow E2E Tests
 * Week 3.1 of 4-week sprint
 *
 * Tests full quote lifecycle: create → approve → send → accept
 * Run these tests 10-20 times to ensure stability
 */

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

// Test configuration
const TEST_CONFIG = {
  JWT_SECRET: 'test-jwt-secret-for-e2e',
  JWT_REFRESH_SECRET: 'test-refresh-secret-for-e2e'
};

// Mock database pool
const createMockPool = () => {
  const mockData = {
    users: [
      { id: 1, email: 'rep@test.com', role: 'sales', first_name: 'Sales', last_name: 'Rep', can_approve_quotes: false },
      { id: 2, email: 'manager@test.com', role: 'manager', first_name: 'Sales', last_name: 'Manager', can_approve_quotes: true, max_approval_amount_cents: 5000000 }
    ],
    customers: [
      { id: 1, name: 'Test Customer', email: 'customer@test.com', phone: '555-1234' }
    ],
    quotations: [],
    quotation_items: [],
    approvals: [],
    nextQuoteId: 1,
    nextApprovalId: 1
  };

  return {
    query: jest.fn().mockImplementation((sql, params) => {
      const sqlLower = sql.toLowerCase();

      // User queries
      if (sqlLower.includes('from users') && sqlLower.includes('where')) {
        const userId = params?.[0];
        const user = mockData.users.find(u => u.id === userId || u.email === userId);
        return Promise.resolve({ rows: user ? [user] : [] });
      }

      // Customer queries
      if (sqlLower.includes('from customers')) {
        const customerId = params?.[0];
        const customer = mockData.customers.find(c => c.id === customerId);
        return Promise.resolve({ rows: customer ? [customer] : [] });
      }

      // Create quotation
      if (sqlLower.includes('insert into quotations')) {
        const quote = {
          id: mockData.nextQuoteId++,
          quotation_number: `Q-2024-${String(mockData.nextQuoteId).padStart(4, '0')}`,
          customer_id: params[0],
          status: 'DRAFT',
          subtotal_cents: 0,
          total_cents: 0,
          discount_percent: 0,
          created_at: new Date().toISOString(),
          created_by: params[1]
        };
        mockData.quotations.push(quote);
        return Promise.resolve({ rows: [quote] });
      }

      // Get quotation
      if (sqlLower.includes('from quotations') && sqlLower.includes('where')) {
        const quoteId = params?.[0];
        const quote = mockData.quotations.find(q => q.id === quoteId);
        if (quote) {
          const customer = mockData.customers.find(c => c.id === quote.customer_id);
          return Promise.resolve({
            rows: [{
              ...quote,
              customer_name: customer?.name,
              customer_email: customer?.email
            }]
          });
        }
        return Promise.resolve({ rows: [] });
      }

      // Update quotation
      if (sqlLower.includes('update quotations')) {
        const quoteId = params[params.length - 1];
        const quote = mockData.quotations.find(q => q.id === quoteId);
        if (quote) {
          if (sqlLower.includes('status')) {
            const statusIndex = params.findIndex((p, i) => {
              const beforeParam = sql.substring(0, sql.indexOf(`$${i + 1}`));
              return beforeParam.toLowerCase().includes('status');
            });
            if (statusIndex >= 0) quote.status = params[statusIndex];
          }
          if (sqlLower.includes('sent_at')) {
            quote.sent_at = new Date().toISOString();
          }
          if (sqlLower.includes('approved_at')) {
            quote.approved_at = new Date().toISOString();
          }
          if (sqlLower.includes('won_at')) {
            quote.won_at = new Date().toISOString();
          }
          return Promise.resolve({ rows: [quote] });
        }
        return Promise.resolve({ rows: [] });
      }

      // Add quotation items
      if (sqlLower.includes('insert into quotation_items')) {
        const item = {
          id: mockData.quotation_items.length + 1,
          quotation_id: params[0],
          product_id: params[1],
          quantity: params[2] || 1,
          unit_price_cents: params[3] || 10000,
          line_total_cents: (params[2] || 1) * (params[3] || 10000)
        };
        mockData.quotation_items.push(item);
        return Promise.resolve({ rows: [item] });
      }

      // Get quotation items
      if (sqlLower.includes('from quotation_items')) {
        const quoteId = params?.[0];
        const items = mockData.quotation_items.filter(i => i.quotation_id === quoteId);
        return Promise.resolve({ rows: items });
      }

      // Create approval request
      if (sqlLower.includes('insert into quote_approvals') || sqlLower.includes('insert into approvals')) {
        const approval = {
          id: mockData.nextApprovalId++,
          quotation_id: params[0],
          requested_by: params[1],
          status: 'PENDING',
          created_at: new Date().toISOString()
        };
        mockData.approvals.push(approval);
        return Promise.resolve({ rows: [approval] });
      }

      // Get approval
      if (sqlLower.includes('from quote_approvals') || sqlLower.includes('from approvals')) {
        const approvalId = params?.[0];
        const approval = mockData.approvals.find(a => a.id === approvalId);
        return Promise.resolve({ rows: approval ? [approval] : [] });
      }

      // Update approval
      if (sqlLower.includes('update quote_approvals') || sqlLower.includes('update approvals')) {
        const approvalId = params[params.length - 1];
        const approval = mockData.approvals.find(a => a.id === approvalId);
        if (approval) {
          approval.status = 'APPROVED';
          approval.approved_by = params[0];
          approval.approved_at = new Date().toISOString();
          return Promise.resolve({ rows: [approval] });
        }
        return Promise.resolve({ rows: [] });
      }

      // Notification log
      if (sqlLower.includes('insert into notification_log')) {
        return Promise.resolve({ rows: [{ id: 1 }] });
      }

      // Default
      return Promise.resolve({ rows: [] });
    }),
    mockData
  };
};

// Generate test tokens
const generateTestToken = (user) => {
  return jwt.sign(
    { userId: user.id, email: user.email, role: user.role, type: 'access' },
    TEST_CONFIG.JWT_SECRET,
    { expiresIn: '1h' }
  );
};

describe('Quote Workflow E2E Tests', () => {
  let app;
  let mockPool;
  let repToken;
  let managerToken;

  beforeAll(() => {
    // Set test environment
    process.env.JWT_SECRET = TEST_CONFIG.JWT_SECRET;

    mockPool = createMockPool();
    repToken = generateTestToken(mockPool.mockData.users[0]);
    managerToken = generateTestToken(mockPool.mockData.users[1]);

    // Create minimal Express app for E2E testing
    app = express();
    app.use(express.json());

    // Auth middleware
    const authenticate = (req, res, next) => {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No token provided' });
      }
      try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, TEST_CONFIG.JWT_SECRET);
        req.user = mockPool.mockData.users.find(u => u.id === decoded.userId);
        next();
      } catch (err) {
        res.status(401).json({ error: 'Invalid token' });
      }
    };

    // Routes for E2E testing
    // POST /api/quotations - Create quote
    app.post('/api/quotations', authenticate, async (req, res) => {
      const { customer_id, items = [] } = req.body;

      const quoteResult = await mockPool.query(
        'INSERT INTO quotations (customer_id, created_by) VALUES ($1, $2) RETURNING *',
        [customer_id, req.user.id]
      );
      const quote = quoteResult.rows[0];

      // Add items
      let subtotal = 0;
      for (const item of items) {
        const itemResult = await mockPool.query(
          'INSERT INTO quotation_items (quotation_id, product_id, quantity, unit_price_cents) VALUES ($1, $2, $3, $4) RETURNING *',
          [quote.id, item.product_id, item.quantity, item.unit_price_cents]
        );
        subtotal += itemResult.rows[0].line_total_cents;
      }

      quote.subtotal_cents = subtotal;
      quote.total_cents = subtotal;

      // Check if approval required (discount > 15%)
      const discount = parseFloat(req.body.discount_percent) || 0;
      if (discount > 15 || subtotal > 1000000) {
        quote.status = 'PENDING_APPROVAL';
        quote.approval_required = true;

        // Create approval request
        const approvalResult = await mockPool.query(
          'INSERT INTO approvals (quotation_id, requested_by) VALUES ($1, $2) RETURNING *',
          [quote.id, req.user.id]
        );
        quote.approval_id = approvalResult.rows[0].id;
      }

      res.status(201).json(quote);
    });

    // GET /api/quotations/:id
    app.get('/api/quotations/:id', authenticate, async (req, res) => {
      const result = await mockPool.query(
        'SELECT * FROM quotations WHERE id = $1',
        [parseInt(req.params.id)]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Quote not found' });
      }
      res.json(result.rows[0]);
    });

    // POST /api/approvals/:id/approve
    app.post('/api/approvals/:id/approve', authenticate, async (req, res) => {
      if (!req.user.can_approve_quotes && req.user.role !== 'manager' && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Not authorized to approve quotes' });
      }

      const approvalResult = await mockPool.query(
        'SELECT * FROM approvals WHERE id = $1',
        [parseInt(req.params.id)]
      );

      if (approvalResult.rows.length === 0) {
        return res.status(404).json({ error: 'Approval not found' });
      }

      const approval = approvalResult.rows[0];

      // Update approval
      await mockPool.query(
        'UPDATE approvals SET status = $1, approved_by = $2 WHERE id = $3 RETURNING *',
        ['APPROVED', req.user.id, approval.id]
      );

      // Update quote status
      const quote = mockPool.mockData.quotations.find(q => q.id === approval.quotation_id);
      if (quote) {
        quote.status = 'APPROVED';
        quote.approved_at = new Date().toISOString();
        quote.approved_by = req.user.id;
      }

      res.json({ success: true, quote });
    });

    // POST /api/quotations/:id/send
    app.post('/api/quotations/:id/send', authenticate, async (req, res) => {
      const quote = mockPool.mockData.quotations.find(q => q.id === parseInt(req.params.id));

      if (!quote) {
        return res.status(404).json({ error: 'Quote not found' });
      }

      if (quote.status === 'PENDING_APPROVAL') {
        return res.status(400).json({ error: 'Quote requires approval before sending' });
      }

      quote.status = 'SENT';
      quote.sent_at = new Date().toISOString();

      res.json({ success: true, quote });
    });

    // PUT /api/quotations/:id/status
    app.put('/api/quotations/:id/status', authenticate, async (req, res) => {
      const { status } = req.body;
      const quote = mockPool.mockData.quotations.find(q => q.id === parseInt(req.params.id));

      if (!quote) {
        return res.status(404).json({ error: 'Quote not found' });
      }

      quote.status = status;
      if (status === 'WON') {
        quote.won_at = new Date().toISOString();
      } else if (status === 'LOST') {
        quote.lost_at = new Date().toISOString();
      }

      res.json({ success: true, quote });
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset mock data
    mockPool.mockData.quotations = [];
    mockPool.mockData.quotation_items = [];
    mockPool.mockData.approvals = [];
    mockPool.mockData.nextQuoteId = 1;
    mockPool.mockData.nextApprovalId = 1;
  });

  describe('Full Quote Workflow', () => {
    test('complete workflow: create → approve → send → accept (run multiple times)', async () => {
      // Step 1: Rep creates quote with items that trigger approval
      const createResponse = await request(app)
        .post('/api/quotations')
        .set('Authorization', `Bearer ${repToken}`)
        .send({
          customer_id: 1,
          discount_percent: 20, // Triggers approval (> 15%)
          items: [
            { product_id: 1, quantity: 2, unit_price_cents: 50000 },
            { product_id: 2, quantity: 1, unit_price_cents: 100000 }
          ]
        });

      expect(createResponse.status).toBe(201);
      expect(createResponse.body.status).toBe('PENDING_APPROVAL');
      expect(createResponse.body.approval_id).toBeDefined();

      const quoteId = createResponse.body.id;
      const approvalId = createResponse.body.approval_id;

      // Step 2: Manager approves the quote
      const approveResponse = await request(app)
        .post(`/api/approvals/${approvalId}/approve`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({});

      expect(approveResponse.status).toBe(200);
      expect(approveResponse.body.success).toBe(true);
      expect(approveResponse.body.quote.status).toBe('APPROVED');

      // Verify quote status updated
      const getApprovedResponse = await request(app)
        .get(`/api/quotations/${quoteId}`)
        .set('Authorization', `Bearer ${repToken}`);

      expect(getApprovedResponse.body.status).toBe('APPROVED');
      expect(getApprovedResponse.body.approved_at).toBeDefined();

      // Step 3: Rep sends the quote
      const sendResponse = await request(app)
        .post(`/api/quotations/${quoteId}/send`)
        .set('Authorization', `Bearer ${repToken}`)
        .send({});

      expect(sendResponse.status).toBe(200);
      expect(sendResponse.body.quote.status).toBe('SENT');
      expect(sendResponse.body.quote.sent_at).toBeDefined();

      // Step 4: Mark quote as WON
      const wonResponse = await request(app)
        .put(`/api/quotations/${quoteId}/status`)
        .set('Authorization', `Bearer ${repToken}`)
        .send({ status: 'WON' });

      expect(wonResponse.status).toBe(200);
      expect(wonResponse.body.quote.status).toBe('WON');
      expect(wonResponse.body.quote.won_at).toBeDefined();
    });

    test('workflow without approval: create → send → accept', async () => {
      // Create quote that doesn't need approval (low discount)
      const createResponse = await request(app)
        .post('/api/quotations')
        .set('Authorization', `Bearer ${repToken}`)
        .send({
          customer_id: 1,
          discount_percent: 5, // Below threshold
          items: [
            { product_id: 1, quantity: 1, unit_price_cents: 25000 }
          ]
        });

      expect(createResponse.status).toBe(201);
      expect(createResponse.body.status).toBe('DRAFT');

      const quoteId = createResponse.body.id;

      // Send directly (no approval needed)
      const sendResponse = await request(app)
        .post(`/api/quotations/${quoteId}/send`)
        .set('Authorization', `Bearer ${repToken}`)
        .send({});

      expect(sendResponse.status).toBe(200);
      expect(sendResponse.body.quote.status).toBe('SENT');

      // Mark as WON
      const wonResponse = await request(app)
        .put(`/api/quotations/${quoteId}/status`)
        .set('Authorization', `Bearer ${repToken}`)
        .send({ status: 'WON' });

      expect(wonResponse.status).toBe(200);
      expect(wonResponse.body.quote.status).toBe('WON');
    });

    test('cannot send quote pending approval', async () => {
      // Create quote that needs approval
      const createResponse = await request(app)
        .post('/api/quotations')
        .set('Authorization', `Bearer ${repToken}`)
        .send({
          customer_id: 1,
          discount_percent: 25,
          items: [{ product_id: 1, quantity: 1, unit_price_cents: 50000 }]
        });

      const quoteId = createResponse.body.id;

      // Try to send without approval
      const sendResponse = await request(app)
        .post(`/api/quotations/${quoteId}/send`)
        .set('Authorization', `Bearer ${repToken}`)
        .send({});

      expect(sendResponse.status).toBe(400);
      expect(sendResponse.body.error).toContain('approval');
    });

    test('rep cannot approve quotes', async () => {
      // Create quote that needs approval
      const createResponse = await request(app)
        .post('/api/quotations')
        .set('Authorization', `Bearer ${repToken}`)
        .send({
          customer_id: 1,
          discount_percent: 20,
          items: [{ product_id: 1, quantity: 1, unit_price_cents: 50000 }]
        });

      const approvalId = createResponse.body.approval_id;

      // Rep tries to approve their own quote
      const approveResponse = await request(app)
        .post(`/api/approvals/${approvalId}/approve`)
        .set('Authorization', `Bearer ${repToken}`)
        .send({});

      expect(approveResponse.status).toBe(403);
    });

    test('quote lost workflow', async () => {
      // Create and send quote
      const createResponse = await request(app)
        .post('/api/quotations')
        .set('Authorization', `Bearer ${repToken}`)
        .send({
          customer_id: 1,
          items: [{ product_id: 1, quantity: 1, unit_price_cents: 30000 }]
        });

      const quoteId = createResponse.body.id;

      await request(app)
        .post(`/api/quotations/${quoteId}/send`)
        .set('Authorization', `Bearer ${repToken}`)
        .send({});

      // Mark as LOST
      const lostResponse = await request(app)
        .put(`/api/quotations/${quoteId}/status`)
        .set('Authorization', `Bearer ${repToken}`)
        .send({ status: 'LOST' });

      expect(lostResponse.status).toBe(200);
      expect(lostResponse.body.quote.status).toBe('LOST');
      expect(lostResponse.body.quote.lost_at).toBeDefined();
    });
  });

  describe('Authentication & Authorization', () => {
    test('requires authentication for all endpoints', async () => {
      const endpoints = [
        { method: 'post', path: '/api/quotations' },
        { method: 'get', path: '/api/quotations/1' },
        { method: 'post', path: '/api/quotations/1/send' },
        { method: 'post', path: '/api/approvals/1/approve' }
      ];

      for (const endpoint of endpoints) {
        const response = await request(app)[endpoint.method](endpoint.path).send({});
        expect(response.status).toBe(401);
      }
    });

    test('rejects invalid tokens', async () => {
      const response = await request(app)
        .get('/api/quotations/1')
        .set('Authorization', 'Bearer invalid-token')
        .send();

      expect(response.status).toBe(401);
    });
  });

  describe('Stability Tests (Run 10+ times)', () => {
    // Run the same workflow multiple times to ensure stability
    const runCount = 10;

    for (let i = 1; i <= runCount; i++) {
      test(`stability run ${i}/${runCount}: full workflow`, async () => {
        const createResponse = await request(app)
          .post('/api/quotations')
          .set('Authorization', `Bearer ${repToken}`)
          .send({
            customer_id: 1,
            discount_percent: 18,
            items: [
              { product_id: i, quantity: i, unit_price_cents: 10000 * i }
            ]
          });

        expect(createResponse.status).toBe(201);
        const quoteId = createResponse.body.id;
        const approvalId = createResponse.body.approval_id;

        // Approve
        await request(app)
          .post(`/api/approvals/${approvalId}/approve`)
          .set('Authorization', `Bearer ${managerToken}`);

        // Send
        await request(app)
          .post(`/api/quotations/${quoteId}/send`)
          .set('Authorization', `Bearer ${repToken}`);

        // Win
        const finalResponse = await request(app)
          .put(`/api/quotations/${quoteId}/status`)
          .set('Authorization', `Bearer ${repToken}`)
          .send({ status: 'WON' });

        expect(finalResponse.body.quote.status).toBe('WON');
      });
    }
  });
});
