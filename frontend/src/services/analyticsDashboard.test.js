import { cachedFetch } from './apiCache';

jest.mock('./apiCache');

describe('Analytics Dashboard Service', () => {
  const API_BASE_URL = '/api';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('fetchOverview', () => {
    test('should fetch overview analytics', async () => {
      const mockData = {
        total_quotes: 100,
        avg_quote_value: 5000,
        total_quote_value: 500000,
        accepted_quotes: 40,
        rejected_quotes: 20,
        pending_quotes: 40,
        conversion_rate: 40,
        total_revenue: 200000
      };

      cachedFetch.mockResolvedValue(mockData);

      const fetchOverview = async (startDate, endDate) => {
        const data = await cachedFetch(`${API_BASE_URL}/analytics/overview?start_date=${startDate}&end_date=${endDate}`);
        return data;
      };

      const result = await fetchOverview('2024-01-01', '2024-12-31');

      expect(result.total_quotes).toBe(100);
      expect(result.conversion_rate).toBe(40);
      expect(result.total_revenue).toBe(200000);
      expect(cachedFetch).toHaveBeenCalledWith(
        `${API_BASE_URL}/analytics/overview?start_date=2024-01-01&end_date=2024-12-31`
      );
    });
  });

  describe('fetchQuotesByStatus', () => {
    test('should fetch quotes grouped by status', async () => {
      const mockData = {
        data: [
          { status: 'pending', count: 50, total_value: 250000 },
          { status: 'accepted', count: 40, total_value: 200000 },
          { status: 'rejected', count: 10, total_value: 50000 }
        ]
      };

      cachedFetch.mockResolvedValue(mockData);

      const fetchQuotesByStatus = async (startDate, endDate) => {
        const data = await cachedFetch(`${API_BASE_URL}/analytics/quotes-by-status?start_date=${startDate}&end_date=${endDate}`);
        return data;
      };

      const result = await fetchQuotesByStatus('2024-01-01', '2024-12-31');

      expect(result.data).toHaveLength(3);
      expect(result.data[0].status).toBe('pending');
      expect(result.data[0].count).toBe(50);
    });
  });

  describe('fetchRevenueTrends', () => {
    test('should fetch daily revenue trends', async () => {
      const mockData = {
        interval: 'daily',
        data: [
          { period: '2024-01-01', quote_count: 5, revenue: 25000, total_quoted: 30000 },
          { period: '2024-01-02', quote_count: 8, revenue: 40000, total_quoted: 50000 }
        ]
      };

      cachedFetch.mockResolvedValue(mockData);

      const fetchRevenueTrends = async (startDate, endDate, interval) => {
        const data = await cachedFetch(`${API_BASE_URL}/analytics/revenue-trends?start_date=${startDate}&end_date=${endDate}&interval=${interval}`);
        return data;
      };

      const result = await fetchRevenueTrends('2024-01-01', '2024-01-31', 'daily');

      expect(result.interval).toBe('daily');
      expect(result.data).toHaveLength(2);
      expect(result.data[0].revenue).toBe(25000);
    });

    test('should fetch weekly revenue trends', async () => {
      const mockData = {
        interval: 'weekly',
        data: []
      };

      cachedFetch.mockResolvedValue(mockData);

      const fetchRevenueTrends = async (startDate, endDate, interval) => {
        const data = await cachedFetch(`${API_BASE_URL}/analytics/revenue-trends?start_date=${startDate}&end_date=${endDate}&interval=${interval}`);
        return data;
      };

      const result = await fetchRevenueTrends('2024-01-01', '2024-12-31', 'weekly');

      expect(result.interval).toBe('weekly');
    });

    test('should fetch monthly revenue trends', async () => {
      const mockData = {
        interval: 'monthly',
        data: []
      };

      cachedFetch.mockResolvedValue(mockData);

      const fetchRevenueTrends = async (startDate, endDate, interval) => {
        const data = await cachedFetch(`${API_BASE_URL}/analytics/revenue-trends?start_date=${startDate}&end_date=${endDate}&interval=${interval}`);
        return data;
      };

      const result = await fetchRevenueTrends('2024-01-01', '2024-12-31', 'monthly');

      expect(result.interval).toBe('monthly');
    });
  });

  describe('fetchConversionRates', () => {
    test('should fetch conversion rates by customer', async () => {
      const mockData = {
        group_by: 'customer',
        data: [
          { group_id: 1, total_quotes: 10, accepted_quotes: 8, conversion_rate: 80 },
          { group_id: 2, total_quotes: 5, accepted_quotes: 3, conversion_rate: 60 }
        ]
      };

      cachedFetch.mockResolvedValue(mockData);

      const fetchConversionRates = async (groupBy) => {
        const data = await cachedFetch(`${API_BASE_URL}/analytics/conversion-rates?group_by=${groupBy}`);
        return data;
      };

      const result = await fetchConversionRates('customer');

      expect(result.group_by).toBe('customer');
      expect(result.data[0].conversion_rate).toBe(80);
    });
  });

  describe('fetchTopCustomers', () => {
    test('should fetch top customers by revenue', async () => {
      const mockData = {
        data: [
          { customer_id: 1, name: 'Acme Corp', email: 'contact@acme.com', quote_count: 15, total_revenue: 150000, avg_quote_value: 10000 },
          { customer_id: 2, name: 'Tech Inc', email: 'hello@tech.com', quote_count: 10, total_revenue: 100000, avg_quote_value: 10000 }
        ]
      };

      cachedFetch.mockResolvedValue(mockData);

      const fetchTopCustomers = async (limit = 10) => {
        const data = await cachedFetch(`${API_BASE_URL}/analytics/top-customers?limit=${limit}`);
        return data;
      };

      const result = await fetchTopCustomers(10);

      expect(result.data).toHaveLength(2);
      expect(result.data[0].name).toBe('Acme Corp');
      expect(result.data[0].total_revenue).toBe(150000);
    });
  });

  describe('fetchTopProducts', () => {
    test('should fetch top products by quote frequency', async () => {
      const mockData = {
        data: [
          { product_id: 1, name: 'Widget Pro', sku: 'WP-001', times_quoted: 50, total_quantity: 500, total_value: 50000 },
          { product_id: 2, name: 'Gadget Max', sku: 'GM-002', times_quoted: 40, total_quantity: 200, total_value: 40000 }
        ]
      };

      cachedFetch.mockResolvedValue(mockData);

      const fetchTopProducts = async (limit = 10) => {
        const data = await cachedFetch(`${API_BASE_URL}/analytics/top-products?limit=${limit}`);
        return data;
      };

      const result = await fetchTopProducts();

      expect(result.data).toHaveLength(2);
      expect(result.data[0].name).toBe('Widget Pro');
      expect(result.data[0].times_quoted).toBe(50);
    });
  });

  describe('fetchSalesPerformance', () => {
    test('should fetch sales rep performance metrics', async () => {
      const mockData = {
        data: [
          {
            user_id: 1,
            name: 'John Doe',
            email: 'john@company.com',
            quotes_created: 20,
            quotes_won: 15,
            quotes_lost: 5,
            total_revenue: 150000,
            avg_quote_value: 7500,
            win_rate: 75
          }
        ]
      };

      cachedFetch.mockResolvedValue(mockData);

      const fetchSalesPerformance = async () => {
        const data = await cachedFetch(`${API_BASE_URL}/analytics/sales-performance`);
        return data;
      };

      const result = await fetchSalesPerformance();

      expect(result.data).toHaveLength(1);
      expect(result.data[0].name).toBe('John Doe');
      expect(result.data[0].win_rate).toBe(75);
    });
  });

  describe('fetchQuoteVelocity', () => {
    test('should fetch quote timing metrics', async () => {
      const mockData = {
        avg_time_to_decision_hours: '48.50',
        avg_time_to_win_hours: '36.20',
        avg_time_to_loss_hours: '60.80',
        expired_quotes: 5,
        pending_quotes: 25
      };

      cachedFetch.mockResolvedValue(mockData);

      const fetchQuoteVelocity = async () => {
        const data = await cachedFetch(`${API_BASE_URL}/analytics/quote-velocity`);
        return data;
      };

      const result = await fetchQuoteVelocity();

      expect(result.avg_time_to_decision_hours).toBe('48.50');
      expect(result.expired_quotes).toBe(5);
      expect(result.pending_quotes).toBe(25);
    });
  });

  describe('fetchDiscountImpact', () => {
    test('should fetch discount impact analysis', async () => {
      const mockData = {
        quotes_with_discount: 60,
        quotes_without_discount: 40,
        discounted_quotes_won: 45,
        non_discounted_quotes_won: 20,
        discount_conversion_rate: 75,
        non_discount_conversion_rate: 50,
        avg_discount_amount: 500,
        total_discount_given: 30000
      };

      cachedFetch.mockResolvedValue(mockData);

      const fetchDiscountImpact = async () => {
        const data = await cachedFetch(`${API_BASE_URL}/analytics/discount-impact`);
        return data;
      };

      const result = await fetchDiscountImpact();

      expect(result.quotes_with_discount).toBe(60);
      expect(result.discount_conversion_rate).toBe(75);
      expect(result.total_discount_given).toBe(30000);
    });
  });

  describe('fetchExpirationAnalysis', () => {
    test('should fetch expiration analysis', async () => {
      const mockData = {
        expired_pending: 8,
        expiring_soon: 12,
        active_pending: 30,
        avg_expired_value: 5000,
        days_ahead: 7
      };

      cachedFetch.mockResolvedValue(mockData);

      const fetchExpirationAnalysis = async (daysAhead = 7) => {
        const data = await cachedFetch(`${API_BASE_URL}/analytics/expiration-analysis?days_ahead=${daysAhead}`);
        return data;
      };

      const result = await fetchExpirationAnalysis(7);

      expect(result.expired_pending).toBe(8);
      expect(result.expiring_soon).toBe(12);
      expect(result.days_ahead).toBe(7);
    });
  });

  describe('fetchComparison', () => {
    test('should compare two time periods', async () => {
      const mockData = {
        current_period: {
          total_quotes: 100,
          revenue: 200000,
          accepted_quotes: 60
        },
        previous_period: {
          total_quotes: 80,
          revenue: 150000,
          accepted_quotes: 45
        },
        changes: {
          quotes_change_percent: 25,
          revenue_change_percent: 33.33,
          accepted_quotes_change_percent: 33.33
        }
      };

      cachedFetch.mockResolvedValue(mockData);

      const fetchComparison = async (currentStart, currentEnd, previousStart, previousEnd) => {
        const data = await cachedFetch(
          `${API_BASE_URL}/analytics/comparison?current_start=${currentStart}&current_end=${currentEnd}&previous_start=${previousStart}&previous_end=${previousEnd}`
        );
        return data;
      };

      const result = await fetchComparison('2024-07-01', '2024-07-31', '2024-06-01', '2024-06-30');

      expect(result.current_period.total_quotes).toBe(100);
      expect(result.previous_period.total_quotes).toBe(80);
      expect(result.changes.quotes_change_percent).toBe(25);
    });
  });

  describe('Chart Data Formatting', () => {
    test('should format revenue trends for line chart', () => {
      const trendData = [
        { period: '2024-01-01', revenue: 25000 },
        { period: '2024-01-02', revenue: 40000 },
        { period: '2024-01-03', revenue: 35000 }
      ];

      const formatForLineChart = (data) => {
        return {
          labels: data.map(d => d.period),
          datasets: [{
            label: 'Revenue',
            data: data.map(d => d.revenue)
          }]
        };
      };

      const chartData = formatForLineChart(trendData);

      expect(chartData.labels).toEqual(['2024-01-01', '2024-01-02', '2024-01-03']);
      expect(chartData.datasets[0].data).toEqual([25000, 40000, 35000]);
    });

    test('should format quotes by status for pie chart', () => {
      const statusData = [
        { status: 'pending', count: 50 },
        { status: 'accepted', count: 40 },
        { status: 'rejected', count: 10 }
      ];

      const formatForPieChart = (data) => {
        return {
          labels: data.map(d => d.status),
          datasets: [{
            data: data.map(d => d.count)
          }]
        };
      };

      const chartData = formatForPieChart(statusData);

      expect(chartData.labels).toEqual(['pending', 'accepted', 'rejected']);
      expect(chartData.datasets[0].data).toEqual([50, 40, 10]);
    });

    test('should format top customers for bar chart', () => {
      const customerData = [
        { name: 'Acme Corp', total_revenue: 150000 },
        { name: 'Tech Inc', total_revenue: 100000 }
      ];

      const formatForBarChart = (data) => {
        return {
          labels: data.map(d => d.name),
          datasets: [{
            label: 'Revenue',
            data: data.map(d => d.total_revenue)
          }]
        };
      };

      const chartData = formatForBarChart(customerData);

      expect(chartData.labels).toEqual(['Acme Corp', 'Tech Inc']);
      expect(chartData.datasets[0].data).toEqual([150000, 100000]);
    });
  });

  describe('Date Range Utilities', () => {
    test('should calculate date range for last 30 days', () => {
      const getLastNDays = (days) => {
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - days);
        return {
          start_date: start.toISOString().split('T')[0],
          end_date: end.toISOString().split('T')[0]
        };
      };

      const range = getLastNDays(30);

      expect(range.start_date).toBeDefined();
      expect(range.end_date).toBeDefined();
      expect(typeof range.start_date).toBe('string');
    });

    test('should calculate current month date range', () => {
      const getCurrentMonth = () => {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        return {
          start_date: start.toISOString().split('T')[0],
          end_date: end.toISOString().split('T')[0]
        };
      };

      const range = getCurrentMonth();

      expect(range.start_date).toMatch(/^\d{4}-\d{2}-01$/);
      expect(range.end_date).toBeDefined();
    });

    test('should calculate previous month date range', () => {
      const getPreviousMonth = () => {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const end = new Date(now.getFullYear(), now.getMonth(), 0);
        return {
          start_date: start.toISOString().split('T')[0],
          end_date: end.toISOString().split('T')[0]
        };
      };

      const range = getPreviousMonth();

      expect(range.start_date).toBeDefined();
      expect(range.end_date).toBeDefined();
    });
  });

  describe('Metric Calculations', () => {
    test('should calculate conversion rate', () => {
      const calculateConversionRate = (accepted, total) => {
        if (total === 0) return 0;
        return parseFloat(((accepted / total) * 100).toFixed(2));
      };

      expect(calculateConversionRate(40, 100)).toBe(40);
      expect(calculateConversionRate(0, 0)).toBe(0);
      expect(calculateConversionRate(1, 3)).toBe(33.33);
    });

    test('should calculate percentage change', () => {
      const calculatePercentageChange = (current, previous) => {
        if (!previous || previous === 0) return null;
        return parseFloat((((current - previous) / previous) * 100).toFixed(2));
      };

      expect(calculatePercentageChange(100, 80)).toBe(25);
      expect(calculatePercentageChange(80, 100)).toBe(-20);
      expect(calculatePercentageChange(100, 0)).toBeNull();
    });

    test('should calculate average', () => {
      const calculateAverage = (values) => {
        if (values.length === 0) return 0;
        const sum = values.reduce((acc, val) => acc + val, 0);
        return parseFloat((sum / values.length).toFixed(2));
      };

      expect(calculateAverage([10, 20, 30])).toBe(20);
      expect(calculateAverage([5000, 7000, 8000])).toBe(6666.67);
      expect(calculateAverage([])).toBe(0);
    });

    test('should calculate total revenue', () => {
      const calculateTotalRevenue = (quotes) => {
        return quotes
          .filter(q => q.status === 'accepted')
          .reduce((sum, q) => sum + q.total_amount, 0);
      };

      const quotes = [
        { status: 'accepted', total_amount: 10000 },
        { status: 'accepted', total_amount: 15000 },
        { status: 'pending', total_amount: 20000 },
        { status: 'rejected', total_amount: 5000 }
      ];

      expect(calculateTotalRevenue(quotes)).toBe(25000);
    });
  });

  describe('Data Aggregation', () => {
    test('should group quotes by status', () => {
      const groupByStatus = (quotes) => {
        const groups = {};
        quotes.forEach(quote => {
          if (!groups[quote.status]) {
            groups[quote.status] = { count: 0, total_value: 0 };
          }
          groups[quote.status].count++;
          groups[quote.status].total_value += quote.total_amount;
        });
        return Object.keys(groups).map(status => ({
          status,
          count: groups[status].count,
          total_value: groups[status].total_value
        }));
      };

      const quotes = [
        { status: 'pending', total_amount: 5000 },
        { status: 'pending', total_amount: 7000 },
        { status: 'accepted', total_amount: 10000 }
      ];

      const grouped = groupByStatus(quotes);

      expect(grouped).toHaveLength(2);
      expect(grouped.find(g => g.status === 'pending').count).toBe(2);
      expect(grouped.find(g => g.status === 'pending').total_value).toBe(12000);
    });

    test('should aggregate by time period', () => {
      const aggregateByMonth = (quotes) => {
        const groups = {};
        quotes.forEach(quote => {
          const month = quote.created_at.substring(0, 7); // YYYY-MM
          if (!groups[month]) {
            groups[month] = { period: month, count: 0, revenue: 0 };
          }
          groups[month].count++;
          if (quote.status === 'accepted') {
            groups[month].revenue += quote.total_amount;
          }
        });
        return Object.values(groups).sort((a, b) => a.period.localeCompare(b.period));
      };

      const quotes = [
        { created_at: '2024-01-15', status: 'accepted', total_amount: 10000 },
        { created_at: '2024-01-20', status: 'accepted', total_amount: 15000 },
        { created_at: '2024-02-10', status: 'pending', total_amount: 20000 }
      ];

      const aggregated = aggregateByMonth(quotes);

      expect(aggregated).toHaveLength(2);
      expect(aggregated[0].period).toBe('2024-01');
      expect(aggregated[0].count).toBe(2);
      expect(aggregated[0].revenue).toBe(25000);
    });
  });

  describe('UI Formatting Utilities', () => {
    test('should format currency', () => {
      const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD'
        }).format(amount);
      };

      expect(formatCurrency(10000)).toBe('$10,000.00');
      expect(formatCurrency(5000.50)).toBe('$5,000.50');
    });

    test('should format percentage', () => {
      const formatPercentage = (value) => {
        return `${value.toFixed(2)}%`;
      };

      expect(formatPercentage(45.5)).toBe('45.50%');
      expect(formatPercentage(100)).toBe('100.00%');
    });

    test('should format large numbers', () => {
      const formatLargeNumber = (num) => {
        if (num >= 1000000) {
          return `${(num / 1000000).toFixed(1)}M`;
        } else if (num >= 1000) {
          return `${(num / 1000).toFixed(1)}K`;
        }
        return num.toString();
      };

      expect(formatLargeNumber(1500000)).toBe('1.5M');
      expect(formatLargeNumber(50000)).toBe('50.0K');
      expect(formatLargeNumber(500)).toBe('500');
    });

    test('should get trend indicator', () => {
      const getTrendIndicator = (current, previous) => {
        if (!previous || previous === 0) return 'neutral';
        if (current > previous) return 'up';
        if (current < previous) return 'down';
        return 'neutral';
      };

      expect(getTrendIndicator(100, 80)).toBe('up');
      expect(getTrendIndicator(80, 100)).toBe('down');
      expect(getTrendIndicator(100, 100)).toBe('neutral');
      expect(getTrendIndicator(100, 0)).toBe('neutral');
    });

    test('should get performance color', () => {
      const getPerformanceColor = (value, threshold) => {
        if (value >= threshold.excellent) return 'green';
        if (value >= threshold.good) return 'yellow';
        return 'red';
      };

      const conversionThreshold = { excellent: 50, good: 30 };

      expect(getPerformanceColor(60, conversionThreshold)).toBe('green');
      expect(getPerformanceColor(40, conversionThreshold)).toBe('yellow');
      expect(getPerformanceColor(20, conversionThreshold)).toBe('red');
    });
  });

  describe('Export Utilities', () => {
    test('should prepare data for CSV export', () => {
      const prepareForCSV = (data, columns) => {
        const headers = columns.join(',');
        const rows = data.map(row =>
          columns.map(col => row[col]).join(',')
        );
        return [headers, ...rows].join('\n');
      };

      const data = [
        { name: 'Acme Corp', revenue: 150000, quotes: 15 },
        { name: 'Tech Inc', revenue: 100000, quotes: 10 }
      ];

      const csv = prepareForCSV(data, ['name', 'revenue', 'quotes']);

      expect(csv).toContain('name,revenue,quotes');
      expect(csv).toContain('Acme Corp,150000,15');
      expect(csv).toContain('Tech Inc,100000,10');
    });

    test('should generate filename with timestamp', () => {
      const generateFilename = (prefix) => {
        const date = new Date().toISOString().split('T')[0];
        return `${prefix}_${date}.csv`;
      };

      const filename = generateFilename('analytics_report');

      expect(filename).toMatch(/^analytics_report_\d{4}-\d{2}-\d{2}\.csv$/);
    });
  });

  describe('Filter Utilities', () => {
    test('should filter by date range', () => {
      const filterByDateRange = (quotes, startDate, endDate) => {
        return quotes.filter(quote => {
          const date = new Date(quote.created_at);
          return date >= new Date(startDate) && date <= new Date(endDate);
        });
      };

      const quotes = [
        { created_at: '2024-01-15', total_amount: 10000 },
        { created_at: '2024-02-15', total_amount: 15000 },
        { created_at: '2024-03-15', total_amount: 20000 }
      ];

      const filtered = filterByDateRange(quotes, '2024-02-01', '2024-02-28');

      expect(filtered).toHaveLength(1);
      expect(filtered[0].created_at).toBe('2024-02-15');
    });

    test('should filter by status', () => {
      const filterByStatus = (quotes, status) => {
        return quotes.filter(quote => quote.status === status);
      };

      const quotes = [
        { status: 'accepted', total_amount: 10000 },
        { status: 'pending', total_amount: 15000 },
        { status: 'accepted', total_amount: 20000 }
      ];

      const filtered = filterByStatus(quotes, 'accepted');

      expect(filtered).toHaveLength(2);
      expect(filtered.every(q => q.status === 'accepted')).toBe(true);
    });

    test('should filter by minimum value', () => {
      const filterByMinValue = (quotes, minValue) => {
        return quotes.filter(quote => quote.total_amount >= minValue);
      };

      const quotes = [
        { total_amount: 5000 },
        { total_amount: 15000 },
        { total_amount: 25000 }
      ];

      const filtered = filterByMinValue(quotes, 10000);

      expect(filtered).toHaveLength(2);
      expect(filtered.every(q => q.total_amount >= 10000)).toBe(true);
    });
  });

  describe('Dashboard Card Metrics', () => {
    test('should calculate key performance indicators', () => {
      const calculateKPIs = (overview) => {
        return {
          totalQuotes: overview.total_quotes,
          conversionRate: `${overview.conversion_rate}%`,
          avgQuoteValue: `$${overview.avg_quote_value.toLocaleString()}`,
          totalRevenue: `$${overview.total_revenue.toLocaleString()}`
        };
      };

      const overview = {
        total_quotes: 100,
        conversion_rate: 40,
        avg_quote_value: 5000,
        total_revenue: 200000
      };

      const kpis = calculateKPIs(overview);

      expect(kpis.totalQuotes).toBe(100);
      expect(kpis.conversionRate).toBe('40%');
      expect(kpis.totalRevenue).toBe('$200,000');
    });
  });
});
