import { cachedFetch } from './apiCache';

jest.mock('./apiCache');

describe('Quote Analytics & Reporting Service', () => {
  const API_BASE_URL = '/api';

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  describe('getDashboardMetrics', () => {
    test('should fetch dashboard metrics', async () => {
      const mockData = {
        metrics: {
          total_quotes: 100,
          accepted_quotes: 60,
          rejected_quotes: 20,
          pending_quotes: 20,
          total_value: 500000,
          won_value: 300000,
          average_quote_value: 5000,
          conversion_rate: '60.00'
        }
      };

      cachedFetch.mockResolvedValue(mockData);

      const getDashboardMetrics = async (startDate, endDate, userId = null) => {
        const params = new URLSearchParams({
          start_date: startDate,
          end_date: endDate
        });
        if (userId) params.append('user_id', userId);
        return await cachedFetch(`${API_BASE_URL}/analytics/dashboard?${params}`);
      };

      const result = await getDashboardMetrics('2024-01-01', '2024-12-31');
      expect(result.metrics.total_quotes).toBe(100);
      expect(result.metrics.conversion_rate).toBe('60.00');
    });

    test('should filter metrics by user', async () => {
      const mockData = {
        metrics: {
          total_quotes: 50,
          conversion_rate: '60.00'
        }
      };

      cachedFetch.mockResolvedValue(mockData);

      const getDashboardMetrics = async (startDate, endDate, userId = null) => {
        const params = new URLSearchParams({
          start_date: startDate,
          end_date: endDate
        });
        if (userId) params.append('user_id', userId);
        return await cachedFetch(`${API_BASE_URL}/analytics/dashboard?${params}`);
      };

      const result = await getDashboardMetrics('2024-01-01', '2024-12-31', 1);
      expect(result.metrics.total_quotes).toBe(50);
    });
  });

  describe('getConversionFunnel', () => {
    test('should fetch conversion funnel data', async () => {
      const mockData = {
        funnel: [
          { status: 'draft', count: 20 },
          { status: 'pending', count: 30 },
          { status: 'sent', count: 40 },
          { status: 'accepted', count: 50 },
          { status: 'rejected', count: 10 }
        ]
      };

      cachedFetch.mockResolvedValue(mockData);

      const getConversionFunnel = async (startDate, endDate) => {
        return await cachedFetch(
          `${API_BASE_URL}/analytics/conversion-funnel?start_date=${startDate}&end_date=${endDate}`
        );
      };

      const result = await getConversionFunnel('2024-01-01', '2024-12-31');
      expect(result.funnel).toHaveLength(5);
      expect(result.funnel[0].status).toBe('draft');
    });
  });

  describe('getRevenueTrends', () => {
    test('should fetch revenue trends by month', async () => {
      const mockData = {
        trends: [
          { period: '2024-01', quote_count: 20, total_revenue: 100000, won_revenue: 60000 },
          { period: '2024-02', quote_count: 25, total_revenue: 125000, won_revenue: 75000 }
        ]
      };

      cachedFetch.mockResolvedValue(mockData);

      const getRevenueTrends = async (startDate, endDate, interval = 'month') => {
        return await cachedFetch(
          `${API_BASE_URL}/analytics/revenue-trends?start_date=${startDate}&end_date=${endDate}&interval=${interval}`
        );
      };

      const result = await getRevenueTrends('2024-01-01', '2024-12-31', 'month');
      expect(result.trends).toHaveLength(2);
      expect(result.trends[0].period).toBe('2024-01');
    });

    test('should fetch revenue trends by week', async () => {
      const mockData = {
        trends: [{ period: '2024-01', quote_count: 5, total_revenue: 25000, won_revenue: 15000 }]
      };

      cachedFetch.mockResolvedValue(mockData);

      const getRevenueTrends = async (startDate, endDate, interval = 'month') => {
        return await cachedFetch(
          `${API_BASE_URL}/analytics/revenue-trends?start_date=${startDate}&end_date=${endDate}&interval=${interval}`
        );
      };

      const result = await getRevenueTrends('2024-01-01', '2024-12-31', 'week');
      expect(result.trends).toHaveLength(1);
    });
  });

  describe('getTopCustomers', () => {
    test('should fetch top customers', async () => {
      const mockData = {
        customers: [
          { id: 1, name: 'Customer A', quote_count: 10, total_value: 100000, won_value: 80000 },
          { id: 2, name: 'Customer B', quote_count: 8, total_value: 80000, won_value: 60000 }
        ]
      };

      cachedFetch.mockResolvedValue(mockData);

      const getTopCustomers = async (startDate, endDate, limit = 10) => {
        return await cachedFetch(
          `${API_BASE_URL}/analytics/top-customers?start_date=${startDate}&end_date=${endDate}&limit=${limit}`
        );
      };

      const result = await getTopCustomers('2024-01-01', '2024-12-31', 10);
      expect(result.customers).toHaveLength(2);
      expect(result.customers[0].name).toBe('Customer A');
    });
  });

  describe('getUserPerformance', () => {
    test('should fetch user performance metrics', async () => {
      const mockData = {
        performance: [
          {
            id: 1,
            name: 'User A',
            quote_count: 50,
            accepted_count: 30,
            total_value: 250000,
            won_value: 150000,
            conversion_rate: '60.00'
          },
          {
            id: 2,
            name: 'User B',
            quote_count: 40,
            accepted_count: 20,
            total_value: 200000,
            won_value: 100000,
            conversion_rate: '50.00'
          }
        ]
      };

      cachedFetch.mockResolvedValue(mockData);

      const getUserPerformance = async (startDate, endDate) => {
        return await cachedFetch(
          `${API_BASE_URL}/analytics/user-performance?start_date=${startDate}&end_date=${endDate}`
        );
      };

      const result = await getUserPerformance('2024-01-01', '2024-12-31');
      expect(result.performance).toHaveLength(2);
      expect(result.performance[0].conversion_rate).toBe('60.00');
    });
  });

  describe('getQuoteStatusDistribution', () => {
    test('should fetch quote status distribution', async () => {
      const mockData = {
        distribution: [
          { status: 'accepted', count: 60, total_value: 300000 },
          { status: 'pending', count: 20, total_value: 100000 },
          { status: 'rejected', count: 20, total_value: 100000 }
        ]
      };

      cachedFetch.mockResolvedValue(mockData);

      const getQuoteStatusDistribution = async (startDate, endDate) => {
        return await cachedFetch(
          `${API_BASE_URL}/analytics/quote-status-distribution?start_date=${startDate}&end_date=${endDate}`
        );
      };

      const result = await getQuoteStatusDistribution('2024-01-01', '2024-12-31');
      expect(result.distribution).toHaveLength(3);
    });
  });

  describe('getAverageResponseTime', () => {
    test('should fetch average response times', async () => {
      const mockData = {
        response_time: {
          avg_days_to_accept: 5.2,
          avg_days_to_send: 2.1
        }
      };

      cachedFetch.mockResolvedValue(mockData);

      const getAverageResponseTime = async (startDate, endDate) => {
        return await cachedFetch(
          `${API_BASE_URL}/analytics/average-response-time?start_date=${startDate}&end_date=${endDate}`
        );
      };

      const result = await getAverageResponseTime('2024-01-01', '2024-12-31');
      expect(result.response_time.avg_days_to_accept).toBe(5.2);
      expect(result.response_time.avg_days_to_send).toBe(2.1);
    });
  });

  describe('getProductPerformance', () => {
    test('should fetch product performance', async () => {
      const mockData = {
        products: [
          { id: 1, name: 'Product A', quote_count: 20, total_quantity: 100, total_revenue: 50000 },
          { id: 2, name: 'Product B', quote_count: 15, total_quantity: 75, total_revenue: 37500 }
        ]
      };

      cachedFetch.mockResolvedValue(mockData);

      const getProductPerformance = async (startDate, endDate, limit = 10) => {
        return await cachedFetch(
          `${API_BASE_URL}/analytics/product-performance?start_date=${startDate}&end_date=${endDate}&limit=${limit}`
        );
      };

      const result = await getProductPerformance('2024-01-01', '2024-12-31', 10);
      expect(result.products).toHaveLength(2);
      expect(result.products[0].name).toBe('Product A');
    });
  });

  describe('exportReport', () => {
    test('should export report as PDF', async () => {
      const mockResponse = {
        success: true,
        export_url: '/exports/dashboard_1234567890.pdf',
        format: 'pdf'
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const exportReport = async (reportType, format, filters) => {
        const response = await fetch(`${API_BASE_URL}/analytics/export`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ report_type: reportType, format, filters })
        });
        return await response.json();
      };

      const result = await exportReport('dashboard', 'pdf', {
        start_date: '2024-01-01',
        end_date: '2024-12-31'
      });

      expect(result.success).toBe(true);
      expect(result.export_url).toContain('.pdf');
    });

    test('should export report as Excel', async () => {
      const mockResponse = {
        success: true,
        export_url: '/exports/revenue_1234567890.xlsx',
        format: 'excel'
      };

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse
      });

      const exportReport = async (reportType, format, filters) => {
        const response = await fetch(`${API_BASE_URL}/analytics/export`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ report_type: reportType, format, filters })
        });
        return await response.json();
      };

      const result = await exportReport('revenue', 'excel', {});
      expect(result.success).toBe(true);
      expect(result.format).toBe('excel');
    });
  });

  describe('getCustomerInsights', () => {
    test('should fetch customer insights', async () => {
      const mockData = {
        insights: {
          total_quotes: 20,
          accepted_quotes: 15,
          total_value: 100000,
          won_value: 75000,
          average_quote_value: 5000,
          last_quote_date: '2024-06-01',
          conversion_rate: '75.00'
        }
      };

      cachedFetch.mockResolvedValue(mockData);

      const getCustomerInsights = async (customerId) => {
        return await cachedFetch(`${API_BASE_URL}/analytics/customer-insights?customer_id=${customerId}`);
      };

      const result = await getCustomerInsights(1);
      expect(result.insights.total_quotes).toBe(20);
      expect(result.insights.conversion_rate).toBe('75.00');
    });
  });

  describe('getWinLossReasons', () => {
    test('should fetch win/loss reasons', async () => {
      const mockData = {
        reasons: [
          { status: 'rejected', rejection_reason: 'Price too high', count: 15 },
          { status: 'rejected', rejection_reason: 'Competitor offer', count: 10 },
          { status: 'accepted', rejection_reason: null, count: 50 }
        ]
      };

      cachedFetch.mockResolvedValue(mockData);

      const getWinLossReasons = async (startDate, endDate) => {
        return await cachedFetch(
          `${API_BASE_URL}/analytics/win-loss-reasons?start_date=${startDate}&end_date=${endDate}`
        );
      };

      const result = await getWinLossReasons('2024-01-01', '2024-12-31');
      expect(result.reasons).toHaveLength(3);
    });
  });

  describe('Analytics Utilities', () => {
    test('should calculate conversion rate', () => {
      const calculateConversionRate = (accepted, total) => {
        if (total === 0) return '0.00';
        return ((accepted / total) * 100).toFixed(2);
      };

      expect(calculateConversionRate(60, 100)).toBe('60.00');
      expect(calculateConversionRate(0, 100)).toBe('0.00');
      expect(calculateConversionRate(0, 0)).toBe('0.00');
    });

    test('should calculate win rate', () => {
      const calculateWinRate = (won, total) => {
        if (total === 0) return '0.00';
        return ((won / total) * 100).toFixed(2);
      };

      expect(calculateWinRate(75, 100)).toBe('75.00');
      expect(calculateWinRate(0, 0)).toBe('0.00');
    });

    test('should format currency', () => {
      const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD'
        }).format(amount);
      };

      expect(formatCurrency(100000)).toBe('$100,000.00');
      expect(formatCurrency(0)).toBe('$0.00');
    });

    test('should format percentage', () => {
      const formatPercentage = (value) => {
        return `${parseFloat(value).toFixed(2)}%`;
      };

      expect(formatPercentage('60.00')).toBe('60.00%');
      expect(formatPercentage('0')).toBe('0.00%');
    });
  });

  describe('Chart Data Formatting', () => {
    test('should format funnel chart data', () => {
      const formatFunnelData = (funnel) => {
        return funnel.map(stage => ({
          name: stage.status.charAt(0).toUpperCase() + stage.status.slice(1),
          value: stage.count
        }));
      };

      const funnel = [
        { status: 'draft', count: 20 },
        { status: 'sent', count: 40 }
      ];

      const formatted = formatFunnelData(funnel);
      expect(formatted[0].name).toBe('Draft');
      expect(formatted[0].value).toBe(20);
    });

    test('should format trend chart data', () => {
      const formatTrendData = (trends) => {
        return trends.map(trend => ({
          period: trend.period,
          revenue: parseFloat(trend.total_revenue),
          won: parseFloat(trend.won_revenue)
        }));
      };

      const trends = [
        { period: '2024-01', total_revenue: 100000, won_revenue: 60000 }
      ];

      const formatted = formatTrendData(trends);
      expect(formatted[0].revenue).toBe(100000);
      expect(formatted[0].won).toBe(60000);
    });

    test('should format pie chart data', () => {
      const formatPieData = (distribution) => {
        return distribution.map(item => ({
          label: item.status,
          value: item.count
        }));
      };

      const distribution = [
        { status: 'accepted', count: 60 },
        { status: 'rejected', count: 20 }
      ];

      const formatted = formatPieData(distribution);
      expect(formatted).toHaveLength(2);
      expect(formatted[0].label).toBe('accepted');
    });
  });

  describe('Performance Metrics', () => {
    test('should calculate average quote value', () => {
      const calculateAverageValue = (totalValue, count) => {
        if (count === 0) return 0;
        return totalValue / count;
      };

      expect(calculateAverageValue(500000, 100)).toBe(5000);
      expect(calculateAverageValue(0, 0)).toBe(0);
    });

    test('should get performance trend', () => {
      const getPerformanceTrend = (current, previous) => {
        if (previous === 0) return 'new';
        const change = ((current - previous) / previous) * 100;
        if (change > 0) return 'up';
        if (change < 0) return 'down';
        return 'stable';
      };

      expect(getPerformanceTrend(120, 100)).toBe('up');
      expect(getPerformanceTrend(80, 100)).toBe('down');
      expect(getPerformanceTrend(100, 100)).toBe('stable');
      expect(getPerformanceTrend(100, 0)).toBe('new');
    });

    test('should calculate growth rate', () => {
      const calculateGrowthRate = (current, previous) => {
        if (previous === 0) return '0.00';
        return (((current - previous) / previous) * 100).toFixed(2);
      };

      expect(calculateGrowthRate(120, 100)).toBe('20.00');
      expect(calculateGrowthRate(80, 100)).toBe('-20.00');
      expect(calculateGrowthRate(100, 0)).toBe('0.00');
    });
  });

  describe('Date Range Utilities', () => {
    test('should get preset date ranges', () => {
      const getPresetDateRange = (preset) => {
        const now = new Date('2024-12-31');
        const ranges = {
          today: { start: now, end: now },
          week: {
            start: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
            end: now
          },
          month: {
            start: new Date(now.getFullYear(), now.getMonth(), 1),
            end: now
          },
          year: {
            start: new Date(now.getFullYear(), 0, 1),
            end: now
          }
        };
        return ranges[preset];
      };

      const weekRange = getPresetDateRange('week');
      expect(weekRange.end).toEqual(new Date('2024-12-31'));
    });

    test('should format date for API', () => {
      const formatDateForAPI = (date) => {
        return date.toISOString().split('T')[0];
      };

      expect(formatDateForAPI(new Date('2024-12-31'))).toBe('2024-12-31');
    });
  });

  describe('Report Filtering', () => {
    test('should build filter query string', () => {
      const buildFilterQuery = (filters) => {
        const params = new URLSearchParams();
        Object.keys(filters).forEach(key => {
          if (filters[key] !== null && filters[key] !== undefined) {
            params.append(key, filters[key]);
          }
        });
        return params.toString();
      };

      const filters = {
        start_date: '2024-01-01',
        end_date: '2024-12-31',
        user_id: 1
      };

      const query = buildFilterQuery(filters);
      expect(query).toContain('start_date=2024-01-01');
      expect(query).toContain('user_id=1');
    });
  });

  describe('Data Aggregation', () => {
    test('should aggregate revenue by period', () => {
      const aggregateByPeriod = (data, period) => {
        const aggregated = {};
        data.forEach(item => {
          const key = item[period];
          if (!aggregated[key]) {
            aggregated[key] = { revenue: 0, count: 0 };
          }
          aggregated[key].revenue += item.revenue;
          aggregated[key].count += 1;
        });
        return aggregated;
      };

      const data = [
        { month: '2024-01', revenue: 10000 },
        { month: '2024-01', revenue: 15000 },
        { month: '2024-02', revenue: 20000 }
      ];

      const result = aggregateByPeriod(data, 'month');
      expect(result['2024-01'].revenue).toBe(25000);
      expect(result['2024-01'].count).toBe(2);
    });
  });

  describe('Performance Indicators', () => {
    test('should determine KPI status', () => {
      const getKPIStatus = (actual, target) => {
        const percentage = (actual / target) * 100;
        if (percentage >= 100) return 'excellent';
        if (percentage >= 80) return 'good';
        if (percentage >= 60) return 'fair';
        return 'poor';
      };

      expect(getKPIStatus(100, 100)).toBe('excellent');
      expect(getKPIStatus(90, 100)).toBe('good');
      expect(getKPIStatus(70, 100)).toBe('fair');
      expect(getKPIStatus(50, 100)).toBe('poor');
    });

    test('should calculate target progress', () => {
      const calculateProgress = (current, target) => {
        if (target === 0) return '0.00';
        return Math.min(((current / target) * 100), 100).toFixed(2);
      };

      expect(calculateProgress(50, 100)).toBe('50.00');
      expect(calculateProgress(150, 100)).toBe('100.00');
      expect(calculateProgress(0, 0)).toBe('0.00');
    });
  });
});
