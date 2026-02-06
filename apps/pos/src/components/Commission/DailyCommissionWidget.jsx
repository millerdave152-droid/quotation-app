/**
 * Daily Commission Widget
 * Shows today's commission summary with comparisons
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  CurrencyDollarIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  ShoppingCartIcon,
  SparklesIcon,
  ArrowPathIcon,
  ChartBarIcon,
  TrophyIcon,
} from '@heroicons/react/24/outline';
import { getMyCommissions, getLeaderboard } from '../../api/commissions';

/**
 * Format currency
 */
function formatCurrency(amount, compact = false) {
  if (amount == null) return '$0';
  if (compact && Math.abs(amount) >= 1000) {
    return `$${(amount / 1000).toFixed(1)}K`;
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Calculate percentage change
 */
function percentChange(current, previous) {
  if (!previous || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

/**
 * Stat card component
 */
function StatCard({ icon: Icon, label, value, subValue, trend, iconBg = 'bg-green-100', iconColor = 'text-green-600' }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="flex items-start justify-between">
        <div className={`p-2 ${iconBg} rounded-lg`}>
          <Icon className={`w-5 h-5 ${iconColor}`} />
        </div>
        {trend !== null && trend !== undefined && (
          <div className={`flex items-center gap-1 text-xs font-medium ${
            trend >= 0 ? 'text-green-600' : 'text-red-500'
          }`}>
            {trend >= 0 ? (
              <ArrowTrendingUpIcon className="w-3.5 h-3.5" />
            ) : (
              <ArrowTrendingDownIcon className="w-3.5 h-3.5" />
            )}
            {Math.abs(trend).toFixed(0)}%
          </div>
        )}
      </div>
      <div className="mt-3">
        <div className="text-2xl font-bold text-slate-900">{value}</div>
        <div className="text-sm text-slate-500">{label}</div>
        {subValue && (
          <div className="text-xs text-slate-400 mt-1">{subValue}</div>
        )}
      </div>
    </div>
  );
}

/**
 * Top item row
 */
function TopItemRow({ item, index }) {
  const medals = ['🥇', '🥈', '🥉'];
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-2">
        <span className="w-6 text-center">
          {index < 3 ? medals[index] : `${index + 1}.`}
        </span>
        <span className="text-sm text-slate-700 truncate max-w-[150px]">
          {item.itemName}
        </span>
        {item.isBonus && (
          <SparklesIcon className="w-3.5 h-3.5 text-amber-500" />
        )}
      </div>
      <span className="text-sm font-medium text-green-600">
        {formatCurrency(item.commission)}
      </span>
    </div>
  );
}

/**
 * Progress bar for target
 */
function TargetProgress({ current, target, label }) {
  const percent = Math.min((current / target) * 100, 100);
  const isAchieved = current >= target;

  return (
    <div className="mt-4 p-3 bg-slate-50 rounded-lg">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
          {label}
        </span>
        <span className={`text-xs font-medium ${isAchieved ? 'text-green-600' : 'text-slate-600'}`}>
          {percent.toFixed(0)}%
        </span>
      </div>
      <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            isAchieved ? 'bg-green-500' : 'bg-blue-500'
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="flex items-center justify-between mt-1">
        <span className="text-xs text-slate-500">
          {formatCurrency(current)} earned
        </span>
        <span className="text-xs text-slate-500">
          {formatCurrency(target)} goal
        </span>
      </div>
      {isAchieved && (
        <div className="flex items-center gap-1 mt-2 text-xs text-green-600">
          <TrophyIcon className="w-3.5 h-3.5" />
          Target achieved!
        </div>
      )}
    </div>
  );
}

/**
 * Daily Commission Widget
 */
export default function DailyCommissionWidget({
  salesRepId,
  showLeaderboardRank = true,
  showTopItems = true,
  showTarget = true,
  className = '',
}) {
  const [data, setData] = useState(null);
  const [rank, setRank] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    if (!salesRepId) return;

    setLoading(true);
    setError(null);

    try {
      // Get today's date range
      const today = new Date().toISOString().split('T')[0];

      // Get MTD data for comparison
      const mtdStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
        .toISOString().split('T')[0];

      const [todayResult, mtdResult] = await Promise.all([
        getMyCommissions({ startDate: today, endDate: today }),
        getMyCommissions({ startDate: mtdStart, endDate: today }),
      ]);

      // Calculate averages
      const mtdDays = mtdResult.data?.dailyBreakdown?.length || 1;
      const avgDailyCommission = (mtdResult.data?.summary?.totalCommission || 0) / mtdDays;

      // Get leaderboard rank
      if (showLeaderboardRank) {
        const leaderboardResult = await getLeaderboard('month');
        const myRank = leaderboardResult.data?.find(e => e.repId === salesRepId);
        setRank(myRank?.rank || null);
      }

      setData({
        today: todayResult.data,
        mtd: mtdResult.data,
        avgDailyCommission,
      });
    } catch (err) {
      console.error('[DailyCommissionWidget] Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [salesRepId, showLeaderboardRank]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className={`bg-white rounded-xl border border-slate-200 p-6 ${className}`}>
        <div className="flex items-center justify-center py-8">
          <div className="w-8 h-8 border-2 border-slate-300 border-t-green-500 rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`bg-white rounded-xl border border-slate-200 p-6 ${className}`}>
        <div className="text-center py-4">
          <p className="text-sm text-red-500">{error}</p>
          <button
            onClick={fetchData}
            className="mt-2 text-sm text-blue-600 hover:underline"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const todaySummary = data?.today?.summary || {};
  const mtdSummary = data?.mtd?.summary || {};
  const todayEarnings = data?.today?.earnings || [];
  const targetProgress = data?.mtd?.targetProgress;

  // Sort by commission to get top items
  const topItems = [...todayEarnings]
    .sort((a, b) => b.commission - a.commission)
    .slice(0, 5);

  // Calculate comparison to average
  const vsAvgTrend = data?.avgDailyCommission > 0
    ? percentChange(todaySummary.totalCommission || 0, data.avgDailyCommission)
    : null;

  return (
    <div className={`bg-white rounded-xl border border-slate-200 overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-green-100 rounded-lg">
            <CurrencyDollarIcon className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">Today's Commission</h3>
            {rank && (
              <p className="text-xs text-slate-500">
                #{rank} on leaderboard this month
              </p>
            )}
          </div>
        </div>
        <button
          onClick={fetchData}
          className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <ArrowPathIcon className="w-5 h-5" />
        </button>
      </div>

      {/* Stats Grid */}
      <div className="p-4 grid grid-cols-2 gap-3">
        <StatCard
          icon={CurrencyDollarIcon}
          label="Today's Earnings"
          value={formatCurrency(todaySummary.totalCommission || 0)}
          trend={vsAvgTrend}
          subValue={vsAvgTrend !== null ? `vs ${formatCurrency(data?.avgDailyCommission || 0)} avg` : null}
        />
        <StatCard
          icon={ShoppingCartIcon}
          label="Sales Today"
          value={todaySummary.orderCount || 0}
          iconBg="bg-blue-100"
          iconColor="text-blue-600"
        />
        <StatCard
          icon={SparklesIcon}
          label="Bonus Earned"
          value={formatCurrency(todaySummary.bonusCommission || 0)}
          iconBg="bg-amber-100"
          iconColor="text-amber-600"
        />
        <StatCard
          icon={ChartBarIcon}
          label="MTD Total"
          value={formatCurrency(mtdSummary.totalCommission || 0, true)}
          iconBg="bg-purple-100"
          iconColor="text-purple-600"
        />
      </div>

      {/* Target Progress */}
      {showTarget && targetProgress && (
        <div className="px-4 pb-4">
          <TargetProgress
            current={targetProgress.earned}
            target={targetProgress.target}
            label="Monthly Target"
          />
        </div>
      )}

      {/* Top Items */}
      {showTopItems && topItems.length > 0 && (
        <div className="px-4 pb-4 border-t border-slate-100">
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-4 mb-2">
            Top Commission Items Today
          </h4>
          <div className="divide-y divide-slate-100">
            {topItems.map((item, i) => (
              <TopItemRow key={item.id || i} item={item} index={i} />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {todaySummary.orderCount === 0 && (
        <div className="px-4 pb-6 text-center">
          <div className="py-6">
            <ShoppingCartIcon className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">No sales yet today</p>
            <p className="text-xs text-slate-400 mt-1">
              Complete a sale to see your commission
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
