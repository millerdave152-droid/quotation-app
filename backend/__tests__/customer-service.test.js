/**
 * TeleTime Quotation App - CustomerService Tests
 * Tests for backend/services/CustomerService.js
 */

const CustomerService = require('../services/CustomerService');
const LookupService = require('../services/LookupService');

// Mock LookupService to prevent actual DB calls from the static method
jest.mock('../services/LookupService', () => ({
  saveNamesFromCustomer: jest.fn().mockResolvedValue({ firstName: true, lastName: true })
}));

describe('CustomerService', () => {
  let service;
  let mockPool;
  let mockCache;

  beforeEach(() => {
    mockPool = {
      query: jest.fn()
    };

    mockCache = {
      cacheQuery: jest.fn((key, ttl, fn) => fn()),
      invalidatePattern: jest.fn()
    };

    service = new CustomerService(mockPool, mockCache);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================================
  // getCustomers Tests
  // ============================================================================

  describe('getCustomers()', () => {
    it('should return paginated customers with default options', async () => {
      const mockCustomers = [
        { id: 1, name: 'John Doe', email: 'john@example.com', city: 'Mississauga', province: 'ON' },
        { id: 2, name: 'Jane Smith', email: 'jane@example.com', city: 'Toronto', province: 'ON' }
      ];

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '2' }] }) // count query
        .mockResolvedValueOnce({ rows: mockCustomers }); // data query

      const result = await service.getCustomers();

      expect(result.customers).toEqual(mockCustomers);
      expect(result.pagination).toEqual({
        total: 2,
        page: 1,
        limit: 50,
        totalPages: 1
      });
      expect(mockCache.cacheQuery).toHaveBeenCalled();
    });

    it('should apply search filter across multiple columns', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 1, name: 'John Doe' }] });

      await service.getCustomers({ search: 'John' });

      // The count query should include the ILIKE search condition
      const countCall = mockPool.query.mock.calls[0];
      expect(countCall[1]).toEqual(['%John%']);
    });

    it('should filter by city and province', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '3' }] })
        .mockResolvedValueOnce({ rows: [] });

      await service.getCustomers({ city: 'Toronto', province: 'ON' });

      const countCall = mockPool.query.mock.calls[0];
      expect(countCall[1]).toEqual(['%Toronto%', '%ON%']);
    });

    it('should handle pagination correctly', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '150' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.getCustomers({ page: 3, limit: 25 });

      expect(result.pagination).toEqual({
        total: 150,
        page: 3,
        limit: 25,
        totalPages: 6
      });

      // Verify offset calculation: (page-1) * limit = (3-1) * 25 = 50
      const dataCall = mockPool.query.mock.calls[1];
      const params = dataCall[1];
      expect(params).toContain(25);  // limit
      expect(params).toContain(50);  // offset
    });

    it('should sanitize sort order to ASC or DESC', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      await service.getCustomers({ sortOrder: 'INVALID' });

      // Invalid sort order should default to ASC
      const dataQuery = mockPool.query.mock.calls[1][0];
      expect(dataQuery).toContain('ASC');
    });

    it('should default to sorting by name for invalid sort columns', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      await service.getCustomers({ sortBy: 'drop_table' });

      const dataQuery = mockPool.query.mock.calls[1][0];
      expect(dataQuery).toContain('ORDER BY name');
    });

    it('should combine search with city and province filters', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      await service.getCustomers({ search: 'Doe', city: 'Mississauga', province: 'ON' });

      const countCall = mockPool.query.mock.calls[0];
      expect(countCall[1]).toEqual(['%Doe%', '%Mississauga%', '%ON%']);
    });
  });

  // ============================================================================
  // getStatsOverview Tests
  // ============================================================================

  describe('getStatsOverview()', () => {
    it('should return customer statistics with top customers', async () => {
      const mockStats = {
        rows: [{
          total_customers: '150',
          new_this_month: '12',
          new_this_week: '3'
        }]
      };

      const mockTopCustomers = {
        rows: [
          { id: 1, name: 'Big Corp', email: 'corp@example.com', company: 'Big Corp Inc', quote_count: '25', total_spent: '125000' },
          { id: 2, name: 'Small Biz', email: 'small@example.com', company: 'Small LLC', quote_count: '10', total_spent: '45000' }
        ]
      };

      mockPool.query
        .mockResolvedValueOnce(mockStats)
        .mockResolvedValueOnce(mockTopCustomers);

      const result = await service.getStatsOverview();

      expect(result.overview).toEqual(mockStats.rows[0]);
      expect(result.topCustomers).toHaveLength(2);
      expect(result.topCustomers[0].name).toBe('Big Corp');
    });

    it('should handle empty customer database', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ total_customers: '0', new_this_month: '0', new_this_week: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await service.getStatsOverview();

      expect(result.overview.total_customers).toBe('0');
      expect(result.topCustomers).toHaveLength(0);
    });
  });

  // ============================================================================
  // getCustomerById Tests
  // ============================================================================

  describe('getCustomerById()', () => {
    it('should return customer with quotes and stats', async () => {
      const mockCustomer = {
        id: 1, name: 'John Doe', email: 'john@example.com',
        phone: '905-555-0123', company: 'Teletime', city: 'Mississauga'
      };

      const mockQuotes = [
        { id: 10, quotation_number: 'QT-2025-0001', created_at: '2025-01-15', status: 'WON', total_amount: 250000 },
        { id: 11, quotation_number: 'QT-2025-0002', created_at: '2025-02-20', status: 'SENT', total_amount: 150000 }
      ];

      const mockStats = {
        total_quotes: '5',
        total_spent: '750000',
        average_order: '150000',
        last_quote_date: '2025-03-01'
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: [mockCustomer] })
        .mockResolvedValueOnce({ rows: mockQuotes })
        .mockResolvedValueOnce({ rows: [mockStats] });

      const result = await service.getCustomerById(1);

      expect(result).not.toBeNull();
      expect(result.customer).toEqual(mockCustomer);
      expect(result.quotes).toHaveLength(2);
      expect(result.stats.total_quotes).toBe('5');
    });

    it('should return null for non-existent customer', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await service.getCustomerById(999);

      expect(result).toBeNull();
      // Should NOT query for quotes if customer not found
      expect(mockPool.query).toHaveBeenCalledTimes(1);
    });
  });

  // ============================================================================
  // createCustomer Tests
  // ============================================================================

  describe('createCustomer()', () => {
    it('should create a customer with all fields', async () => {
      const customerData = {
        name: 'Alice Johnson',
        email: 'alice@example.com',
        phone: '416-555-9876',
        company: 'Tech Solutions',
        address: '123 Main St',
        city: 'Toronto',
        province: 'ON',
        postal_code: 'M5H 2N2',
        notes: 'VIP customer',
        marketing_source: 'referral',
        marketing_source_detail: 'Google',
        marketing_source_id: 'ref-123',
        first_contact_date: '2025-01-15',
        email_transactional: true,
        email_marketing: true,
        sms_transactional: false,
        sms_marketing: false
      };

      const createdCustomer = { id: 10, ...customerData, created_at: '2025-03-01' };
      mockPool.query.mockResolvedValueOnce({ rows: [createdCustomer] });

      const result = await service.createCustomer(customerData);

      expect(result).toEqual(createdCustomer);
      expect(mockPool.query).toHaveBeenCalledTimes(1);

      // Verify all 17 params were passed
      const queryCall = mockPool.query.mock.calls[0];
      expect(queryCall[1]).toHaveLength(17);
      expect(queryCall[1][0]).toBe('Alice Johnson');
      expect(queryCall[1][1]).toBe('alice@example.com');
    });

    it('should use default values for optional consent fields', async () => {
      const customerData = {
        name: 'Bob Brown',
        email: 'bob@example.com'
      };

      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 11, ...customerData }] });

      await service.createCustomer(customerData);

      const queryCall = mockPool.query.mock.calls[0];
      const params = queryCall[1];

      // email_transactional defaults to true
      expect(params[13]).toBe(true);
      // email_marketing defaults to false
      expect(params[14]).toBe(false);
      // sms_transactional defaults to false
      expect(params[15]).toBe(false);
      // sms_marketing defaults to false
      expect(params[16]).toBe(false);
    });

    it('should invalidate cache after creation', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Test' }] });

      await service.createCustomer({ name: 'Test', email: 'test@test.com' });

      expect(mockCache.invalidatePattern).toHaveBeenCalledWith('customers:');
    });

    it('should call LookupService.saveNamesFromCustomer asynchronously', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'John Doe' }] });

      await service.createCustomer({ name: 'John Doe', email: 'john@test.com' });

      expect(LookupService.saveNamesFromCustomer).toHaveBeenCalledWith('John Doe');
    });

    it('should not call saveNamesFromCustomer when name is empty', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 1, name: '' }] });

      await service.createCustomer({ name: '', email: 'test@test.com' });

      expect(LookupService.saveNamesFromCustomer).not.toHaveBeenCalled();
    });

    it('should handle null marketing_source fields gracefully', async () => {
      const customerData = {
        name: 'Test User',
        email: 'test@example.com',
        marketing_source: '',
        marketing_source_detail: '',
        marketing_source_id: '',
        first_contact_date: ''
      };

      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 1, ...customerData }] });

      await service.createCustomer(customerData);

      const params = mockPool.query.mock.calls[0][1];
      // Empty strings should be converted to null for optional fields
      expect(params[9]).toBeNull();  // marketing_source
      expect(params[10]).toBeNull(); // marketing_source_detail
      expect(params[11]).toBeNull(); // marketing_source_id
      expect(params[12]).toBeNull(); // first_contact_date
    });
  });

  // ============================================================================
  // updateCustomer Tests
  // ============================================================================

  describe('updateCustomer()', () => {
    it('should update a customer without preference fields', async () => {
      const updatedCustomer = {
        id: 1, name: 'Updated Name', email: 'updated@example.com',
        phone: '905-555-0000', company: 'New Company'
      };

      mockPool.query.mockResolvedValueOnce({ rows: [updatedCustomer] });

      const result = await service.updateCustomer(1, {
        name: 'Updated Name',
        email: 'updated@example.com',
        phone: '905-555-0000',
        company: 'New Company'
      });

      expect(result).toEqual(updatedCustomer);
      // Without preference fields, query uses 10 params (9 fields + id)
      const params = mockPool.query.mock.calls[0][1];
      expect(params).toHaveLength(10);
    });

    it('should update customer with preference fields', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 1, email_marketing: true }] });

      await service.updateCustomer(1, {
        name: 'Test',
        email: 'test@test.com',
        email_transactional: true,
        email_marketing: true,
        sms_transactional: false,
        sms_marketing: false
      });

      // With preference fields, query uses 14 params
      const params = mockPool.query.mock.calls[0][1];
      expect(params).toHaveLength(14);
    });

    it('should return null for non-existent customer', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await service.updateCustomer(999, { name: 'Test', email: 'test@test.com' });

      expect(result).toBeNull();
    });

    it('should invalidate cache after update', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });

      await service.updateCustomer(1, { name: 'Test', email: 'test@test.com' });

      expect(mockCache.invalidatePattern).toHaveBeenCalledWith('customers:');
    });
  });

  // ============================================================================
  // deleteCustomer Tests
  // ============================================================================

  describe('deleteCustomer()', () => {
    it('should delete an existing customer', async () => {
      const deletedCustomer = { id: 1, name: 'Deleted User', email: 'deleted@example.com' };
      mockPool.query.mockResolvedValueOnce({ rows: [deletedCustomer] });

      const result = await service.deleteCustomer(1);

      expect(result).toEqual(deletedCustomer);
      expect(mockPool.query).toHaveBeenCalledWith(
        'DELETE FROM customers WHERE id = $1 RETURNING *',
        [1]
      );
    });

    it('should return null when deleting non-existent customer', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await service.deleteCustomer(999);

      expect(result).toBeNull();
    });

    it('should invalidate cache after deletion', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });

      await service.deleteCustomer(1);

      expect(mockCache.invalidatePattern).toHaveBeenCalledWith('customers:');
    });
  });

  // ============================================================================
  // isEmailInUse Tests
  // ============================================================================

  describe('isEmailInUse()', () => {
    it('should return true when email is in use', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 5 }] });

      const result = await service.isEmailInUse('taken@example.com');

      expect(result).toBe(true);
    });

    it('should return false when email is not in use', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await service.isEmailInUse('available@example.com');

      expect(result).toBe(false);
    });

    it('should exclude a specific customer ID when checking', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await service.isEmailInUse('user@example.com', 10);

      const queryCall = mockPool.query.mock.calls[0];
      expect(queryCall[0]).toContain('AND id != $2');
      expect(queryCall[1]).toEqual(['user@example.com', 10]);
    });

    it('should not add exclude clause when excludeId is null', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await service.isEmailInUse('user@example.com');

      const queryCall = mockPool.query.mock.calls[0];
      expect(queryCall[0]).not.toContain('AND id != $2');
      expect(queryCall[1]).toEqual(['user@example.com']);
    });
  });

  // ============================================================================
  // calculateLifetimeValue Tests
  // ============================================================================

  describe('calculateLifetimeValue()', () => {
    it('should return null for non-existent customer', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await service.calculateLifetimeValue(999);

      expect(result).toBeNull();
    });

    it('should calculate CLV using order revenue when available', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          customer_id: 1,
          customer_name: 'Acme Corp',
          customer_since: '2024-01-01T00:00:00.000Z',
          total_quotes: '8',
          converted_quotes: '5',
          quote_revenue: '30000.00',
          first_quote_date: '2024-01-15',
          last_quote_date: '2025-12-01',
          total_orders: '4',
          completed_orders: '4',
          order_revenue_cents: '2500000', // $25,000 in cents
          first_order_date: '2024-02-01',
          last_order_date: '2025-11-15'
        }]
      });

      const result = await service.calculateLifetimeValue(1);

      expect(result).not.toBeNull();
      expect(result.customerId).toBe(1);
      expect(result.customerName).toBe('Acme Corp');
      // Should use order revenue ($25,000), not quote revenue ($30,000)
      expect(result.metrics.lifetimeValue).toBe(25000);
      expect(result.metrics.totalTransactions).toBe(4);
      expect(result.metrics.averageOrderValue).toBe(6250);
      expect(result.segment).toBe('gold'); // $25,000 >= $20,000
      expect(result.engagement.churnRisk).toBeDefined();
    });

    it('should fall back to quote revenue when no orders exist', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          customer_id: 2,
          customer_name: 'Small Biz',
          customer_since: '2025-01-01T00:00:00.000Z',
          total_quotes: '3',
          converted_quotes: '2',
          quote_revenue: '7500.00',
          first_quote_date: '2025-01-15',
          last_quote_date: '2025-10-01',
          total_orders: '0',
          completed_orders: '0',
          order_revenue_cents: '0',
          first_order_date: null,
          last_order_date: null
        }]
      });

      const result = await service.calculateLifetimeValue(2);

      expect(result.metrics.lifetimeValue).toBe(7500);
      expect(result.metrics.totalTransactions).toBe(2); // converted_quotes
      expect(result.segment).toBe('silver'); // $7,500 >= $5,000
    });

    it('should assign correct segment tiers', async () => {
      const makeData = (orderCents) => ({
        rows: [{
          customer_id: 1,
          customer_name: 'Test',
          customer_since: '2024-01-01T00:00:00.000Z',
          total_quotes: '1',
          converted_quotes: '1',
          quote_revenue: '0',
          first_quote_date: '2024-01-01',
          last_quote_date: '2024-01-01',
          total_orders: '1',
          completed_orders: '1',
          order_revenue_cents: String(orderCents),
          first_order_date: '2024-01-01',
          last_order_date: '2024-01-01'
        }]
      });

      // Platinum: >= $50,000
      mockPool.query.mockResolvedValueOnce(makeData(7500000)); // $75,000
      let result = await service.calculateLifetimeValue(1);
      expect(result.segment).toBe('platinum');

      // Gold: >= $20,000
      mockPool.query.mockResolvedValueOnce(makeData(3500000)); // $35,000
      result = await service.calculateLifetimeValue(1);
      expect(result.segment).toBe('gold');

      // Silver: >= $5,000
      mockPool.query.mockResolvedValueOnce(makeData(1000000)); // $10,000
      result = await service.calculateLifetimeValue(1);
      expect(result.segment).toBe('silver');

      // Bronze: < $5,000
      mockPool.query.mockResolvedValueOnce(makeData(200000)); // $2,000
      result = await service.calculateLifetimeValue(1);
      expect(result.segment).toBe('bronze');
    });

    it('should determine churn risk based on days since last activity', async () => {
      const now = new Date();

      // High risk: > 180 days
      const oldDate = new Date(now);
      oldDate.setDate(oldDate.getDate() - 200);

      mockPool.query.mockResolvedValueOnce({
        rows: [{
          customer_id: 1,
          customer_name: 'Old Customer',
          customer_since: '2020-01-01T00:00:00.000Z',
          total_quotes: '1',
          converted_quotes: '1',
          quote_revenue: '1000',
          first_quote_date: '2020-01-01',
          last_quote_date: oldDate.toISOString(),
          total_orders: '0',
          completed_orders: '0',
          order_revenue_cents: '0',
          first_order_date: null,
          last_order_date: null
        }]
      });

      const result = await service.calculateLifetimeValue(1);
      expect(result.engagement.churnRisk).toBe('high');
    });

    it('should set churn risk to unknown when no activity date exists', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          customer_id: 1,
          customer_name: 'New Customer',
          customer_since: '2025-01-01T00:00:00.000Z',
          total_quotes: '0',
          converted_quotes: '0',
          quote_revenue: '0',
          first_quote_date: null,
          last_quote_date: null,
          total_orders: '0',
          completed_orders: '0',
          order_revenue_cents: '0',
          first_order_date: null,
          last_order_date: null
        }]
      });

      const result = await service.calculateLifetimeValue(1);
      expect(result.engagement.churnRisk).toBe('unknown');
      expect(result.engagement.daysSinceLastActivity).toBeNull();
    });

    it('should calculate conversion rate from quotes', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          customer_id: 1,
          customer_name: 'Test',
          customer_since: '2024-01-01T00:00:00.000Z',
          total_quotes: '10',
          converted_quotes: '7',
          quote_revenue: '5000',
          first_quote_date: '2024-01-01',
          last_quote_date: '2024-06-01',
          total_orders: '0',
          completed_orders: '0',
          order_revenue_cents: '0',
          first_order_date: null,
          last_order_date: null
        }]
      });

      const result = await service.calculateLifetimeValue(1);
      expect(result.metrics.conversionRate).toBe(70);
      expect(result.quoteStats.totalQuotes).toBe(10);
      expect(result.quoteStats.convertedQuotes).toBe(7);
    });
  });

  // ============================================================================
  // getLifetimeValueSummary Tests
  // ============================================================================

  describe('getLifetimeValueSummary()', () => {
    it('should return CLV summary with customer list and aggregate stats', async () => {
      const mockCustomerRows = [
        {
          customer_id: 1,
          customer_name: 'Big Spender',
          email: 'big@example.com',
          company: 'Big Corp',
          customer_since: '2023-01-01',
          lifetime_value: '55000.00',
          total_transactions: '10',
          average_order_value: '5500.00',
          last_activity: '2025-12-01',
          segment: 'platinum'
        }
      ];

      const mockAggregateStats = {
        rows: [{
          total_customers: '200',
          active_customers: '150',
          total_clv: '2500000.00',
          average_clv: '16666.67',
          platinum_count: '5',
          gold_count: '20',
          silver_count: '50',
          bronze_count: '75'
        }]
      };

      mockPool.query
        .mockResolvedValueOnce({ rows: mockCustomerRows })
        .mockResolvedValueOnce(mockAggregateStats);

      const result = await service.getLifetimeValueSummary();

      expect(result.customers).toHaveLength(1);
      expect(result.customers[0].customerId).toBe(1);
      expect(result.customers[0].lifetimeValue).toBe(55000);
      expect(result.customers[0].segment).toBe('platinum');

      expect(result.summary.totalCustomers).toBe(200);
      expect(result.summary.activeCustomers).toBe(150);
      expect(result.summary.segmentBreakdown.platinum).toBe(5);
      expect(result.summary.segmentBreakdown.gold).toBe(20);
    });

    it('should filter by segment', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total_customers: '0', active_customers: '0', total_clv: '0', average_clv: '0', platinum_count: '0', gold_count: '0', silver_count: '0', bronze_count: '0' }] });

      await service.getLifetimeValueSummary({ segment: 'gold' });

      const dataQuery = mockPool.query.mock.calls[0][0];
      expect(dataQuery).toContain('lifetime_value >= 20000 AND lifetime_value < 50000');
    });

    it('should respect custom limit', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total_customers: '0', active_customers: '0', total_clv: '0', average_clv: '0', platinum_count: '0', gold_count: '0', silver_count: '0', bronze_count: '0' }] });

      await service.getLifetimeValueSummary({ limit: 10 });

      const params = mockPool.query.mock.calls[0][1];
      expect(params).toEqual([10]);
    });

    it('should handle invalid segment filter gracefully', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ total_customers: '0', active_customers: '0', total_clv: '0', average_clv: '0', platinum_count: '0', gold_count: '0', silver_count: '0', bronze_count: '0' }] });

      await service.getLifetimeValueSummary({ segment: 'diamond' });

      // Invalid segment should not add a HAVING clause
      const dataQuery = mockPool.query.mock.calls[0][0];
      expect(dataQuery).not.toContain('HAVING');
    });
  });

  // ============================================================================
  // invalidateCache Tests
  // ============================================================================

  describe('invalidateCache()', () => {
    it('should call cache.invalidatePattern with customers prefix', () => {
      service.invalidateCache();

      expect(mockCache.invalidatePattern).toHaveBeenCalledWith('customers:');
    });

    it('should not throw when cache is null', () => {
      const serviceNoCache = new CustomerService(mockPool, null);

      expect(() => serviceNoCache.invalidateCache()).not.toThrow();
    });

    it('should not throw when cache lacks invalidatePattern method', () => {
      const serviceEmptyCache = new CustomerService(mockPool, {});

      expect(() => serviceEmptyCache.invalidateCache()).not.toThrow();
    });
  });

  // ============================================================================
  // Tag Methods Tests
  // ============================================================================

  describe('getAllTags()', () => {
    it('should return tags with customer counts', async () => {
      const mockTags = [
        { id: 1, name: 'VIP', color: '#ff0000', is_system: true, customer_count: '15' },
        { id: 2, name: 'New Lead', color: '#00ff00', is_system: false, customer_count: '42' }
      ];

      mockPool.query.mockResolvedValueOnce({ rows: mockTags });

      const result = await service.getAllTags();

      expect(result).toEqual(mockTags);
      expect(result).toHaveLength(2);
    });
  });

  describe('createTag()', () => {
    it('should create a tag with provided data', async () => {
      const tagData = { name: 'Priority', color: '#ff6600', description: 'Priority customers' };
      const createdTag = { id: 5, ...tagData, is_system: false };

      mockPool.query.mockResolvedValueOnce({ rows: [createdTag] });

      const result = await service.createTag(tagData, 1);

      expect(result).toEqual(createdTag);
      const params = mockPool.query.mock.calls[0][1];
      expect(params).toEqual(['Priority', '#ff6600', 'Priority customers', 1]);
    });

    it('should use default color when not provided', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Test', color: '#3b82f6' }] });

      await service.createTag({ name: 'Test' });

      const params = mockPool.query.mock.calls[0][1];
      expect(params[1]).toBe('#3b82f6');
    });
  });

  describe('updateTag()', () => {
    it('should update a non-system tag', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ is_system: false }] }) // check system
        .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Renamed', color: '#aaa' }] });

      const result = await service.updateTag(1, { name: 'Renamed', color: '#aaa' });

      expect(result).toBeDefined();
      expect(result.name).toBe('Renamed');
    });

    it('should throw error when renaming a system tag', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ is_system: true }] });

      await expect(service.updateTag(1, { name: 'NewName' }))
        .rejects.toThrow('Cannot rename system tags');
    });

    it('should return null when tag does not exist', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await service.updateTag(999, { name: 'Test' });

      expect(result).toBeNull();
    });

    it('should return null when no updates provided', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ is_system: false }] });

      const result = await service.updateTag(1, {});

      expect(result).toBeNull();
    });

    it('should allow updating color of a system tag', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ is_system: true }] })
        .mockResolvedValueOnce({ rows: [{ id: 1, color: '#000', is_system: true }] });

      const result = await service.updateTag(1, { color: '#000' });

      expect(result).toBeDefined();
    });
  });

  describe('deleteTag()', () => {
    it('should delete a non-system tag', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 2 }] });

      const result = await service.deleteTag(2);

      expect(result).toBe(true);
      const queryCall = mockPool.query.mock.calls[0];
      expect(queryCall[0]).toContain('is_system = FALSE');
    });

    it('should return false when tag does not exist or is system', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await service.deleteTag(1);

      expect(result).toBe(false);
    });
  });

  describe('getCustomerTags()', () => {
    it('should return tags assigned to a customer', async () => {
      const mockTags = [
        { id: 1, name: 'VIP', color: '#ff0000', assigned_at: '2025-01-01', assigned_by_name: 'Admin User' }
      ];

      mockPool.query.mockResolvedValueOnce({ rows: mockTags });

      const result = await service.getCustomerTags(5);

      expect(result).toEqual(mockTags);
      expect(mockPool.query.mock.calls[0][1]).toEqual([5]);
    });
  });

  describe('addTagToCustomer()', () => {
    it('should add a tag to a customer', async () => {
      const assignment = { id: 1, customer_id: 5, tag_id: 3, assigned_by: 1 };
      mockPool.query.mockResolvedValueOnce({ rows: [assignment] });

      const result = await service.addTagToCustomer(5, 3, 1);

      expect(result).toEqual(assignment);
      expect(mockCache.invalidatePattern).toHaveBeenCalledWith('customers:');
    });

    it('should return already_assigned when tag is duplicate', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] }); // ON CONFLICT DO NOTHING returns no rows

      const result = await service.addTagToCustomer(5, 3, 1);

      expect(result).toEqual({ already_assigned: true });
    });

    it('should throw descriptive error for foreign key violations', async () => {
      const fkError = new Error('foreign key violation');
      fkError.code = '23503';
      mockPool.query.mockRejectedValueOnce(fkError);

      await expect(service.addTagToCustomer(999, 999))
        .rejects.toThrow('Customer or tag not found');
    });

    it('should re-throw non-FK errors', async () => {
      const genericError = new Error('Connection lost');
      genericError.code = '08001';
      mockPool.query.mockRejectedValueOnce(genericError);

      await expect(service.addTagToCustomer(5, 3))
        .rejects.toThrow('Connection lost');
    });
  });

  describe('removeTagFromCustomer()', () => {
    it('should remove a tag from a customer and return true', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] });

      const result = await service.removeTagFromCustomer(5, 3);

      expect(result).toBe(true);
      expect(mockCache.invalidatePattern).toHaveBeenCalledWith('customers:');
    });

    it('should return false when tag was not assigned', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await service.removeTagFromCustomer(5, 999);

      expect(result).toBe(false);
    });
  });

  describe('getCustomersByTag()', () => {
    it('should return paginated customers for a tag', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '25' }] })
        .mockResolvedValueOnce({
          rows: [
            { id: 1, name: 'Customer A', assigned_at: '2025-01-01' },
            { id: 2, name: 'Customer B', assigned_at: '2025-01-02' }
          ]
        });

      const result = await service.getCustomersByTag(3, { page: 1, limit: 50 });

      expect(result.customers).toHaveLength(2);
      expect(result.pagination.total).toBe(25);
      expect(result.pagination.totalPages).toBe(1);
    });
  });

  describe('bulkAddTag()', () => {
    it('should bulk add a tag to multiple customers', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await service.bulkAddTag([1, 2, 3], 5, 1);

      expect(result).toEqual({ tagged: 3 });
      expect(mockCache.invalidatePattern).toHaveBeenCalledWith('customers:');

      // Verify the query params contain all customer IDs
      const params = mockPool.query.mock.calls[0][1];
      expect(params).toContain(1);
      expect(params).toContain(2);
      expect(params).toContain(3);
      expect(params).toContain(5); // tag_id appears 3 times
    });
  });

  describe('getTagStats()', () => {
    it('should return tag statistics', async () => {
      const mockStats = [
        { id: 1, name: 'VIP', color: '#ff0000', is_system: true, customer_count: '15', recent_assignments: '3' },
        { id: 2, name: 'Lead', color: '#00ff00', is_system: false, customer_count: '42', recent_assignments: '10' }
      ];

      mockPool.query.mockResolvedValueOnce({ rows: mockStats });

      const result = await service.getTagStats();

      expect(result).toHaveLength(2);
      expect(result[0].customer_count).toBe('15');
    });
  });

  describe('updateTagAutoRules()', () => {
    it('should update auto-assign rules for a tag', async () => {
      const rules = {
        conditions: [
          { field: 'lifetime_spend', operator: 'gte', value: 50000 }
        ],
        logic: 'AND'
      };

      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 1, name: 'VIP', auto_assign_rules: rules }]
      });

      const result = await service.updateTagAutoRules(1, rules);

      expect(result).toBeDefined();
      expect(mockPool.query.mock.calls[0][1]).toEqual([JSON.stringify(rules), 1]);
    });

    it('should return null when tag does not exist', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await service.updateTagAutoRules(999, {});

      expect(result).toBeNull();
    });
  });

  describe('evaluateAutoTags()', () => {
    it('should evaluate and assign auto tags based on rules', async () => {
      // Return tags with rules
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            name: 'Big Spender',
            auto_assign_rules: {
              conditions: [
                { field: 'lifetime_spend', operator: 'gte', value: 50000 }
              ],
              logic: 'AND'
            }
          }]
        })
        // Return matching customers
        .mockResolvedValueOnce({ rows: [{ id: 10 }, { id: 20 }] })
        // Two INSERT calls for each customer
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const results = await service.evaluateAutoTags();

      expect(results).toHaveLength(1);
      expect(results[0].tag_id).toBe(1);
      expect(results[0].tag_name).toBe('Big Spender');
      expect(results[0].assigned_count).toBe(2);
    });

    it('should skip tags with no conditions', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          name: 'Empty',
          auto_assign_rules: { conditions: [], logic: 'AND' }
        }]
      });

      const results = await service.evaluateAutoTags();

      expect(results).toHaveLength(0);
    });

    it('should skip tags with null auto_assign_rules', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          name: 'No Rules',
          auto_assign_rules: null
        }]
      });

      const results = await service.evaluateAutoTags();

      expect(results).toHaveLength(0);
    });
  });

  describe('_resolveAutoRuleField()', () => {
    it('should map known fields to SQL expressions', () => {
      expect(service._resolveAutoRuleField('lifetime_spend')).toBe('COALESCE(o.lifetime_spend, 0)');
      expect(service._resolveAutoRuleField('order_count')).toBe('COALESCE(o.order_count, 0)');
      expect(service._resolveAutoRuleField('city')).toBe('c.city');
      expect(service._resolveAutoRuleField('province')).toBe('c.province');
      expect(service._resolveAutoRuleField('created_at')).toBe('c.created_at');
    });

    it('should return null for unknown fields', () => {
      expect(service._resolveAutoRuleField('invalid_field')).toBeNull();
      expect(service._resolveAutoRuleField('DROP TABLE')).toBeNull();
    });
  });

  // ============================================================================
  // Error Handling Tests
  // ============================================================================

  describe('Error handling', () => {
    it('should propagate database errors from getCustomers', async () => {
      mockCache.cacheQuery.mockImplementation(() => {
        throw new Error('Database connection lost');
      });

      await expect(service.getCustomers()).rejects.toThrow('Database connection lost');
    });

    it('should propagate database errors from createCustomer', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('Unique constraint violation'));

      await expect(service.createCustomer({ name: 'Test', email: 'test@test.com' }))
        .rejects.toThrow('Unique constraint violation');
    });

    it('should propagate database errors from deleteCustomer', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('Foreign key constraint'));

      await expect(service.deleteCustomer(1))
        .rejects.toThrow('Foreign key constraint');
    });
  });
});
