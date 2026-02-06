/**
 * Expiring Quotes Widget
 * Dashboard widget showing quotes approaching expiration with follow-up actions
 *
 * Features:
 * - Summary counts with total values at risk
 * - Top 3 most urgent quotes expanded by default
 * - Quick actions: Call (click-to-call), Convert to Sale
 * - Click row to open full quote details
 * - Auto-refresh every 5 minutes
 * - Highlights quotes expiring today in red
 * - Collapses if no quotes expiring this week
 */

import React, { useState, useEffect } from 'react';
import {
  ClockIcon,
  ExclamationTriangleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  CurrencyDollarIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';
import { ExclamationCircleIcon } from '@heroicons/react/24/solid';

import ExpiringQuoteRow from './ExpiringQuoteRow';
import { useExpiringQuotes } from '../../hooks/useExpiringQuotes';

/**
 * Format currency compactly
 */
function formatCurrency(amount) {
  if (amount == null) return '$0';
  if (amount >= 10000) return `$${(amount / 1000).toFixed(0)}K`;
  if (amount >= 1000) return `$${(amount / 1000).toFixed(1)}K`;
  return `$${amount.toFixed(0)}`;
}

/**
 * Stat badge component
 */
function StatBadge({ label, value, variant = 'default', icon: Icon }) {
  const variants = {
    urgent: 'bg-red-100 text-red-700 border-red-200',
    warning: 'bg-orange-100 text-orange-700 border-orange-200',
    default: 'bg-gray-100 text-gray-700 border-gray-200',
    money: 'bg-green-50 text-green-700 border-green-200',
  };

  return (
    <div className={`flex flex-col items-center px-3 py-2 rounded-lg border ${variants[variant]}`}>
      <div className="flex items-center gap-1">
        {Icon && <Icon className="w-4 h-4" />}
        <span className="text-lg font-bold">{value}</span>
      </div>
      <span className="text-xs font-medium opacity-75">{label}</span>
    </div>
  );
}

/**
 * Empty state component
 */
function EmptyState() {
  return (
    <div className="text-center py-8 px-4">
      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
        <CheckCircleIcon className="w-8 h-8 text-green-500" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-1">All caught up!</h3>
      <p className="text-sm text-gray-500">No quotes expiring in the next 7 days</p>
    </div>
  );
}

/**
 * Loading skeleton
 */
function LoadingSkeleton() {
  return (
    <div className="animate-pulse space-y-3">
      <div className="flex gap-2">
        <div className="h-14 bg-gray-200 rounded-lg flex-1" />
        <div className="h-14 bg-gray-200 rounded-lg flex-1" />
        <div className="h-14 bg-gray-200 rounded-lg flex-1" />
      </div>
      <div className="space-y-2">
        <div className="h-20 bg-gray-200 rounded-lg" />
        <div className="h-16 bg-gray-200 rounded-lg" />
        <div className="h-16 bg-gray-200 rounded-lg" />
      </div>
    </div>
  );
}

/**
 * Main Expiring Quotes Widget
 */
export default function ExpiringQuotesWidget({
  salesRepId = null,
  daysAhead = 7,
  maxQuotes = 10,
  defaultExpandedCount = 3,
  onViewAllQuotes,
  onViewQuote,
  onConvertToSale,
  className = '',
  collapsible = true,
}) {
  const {
    quotes,
    stats,
    loading,
    error,
    hasQuotes,
    hasUrgentQuotes,
    isEmpty,
    refresh,
    lastUpdated,
  } = useExpiringQuotes({
    salesRepId,
    daysAhead,
    maxQuotes,
    autoRefresh: true,
    pollInterval: 5 * 60 * 1000, // 5 minutes
  });

  // Track which quotes are expanded (top 3 by default)
  const [expandedQuotes, setExpandedQuotes] = useState(new Set());
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Expand top 3 urgent quotes by default
  useEffect(() => {
    if (quotes.length > 0) {
      const topQuoteIds = quotes
        .slice(0, defaultExpandedCount)
        .map(q => q.quoteId);
      setExpandedQuotes(new Set(topQuoteIds));
    }
  }, [quotes, defaultExpandedCount]);

  // Auto-collapse if no quotes this week
  useEffect(() => {
    if (isEmpty && collapsible) {
      setIsCollapsed(true);
    }
  }, [isEmpty, collapsible]);

  const toggleQuoteExpand = (quoteId) => {
    setExpandedQuotes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(quoteId)) {
        newSet.delete(quoteId);
      } else {
        newSet.add(quoteId);
      }
      return newSet;
    });
  };

  const handleViewQuote = (quote) => {
    if (onViewQuote) {
      onViewQuote(quote);
    } else {
      // Default navigation
      window.location.href = `/quotes/${quote.quoteId}`;
    }
  };

  const handleConvertToSale = (quote) => {
    if (onConvertToSale) {
      onConvertToSale(quote);
    } else {
      // Default: navigate to POS with quote
      window.location.href = `/pos?quote=${quote.quoteId}`;
    }
  };

  const handleViewAll = () => {
    if (onViewAllQuotes) {
      onViewAllQuotes();
    } else {
      window.location.href = '/quotes?filter=expiring';
    }
  };

  // Determine header styling based on urgency
  const headerBg = hasUrgentQuotes
    ? 'bg-gradient-to-r from-red-500 to-red-600'
    : stats.expiringIn3Days > 0
    ? 'bg-gradient-to-r from-orange-500 to-orange-600'
    : 'bg-gradient-to-r from-gray-600 to-gray-700';

  // Collapsed view
  if (isCollapsed && collapsible) {
    return (
      <div
        className={`bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden cursor-pointer hover:shadow-md transition-shadow ${className}`}
        onClick={() => setIsCollapsed(false)}
      >
        <div className={`${headerBg} px-4 py-3 flex items-center justify-between`}>
          <div className="flex items-center gap-2 text-white">
            <ClockIcon className="w-5 h-5" />
            <span className="font-semibold">Expiring Quotes</span>
            {stats.expiringIn7Days > 0 && (
              <span className="px-2 py-0.5 bg-white/20 rounded-full text-xs font-medium">
                {stats.expiringIn7Days}
              </span>
            )}
          </div>
          <ChevronDownIcon className="w-5 h-5 text-white/80" />
        </div>
      </div>
    );
  }

  return (
    <div
      className={`bg-white rounded-xl shadow-sm border overflow-hidden ${
        hasUrgentQuotes ? 'border-red-200' : 'border-gray-200'
      } ${className}`}
    >
      {/* Header */}
      <div className={`${headerBg} px-4 py-3`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-white">
            {hasUrgentQuotes ? (
              <ExclamationCircleIcon className="w-5 h-5 animate-pulse" />
            ) : (
              <ClockIcon className="w-5 h-5" />
            )}
            <span className="font-semibold">Expiring Quotes</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={refresh}
              disabled={loading}
              className="p-1.5 rounded-lg hover:bg-white/20 transition-colors text-white/80 hover:text-white"
              title="Refresh"
            >
              <ArrowPathIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            {collapsible && (
              <button
                onClick={() => setIsCollapsed(true)}
                className="p-1.5 rounded-lg hover:bg-white/20 transition-colors text-white/80 hover:text-white"
                title="Collapse"
              >
                <ChevronUpIcon className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Last updated */}
        {lastUpdated && (
          <div className="mt-1 text-xs text-white/60">
            Updated {lastUpdated.toLocaleTimeString()}
          </div>
        )}
      </div>

      {/* Stats bar */}
      <div className="p-4 bg-gray-50 border-b border-gray-200">
        <div className="flex gap-2 justify-between">
          <StatBadge
            label="Today"
            value={stats.expiringToday || 0}
            variant={stats.expiringToday > 0 ? 'urgent' : 'default'}
            icon={stats.expiringToday > 0 ? ExclamationTriangleIcon : null}
          />
          <StatBadge
            label="3 Days"
            value={stats.expiringIn3Days || 0}
            variant={stats.expiringIn3Days > stats.expiringToday ? 'warning' : 'default'}
          />
          <StatBadge
            label="7 Days"
            value={stats.expiringIn7Days || 0}
            variant="default"
            icon={DocumentTextIcon}
          />
          <StatBadge
            label="At Risk"
            value={formatCurrency(stats.totalAtRiskValue || 0)}
            variant="money"
            icon={CurrencyDollarIcon}
          />
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {loading && !hasQuotes ? (
          <LoadingSkeleton />
        ) : error ? (
          <div className="text-center py-6">
            <ExclamationTriangleIcon className="w-10 h-10 text-red-400 mx-auto mb-2" />
            <p className="text-sm text-red-600">{error}</p>
            <button
              onClick={refresh}
              className="mt-2 text-sm text-blue-600 hover:underline"
            >
              Try again
            </button>
          </div>
        ) : isEmpty ? (
          <EmptyState />
        ) : (
          <div className="space-y-2">
            {quotes.map((quote) => (
              <ExpiringQuoteRow
                key={quote.quoteId}
                quote={quote}
                expanded={expandedQuotes.has(quote.quoteId)}
                onToggleExpand={() => toggleQuoteExpand(quote.quoteId)}
                onViewQuote={handleViewQuote}
                onConvertToSale={handleConvertToSale}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer - View All */}
      {hasQuotes && (
        <div className="px-4 pb-4">
          <button
            onClick={handleViewAll}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
          >
            View All Expiring Quotes
            <span className="text-blue-400">({stats.expiringIn7Days || quotes.length})</span>
          </button>
        </div>
      )}
    </div>
  );
}
