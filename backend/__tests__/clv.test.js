const request = require('supertest');
const express = require('express');
const CustomerService = require('../services/CustomerService');

// Mock database pool
const mockPool = {
  query: jest.fn()
};

// Mock cache
const mockCache = {
  cacheQuery: jest.fn((key, ttl, fn) => fn()),
  invalidatePattern: jest.fn()
};

describe('Customer Lifetime Value (CLV) Feature', () => {
  let customerService;

  beforeAll(() => {
    customerService = new CustomerService(mockPool, mockCache);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ==================== calculateLifetimeValue() Tests ====================

  describe('CustomerService.calculateLifetimeValue()', () => {
    test('should calculate CLV for customer with quotes and orders', async () => {
      const mockData = {
        rows: [{
          customer_id: 1,
          customer_name: 'Acme Corporation',
          customer_since: '2023-01-15T00:00:00.000Z',
          total_quotes: '10',
          converted_quotes: '7',
          quote_revenue: '35000.00',
          first_quote_date: '2023-02-01T00:00:00.000Z',
          last_quote_date: '2024-11-01T00:00:00.000Z',
          total_orders: '5',
          completed_orders: '5',
          order_revenue_cents: '2800000', // $28,000
          first_order_date: '2023-03-01T00:00:00.000Z',
          last_order_date: '2024-10-15T00:00:00.000Z'
        }]
      };

      mockPool.query.mockResolvedValue(mockData);

      const result = await customerService.calculateLifetimeValue(1);

      expect(result).not.toBeNull();
      expect(result.customerId).toBe(1);
      expect(result.customerName).toBe('Acme Corporation');
      expect(result.metrics.lifetimeValue).toBe(28000); // Uses order revenue
      expect(result.metrics.totalTransactions).toBe(5);
      expect(result.metrics.averageOrderValue).toBe(5600);
      expect(result.segment).toBe('gold'); // $28,000 is in gold tier
      expect(result.quoteStats.totalQuotes).toBe(10);
      expect(result.quoteStats.convertedQuotes).toBe(7);
      expect(result.orderStats.totalOrders).toBe(5);
      expect(result.orderStats.completedOrders).toBe(5);
    });

    test('should calculate CLV for customer with only quotes (no orders)', async () => {
      const mockData = {
        rows: [{
          customer_id: 2,
          customer_name: 'Small Business LLC',
          customer_since: '2024-01-01T00:00:00.000Z',
          total_quotes: '3',
          converted_quotes: '2',
          quote_revenue: '8000.00',
          first_quote_date: '2024-02-01T00:00:00.000Z',
          last_quote_date: '2024-09-15T00:00:00.000Z',
          total_orders: '0',
          completed_orders: '0',
          order_revenue_cents: '0',
          first_order_date: null,
          last_order_date: null
        }]
      };

      mockPool.query.mockResolvedValue(mockData);

      const result = await customerService.calculateLifetimeValue(2);

      expect(result).not.toBeNull();
      expect(result.customerId).toBe(2);
      expect(result.metrics.lifetimeValue).toBe(8000); // Uses quote revenue when no orders
      expect(result.metrics.totalTransactions).toBe(2); // converted_quotes
      expect(result.segment).toBe('silver'); // $8,000 is in silver tier
      expect(result.orderStats.totalOrders).toBe(0);
    });

    test('should return null for non-existent customer', async () => {
      mockPool.query.mockResolvedValue({ rows: [] });

      const result = await customerService.calculateLifetimeValue(999);

      expect(result).toBeNull();
    });

    test('should calculate correct segment tiers', async () => {
      // Test platinum tier (>= $50,000)
      const platinumData = {
        rows: [{
          customer_id: 3,
          customer_name: 'Enterprise Corp',
          customer_since: '2022-01-01T00:00:00.000Z',
          total_quotes: '20',
          converted_quotes: '15',
          quote_revenue: '75000.00',
          first_quote_date: '2022-02-01T00:00:00.000Z',
          last_quote_date: '2024-12-01T00:00:00.000Z',
          total_orders: '0',
          completed_orders: '0',
          order_revenue_cents: '0',
          first_order_date: null,
          last_order_date: null
        }]
      };

      mockPool.query.mockResolvedValue(platinumData);
      let result = await customerService.calculateLifetimeValue(3);
      expect(result.segment).toBe('platinum');

      // Test bronze tier (< $5,000)
      const bronzeData = {
        rows: [{
          customer_id: 4,
          customer_name: 'New Customer',
          customer_since: '2024-06-01T00:00:00.000Z',
          total_quotes: '2',
          converted_quotes: '1',
          quote_revenue: '1500.00',
          first_quote_date: '2024-07-01T00:00:00.000Z',
          last_quote_date: '2024-08-01T00:00:00.000Z',
          total_orders: '0',
          completed_orders: '0',
          order_revenue_cents: '0',
          first_order_date: null,
          last_order_date: null
        }]
      };

      mockPool.query.mockResolvedValue(bronzeData);
      result = await customerService.calculateLifetimeValue(4);
      expect(result.segment).toBe('bronze');
    });

    test('should calculate churn risk based on inactivity', async () => {
      // High churn risk (> 180 days since last activity)
      const highChurnDate = new Date();
      highChurnDate.setDate(highChurnDate.getDate() - 200);

      const highChurnData = {
        rows: [{
          customer_id: 5,
          customer_name: 'Inactive Customer',
          customer_since: '2022-01-01T00:00:00.000Z',
          total_quotes: '5',
          converted_quotes: '3',
          quote_revenue: '10000.00',
          first_quote_date: '2022-02-01T00:00:00.000Z',
          last_quote_date: highChurnDate.toISOString(),
          total_orders: '0',
          completed_orders: '0',
          order_revenue_cents: '0',
          first_order_date: null,
          last_order_date: null
        }]
      };

      mockPool.query.mockResolvedValue(highChurnData);
      let result = await customerService.calculateLifetimeValue(5);
      expect(result.engagement.churnRisk).toBe('high');

      // Low churn risk (< 90 days since last activity)
      const lowChurnDate = new Date();
      lowChurnDate.setDate(lowChurnDate.getDate() - 30);

      const lowChurnData = {
        rows: [{
          customer_id: 6,
          customer_name: 'Active Customer',
          customer_since: '2024-01-01T00:00:00.000Z',
          total_quotes: '5',
          converted_quotes: '4',
          quote_revenue: '15000.00',
          first_quote_date: '2024-02-01T00:00:00.000Z',
          last_quote_date: lowChurnDate.toISOString(),
          total_orders: '0',
          completed_orders: '0',
          order_revenue_cents: '0',
          first_order_date: null,
          last_order_date: null
        }]
      };

      mockPool.query.mockResolvedValue(lowChurnData);
      result = await customerService.calculateLifetimeValue(6);
      expect(result.engagement.churnRisk).toBe('low');
    });

    test('should calculate conversion rate correctly', async () => {
      const mockData = {
        rows: [{
          customer_id: 7,
          customer_name: 'Test Customer',
          customer_since: '2024-01-01T00:00:00.000Z',
          total_quotes: '8',
          converted_quotes: '6',
          quote_revenue: '12000.00',
          first_quote_date: '2024-02-01T00:00:00.000Z',
          last_quote_date: '2024-10-01T00:00:00.000Z',
          total_orders: '0',
          completed_orders: '0',
          order_revenue_cents: '0',
          first_order_date: null,
          last_order_date: null
        }]
      };

      mockPool.query.mockResolvedValue(mockData);

      const result = await customerService.calculateLifetimeValue(7);

      // 6 converted out of 8 total = 75%
      expect(result.metrics.conversionRate).toBe(75);
    });

    test('should handle zero quotes gracefully', async () => {
      const mockData = {
        rows: [{
          customer_id: 8,
          customer_name: 'New Customer No Activity',
          customer_since: '2024-11-01T00:00:00.000Z',
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
      };

      mockPool.query.mockResolvedValue(mockData);

      const result = await customerService.calculateLifetimeValue(8);

      expect(result).not.toBeNull();
      expect(result.metrics.lifetimeValue).toBe(0);
      expect(result.metrics.conversionRate).toBe(0);
      expect(result.engagement.churnRisk).toBe('unknown');
    });
  });

  // ==================== getLifetimeValueSummary() Tests ====================

  describe('CustomerService.getLifetimeValueSummary()', () => {
    test('should return CLV summary for all customers', async () => {
      const customersData = {
        rows: [
          {
            customer_id: 1,
            customer_name: 'Enterprise Corp',
            email: 'enterprise@example.com',
            company: 'Enterprise Corp',
            customer_since: '2022-01-01T00:00:00.000Z',
            lifetime_value: '75000.00',
            total_transactions: '15',
            average_order_value: '5000.00',
            last_activity: '2024-11-01T00:00:00.000Z',
            segment: 'platinum'
          },
          {
            customer_id: 2,
            customer_name: 'Medium Business',
            email: 'medium@example.com',
            company: 'Medium Business LLC',
            customer_since: '2023-01-01T00:00:00.000Z',
            lifetime_value: '25000.00',
            total_transactions: '10',
            average_order_value: '2500.00',
            last_activity: '2024-10-15T00:00:00.000Z',
            segment: 'gold'
          }
        ]
      };

      const aggregateData = {
        rows: [{
          total_customers: '100',
          active_customers: '75',
          total_clv: '500000.00',
          average_clv: '6666.67',
          platinum_count: '5',
          gold_count: '15',
          silver_count: '30',
          bronze_count: '25'
        }]
      };

      mockPool.query
        .mockResolvedValueOnce(customersData)
        .mockResolvedValueOnce(aggregateData);

      const result = await customerService.getLifetimeValueSummary();

      expect(result.customers).toHaveLength(2);
      expect(result.customers[0].customerId).toBe(1);
      expect(result.customers[0].lifetimeValue).toBe(75000);
      expect(result.customers[0].segment).toBe('platinum');

      expect(result.summary.totalCustomers).toBe(100);
      expect(result.summary.activeCustomers).toBe(75);
      expect(result.summary.totalCLV).toBe(500000);
      expect(result.summary.segmentBreakdown.platinum).toBe(5);
      expect(result.summary.segmentBreakdown.gold).toBe(15);
    });

    test('should filter by segment', async () => {
      const customersData = {
        rows: [
          {
            customer_id: 1,
            customer_name: 'Platinum Customer',
            email: 'platinum@example.com',
            company: 'Platinum Corp',
            customer_since: '2022-01-01T00:00:00.000Z',
            lifetime_value: '55000.00',
            total_transactions: '20',
            average_order_value: '2750.00',
            last_activity: '2024-11-01T00:00:00.000Z',
            segment: 'platinum'
          }
        ]
      };

      const aggregateData = {
        rows: [{
          total_customers: '100',
          active_customers: '75',
          total_clv: '500000.00',
          average_clv: '6666.67',
          platinum_count: '5',
          gold_count: '15',
          silver_count: '30',
          bronze_count: '25'
        }]
      };

      mockPool.query
        .mockResolvedValueOnce(customersData)
        .mockResolvedValueOnce(aggregateData);

      const result = await customerService.getLifetimeValueSummary({ segment: 'platinum' });

      expect(result.customers).toHaveLength(1);
      expect(result.customers[0].segment).toBe('platinum');

      // Verify the query was called with segment filter
      expect(mockPool.query).toHaveBeenCalled();
      const firstCallArgs = mockPool.query.mock.calls[0];
      expect(firstCallArgs[0]).toContain('lifetime_value >= 50000');
    });

    test('should respect limit parameter', async () => {
      const customersData = { rows: [] };
      const aggregateData = {
        rows: [{
          total_customers: '100',
          active_customers: '75',
          total_clv: '500000.00',
          average_clv: '6666.67',
          platinum_count: '5',
          gold_count: '15',
          silver_count: '30',
          bronze_count: '25'
        }]
      };

      mockPool.query
        .mockResolvedValueOnce(customersData)
        .mockResolvedValueOnce(aggregateData);

      await customerService.getLifetimeValueSummary({ limit: 10 });

      expect(mockPool.query).toHaveBeenCalled();
      const firstCallArgs = mockPool.query.mock.calls[0];
      expect(firstCallArgs[1]).toContain(10); // Limit parameter
    });

    test('should sort by specified column', async () => {
      const customersData = { rows: [] };
      const aggregateData = {
        rows: [{
          total_customers: '100',
          active_customers: '75',
          total_clv: '500000.00',
          average_clv: '6666.67',
          platinum_count: '5',
          gold_count: '15',
          silver_count: '30',
          bronze_count: '25'
        }]
      };

      mockPool.query
        .mockResolvedValueOnce(customersData)
        .mockResolvedValueOnce(aggregateData);

      await customerService.getLifetimeValueSummary({ sortBy: 'total_transactions', sortOrder: 'ASC' });

      expect(mockPool.query).toHaveBeenCalled();
      const firstCallArgs = mockPool.query.mock.calls[0];
      expect(firstCallArgs[0]).toContain('ORDER BY total_transactions ASC');
    });

    test('should handle empty results gracefully', async () => {
      const customersData = { rows: [] };
      const aggregateData = {
        rows: [{
          total_customers: '0',
          active_customers: '0',
          total_clv: '0',
          average_clv: '0',
          platinum_count: '0',
          gold_count: '0',
          silver_count: '0',
          bronze_count: '0'
        }]
      };

      mockPool.query
        .mockResolvedValueOnce(customersData)
        .mockResolvedValueOnce(aggregateData);

      const result = await customerService.getLifetimeValueSummary();

      expect(result.customers).toHaveLength(0);
      expect(result.summary.totalCustomers).toBe(0);
      expect(result.summary.totalCLV).toBe(0);
    });
  });

  // ==================== API Endpoints Tests ====================

  describe('CLV API Endpoints', () => {
    let app;

    beforeAll(() => {
      app = express();
      app.use(express.json());

      // Mock GET /api/customers/lifetime-value
      app.get('/api/customers/lifetime-value', async (req, res) => {
        try {
          const { limit, segment, sortBy, sortOrder } = req.query;

          const result = await customerService.getLifetimeValueSummary({
            limit: limit ? parseInt(limit) : 50,
            segment,
            sortBy,
            sortOrder
          });

          res.json({
            success: true,
            data: result
          });
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      });

      // Mock GET /api/customers/:id/lifetime-value
      app.get('/api/customers/:id/lifetime-value', async (req, res) => {
        try {
          const customerId = parseInt(req.params.id);

          if (isNaN(customerId)) {
            return res.status(400).json({ error: 'Invalid customer ID' });
          }

          const clv = await customerService.calculateLifetimeValue(customerId);

          if (!clv) {
            return res.status(404).json({ error: 'Customer not found' });
          }

          res.json({
            success: true,
            data: clv
          });
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      });
    });

    describe('GET /api/customers/lifetime-value', () => {
      test('should return CLV summary for all customers', async () => {
        const customersData = {
          rows: [
            {
              customer_id: 1,
              customer_name: 'Test Corp',
              email: 'test@example.com',
              company: 'Test Corp',
              customer_since: '2023-01-01T00:00:00.000Z',
              lifetime_value: '30000.00',
              total_transactions: '10',
              average_order_value: '3000.00',
              last_activity: '2024-10-01T00:00:00.000Z',
              segment: 'gold'
            }
          ]
        };

        const aggregateData = {
          rows: [{
            total_customers: '50',
            active_customers: '40',
            total_clv: '200000.00',
            average_clv: '5000.00',
            platinum_count: '2',
            gold_count: '8',
            silver_count: '15',
            bronze_count: '15'
          }]
        };

        mockPool.query
          .mockResolvedValueOnce(customersData)
          .mockResolvedValueOnce(aggregateData);

        const response = await request(app).get('/api/customers/lifetime-value');

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.customers).toHaveLength(1);
        expect(response.body.data.summary.totalCustomers).toBe(50);
      });

      test('should accept filter parameters', async () => {
        const customersData = { rows: [] };
        const aggregateData = {
          rows: [{
            total_customers: '0',
            active_customers: '0',
            total_clv: '0',
            average_clv: '0',
            platinum_count: '0',
            gold_count: '0',
            silver_count: '0',
            bronze_count: '0'
          }]
        };

        mockPool.query
          .mockResolvedValueOnce(customersData)
          .mockResolvedValueOnce(aggregateData);

        const response = await request(app)
          .get('/api/customers/lifetime-value')
          .query({ limit: 10, segment: 'gold', sortBy: 'lifetime_value', sortOrder: 'DESC' });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });
    });

    describe('GET /api/customers/:id/lifetime-value', () => {
      test('should return CLV for specific customer', async () => {
        const mockData = {
          rows: [{
            customer_id: 1,
            customer_name: 'Test Customer',
            customer_since: '2023-01-01T00:00:00.000Z',
            total_quotes: '5',
            converted_quotes: '4',
            quote_revenue: '20000.00',
            first_quote_date: '2023-02-01T00:00:00.000Z',
            last_quote_date: '2024-10-01T00:00:00.000Z',
            total_orders: '0',
            completed_orders: '0',
            order_revenue_cents: '0',
            first_order_date: null,
            last_order_date: null
          }]
        };

        mockPool.query.mockResolvedValue(mockData);

        const response = await request(app).get('/api/customers/1/lifetime-value');

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.customerId).toBe(1);
        expect(response.body.data.metrics.lifetimeValue).toBe(20000);
        expect(response.body.data.segment).toBe('gold');
      });

      test('should return 404 for non-existent customer', async () => {
        mockPool.query.mockResolvedValue({ rows: [] });

        const response = await request(app).get('/api/customers/999/lifetime-value');

        expect(response.status).toBe(404);
        expect(response.body.error).toBe('Customer not found');
      });

      test('should return 400 for invalid customer ID', async () => {
        const response = await request(app).get('/api/customers/abc/lifetime-value');

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Invalid customer ID');
      });
    });
  });
});
