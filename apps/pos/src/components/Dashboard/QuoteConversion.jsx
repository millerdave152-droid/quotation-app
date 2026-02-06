/**
 * Quote Conversion Component
 * Shows quote conversion metrics and funnel
 */

import React, { useState, useEffect } from 'react';
import DonutChart from './charts/DonutChart';
import { getQuoteConversionMetrics, getQuoteConversionTrend } from '../../api/reports';
import {
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/24/outline';

const QuoteConversion = ({ dateRange = {} }) => {
  const [conversionData, setConversionData] = useState(null);
  const [trendData, setTrendData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [metricsRes, trendRes] = await Promise.all([
          getQuoteConversionMetrics(dateRange),
          getQuoteConversionTrend({ ...dateRange, groupBy: 'week' }),
        ]);

        if (metricsRes.success) setConversionData(metricsRes.data);
        if (trendRes.success) setTrendData(trendRes.data);
      } catch (error) {
        console.error('Failed to fetch conversion data:', error);
      }
      setLoading(false);
    };

    fetchData();
  }, [dateRange]);

  // Format data for donut chart
  const donutData = conversionData?.byStatus?.map(status => ({
    label: status.conversion_status.charAt(0).toUpperCase() + status.conversion_status.slice(1),
    value: parseFloat(status.total_value) || 0,
    count: parseInt(status.count) || 0,
  })) || [];

  const formatCurrency = (val) => {
    if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}M`;
    if (val >= 1000) return `$${(val / 1000).toFixed(0)}K`;
    return `$${val.toFixed(0)}`;
  };

  const statusConfig = {
    converted: { color: 'green', icon: CheckCircleIcon, bg: 'bg-green-50', text: 'text-green-700' },
    pending: { color: 'yellow', icon: ClockIcon, bg: 'bg-yellow-50', text: 'text-yellow-700' },
    lost: { color: 'red', icon: XCircleIcon, bg: 'bg-red-50', text: 'text-red-700' },
    expired: { color: 'gray', icon: ExclamationCircleIcon, bg: 'bg-gray-50', text: 'text-gray-700' },
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-40 mb-4" />
          <div className="h-40 bg-gray-100 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Quote Conversion</h2>
          <p className="text-sm text-gray-500">Track quote-to-order pipeline</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Conversion rate highlight */}
        <div className="flex flex-col items-center justify-center">
          <div className="text-center mb-4">
            <p className="text-5xl font-bold text-blue-600">
              {conversionData?.conversionRate?.toFixed(1) || 0}%
            </p>
            <p className="text-sm text-gray-500 mt-1">Conversion Rate</p>
          </div>

          <div className="w-full max-w-xs">
            <DonutChart
              data={donutData}
              valueKey="value"
              labelKey="label"
              size={140}
              thickness={25}
              colors={['#10b981', '#f59e0b', '#ef4444', '#9ca3af']}
              showLegend={false}
            />
          </div>

          <div className="text-center mt-3">
            <p className="text-sm text-gray-500">
              Avg. {conversionData?.avgDaysToConvert?.toFixed(1) || '-'} days to convert
            </p>
          </div>
        </div>

        {/* Status breakdown */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Quote Status Breakdown</h3>

          {conversionData?.byStatus?.map((status, i) => {
            const config = statusConfig[status.conversion_status] || statusConfig.pending;
            const Icon = config.icon;
            const percentage = conversionData.totalQuotes > 0
              ? ((status.count / conversionData.totalQuotes) * 100).toFixed(1)
              : 0;

            return (
              <div
                key={i}
                className={`flex items-center justify-between p-3 rounded-lg ${config.bg}`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-5 h-5 ${config.text}`} />
                  <div>
                    <p className={`font-medium ${config.text}`}>
                      {status.conversion_status.charAt(0).toUpperCase() +
                        status.conversion_status.slice(1)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {status.count} quotes ({percentage}%)
                    </p>
                  </div>
                </div>
                <p className={`font-semibold ${config.text}`}>
                  {formatCurrency(status.total_value || 0)}
                </p>
              </div>
            );
          })}

          {/* Time to conversion distribution */}
          {conversionData?.timeToConversionDistribution?.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">
                Time to Conversion
              </h4>
              <div className="space-y-2">
                {conversionData.timeToConversionDistribution.slice(0, 4).map((bucket, i) => {
                  const maxCount = Math.max(
                    ...conversionData.timeToConversionDistribution.map(b => b.count)
                  );
                  const width = maxCount > 0 ? (bucket.count / maxCount) * 100 : 0;

                  return (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-20">{bucket.time_bucket}</span>
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full"
                          style={{ width: `${width}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-600 w-8 text-right">{bucket.count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default QuoteConversion;
