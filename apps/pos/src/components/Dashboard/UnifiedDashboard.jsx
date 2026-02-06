/**
 * Unified Dashboard Component
 * Main dashboard combining all Quote + POS analytics
 */

import React, { useState, useEffect, useCallback } from 'react';
import StatCard from './StatCard';
import SalesOverview from './SalesOverview';
import QuoteConversion from './QuoteConversion';
import ProductPerformance from './ProductPerformance';
import CustomerInsights from './CustomerInsights';
import ExpiringQuotesWidget from './ExpiringQuotesWidget';
import { getDashboardSummary } from '../../api/reports';
import {
  CalendarIcon,
  ArrowPathIcon,
  DocumentArrowDownIcon,
} from '@heroicons/react/24/outline';

const UnifiedDashboard = () => {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState({
    startDate: null,
    endDate: null,
  });
  const [selectedPeriod, setSelectedPeriod] = useState('month');

  // Calculate date range based on selected period
  useEffect(() => {
    const now = new Date();
    let start;

    switch (selectedPeriod) {
      case 'today':
        start = new Date(now.setHours(0, 0, 0, 0));
        break;
      case 'week':
        start = new Date(now);
        start.setDate(start.getDate() - start.getDay());
        break;
      case 'month':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'quarter':
        const quarter = Math.floor(now.getMonth() / 3);
        start = new Date(now.getFullYear(), quarter * 3, 1);
        break;
      case 'year':
        start = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        start = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    setDateRange({
      startDate: start.toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0],
    });
  }, [selectedPeriod]);

  // Fetch dashboard summary
  const fetchSummary = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getDashboardSummary();
      if (res.success) {
        setSummary(res.data);
      }
    } catch (error) {
      console.error('Failed to fetch dashboard summary:', error);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const handleRefresh = () => {
    fetchSummary();
  };

  const handleExport = () => {
    // TODO: Implement CSV export
    console.log('Export triggered');
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Unified Analytics</h1>
            <p className="text-sm text-gray-500 mt-1">
              Combined Quote & POS performance dashboard
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Period selector */}
            <div className="flex items-center gap-2 bg-white rounded-lg border border-gray-200 p-1">
              <CalendarIcon className="w-4 h-4 text-gray-400 ml-2" />
              {['today', 'week', 'month', 'quarter', 'year'].map((period) => (
                <button
                  key={period}
                  onClick={() => setSelectedPeriod(period)}
                  className={`px-3 py-1.5 text-sm rounded-md transition ${
                    selectedPeriod === period
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {period.charAt(0).toUpperCase() + period.slice(1)}
                </button>
              ))}
            </div>

            {/* Actions */}
            <button
              onClick={handleRefresh}
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-white rounded-lg border border-gray-200 transition"
              title="Refresh data"
            >
              <ArrowPathIcon className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>

            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-4 py-2 bg-white text-gray-700 rounded-lg border border-gray-200 hover:bg-gray-50 transition"
            >
              <DocumentArrowDownIcon className="w-4 h-4" />
              Export
            </button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard
          title="Today's Revenue"
          value={summary?.today?.revenue || 0}
          format="currency"
          icon="currency"
          loading={loading}
        />
        <StatCard
          title="Today's Transactions"
          value={summary?.today?.transactions || 0}
          format="number"
          icon="cart"
          loading={loading}
        />
        <StatCard
          title="This Month"
          value={summary?.thisMonth?.revenue || 0}
          previousValue={summary?.thisWeek?.revenue || 0}
          format="currency"
          icon="chart"
          loading={loading}
        />
        <StatCard
          title="Quote Conversion"
          value={summary?.quoteConversion?.rate || 0}
          format="percent"
          icon="document"
          loading={loading}
        />
      </div>

      {/* AOV Comparison Cards */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl p-6 text-white">
          <p className="text-sm font-medium text-blue-100 mb-1">Quote AOV</p>
          <p className="text-3xl font-bold">
            ${(summary?.aov?.quote || 0).toFixed(2)}
          </p>
          <p className="text-sm text-blue-200 mt-2">Average order value from quotes</p>
        </div>
        <div className="bg-gradient-to-br from-green-500 to-green-600 rounded-xl p-6 text-white">
          <p className="text-sm font-medium text-green-100 mb-1">POS AOV</p>
          <p className="text-3xl font-bold">
            ${(summary?.aov?.pos || 0).toFixed(2)}
          </p>
          <p className="text-sm text-green-200 mt-2">Average order value from walk-ins</p>
        </div>
      </div>

      {/* Top Products Today */}
      {summary?.topProducts?.length > 0 && (
        <div className="bg-white rounded-xl p-4 mb-6 shadow-sm border border-gray-100">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Top Products Today</h3>
          <div className="flex items-center gap-4 overflow-x-auto pb-2">
            {summary.topProducts.map((product, i) => (
              <div
                key={i}
                className="flex-shrink-0 flex items-center gap-3 p-3 bg-gray-50 rounded-lg min-w-48"
              >
                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-600 text-sm font-bold">
                  #{i + 1}
                </span>
                <div>
                  <p className="text-sm font-medium text-gray-900 truncate max-w-32">
                    {product.product_name}
                  </p>
                  <p className="text-xs text-gray-500">
                    {product.units} units | ${parseFloat(product.revenue).toFixed(2)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Content with Sidebar */}
      <div className="flex gap-6">
        {/* Main Content Area */}
        <div className="flex-1 min-w-0">
          {/* Main Charts Grid */}
          <div className="grid grid-cols-2 gap-6 mb-6">
            <SalesOverview dateRange={dateRange} />
            <QuoteConversion dateRange={dateRange} />
          </div>

          {/* Bottom Grid */}
          <div className="grid grid-cols-2 gap-6">
            <ProductPerformance dateRange={dateRange} />
            <CustomerInsights dateRange={dateRange} />
          </div>
        </div>

        {/* Right Sidebar - Expiring Quotes */}
        <div className="w-80 flex-shrink-0">
          <ExpiringQuotesWidget
            daysAhead={7}
            maxQuotes={8}
            defaultExpandedCount={3}
            onViewAllQuotes={() => {
              window.location.href = '/quotes?filter=expiring';
            }}
            onViewQuote={(quote) => {
              window.location.href = `/quotes/${quote.quoteId}`;
            }}
            onConvertToSale={(quote) => {
              window.location.href = `/pos?quote=${quote.quoteId}`;
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default UnifiedDashboard;
