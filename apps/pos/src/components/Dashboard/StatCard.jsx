/**
 * Stat Card Component
 * Displays a single metric with optional comparison
 */

import React from 'react';
import {
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  CurrencyDollarIcon,
  ShoppingCartIcon,
  UserGroupIcon,
  DocumentTextIcon,
  ChartBarIcon,
} from '@heroicons/react/24/outline';

const iconMap = {
  currency: CurrencyDollarIcon,
  cart: ShoppingCartIcon,
  users: UserGroupIcon,
  document: DocumentTextIcon,
  chart: ChartBarIcon,
};

const StatCard = ({
  title,
  value,
  previousValue,
  format = 'number', // 'number', 'currency', 'percent'
  icon = 'currency',
  trend, // 'up', 'down', or calculated from previous
  className = '',
  loading = false,
}) => {
  // Format value based on type
  const formatValue = (val) => {
    if (val === null || val === undefined) return '-';

    switch (format) {
      case 'currency':
        if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}M`;
        if (val >= 1000) return `$${(val / 1000).toFixed(1)}K`;
        return `$${val.toFixed(2)}`;
      case 'percent':
        return `${val.toFixed(1)}%`;
      default:
        if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
        if (val >= 1000) return `${(val / 1000).toFixed(1)}K`;
        return val.toLocaleString();
    }
  };

  // Calculate trend if previous value exists
  const calculateTrend = () => {
    if (trend) return trend;
    if (!previousValue || previousValue === 0) return null;

    const change = ((value - previousValue) / previousValue) * 100;
    return change >= 0 ? 'up' : 'down';
  };

  const trendDirection = calculateTrend();

  // Calculate percentage change
  const percentChange = previousValue
    ? Math.abs(((value - previousValue) / previousValue) * 100).toFixed(1)
    : null;

  const IconComponent = iconMap[icon] || CurrencyDollarIcon;

  if (loading) {
    return (
      <div className={`bg-white rounded-xl p-6 shadow-sm border border-gray-100 ${className}`}>
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-24 mb-4" />
          <div className="h-8 bg-gray-200 rounded w-32 mb-2" />
          <div className="h-3 bg-gray-200 rounded w-20" />
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow ${className}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-500 mb-1">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{formatValue(value)}</p>

          {/* Trend indicator */}
          {percentChange && (
            <div className="flex items-center mt-2 gap-1">
              {trendDirection === 'up' ? (
                <ArrowTrendingUpIcon className="w-4 h-4 text-green-500" />
              ) : (
                <ArrowTrendingDownIcon className="w-4 h-4 text-red-500" />
              )}
              <span
                className={`text-sm font-medium ${
                  trendDirection === 'up' ? 'text-green-600' : 'text-red-600'
                }`}
              >
                {percentChange}%
              </span>
              <span className="text-sm text-gray-400">vs previous</span>
            </div>
          )}
        </div>

        <div className="p-3 rounded-xl bg-blue-50">
          <IconComponent className="w-6 h-6 text-blue-600" />
        </div>
      </div>
    </div>
  );
};

export default StatCard;
