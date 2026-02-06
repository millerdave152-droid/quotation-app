/**
 * Commission Summary Cards
 * Reusable summary statistics cards for commission views
 */

import React from 'react';
import {
  CurrencyDollarIcon,
  ShoppingCartIcon,
  SparklesIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  ChartBarIcon,
  UserGroupIcon,
  ReceiptPercentIcon,
} from '@heroicons/react/24/outline';

/**
 * Format currency
 */
function formatCurrency(amount, compact = false) {
  if (amount == null) return '$0';
  if (compact && Math.abs(amount) >= 10000) {
    return `$${(amount / 1000).toFixed(1)}K`;
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format percentage
 */
function formatPercent(value) {
  return `${(value * 100).toFixed(2)}%`;
}

/**
 * Single stat card
 */
function StatCard({
  icon: Icon,
  iconBg = 'bg-green-100',
  iconColor = 'text-green-600',
  label,
  value,
  subValue,
  trend,
  trendLabel,
  loading = false,
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow">
      {loading ? (
        <div className="animate-pulse">
          <div className="w-10 h-10 bg-slate-200 rounded-lg mb-3"></div>
          <div className="h-8 bg-slate-200 rounded w-2/3 mb-2"></div>
          <div className="h-4 bg-slate-100 rounded w-1/2"></div>
        </div>
      ) : (
        <>
          <div className="flex items-start justify-between mb-3">
            <div className={`p-2.5 ${iconBg} rounded-lg`}>
              <Icon className={`w-5 h-5 ${iconColor}`} />
            </div>
            {trend !== undefined && trend !== null && (
              <div className={`flex items-center gap-1 text-sm font-medium ${
                trend >= 0 ? 'text-green-600' : 'text-red-500'
              }`}>
                {trend >= 0 ? (
                  <ArrowTrendingUpIcon className="w-4 h-4" />
                ) : (
                  <ArrowTrendingDownIcon className="w-4 h-4" />
                )}
                <span>{Math.abs(trend).toFixed(1)}%</span>
              </div>
            )}
          </div>
          <div className="text-2xl font-bold text-slate-900 mb-1">{value}</div>
          <div className="text-sm text-slate-500">{label}</div>
          {subValue && (
            <div className="text-xs text-slate-400 mt-1">{subValue}</div>
          )}
          {trendLabel && (
            <div className="text-xs text-slate-400 mt-1">{trendLabel}</div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Commission Summary Cards - Sales Rep View
 */
export function RepCommissionSummary({ summary, comparison, loading = false }) {
  const commissionTrend = comparison?.changes?.commission && summary?.totalCommission
    ? (comparison.changes.commission / (summary.totalCommission - comparison.changes.commission)) * 100
    : null;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        icon={CurrencyDollarIcon}
        iconBg="bg-green-100"
        iconColor="text-green-600"
        label="Total Commission"
        value={formatCurrency(summary?.totalCommission)}
        trend={commissionTrend}
        trendLabel={comparison ? 'vs previous period' : null}
        loading={loading}
      />
      <StatCard
        icon={ShoppingCartIcon}
        iconBg="bg-blue-100"
        iconColor="text-blue-600"
        label="Sales Count"
        value={summary?.orderCount || 0}
        subValue={summary?.totalSales ? `${formatCurrency(summary.totalSales)} in sales` : null}
        loading={loading}
      />
      <StatCard
        icon={SparklesIcon}
        iconBg="bg-amber-100"
        iconColor="text-amber-600"
        label="Bonus Earned"
        value={formatCurrency(summary?.bonusCommission)}
        subValue={summary?.bonusItems ? `${summary.bonusItems} bonus items` : null}
        loading={loading}
      />
      <StatCard
        icon={ReceiptPercentIcon}
        iconBg="bg-purple-100"
        iconColor="text-purple-600"
        label="Avg. Rate"
        value={formatPercent(summary?.averageRate || 0)}
        subValue={summary?.orderCount ? `${formatCurrency(summary.totalCommission / summary.orderCount)}/order` : null}
        loading={loading}
      />
    </div>
  );
}

/**
 * Commission Summary Cards - Team/Manager View
 */
export function TeamCommissionSummary({ totals, loading = false }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        icon={CurrencyDollarIcon}
        iconBg="bg-green-100"
        iconColor="text-green-600"
        label="Total Team Commission"
        value={formatCurrency(totals?.totalCommission, true)}
        subValue={`${formatCurrency(totals?.totalBonus)} in bonuses`}
        loading={loading}
      />
      <StatCard
        icon={UserGroupIcon}
        iconBg="bg-blue-100"
        iconColor="text-blue-600"
        label="Active Reps"
        value={`${totals?.activeReps || 0} / ${totals?.totalReps || 0}`}
        subValue={totals?.avgCommissionPerRep ? `${formatCurrency(totals.avgCommissionPerRep)} avg/rep` : null}
        loading={loading}
      />
      <StatCard
        icon={ShoppingCartIcon}
        iconBg="bg-indigo-100"
        iconColor="text-indigo-600"
        label="Total Orders"
        value={totals?.totalOrders || 0}
        subValue={totals?.totalSales ? `${formatCurrency(totals.totalSales, true)} revenue` : null}
        loading={loading}
      />
      <StatCard
        icon={ChartBarIcon}
        iconBg="bg-purple-100"
        iconColor="text-purple-600"
        label="Avg. Per Order"
        value={formatCurrency(totals?.avgCommissionPerOrder)}
        subValue={totals?.totalSales && totals?.totalCommission
          ? `${((totals.totalCommission / totals.totalSales) * 100).toFixed(2)}% effective rate`
          : null}
        loading={loading}
      />
    </div>
  );
}

/**
 * Target Progress Card
 */
export function TargetProgressCard({ targetProgress, loading = false }) {
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-5 animate-pulse">
        <div className="h-4 bg-slate-200 rounded w-1/3 mb-4"></div>
        <div className="h-3 bg-slate-100 rounded-full mb-2"></div>
        <div className="h-4 bg-slate-100 rounded w-1/2"></div>
      </div>
    );
  }

  if (!targetProgress) return null;

  const { target, earned, percent, remaining } = targetProgress;
  const isAchieved = earned >= target;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-slate-900">Monthly Target</h3>
        <span className={`text-sm font-medium ${isAchieved ? 'text-green-600' : 'text-slate-600'}`}>
          {percent.toFixed(1)}%
        </span>
      </div>

      <div className="h-3 bg-slate-100 rounded-full overflow-hidden mb-3">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            isAchieved
              ? 'bg-gradient-to-r from-green-500 to-emerald-400'
              : 'bg-gradient-to-r from-blue-500 to-indigo-400'
          }`}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-500">
          {formatCurrency(earned)} earned
        </span>
        <span className="text-slate-500">
          {formatCurrency(target)} goal
        </span>
      </div>

      {isAchieved ? (
        <div className="flex items-center gap-2 mt-3 p-2 bg-green-50 rounded-lg">
          <SparklesIcon className="w-5 h-5 text-green-600" />
          <span className="text-sm font-medium text-green-700">
            Target achieved! Exceeded by {formatCurrency(earned - target)}
          </span>
        </div>
      ) : (
        <div className="text-xs text-slate-400 mt-2">
          {formatCurrency(remaining)} remaining to reach goal
        </div>
      )}
    </div>
  );
}

export default RepCommissionSummary;
