/**
 * Commission Leaderboard Component
 * Shows sales rep commission rankings
 */

import React, { useState, useEffect } from 'react';
import {
  TrophyIcon,
  ArrowPathIcon,
  ChartBarIcon,
  UserIcon,
} from '@heroicons/react/24/outline';
import { getLeaderboard } from '../../api/commissions';

/**
 * Format currency
 */
function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

/**
 * Rank badge component
 */
function RankBadge({ rank }) {
  if (rank === 1) {
    return (
      <div className="w-8 h-8 rounded-full bg-yellow-100 flex items-center justify-center">
        <TrophyIcon className="w-5 h-5 text-yellow-600" />
      </div>
    );
  }
  if (rank === 2) {
    return (
      <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
        <span className="text-sm font-bold text-gray-600">2</span>
      </div>
    );
  }
  if (rank === 3) {
    return (
      <div className="w-8 h-8 rounded-full bg-orange-100 flex items-center justify-center">
        <span className="text-sm font-bold text-orange-600">3</span>
      </div>
    );
  }
  return (
    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
      <span className="text-sm font-medium text-gray-500">{rank}</span>
    </div>
  );
}

/**
 * Leaderboard row
 */
function LeaderboardRow({ entry, isCurrentUser = false }) {
  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
        isCurrentUser ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50'
      }`}
    >
      <RankBadge rank={entry.rank} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`font-medium truncate ${isCurrentUser ? 'text-blue-900' : 'text-gray-900'}`}>
            {entry.repName}
          </span>
          {isCurrentUser && (
            <span className="px-1.5 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded">
              You
            </span>
          )}
        </div>
        <div className="text-xs text-gray-500">
          {entry.orders} orders • {formatCurrency(entry.sales)} in sales
        </div>
      </div>

      <div className="text-right">
        <div className={`font-semibold ${entry.rank <= 3 ? 'text-green-600' : 'text-gray-900'}`}>
          {formatCurrency(entry.commission)}
        </div>
        {entry.bonus > 0 && (
          <div className="text-xs text-green-600">
            +{formatCurrency(entry.bonus)} bonus
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Commission Leaderboard Widget
 */
export default function CommissionLeaderboard({
  currentUserId,
  defaultPeriod = 'month',
  maxEntries = 10,
  className = '',
}) {
  const [leaderboard, setLeaderboard] = useState([]);
  const [period, setPeriod] = useState(defaultPeriod);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const periods = [
    { value: 'today', label: 'Today' },
    { value: 'week', label: 'This Week' },
    { value: 'month', label: 'This Month' },
    { value: 'quarter', label: 'This Quarter' },
    { value: 'year', label: 'This Year' },
  ];

  const fetchLeaderboard = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await getLeaderboard(period);
      setLeaderboard(result.data?.slice(0, maxEntries) || []);
    } catch (err) {
      console.error('[CommissionLeaderboard] Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaderboard();
  }, [period]);

  // Find current user's position
  const currentUserEntry = leaderboard.find(e => e.repId === currentUserId);
  const currentUserRank = currentUserEntry?.rank;

  return (
    <div className={`bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <TrophyIcon className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Commission Leaders</h3>
              {currentUserRank && (
                <p className="text-xs text-gray-500">
                  You're ranked #{currentUserRank}
                </p>
              )}
            </div>
          </div>

          <button
            onClick={fetchLeaderboard}
            disabled={loading}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowPathIcon className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Period selector */}
        <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
          {periods.map(p => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`flex-1 px-2 py-1.5 text-xs font-medium rounded-md transition-colors ${
                period === p.value
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-3">
        {loading && leaderboard.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8">
            <div className="w-8 h-8 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin mb-2" />
            <p className="text-sm text-gray-500">Loading leaderboard...</p>
          </div>
        ) : error ? (
          <div className="text-center py-8">
            <p className="text-sm text-red-500">{error}</p>
            <button
              onClick={fetchLeaderboard}
              className="mt-2 text-sm text-blue-600 hover:underline"
            >
              Retry
            </button>
          </div>
        ) : leaderboard.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <ChartBarIcon className="w-10 h-10 text-gray-300 mb-2" />
            <p className="text-sm text-gray-500">No commission data for this period</p>
          </div>
        ) : (
          <div className="space-y-2">
            {leaderboard.map(entry => (
              <LeaderboardRow
                key={entry.repId}
                entry={entry}
                isCurrentUser={entry.repId === currentUserId}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer - Current user if not in top entries */}
      {currentUserId && !currentUserEntry && leaderboard.length > 0 && (
        <div className="p-3 bg-gray-50 border-t border-gray-200">
          <div className="flex items-center gap-3 p-2 bg-white rounded-lg border border-gray-200">
            <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
              <UserIcon className="w-5 h-5 text-blue-600" />
            </div>
            <div className="flex-1">
              <span className="text-sm text-gray-600">Your current rank</span>
            </div>
            <span className="text-sm font-medium text-gray-500">
              Not ranked yet
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
