/**
 * Sales Overview Component
 * Shows combined Quote + POS sales with charts
 */

import React, { useState, useEffect, useMemo } from 'react';
import LineChart from './charts/LineChart';
import BarChart from './charts/BarChart';
import { getSalesSummary, getMonthlySalesTrend } from '../../api/reports';

const SalesOverview = ({ dateRange = {} }) => {
  const [salesData, setSalesData] = useState(null);
  const [trendData, setTrendData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('trend'); // 'trend' or 'comparison'
  const [groupBy, setGroupBy] = useState('month');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [summaryRes, trendRes] = await Promise.all([
          getSalesSummary({ ...dateRange, groupBy }),
          getMonthlySalesTrend(6),
        ]);

        if (summaryRes.success) setSalesData(summaryRes.data);
        if (trendRes.success) setTrendData(trendRes.data);
      } catch (error) {
        console.error('Failed to fetch sales data:', error);
      }
      setLoading(false);
    };

    fetchData();
  }, [dateRange, groupBy]);

  // Format trend data for charts
  const chartData = useMemo(() => {
    if (!trendData || trendData.length === 0) return [];

    // Group by month and merge quote + pos
    const grouped = {};
    trendData.forEach(row => {
      const monthKey = new Date(row.month).toLocaleDateString('en-US', { month: 'short' });
      if (!grouped[monthKey]) {
        grouped[monthKey] = { label: monthKey, quote: 0, pos: 0 };
      }
      if (row.source === 'quote') {
        grouped[monthKey].quote = parseFloat(row.total_sales) || 0;
      } else {
        grouped[monthKey].pos = parseFloat(row.total_sales) || 0;
      }
    });

    return Object.values(grouped).reverse();
  }, [trendData]);

  // Format for comparison bar chart
  const comparisonData = useMemo(() => {
    if (!salesData?.totals) return [];

    return salesData.totals.map(row => ({
      label: row.source === 'quote' ? 'Quotes' : 'POS',
      value: parseFloat(row.total_sales) || 0,
      transactions: parseInt(row.transaction_count) || 0,
    }));
  }, [salesData]);

  const formatCurrency = (val) => {
    if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}M`;
    if (val >= 1000) return `$${(val / 1000).toFixed(1)}K`;
    return `$${val.toFixed(2)}`;
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-40 mb-4" />
          <div className="h-64 bg-gray-100 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Sales Overview</h2>
          <p className="text-sm text-gray-500">Quote & POS combined revenue</p>
        </div>

        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('trend')}
              className={`px-3 py-1 text-sm rounded-md transition ${
                viewMode === 'trend'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Trend
            </button>
            <button
              onClick={() => setViewMode('comparison')}
              className={`px-3 py-1 text-sm rounded-md transition ${
                viewMode === 'comparison'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Compare
            </button>
          </div>

          {/* Group by selector */}
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="day">Daily</option>
            <option value="week">Weekly</option>
            <option value="month">Monthly</option>
          </select>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="text-center p-3 bg-gray-50 rounded-lg">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Total Revenue</p>
          <p className="text-xl font-bold text-gray-900">
            {formatCurrency(salesData?.summary?.totalSales || 0)}
          </p>
        </div>
        <div className="text-center p-3 bg-blue-50 rounded-lg">
          <p className="text-xs text-blue-600 uppercase tracking-wide">Quote Revenue</p>
          <p className="text-xl font-bold text-blue-700">
            {formatCurrency(salesData?.summary?.quoteRevenue || 0)}
          </p>
        </div>
        <div className="text-center p-3 bg-green-50 rounded-lg">
          <p className="text-xs text-green-600 uppercase tracking-wide">POS Revenue</p>
          <p className="text-xl font-bold text-green-700">
            {formatCurrency(salesData?.summary?.posRevenue || 0)}
          </p>
        </div>
        <div className="text-center p-3 bg-gray-50 rounded-lg">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Transactions</p>
          <p className="text-xl font-bold text-gray-900">
            {salesData?.summary?.totalTransactions?.toLocaleString() || 0}
          </p>
        </div>
      </div>

      {/* Charts */}
      {viewMode === 'trend' ? (
        <div>
          <div className="flex items-center gap-4 mb-4">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-blue-500" />
              <span className="text-sm text-gray-600">Quotes</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-green-500" />
              <span className="text-sm text-gray-600">POS</span>
            </div>
          </div>
          <LineChart
            data={chartData}
            xKey="label"
            yKey="quote"
            secondaryKey="pos"
            showSecondary
            showArea
            width={700}
            height={280}
            lineColor="#3b82f6"
            secondaryLineColor="#10b981"
          />
        </div>
      ) : (
        <BarChart
          data={comparisonData}
          xKey="label"
          yKey="value"
          width={700}
          height={280}
          barColor="#3b82f6"
        />
      )}
    </div>
  );
};

export default SalesOverview;
