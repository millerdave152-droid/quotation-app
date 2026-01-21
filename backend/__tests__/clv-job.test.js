/**
 * CLV Calculation Job Tests
 * Week 4.5 of 4-week sprint
 *
 * Tests for the nightly CLV calculation job
 */

const CLVCalculationJob = require('../jobs/clvCalculationJob');

// Mock the database pool
jest.mock('../db', () => ({
  query: jest.fn()
}));

// Mock CustomerService
jest.mock('../services/CustomerService', () => {
  return jest.fn().mockImplementation(() => ({
    calculateLifetimeValue: jest.fn()
  }));
});

const pool = require('../db');
const CustomerService = require('../services/CustomerService');

describe('CLVCalculationJob', () => {
  let job;
  let mockCustomerService;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create a fresh job instance for each test
    // Note: The singleton pattern means we need to reset state
    job = Object.create(CLVCalculationJob);
    job.isRunning = false;
    job.lastRun = null;
    job.lastRunStats = null;
    job.cronJob = null;

    // Get the mock CustomerService instance
    mockCustomerService = new CustomerService();
    job.customerService = mockCustomerService;
  });

  describe('determineSegment', () => {
    test('should return platinum for values >= $50,000', () => {
      expect(job.determineSegment(50000)).toBe('platinum');
      expect(job.determineSegment(75000)).toBe('platinum');
      expect(job.determineSegment(100000)).toBe('platinum');
    });

    test('should return gold for values >= $20,000 and < $50,000', () => {
      expect(job.determineSegment(20000)).toBe('gold');
      expect(job.determineSegment(35000)).toBe('gold');
      expect(job.determineSegment(49999)).toBe('gold');
    });

    test('should return silver for values >= $5,000 and < $20,000', () => {
      expect(job.determineSegment(5000)).toBe('silver');
      expect(job.determineSegment(10000)).toBe('silver');
      expect(job.determineSegment(19999)).toBe('silver');
    });

    test('should return bronze for values < $5,000', () => {
      expect(job.determineSegment(0)).toBe('bronze');
      expect(job.determineSegment(1000)).toBe('bronze');
      expect(job.determineSegment(4999)).toBe('bronze');
    });
  });

  describe('determineTrend', () => {
    test('should return stable for new customers with no previous CLV', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });
      const trend = await job.determineTrend(1, 10000);
      expect(trend).toBe('stable');
    });

    test('should return stable for customers with null previous CLV', async () => {
      pool.query.mockResolvedValueOnce({ rows: [{ clv_score: null }] });
      const trend = await job.determineTrend(1, 10000);
      expect(trend).toBe('stable');
    });

    test('should return improving for > 10% increase', async () => {
      // Previous: $10,000 (1,000,000 cents), Current: $12,000
      pool.query.mockResolvedValueOnce({ rows: [{ clv_score: 1000000 }] });
      const trend = await job.determineTrend(1, 12000);
      expect(trend).toBe('improving');
    });

    test('should return declining for > 10% decrease', async () => {
      // Previous: $10,000 (1,000,000 cents), Current: $8,000
      pool.query.mockResolvedValueOnce({ rows: [{ clv_score: 1000000 }] });
      const trend = await job.determineTrend(1, 8000);
      expect(trend).toBe('declining');
    });

    test('should return stable for changes within 10%', async () => {
      // Previous: $10,000 (1,000,000 cents), Current: $10,500 (5% increase)
      pool.query.mockResolvedValueOnce({ rows: [{ clv_score: 1000000 }] });
      const trend = await job.determineTrend(1, 10500);
      expect(trend).toBe('stable');
    });
  });

  describe('getDaysSinceLastActivity', () => {
    test('should return days since last quote', async () => {
      pool.query.mockResolvedValueOnce({ rows: [{ days: 45 }] });
      const days = await job.getDaysSinceLastActivity(1);
      expect(days).toBe(45);
    });

    test('should return null if no quotes exist', async () => {
      pool.query.mockResolvedValueOnce({ rows: [{ days: null }] });
      const days = await job.getDaysSinceLastActivity(1);
      expect(days).toBeNull();
    });

    test('should floor decimal days', async () => {
      pool.query.mockResolvedValueOnce({ rows: [{ days: 45.7 }] });
      const days = await job.getDaysSinceLastActivity(1);
      expect(days).toBe(45);
    });
  });

  describe('run', () => {
    test('should skip if already running', async () => {
      job.isRunning = true;
      const result = await job.run();
      expect(result).toEqual({ skipped: true });
    });

    test('should process all active customers', async () => {
      // Mock getting customers
      pool.query.mockResolvedValueOnce({
        rows: [
          { id: 1, name: 'Customer 1' },
          { id: 2, name: 'Customer 2' },
          { id: 3, name: 'Customer 3' }
        ]
      });

      // Mock CLV calculation for each customer
      mockCustomerService.calculateLifetimeValue
        .mockResolvedValueOnce({
          metrics: { lifetimeValue: 25000, totalTransactions: 10, averageOrderValue: 2500 },
          engagement: { churnRisk: 'low' }
        })
        .mockResolvedValueOnce({
          metrics: { lifetimeValue: 8000, totalTransactions: 5, averageOrderValue: 1600 },
          engagement: { churnRisk: 'medium' }
        })
        .mockResolvedValueOnce({
          metrics: { lifetimeValue: 55000, totalTransactions: 20, averageOrderValue: 2750 },
          engagement: { churnRisk: 'low' }
        });

      // Mock trend determination (3 customers x 1 query each)
      pool.query
        .mockResolvedValueOnce({ rows: [{ clv_score: 2400000 }] }) // Customer 1
        .mockResolvedValueOnce({ rows: [{ clv_score: 750000 }] })  // Customer 2
        .mockResolvedValueOnce({ rows: [{ clv_score: 5000000 }] }); // Customer 3

      // Mock days since activity (3 customers x 1 query each)
      pool.query
        .mockResolvedValueOnce({ rows: [{ days: 10 }] })  // Customer 1
        .mockResolvedValueOnce({ rows: [{ days: 45 }] })  // Customer 2
        .mockResolvedValueOnce({ rows: [{ days: 5 }] });   // Customer 3

      // Mock UPDATE queries (3 customers)
      pool.query
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rowCount: 1 })
        .mockResolvedValueOnce({ rowCount: 1 });

      const stats = await job.run();

      expect(stats.processed).toBe(3);
      expect(stats.updated).toBe(3);
      expect(stats.errors).toBe(0);
      expect(job.isRunning).toBe(false);
    });

    test('should handle errors for individual customers', async () => {
      // Mock getting customers
      pool.query.mockResolvedValueOnce({
        rows: [
          { id: 1, name: 'Customer 1' },
          { id: 2, name: 'Customer 2' }
        ]
      });

      // First customer succeeds, second fails
      mockCustomerService.calculateLifetimeValue
        .mockResolvedValueOnce({
          metrics: { lifetimeValue: 10000, totalTransactions: 5, averageOrderValue: 2000 },
          engagement: { churnRisk: 'low' }
        })
        .mockRejectedValueOnce(new Error('Database error'));

      // Mock for successful customer
      pool.query
        .mockResolvedValueOnce({ rows: [{ clv_score: 950000 }] }) // trend
        .mockResolvedValueOnce({ rows: [{ days: 15 }] })          // days
        .mockResolvedValueOnce({ rowCount: 1 });                   // update

      const stats = await job.run();

      expect(stats.processed).toBe(2);
      expect(stats.updated).toBe(1);
      expect(stats.errors).toBe(1);
      expect(stats.errorDetails).toHaveLength(1);
      expect(stats.errorDetails[0].customerId).toBe(2);
    });

    test('should set lastRun and lastRunStats after completion', async () => {
      pool.query.mockResolvedValueOnce({ rows: [] });

      await job.run();

      expect(job.lastRun).toBeInstanceOf(Date);
      expect(job.lastRunStats).toBeDefined();
      expect(job.lastRunStats.processed).toBe(0);
      expect(job.lastRunStats.duration).toBeDefined();
    });
  });

  describe('runForCustomer', () => {
    test('should calculate CLV for single customer', async () => {
      mockCustomerService.calculateLifetimeValue.mockResolvedValueOnce({
        metrics: { lifetimeValue: 15000, totalTransactions: 8, averageOrderValue: 1875 },
        engagement: { churnRisk: 'low' }
      });

      pool.query
        .mockResolvedValueOnce({ rows: [{ clv_score: 1400000 }] })
        .mockResolvedValueOnce({ rows: [{ days: 20 }] })
        .mockResolvedValueOnce({ rowCount: 1 });

      const result = await job.runForCustomer(123);

      expect(result.success).toBe(true);
      expect(result.customerId).toBe(123);
    });

    test('should return error for failed calculation', async () => {
      mockCustomerService.calculateLifetimeValue.mockResolvedValueOnce(null);

      const result = await job.runForCustomer(456);

      expect(result.success).toBe(false);
      expect(result.customerId).toBe(456);
      expect(result.error).toBeDefined();
    });
  });

  describe('getStatus', () => {
    test('should return current job status', () => {
      job.isRunning = false;
      job.lastRun = new Date('2024-01-15T02:00:00');
      job.lastRunStats = { processed: 100, updated: 98, errors: 2 };
      job.cronJob = { stop: jest.fn() };

      const status = job.getStatus();

      expect(status.isRunning).toBe(false);
      expect(status.lastRun).toEqual(new Date('2024-01-15T02:00:00'));
      expect(status.lastRunStats.processed).toBe(100);
      expect(status.scheduled).toBe(true);
    });

    test('should show not scheduled when no cron job', () => {
      job.cronJob = null;
      const status = job.getStatus();
      expect(status.scheduled).toBe(false);
    });
  });

  describe('start/stop', () => {
    test('should not start if already running', () => {
      job.cronJob = { stop: jest.fn() };
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      job.start();

      expect(consoleSpy).toHaveBeenCalledWith('[CLV Job] Already running');
      consoleSpy.mockRestore();
    });

    test('should stop scheduled job', () => {
      const mockStop = jest.fn();
      job.cronJob = { stop: mockStop };

      job.stop();

      expect(mockStop).toHaveBeenCalled();
      expect(job.cronJob).toBeNull();
    });
  });
});
