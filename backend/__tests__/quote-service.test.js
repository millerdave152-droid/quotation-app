/**
 * TeleTime Quotation App - QuoteService Tests
 * Tests for backend/services/QuoteService.js
 */

// Mock dependencies before requiring the service
jest.mock('../services/ActivityService', () => {
  return jest.fn().mockImplementation(() => ({
    logActivity: jest.fn().mockResolvedValue(null)
  }));
});

jest.mock('../services/EmailService', () => ({
  sendQuoteCreatedEmail: jest.fn().mockResolvedValue(null),
  sendQuoteWonEmail: jest.fn().mockResolvedValue(null),
  sendQuoteLostEmail: jest.fn().mockResolvedValue(null)
}));

jest.mock('../services/skulytics/SkulyticsSnapshotService', () => ({
  buildQuoteSnapshot: jest.fn().mockResolvedValue(null),
  SnapshotBuildError: class SnapshotBuildError extends Error {}
}));

const QuoteService = require('../services/QuoteService');

describe('QuoteService', () => {
  let service;
  let mockPool;
  let mockClient;

  beforeEach(() => {
    mockClient = {
      query: jest.fn(),
      release: jest.fn()
    };

    mockPool = {
      query: jest.fn(),
      connect: jest.fn().mockResolvedValue(mockClient)
    };

    service = new QuoteService(mockPool);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================================
  // calculateTotals Tests
  // ============================================================================

  describe('calculateTotals()', () => {
    it('should calculate totals from items in cents', () => {
      const items = [
        { sell_cents: 129999, cost_cents: 89999, quantity: 1 },  // $1,299.99 sell, $899.99 cost
        { sell_cents: 49999, cost_cents: 29999, quantity: 2 }    // $499.99 sell x2, $299.99 cost x2
      ];

      const result = service.calculateTotals(items, 0, 13);

      expect(result.subtotal_cents).toBe(229997); // 129999 + (49999 * 2)
      expect(result.discount_percent).toBe(0);
      expect(result.discount_cents).toBe(0);
      expect(result.tax_rate).toBe(13);
      expect(result.tax_cents).toBe(29900); // Math.round(229997 * 13 / 100)
      expect(result.total_cents).toBe(259897); // 229997 + 29900
      expect(result.total_cost_cents).toBe(149997); // 89999 + (29999 * 2)
      expect(result.gross_profit_cents).toBe(80000); // 229997 - 149997
    });

    it('should apply discount correctly in cents', () => {
      const items = [
        { sell_cents: 100000, cost_cents: 60000, quantity: 1 } // $1,000.00
      ];

      const result = service.calculateTotals(items, 10, 13); // 10% discount

      expect(result.subtotal_cents).toBe(100000);
      expect(result.discount_cents).toBe(10000); // 10% of 100000
      const afterDiscount = 90000;
      expect(result.tax_cents).toBe(11700); // Math.round(90000 * 13 / 100)
      expect(result.total_cents).toBe(101700); // 90000 + 11700
    });

    it('should normalize tax rate from decimal to percentage', () => {
      const items = [
        { sell_cents: 100000, cost_cents: 50000, quantity: 1 }
      ];

      // Pass 0.13 instead of 13
      const result = service.calculateTotals(items, 0, 0.13);

      expect(result.tax_rate).toBe(13);
      expect(result.tax_cents).toBe(13000); // 100000 * 13 / 100
    });

    it('should handle items with dollar amounts (legacy support)', () => {
      const items = [
        { sell: 500.00, cost: 300.00, quantity: 1 } // No _cents fields
      ];

      const result = service.calculateTotals(items, 0, 13);

      expect(result.subtotal_cents).toBe(50000); // $500 converted to cents
      expect(result.total_cost_cents).toBe(30000);
    });

    it('should handle empty items array', () => {
      const result = service.calculateTotals([], 0, 13);

      expect(result.subtotal_cents).toBe(0);
      expect(result.discount_cents).toBe(0);
      expect(result.tax_cents).toBe(0);
      expect(result.total_cents).toBe(0);
      expect(result.total_cost_cents).toBe(0);
      expect(result.gross_profit_cents).toBe(0);
      expect(result.margin_percent).toBe(0);
    });

    it('should calculate margin percentage correctly', () => {
      const items = [
        { sell_cents: 100000, cost_cents: 60000, quantity: 1 }
      ];

      const result = service.calculateTotals(items, 0, 0);

      // Margin = (100000 - 60000) / 100000 = 40%
      expect(result.margin_percent).toBe(40);
    });

    it('should handle zero sell price without division by zero', () => {
      const items = [
        { sell_cents: 0, cost_cents: 0, quantity: 1 }
      ];

      const result = service.calculateTotals(items, 0, 13);

      expect(result.margin_percent).toBe(0);
      expect(result.subtotal_cents).toBe(0);
      expect(result.total_cents).toBe(0);
    });

    it('should default quantity to 1 if not provided', () => {
      const items = [
        { sell_cents: 50000, cost_cents: 30000 } // No quantity
      ];

      const result = service.calculateTotals(items, 0, 0);

      expect(result.subtotal_cents).toBe(50000);
      expect(result.total_cost_cents).toBe(30000);
    });

    it('should handle multiple items with different quantities', () => {
      const items = [
        { sell_cents: 100000, cost_cents: 70000, quantity: 3 },
        { sell_cents: 200000, cost_cents: 150000, quantity: 1 }
      ];

      const result = service.calculateTotals(items, 0, 0);

      expect(result.subtotal_cents).toBe(500000); // (100000 * 3) + (200000 * 1)
      expect(result.total_cost_cents).toBe(360000); // (70000 * 3) + (150000 * 1)
      expect(result.gross_profit_cents).toBe(140000); // 500000 - 360000
    });

    it('should use integer arithmetic only (no floating point)', () => {
      const items = [
        { sell_cents: 33333, cost_cents: 22222, quantity: 3 }
      ];

      const result = service.calculateTotals(items, 5, 13);

      // All results should be integers
      expect(Number.isInteger(result.subtotal_cents)).toBe(true);
      expect(Number.isInteger(result.discount_cents)).toBe(true);
      expect(Number.isInteger(result.tax_cents)).toBe(true);
      expect(Number.isInteger(result.total_cents)).toBe(true);
      expect(Number.isInteger(result.total_cost_cents)).toBe(true);
      expect(Number.isInteger(result.gross_profit_cents)).toBe(true);
    });
  });

  // ============================================================================
  // generateQuoteNumber Tests
  // ============================================================================

  describe('generateQuoteNumber()', () => {
    it('should generate a quote number with current year and padded sequence', async () => {
      const year = new Date().getFullYear();

      mockPool.query.mockResolvedValueOnce({
        rows: [{ next_num: 42 }]
      });

      const result = await service.generateQuoteNumber();

      expect(result).toBe(`QT-${year}-0042`);
    });

    it('should start at 1 when no existing quotes', async () => {
      const year = new Date().getFullYear();

      mockPool.query.mockResolvedValueOnce({
        rows: [{ next_num: 1 }]
      });

      const result = await service.generateQuoteNumber();

      expect(result).toBe(`QT-${year}-0001`);
    });

    it('should use tenant-scoped sequence when tenantId is provided', async () => {
      const year = new Date().getFullYear();

      mockPool.query.mockResolvedValueOnce({
        rows: [{ last_number: 15, prefix: 'QT' }]
      });

      const result = await service.generateQuoteNumber(null, 'tenant-abc');

      expect(result).toBe(`QT-${year}-0015`);
      // Should use UPSERT on tenant_quote_sequences
      const queryCall = mockPool.query.mock.calls[0];
      expect(queryCall[0]).toContain('tenant_quote_sequences');
      expect(queryCall[1]).toEqual(['tenant-abc']);
    });

    it('should use provided client for transaction safety', async () => {
      const year = new Date().getFullYear();

      mockClient.query.mockResolvedValueOnce({
        rows: [{ next_num: 100 }]
      });

      const result = await service.generateQuoteNumber(mockClient);

      expect(result).toBe(`QT-${year}-0100`);
      expect(mockClient.query).toHaveBeenCalled();
      expect(mockPool.query).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // getStatsSummary Tests
  // ============================================================================

  describe('getStatsSummary()', () => {
    it('should return parsed statistics with all fields', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          total_quotes: '100',
          draft_count: '20',
          sent_count: '30',
          won_count: '25',
          lost_count: '15',
          pending_approval_count: '10',
          total_value_cents: '5000000',
          won_value_cents: '2500000',
          pipeline_value_cents: '2000000',
          draft_value_cents: '800000',
          sent_value_cents: '1000000',
          lost_value_cents: '700000',
          total_profit_cents: '1500000',
          won_profit_cents: '750000',
          total_value: '50000.00',
          won_value: '25000.00',
          total_profit: '15000.00',
          last_7_days: '8',
          last_30_days: '25'
        }]
      });

      const result = await service.getStatsSummary();

      expect(result.total_quotes).toBe(100);
      expect(result.draft_count).toBe(20);
      expect(result.won_count).toBe(25);
      expect(result.total_value_cents).toBe(5000000);
      expect(result.won_value_cents).toBe(2500000);
      expect(result.win_rate).toBe(25); // 25/100 * 100
      expect(result.avg_quote_value_cents).toBe(50000); // 5000000 / 100
    });

    it('should handle all-zero statistics', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          total_quotes: '0',
          draft_count: '0',
          sent_count: '0',
          won_count: '0',
          lost_count: '0',
          pending_approval_count: '0',
          total_value_cents: '0',
          won_value_cents: '0',
          pipeline_value_cents: '0',
          draft_value_cents: '0',
          sent_value_cents: '0',
          lost_value_cents: '0',
          total_profit_cents: '0',
          won_profit_cents: '0',
          total_value: '0',
          won_value: '0',
          total_profit: '0',
          last_7_days: '0',
          last_30_days: '0'
        }]
      });

      const result = await service.getStatsSummary();

      expect(result.total_quotes).toBe(0);
      expect(result.win_rate).toBe(0);
      expect(result.avg_quote_value_cents).toBe(0);
    });
  });

  // ============================================================================
  // checkMarginApproval Tests
  // ============================================================================

  describe('checkMarginApproval()', () => {
    it('should not require approval when margin meets threshold', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 1, email: 'sales@test.com', first_name: 'Sales', last_name: 'Rep',
          role: 'salesperson', approval_threshold_percent: '15.00',
          can_approve_quotes: false, manager_id: 2,
          manager_email: 'manager@test.com', manager_name: 'Manager Name'
        }]
      });

      const result = await service.checkMarginApproval(
        { margin_percent: 20 },
        'sales@test.com'
      );

      expect(result.requiresApproval).toBe(false);
      expect(result.user).not.toBeNull();
      expect(result.marginPercent).toBe(20);
      expect(result.threshold).toBe(15);
    });

    it('should require approval when margin is below threshold', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 1, email: 'sales@test.com', first_name: 'Sales', last_name: 'Rep',
          role: 'salesperson', approval_threshold_percent: '15.00',
          can_approve_quotes: false, manager_id: 2,
          manager_email: 'manager@test.com', manager_name: 'Manager Name'
        }]
      });

      const result = await service.checkMarginApproval(
        { margin_percent: 10 },
        'sales@test.com'
      );

      expect(result.requiresApproval).toBe(true);
      expect(result.marginPercent).toBe(10);
      expect(result.threshold).toBe(15);
      expect(result.reason).toContain('below threshold');
    });

    it('should not require approval when user has no threshold set', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 1, email: 'admin@test.com', first_name: 'Admin', last_name: 'User',
          role: 'admin', approval_threshold_percent: null,
          can_approve_quotes: true, manager_id: null,
          manager_email: null, manager_name: null
        }]
      });

      const result = await service.checkMarginApproval(
        { margin_percent: 5 },
        'admin@test.com'
      );

      expect(result.requiresApproval).toBe(false);
      expect(result.reason).toContain('No margin threshold');
    });

    it('should not require approval when user is not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await service.checkMarginApproval(
        { margin_percent: 5 },
        'unknown@test.com'
      );

      expect(result.requiresApproval).toBe(false);
      expect(result.user).toBeNull();
    });

    it('should handle marginPercent alias for margin_percent', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 1, email: 'user@test.com', first_name: 'Test', last_name: 'User',
          role: 'salesperson', approval_threshold_percent: '20.00',
          can_approve_quotes: false, manager_id: null,
          manager_email: null, manager_name: null
        }]
      });

      const result = await service.checkMarginApproval(
        { marginPercent: 25 }, // Using camelCase alias
        'user@test.com'
      );

      expect(result.requiresApproval).toBe(false);
      expect(result.marginPercent).toBe(25);
    });

    it('should handle database errors gracefully', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('DB connection failed'));

      const result = await service.checkMarginApproval(
        { margin_percent: 10 },
        'user@test.com'
      );

      expect(result.requiresApproval).toBe(false);
      expect(result.reason).toContain('Error checking approval');
    });
  });

  // ============================================================================
  // createAutoApprovalRequest Tests
  // ============================================================================

  describe('createAutoApprovalRequest()', () => {
    it('should create an approval request when no pending exists', async () => {
      const user = {
        id: 1, email: 'sales@test.com', first_name: 'Sales', last_name: 'Rep',
        manager_email: 'manager@test.com', manager_name: 'Manager Name'
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [] }) // no existing pending
        .mockResolvedValueOnce({ rows: [{ id: 1, quotation_id: 10, status: 'PENDING' }] }) // insert approval
        .mockResolvedValueOnce({ rows: [] }) // update quote status
        .mockResolvedValueOnce({ rows: [] }); // insert event

      const result = await service.createAutoApprovalRequest(null, 10, user, 8.5, 15);

      expect(result).toBeDefined();
      expect(result.quotation_id).toBe(10);
    });

    it('should return null if pending approval already exists', async () => {
      const user = {
        id: 1, email: 'sales@test.com', first_name: 'Sales', last_name: 'Rep',
        manager_email: 'manager@test.com', manager_name: 'Manager Name'
      };

      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 5 }] }); // existing pending

      const result = await service.createAutoApprovalRequest(null, 10, user, 8.5, 15);

      expect(result).toBeNull();
    });

    it('should find an alternative approver when no manager is set', async () => {
      const user = {
        id: 1, email: 'sales@test.com', first_name: 'Sales', last_name: 'Rep',
        manager_email: null, manager_name: null
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [] }) // no existing pending
        .mockResolvedValueOnce({ rows: [{ email: 'admin@test.com', name: 'Admin User' }] }) // find approver
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // insert approval
        .mockResolvedValueOnce({ rows: [] }) // update quote status
        .mockResolvedValueOnce({ rows: [] }); // insert event

      const result = await service.createAutoApprovalRequest(null, 10, user, 8.5, 15);

      expect(result).toBeDefined();
    });

    it('should return null when no approvers are available', async () => {
      const user = {
        id: 1, email: 'sales@test.com', first_name: 'Sales', last_name: 'Rep',
        manager_email: null, manager_name: null
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [] }) // no existing pending
        .mockResolvedValueOnce({ rows: [] }); // no approvers found

      const result = await service.createAutoApprovalRequest(null, 10, user, 8.5, 15);

      expect(result).toBeNull();
    });

    it('should use transaction client when provided', async () => {
      const user = {
        id: 1, email: 'sales@test.com', first_name: 'Sales', last_name: 'Rep',
        manager_email: 'manager@test.com', manager_name: 'Manager Name'
      };

      mockClient.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 1 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      await service.createAutoApprovalRequest(mockClient, 10, user, 8.5, 15);

      expect(mockClient.query).toHaveBeenCalled();
      expect(mockPool.query).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // getApprovers Tests
  // ============================================================================

  describe('getApprovers()', () => {
    it('should return formatted list of approvers', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { id: 1, email: 'admin@test.com', first_name: 'Admin', last_name: 'User', role: 'admin', department: 'Management' },
          { id: 2, email: 'mgr@test.com', first_name: 'Manager', last_name: '', role: 'manager', department: 'Sales' }
        ]
      });

      const result = await service.getApprovers();

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 1,
        email: 'admin@test.com',
        name: 'Admin User',
        role: 'admin',
        department: 'Management'
      });
      expect(result[1].name).toBe('Manager');
    });

    it('should use email as name when first/last names are empty', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { id: 1, email: 'user@test.com', first_name: '', last_name: '', role: 'admin', department: null }
        ]
      });

      const result = await service.getApprovers();

      expect(result[0].name).toBe('user@test.com');
    });

    it('should return empty array when no approvers exist', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await service.getApprovers();

      expect(result).toEqual([]);
    });
  });

  // ============================================================================
  // getQuotes Tests
  // ============================================================================

  describe('getQuotes()', () => {
    it('should return paginated quotes with default options', async () => {
      const mockQuotes = [
        { id: 1, quote_number: 'QT-2025-0001', customer_name: 'John Doe', total_cents: 250000, status: 'DRAFT', item_count: 3 }
      ];

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: mockQuotes });

      const result = await service.getQuotes();

      expect(result.quotations).toEqual(mockQuotes);
      expect(result.pagination).toEqual({
        total: 1,
        page: 1,
        limit: 50,
        totalPages: 1
      });
    });

    it('should filter by status', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '5' }] })
        .mockResolvedValueOnce({ rows: [] });

      await service.getQuotes({ status: 'WON' });

      const countParams = mockPool.query.mock.calls[0][1];
      expect(countParams).toContain('WON');
    });

    it('should filter by customer_id', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '3' }] })
        .mockResolvedValueOnce({ rows: [] });

      await service.getQuotes({ customer_id: 42 });

      const countParams = mockPool.query.mock.calls[0][1];
      expect(countParams).toContain(42);
    });

    it('should apply date range filters', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      await service.getQuotes({
        from_date: '2025-01-01',
        to_date: '2025-12-31'
      });

      const countParams = mockPool.query.mock.calls[0][1];
      expect(countParams).toContain('2025-01-01');
      expect(countParams).toContain('2025-12-31');
    });

    it('should search across quote number and customer fields', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      await service.getQuotes({ search: 'Samsung' });

      const countParams = mockPool.query.mock.calls[0][1];
      expect(countParams).toContain('%Samsung%');
    });

    it('should sanitize invalid sort columns', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      await service.getQuotes({ sortBy: 'DROP TABLE quotations' });

      // Should default to created_at for invalid sort column
      const dataQuery = mockPool.query.mock.calls[1][0];
      expect(dataQuery).toContain('q.created_at');
    });

    it('should handle pagination correctly', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '200' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.getQuotes({ page: 4, limit: 25 });

      expect(result.pagination.totalPages).toBe(8);
      expect(result.pagination.page).toBe(4);

      // Verify offset: (4-1) * 25 = 75
      const dataParams = mockPool.query.mock.calls[1][1];
      expect(dataParams).toContain(25);
      expect(dataParams).toContain(75);
    });
  });

  // ============================================================================
  // getQuoteById Tests
  // ============================================================================

  describe('getQuoteById()', () => {
    it('should return quote with items and customer info', async () => {
      const mockQuote = {
        id: 1,
        quote_number: 'QT-2025-0001',
        customer_id: 5,
        customer_name: 'John Doe',
        customer_email: 'john@example.com',
        status: 'DRAFT',
        total_cents: 250000
      };

      const mockItems = [
        { id: 1, quotation_id: 1, model: 'RF28R7351SR', sell_cents: 129999, quantity: 1 },
        { id: 2, quotation_id: 1, model: 'WF45R6100AW', sell_cents: 59999, quantity: 2 }
      ];

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockQuote] })
        .mockResolvedValueOnce({ rows: mockItems });

      const result = await service.getQuoteById(1);

      expect(result).not.toBeNull();
      expect(result.id).toBe(1);
      expect(result.customer_name).toBe('John Doe');
      expect(result.items).toHaveLength(2);
      expect(result.items[0].model).toBe('RF28R7351SR');
    });

    it('should return null for non-existent quote', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await service.getQuoteById(999);

      expect(result).toBeNull();
      // Should NOT query for items if quote not found
      expect(mockPool.query).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================================================
  // createQuote Tests
  // ============================================================================

  describe('createQuote()', () => {
    it('should create a quote with items in a transaction', async () => {
      const quoteData = {
        customer_id: 5,
        items: [
          { product_id: 100, sell_cents: 129999, cost_cents: 89999, quantity: 1, manufacturer: 'Samsung', model: 'RF28R7351SR', description: 'French Door Refrigerator', category: 'Appliances' }
        ],
        discount_percent: 0,
        tax_rate: 13,
        notes: 'Test quote',
        created_by: 'admin@test.com'
      };

      // Transaction sequence
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 5 }] }) // customer check
        .mockResolvedValueOnce({ rows: [{ next_num: 1 }] }) // generate quote number
        .mockResolvedValueOnce({ rows: [{ id: 1, quote_number: 'QT-2026-0001', total_cents: 146899, status: 'DRAFT' }] }) // INSERT quote
        .mockResolvedValueOnce({ rows: [] }) // insert items
        .mockResolvedValueOnce({ rows: [] }) // insert event
        .mockResolvedValueOnce({}); // COMMIT

      // Post-commit calls on pool (not client)
      mockPool.query
        .mockResolvedValueOnce({ rows: [] }) // margin check (user lookup)
        .mockResolvedValueOnce({ rows: [{ email: 'admin@test.com' }] }); // email lookup

      const result = await service.createQuote(quoteData);

      expect(result).toBeDefined();
      expect(result.id).toBe(1);
      expect(mockClient.query.mock.calls[0][0]).toBe('BEGIN');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should throw error when customer_id is missing and not a template', async () => {
      mockClient.query.mockResolvedValueOnce({}); // BEGIN

      await expect(service.createQuote({ items: [] }))
        .rejects.toThrow('Customer is required');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should allow template creation without customer_id', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ next_num: 1 }] }) // generate quote number
        .mockResolvedValueOnce({ rows: [{ id: 1, status: 'DRAFT' }] }) // INSERT
        .mockResolvedValueOnce({ rows: [] }) // insert event
        .mockResolvedValueOnce({}); // COMMIT

      // Post-commit: margin check skipped since created_by defaults to 'User'
      mockPool.query.mockResolvedValueOnce({ rows: [] }); // margin user lookup

      const result = await service.createQuote({ is_template: true, items: [] });

      expect(result).toBeDefined();
    });

    it('should throw error when customer does not exist', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [] }); // customer check returns empty

      await expect(service.createQuote({ customer_id: 999, items: [] }))
        .rejects.toThrow('Selected customer not found');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should rollback on database error', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // customer check
        .mockRejectedValueOnce(new Error('Database error')); // generate quote number fails

      await expect(service.createQuote({ customer_id: 1, items: [] }))
        .rejects.toThrow('Database error');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  // ============================================================================
  // deleteQuote Tests
  // ============================================================================

  describe('deleteQuote()', () => {
    it('should delete quote items and then the quote', async () => {
      const deletedQuote = { id: 1, quote_number: 'QT-2025-0001', status: 'DRAFT' };

      mockPool.query
        .mockResolvedValueOnce({ rows: [] }) // delete items
        .mockResolvedValueOnce({ rows: [deletedQuote] }); // delete quote

      const result = await service.deleteQuote(1);

      expect(result).toEqual(deletedQuote);
      expect(mockPool.query).toHaveBeenCalledTimes(2);
      expect(mockPool.query.mock.calls[0][0]).toContain('DELETE FROM quotation_items');
      expect(mockPool.query.mock.calls[1][0]).toContain('DELETE FROM quotations');
    });

    it('should return null when quote does not exist', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] }) // delete items (no items to delete)
        .mockResolvedValueOnce({ rows: [] }); // delete quote returns nothing

      const result = await service.deleteQuote(999);

      expect(result).toBeNull();
    });
  });

  // ============================================================================
  // validateStatusTransition Tests
  // ============================================================================

  describe('validateStatusTransition()', () => {
    it('should allow valid transitions from DRAFT', () => {
      expect(service.validateStatusTransition('DRAFT', 'SENT').valid).toBe(true);
      expect(service.validateStatusTransition('DRAFT', 'LOST').valid).toBe(true);
      expect(service.validateStatusTransition('DRAFT', 'PENDING_APPROVAL').valid).toBe(true);
    });

    it('should allow valid transitions from SENT', () => {
      expect(service.validateStatusTransition('SENT', 'WON').valid).toBe(true);
      expect(service.validateStatusTransition('SENT', 'LOST').valid).toBe(true);
      expect(service.validateStatusTransition('SENT', 'DRAFT').valid).toBe(true);
    });

    it('should allow reopening WON quotes', () => {
      expect(service.validateStatusTransition('WON', 'DRAFT').valid).toBe(true);
    });

    it('should allow reopening LOST quotes', () => {
      expect(service.validateStatusTransition('LOST', 'DRAFT').valid).toBe(true);
    });

    it('should reject invalid transitions', () => {
      const result = service.validateStatusTransition('DRAFT', 'WON');
      expect(result.valid).toBe(false);
      expect(result.reason).toContain('Cannot transition');
    });

    it('should reject transition from WON to LOST', () => {
      const result = service.validateStatusTransition('WON', 'LOST');
      expect(result.valid).toBe(false);
    });

    it('should handle PENDING_APPROVAL transitions', () => {
      expect(service.validateStatusTransition('PENDING_APPROVAL', 'APPROVED').valid).toBe(true);
      expect(service.validateStatusTransition('PENDING_APPROVAL', 'REJECTED').valid).toBe(true);
      expect(service.validateStatusTransition('PENDING_APPROVAL', 'DRAFT').valid).toBe(true);
    });

    it('should handle unknown status gracefully', () => {
      const result = service.validateStatusTransition('UNKNOWN', 'DRAFT');
      expect(result.valid).toBe(false);
    });
  });

  // ============================================================================
  // updateStatus Tests
  // ============================================================================

  describe('updateStatus()', () => {
    it('should update status with date tracking for SENT', async () => {
      // getQuoteById call
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 1, status: 'DRAFT', customer_id: 5 }] }) // quote
        .mockResolvedValueOnce({ rows: [] }) // items
        // updateStatus call
        .mockResolvedValueOnce({ rows: [{ id: 1, status: 'SENT', created_by: 'admin@test.com' }] }) // update
        .mockResolvedValueOnce({ rows: [] }); // event insert

      const result = await service.updateStatus(1, 'SENT');

      expect(result.status).toBe('SENT');
      // Verify sent_at was set
      const updateQuery = mockPool.query.mock.calls[2][0];
      expect(updateQuery).toContain('sent_at = CURRENT_TIMESTAMP');
    });

    it('should update status with date tracking for WON', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 1, status: 'SENT', customer_id: 5 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 1, status: 'WON', created_by: 'admin@test.com' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.updateStatus(1, 'WON');

      expect(result.status).toBe('WON');
      const updateQuery = mockPool.query.mock.calls[2][0];
      expect(updateQuery).toContain('won_at = CURRENT_TIMESTAMP');
    });

    it('should set lost_reason when transitioning to LOST', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 1, status: 'SENT', customer_id: 5 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 1, status: 'LOST', created_by: 'admin@test.com' }] })
        .mockResolvedValueOnce({ rows: [] });

      await service.updateStatus(1, 'LOST', { lostReason: 'Price too high' });

      const updateQuery = mockPool.query.mock.calls[2][0];
      expect(updateQuery).toContain('lost_at = CURRENT_TIMESTAMP');
      expect(updateQuery).toContain('lost_reason');
      const updateParams = mockPool.query.mock.calls[2][1];
      expect(updateParams).toContain('Price too high');
    });

    it('should clear dates when reopening to DRAFT', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 1, status: 'WON', customer_id: 5 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 1, status: 'DRAFT' }] })
        .mockResolvedValueOnce({ rows: [] });

      await service.updateStatus(1, 'DRAFT');

      const updateQuery = mockPool.query.mock.calls[2][0];
      expect(updateQuery).toContain('won_at = NULL');
      expect(updateQuery).toContain('lost_at = NULL');
    });

    it('should throw error for invalid status value', async () => {
      await expect(service.updateStatus(1, 'INVALID'))
        .rejects.toThrow('Invalid status: INVALID');
    });

    it('should return null for non-existent quote', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] }); // getQuoteById returns null

      const result = await service.updateStatus(999, 'SENT');

      expect(result).toBeNull();
    });

    it('should throw error for invalid transition', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 1, status: 'DRAFT', customer_id: 5 }] })
        .mockResolvedValueOnce({ rows: [] });

      await expect(service.updateStatus(1, 'WON'))
        .rejects.toThrow('Cannot transition');
    });

    it('should skip validation when skipValidation option is true', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 1, status: 'DRAFT', customer_id: 5 }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 1, status: 'WON' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.updateStatus(1, 'WON', { skipValidation: true });

      expect(result.status).toBe('WON');
    });

    it('should prevent SENT without customer assigned', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 1, status: 'DRAFT', customer_id: null }] })
        .mockResolvedValueOnce({ rows: [] });

      await expect(service.updateStatus(1, 'SENT'))
        .rejects.toThrow('Cannot mark as Sent without a customer');
    });
  });

  // ============================================================================
  // getAllowedTransitions Tests
  // ============================================================================

  describe('getAllowedTransitions()', () => {
    it('should return allowed transitions for each status', () => {
      expect(service.getAllowedTransitions('DRAFT')).toEqual(['SENT', 'LOST', 'PENDING_APPROVAL']);
      expect(service.getAllowedTransitions('SENT')).toEqual(['WON', 'LOST', 'DRAFT', 'PENDING_APPROVAL']);
      expect(service.getAllowedTransitions('WON')).toEqual(['DRAFT']);
      expect(service.getAllowedTransitions('LOST')).toEqual(['DRAFT']);
    });

    it('should return empty array for unknown status', () => {
      expect(service.getAllowedTransitions('NONEXISTENT')).toEqual([]);
    });
  });

  // ============================================================================
  // getQuoteEvents Tests
  // ============================================================================

  describe('getQuoteEvents()', () => {
    it('should return events with icons and parsed metadata', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            id: 1, quotation_id: 10, event_type: 'CREATED',
            description: 'Quote QT-2025-0001 created',
            user_name: 'Admin', metadata: '{"quoteNumber":"QT-2025-0001"}',
            is_internal: false, activity_category: 'lifecycle',
            created_at: '2025-01-15'
          },
          {
            id: 2, quotation_id: 10, event_type: 'STATUS_CHANGED',
            description: 'Status changed from DRAFT to SENT',
            user_name: null, metadata: null,
            is_internal: false, activity_category: 'lifecycle',
            created_at: '2025-01-16'
          }
        ]
      });

      const result = await service.getQuoteEvents(10);

      expect(result).toHaveLength(2);
      expect(result[0].metadata).toEqual({ quoteNumber: 'QT-2025-0001' });
      expect(result[1].metadata).toEqual({});
    });

    it('should filter internal events when includeInternal is false', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await service.getQuoteEvents(10, { includeInternal: false });

      const query = mockPool.query.mock.calls[0][0];
      expect(query).toContain('is_internal = FALSE');
    });

    it('should include internal events by default', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await service.getQuoteEvents(10);

      const query = mockPool.query.mock.calls[0][0];
      expect(query).not.toContain('is_internal = FALSE');
    });

    it('should respect limit option', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await service.getQuoteEvents(10, { limit: 10 });

      const params = mockPool.query.mock.calls[0][1];
      expect(params).toEqual([10, 10]);
    });

    it('should handle already-parsed metadata objects', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 1, quotation_id: 10, event_type: 'CREATED',
          description: 'Test', user_name: 'Admin',
          metadata: { alreadyParsed: true },
          is_internal: false, activity_category: 'lifecycle',
          created_at: '2025-01-15'
        }]
      });

      const result = await service.getQuoteEvents(10);

      expect(result[0].metadata).toEqual({ alreadyParsed: true });
    });
  });

  // ============================================================================
  // getMatchFieldLabel Tests
  // ============================================================================

  describe('getMatchFieldLabel()', () => {
    it('should return human-readable labels for known match types', () => {
      expect(service.getMatchFieldLabel('quote_number')).toBe('Quote Number');
      expect(service.getMatchFieldLabel('customer_name')).toBe('Customer Name');
      expect(service.getMatchFieldLabel('customer_email')).toBe('Customer Email');
      expect(service.getMatchFieldLabel('product')).toBe('Product/SKU');
      expect(service.getMatchFieldLabel('internal_notes')).toBe('Internal Notes');
    });

    it('should return the raw match type for unknown types', () => {
      expect(service.getMatchFieldLabel('custom_field')).toBe('custom_field');
    });
  });

  // ============================================================================
  // searchQuotes Tests
  // ============================================================================

  describe('searchQuotes()', () => {
    it('should fall back to getQuotes for short search terms', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.searchQuotes({ search: 'a' }); // too short

      // Should use getQuotes path (simple WHERE clause)
      expect(result.quotations).toBeDefined();
      expect(result.pagination).toBeDefined();
    });

    it('should perform enhanced search for valid terms', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ total: '1' }] }) // count
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            quote_number: 'QT-2025-0001',
            match_type: 'product',
            matched_products: [{ model: 'RF28R7351SR', manufacturer: 'Samsung' }],
            customer_name: 'John Doe',
            status: 'DRAFT',
            total_cents: 250000
          }]
        });

      const result = await service.searchQuotes({ search: 'Samsung' });

      expect(result.quotations).toHaveLength(1);
      expect(result.quotations[0].search_match.type).toBe('product');
      expect(result.search_info.term).toBe('Samsung');
      expect(result.search_info.fields_searched).toContain('product_model');
    });

    it('should filter by status during search', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ total: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      await service.searchQuotes({ search: 'Samsung', status: 'WON' });

      const searchParams = mockPool.query.mock.calls[1][1];
      expect(searchParams).toContain('WON');
    });

    it('should handle database errors during search', async () => {
      mockPool.query.mockRejectedValue(new Error('Search query failed'));

      await expect(service.searchQuotes({ search: 'test query' }))
        .rejects.toThrow('Search query failed');
    });
  });

  // ============================================================================
  // insertQuoteItems Tests
  // ============================================================================

  describe('insertQuoteItems()', () => {
    it('should insert items with correct values', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const items = [
        {
          product_id: 100,
          manufacturer: 'Samsung',
          model: 'RF28R7351SR',
          description: 'French Door Refrigerator',
          category: 'Appliances',
          quantity: 1,
          cost_cents: 89999,
          msrp_cents: 149999,
          sell_cents: 129999,
          line_total_cents: 129999,
          line_profit_cents: 40000,
          margin_bp: 3077,
          item_notes: 'Free delivery'
        }
      ];

      await service.insertQuoteItems(mockClient, 10, items);

      expect(mockClient.query).toHaveBeenCalledTimes(1);
      const queryCall = mockClient.query.mock.calls[0];
      expect(queryCall[0]).toContain('INSERT INTO quotation_items');
      // 18 values per row
      expect(queryCall[1]).toHaveLength(18);
      expect(queryCall[1][0]).toBe(10); // quotation_id
      expect(queryCall[1][1]).toBe(100); // product_id
      expect(queryCall[1][2]).toBe('Samsung'); // manufacturer
    });

    it('should handle items with dollar amounts by converting to cents', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const items = [
        {
          product_id: 200,
          manufacturer: 'LG',
          model: 'LSXS26366S',
          description: 'Side-by-Side Refrigerator',
          category: 'Appliances',
          quantity: 2,
          cost: 800.00,
          msrp: 1200.00,
          sell: 1099.99,
          notes: 'Test'
        }
      ];

      await service.insertQuoteItems(mockClient, 20, items);

      const params = mockClient.query.mock.calls[0][1];
      expect(params[7]).toBe(80000);  // cost_cents from $800
      expect(params[8]).toBe(120000); // msrp_cents from $1200
      expect(params[9]).toBe(109999); // sell_cents from $1099.99
    });

    it('should include skulytics data when available', async () => {
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const skulyticsData = new Map();
      skulyticsData.set(100, {
        skulytics_id: 'SKU-001',
        snapshot: { price_trend: 'stable' },
        discontinued_acknowledged_by: null,
        discontinued_acknowledged_at: null
      });

      const items = [
        { product_id: 100, manufacturer: 'Samsung', model: 'Test', description: 'Test', category: 'Test', quantity: 1, sell_cents: 10000, cost_cents: 5000 }
      ];

      await service.insertQuoteItems(mockClient, 10, items, skulyticsData);

      const params = mockClient.query.mock.calls[0][1];
      expect(params[14]).toBe('SKU-001'); // skulytics_id
      expect(params[15]).toBe('{"price_trend":"stable"}'); // skulytics_snapshot
    });
  });

  // ============================================================================
  // Static Properties Tests
  // ============================================================================

  describe('STATUS_TRANSITIONS', () => {
    it('should define all expected status transitions', () => {
      expect(QuoteService.STATUS_TRANSITIONS).toBeDefined();
      expect(QuoteService.STATUS_TRANSITIONS.DRAFT).toContain('SENT');
      expect(QuoteService.STATUS_TRANSITIONS.SENT).toContain('WON');
      expect(QuoteService.STATUS_TRANSITIONS.SENT).toContain('LOST');
      expect(QuoteService.STATUS_TRANSITIONS.PENDING_APPROVAL).toContain('APPROVED');
      expect(QuoteService.STATUS_TRANSITIONS.PENDING_APPROVAL).toContain('REJECTED');
    });
  });

  // ============================================================================
  // Error Handling Tests
  // ============================================================================

  describe('Error handling', () => {
    it('should propagate database errors from getStatsSummary', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('Connection timeout'));

      await expect(service.getStatsSummary())
        .rejects.toThrow('Connection timeout');
    });

    it('should propagate database errors from getQuoteById', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('Query failed'));

      await expect(service.getQuoteById(1))
        .rejects.toThrow('Query failed');
    });

    it('should propagate database errors from deleteQuote', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('Foreign key constraint'));

      await expect(service.deleteQuote(1))
        .rejects.toThrow('Foreign key constraint');
    });

    it('should always release client even when createQuote fails', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce(new Error('Insert failed'));

      await expect(service.createQuote({ customer_id: 1, items: [] }))
        .rejects.toThrow();

      expect(mockClient.release).toHaveBeenCalled();
    });
  });
});
